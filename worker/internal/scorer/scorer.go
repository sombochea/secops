// Package scorer implements background ML-based risk scoring for security events.
//
// It mirrors the 5-signal anomaly detection from the JS anomaly.ts engine:
//
//  1. IP Frequency Burst — Z-score of hourly event count vs 24h rolling average
//  2. Time-of-Day Anomaly — Events outside business hours (22:00–06:00 UTC)
//  3. Failed Auth Velocity — Ratio of failed events from IP in last hour
//  4. New IP Signal — IP never seen before for this org
//  5. User Enumeration — Multiple distinct usernames from same IP in 1h window
//
// The scorer runs periodically, picks up recently inserted events that still
// have only a preliminary score, and re-scores them with full DB context.
// Updates are done in a single transaction per batch for consistency.
package scorer

import (
	"context"
	"fmt"
	"log"
	"math"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

const suspiciousThreshold = 60

// Scorer re-analyzes risk scores in the background.
type Scorer struct {
	pool      *pgxpool.Pool
	batchSize int
	interval  time.Duration
}

func New(pool *pgxpool.Pool, batchSize int, interval time.Duration) *Scorer {
	return &Scorer{pool: pool, batchSize: batchSize, interval: interval}
}

// pendingEvent is a recently inserted event needing re-scoring.
type pendingEvent struct {
	ID        string
	OrgID     string
	SourceIP  *string
	User      *string
	Status    *string
	AuthMethod *string
	Event     string
	Timestamp time.Time
}

// ipStats holds the DB-derived signals for an (org, ip) pair.
type ipStats struct {
	lastHourCount   float64
	avg24hHourly    float64
	stddev24h       float64
	lastHourFailed  float64
	lastHourTotal   float64
	distinctUsers1h float64
	isNew           bool
}

// Run starts the scoring loop. Blocks until ctx is cancelled.
func (s *Scorer) Run(ctx context.Context) {
	log.Printf("[scorer] started (interval=%s, batch=%d)", s.interval, s.batchSize)
	ticker := time.NewTicker(s.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("[scorer] stopped")
			return
		case <-ticker.C:
			if err := s.scoreBatch(ctx); err != nil {
				log.Printf("[scorer] error: %v", err)
			}
		}
	}
}

// RunOnce runs a single scoring pass (useful for drain on shutdown).
func (s *Scorer) RunOnce(ctx context.Context) error {
	return s.scoreBatch(ctx)
}

// scoreBatch fetches events inserted in the last scoring interval window
// that haven't been ML-scored yet, computes scores, and updates them.
func (s *Scorer) scoreBatch(ctx context.Context) error {
	// Fetch events from the last 5 minutes that may need re-scoring.
	// We use received_at to find recently ingested events.
	rows, err := s.pool.Query(ctx, `
		SELECT id, organization_id, source_ip, "user", status, auth_method, event, timestamp
		FROM security_event
		WHERE received_at > now() - interval '5 minutes'
		  AND (metadata IS NULL OR NOT (metadata ? '_ml_scored'))
		ORDER BY received_at DESC
		LIMIT $1
	`, s.batchSize)
	if err != nil {
		return fmt.Errorf("fetch pending: %w", err)
	}
	defer rows.Close()

	var events []pendingEvent
	for rows.Next() {
		var e pendingEvent
		if err := rows.Scan(&e.ID, &e.OrgID, &e.SourceIP, &e.User, &e.Status, &e.AuthMethod, &e.Event, &e.Timestamp); err != nil {
			return fmt.Errorf("scan: %w", err)
		}
		events = append(events, e)
	}
	if len(events) == 0 {
		return nil
	}

	// Gather unique (org, ip) pairs for batch stats lookup
	statsCache := make(map[orgIP]*ipStats)
	for _, e := range events {
		if e.SourceIP == nil {
			continue
		}
		key := orgIP{e.OrgID, *e.SourceIP}
		if _, ok := statsCache[key]; !ok {
			statsCache[key] = nil // placeholder
		}
	}

	// Fetch stats for each unique (org, ip)
	for key := range statsCache {
		st, err := s.getIPStats(ctx, key.org, key.ip)
		if err != nil {
			log.Printf("[scorer] stats error org=%s ip=%s: %v", key.org, key.ip, err)
			continue
		}
		statsCache[key] = st
	}

	// Score and update in a single transaction
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	updated := 0
	for _, e := range events {
		score := s.computeMLScore(e, statsCache)

		newStatus := derefStr(e.Status)
		if newStatus != "failed" && score >= suspiciousThreshold {
			newStatus = "suspicious"
		}

		_, err := tx.Exec(ctx, `
			UPDATE security_event
			SET risk_score = $1,
			    status = $2,
			    metadata = COALESCE(metadata, '{}'::jsonb) || '{"_ml_scored": true}'::jsonb
			WHERE id = $3
		`, score, nilStr(newStatus), e.ID)
		if err != nil {
			return fmt.Errorf("update %s: %w", e.ID, err)
		}
		updated++
	}

	if err := tx.Commit(ctx); err != nil {
		return fmt.Errorf("commit: %w", err)
	}

	if updated > 0 {
		log.Printf("[scorer] re-scored %d events", updated)
	}
	return nil
}

