package inserter

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sombochea/secops/worker/internal/geoip"
	"github.com/sombochea/secops/worker/internal/queue"
	"github.com/sombochea/secops/worker/internal/rcache"
)

type Inserter struct {
	pool      *pgxpool.Pool
	batchSize int
}

func New(pool *pgxpool.Pool, batchSize int) *Inserter {
	return &Inserter{pool: pool, batchSize: batchSize}
}

// EnsureSchema creates the dedup tracking table if it doesn't exist.
func (ins *Inserter) EnsureSchema(ctx context.Context) error {
	_, err := ins.pool.Exec(ctx, `
		CREATE TABLE IF NOT EXISTS wal_processed (
			segment_id TEXT PRIMARY KEY,
			events_count INT NOT NULL DEFAULT 0,
			processed_at TIMESTAMPTZ NOT NULL DEFAULT now()
		)
	`)
	return err
}

// InsertSegment inserts events from a WAL segment atomically with dedup.
// segmentID is the WAL filename — used to prevent re-processing.
// Returns (rows inserted, already processed, error).
func (ins *Inserter) InsertSegment(ctx context.Context, segmentID string, events []queue.Event) (int, bool, error) {
	if len(events) == 0 {
		return 0, false, nil
	}

	// GeoIP enrichment (outside transaction — idempotent)
	ipSet := make(map[string]struct{})
	for _, e := range events {
		if e.SourceIP != "" {
			ipSet[e.SourceIP] = struct{}{}
		}
	}
	ips := make([]string, 0, len(ipSet))
	for ip := range ipSet {
		ips = append(ips, ip)
	}
	geoMap := geoip.BatchLookup(ips)

	// Single transaction: check dedup → insert events → record segment
	tx, err := ins.pool.Begin(ctx)
	if err != nil {
		return 0, false, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	// Check if already processed
	var exists bool
	err = tx.QueryRow(ctx,
		`SELECT EXISTS(SELECT 1 FROM wal_processed WHERE segment_id = $1)`,
		segmentID,
	).Scan(&exists)
	if err != nil {
		return 0, false, fmt.Errorf("dedup check: %w", err)
	}
	if exists {
		return 0, true, nil
	}

	// Insert in sub-batches within the same transaction
	total := 0
	for i := 0; i < len(events); i += ins.batchSize {
		end := i + ins.batchSize
		if end > len(events) {
			end = len(events)
		}
		n, err := insertChunk(ctx, tx, events[i:end], geoMap)
		if err != nil {
			return total, false, err
		}
		total += n
	}

	// Record segment as processed
	_, err = tx.Exec(ctx,
		`INSERT INTO wal_processed (segment_id, events_count) VALUES ($1, $2)`,
		segmentID, total,
	)
	if err != nil {
		return total, false, fmt.Errorf("record segment: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return 0, false, fmt.Errorf("commit: %w", err)
	}

	// Invalidate Redis cache for affected orgs
	orgs := make(map[string]struct{})
	for _, e := range events {
		orgs[e.OrgID] = struct{}{}
	}
	for orgID := range orgs {
		rcache.InvalidateOrg(orgID)
	}

	return total, false, nil
}

func insertChunk(ctx context.Context, tx pgx.Tx, events []queue.Event, geoMap map[string]geoip.Result) (int, error) {
	const cols = 20
	values := make([]string, 0, len(events))
	args := make([]interface{}, 0, len(events)*cols)

	for i, e := range events {
		ts := parseTimestamp(e.Timestamp, e.ReceivedAt)
		geo := geoMap[e.SourceIP]
		event := e.Event
		if event == "" {
			event = "unknown"
		}

		riskScore := preliminaryRisk(e)
		status := e.Status
		if status != "failed" && riskScore >= 60 {
			status = "suspicious"
		}

		var metaJSON *string
		if e.Metadata != nil {
			b, _ := json.Marshal(e.Metadata)
			s := string(b)
			metaJSON = &s
		}

		var geoCountry, geoCity *string
		var geoLat, geoLon *float64
		if geo.Country != "" {
			geoCountry = &geo.Country
			geoCity = &geo.City
			geoLat = &geo.Lat
			geoLon = &geo.Lon
		}

		base := i * cols
		values = append(values, fmt.Sprintf(
			"($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7,
			base+8, base+9, base+10, base+11, base+12, base+13, base+14,
			base+15, base+16, base+17, base+18, base+19, base+20,
		))
		args = append(args,
			uuid.New().String(),
			e.OrgID,
			event,
			nilStr(status),
			nilStr(e.AuthMethod),
			nilStr(e.Host),
			nilStr(e.User),
			nilStr(e.Ruser),
			nilStr(e.SourceIP),
			nilStr(e.Service),
			nilStr(e.Tty),
			nilStr(e.PamType),
			nilStr(e.UA),
			geoCountry,
			geoCity,
			geoLat,
			geoLon,
			metaJSON,
			riskScore,
			ts,
		)
	}

	query := fmt.Sprintf(`INSERT INTO security_event
		(id, organization_id, event, status, auth_method, host, "user", ruser,
		 source_ip, service, tty, pam_type, ua, geo_country, geo_city,
		 geo_lat, geo_lon, metadata, risk_score, timestamp)
		VALUES %s
		ON CONFLICT (id) DO NOTHING`, strings.Join(values, ","))

	tag, err := tx.Exec(ctx, query, args...)
	if err != nil {
		return 0, fmt.Errorf("batch insert: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

func parseTimestamp(s string, fallback time.Time) time.Time {
	for _, fmt := range []string{time.RFC3339, "2006-01-02T15:04:05-0700", "2006-01-02 15:04:05"} {
		if t, err := time.Parse(fmt, s); err == nil {
			return t
		}
	}
	return fallback
}

func nilStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// preliminaryRisk computes a fast static score at insert time.
// The background scorer will refine this with full DB context.
func preliminaryRisk(e queue.Event) int {
	score := 0
	if e.AuthMethod == "invalid_user" {
		score += 40
	}
	if e.Event == "ssh_attempt" && e.Status == "failed" {
		score += 25
	}
	if e.Status == "failed" {
		score += 15
	}
	if e.Status == "suspicious" {
		score += 30
	}
	if score > 100 {
		score = 100
	}
	return score
}