func (s *Scorer) getIPStats(ctx context.Context, orgID, ip string) (*ipStats, error) {
	var st ipStats
	var totalEver int

	err := s.pool.QueryRow(ctx, `
		WITH hourly AS (
			SELECT date_trunc('hour', timestamp) AS h, count(*)::int AS cnt
			FROM security_event
			WHERE organization_id = $1 AND source_ip = $2
			  AND timestamp > now() - interval '24 hours'
			GROUP BY h
		)
		SELECT
			coalesce((SELECT cnt FROM hourly WHERE h = date_trunc('hour', now())), 0)::float,
			coalesce(avg(cnt), 0)::float,
			coalesce(stddev_pop(cnt), 0)::float,
			(SELECT count(*) FROM security_event
			 WHERE organization_id = $1 AND source_ip = $2
			   AND timestamp > now() - interval '1 hour' AND status = 'failed')::float,
			(SELECT count(*) FROM security_event
			 WHERE organization_id = $1 AND source_ip = $2
			   AND timestamp > now() - interval '1 hour')::float,
			(SELECT count(DISTINCT "user") FROM security_event
			 WHERE organization_id = $1 AND source_ip = $2
			   AND timestamp > now() - interval '1 hour')::float,
			(SELECT count(*) FROM security_event
			 WHERE organization_id = $1 AND source_ip = $2)::int
		FROM hourly
	`, orgID, ip).Scan(
		&st.lastHourCount, &st.avg24hHourly, &st.stddev24h,
		&st.lastHourFailed, &st.lastHourTotal, &st.distinctUsers1h,
		&totalEver,
	)
	if err != nil {
		// No rows = new IP with no history
		st.isNew = true
		return &st, nil
	}
	st.isNew = totalEver <= 1 // only the event we just inserted
	return &st, nil
}

// computeMLScore implements the 5-signal scoring model.
// Weights match the JS anomaly.ts engine for consistency.
func (s *Scorer) computeMLScore(e pendingEvent, cache map[orgIP]*ipStats) int {
	if e.SourceIP == nil {
		return 0
	}

	key := orgIP{e.OrgID, *e.SourceIP}
	st := cache[key]
	if st == nil {
		return preliminaryScore(e)
	}

	score := 0.0

	// Signal 1: IP Frequency Burst (Z-score) — weight: 30
	if st.stddev24h > 0 {
		z := (st.lastHourCount - st.avg24hHourly) / st.stddev24h
		score += math.Min(30, math.Max(0, z*10))
	} else if st.lastHourCount > 5 {
		score += math.Min(30, st.lastHourCount*3)
	}

	// Signal 2: Time-of-Day Anomaly — weight: 15
	hour := e.Timestamp.UTC().Hour()
	if hour >= 22 || hour < 6 {
		score += 15
	}

	// Signal 3: Failed Auth Velocity — weight: 25
	if st.lastHourTotal > 0 {
		failRate := st.lastHourFailed / st.lastHourTotal
		score += math.Round(failRate * 25)
	}

	// Signal 4: New IP Signal — weight: 10
	if st.isNew {
		score += 10
	}

	// Signal 5: User Enumeration — weight: 20
	if st.distinctUsers1h >= 3 {
		score += math.Min(20, (st.distinctUsers1h-2)*5)
	}

	// Bonus: known-bad patterns
	if derefStr(e.AuthMethod) == "invalid_user" {
		score += 10
	}
	if e.Event == "ssh_attempt" && derefStr(e.Status) == "failed" {
		score += 5
	}

	return clamp(int(math.Round(score)), 0, 100)
}

// preliminaryScore is a fallback when DB stats aren't available.
func preliminaryScore(e pendingEvent) int {
	score := 0
	if derefStr(e.AuthMethod) == "invalid_user" {
		score += 40
	}
	if e.Event == "ssh_attempt" && derefStr(e.Status) == "failed" {
		score += 25
	}
	if derefStr(e.Status) == "failed" {
		score += 15
	}
	return clamp(score, 0, 100)
}

type orgIP struct{ org, ip string }

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func nilStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func clamp(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}
