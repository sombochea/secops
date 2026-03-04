package inserter

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/sombochea/secops/worker/internal/geoip"
	"github.com/sombochea/secops/worker/internal/queue"
)

type Inserter struct {
	pool      *pgxpool.Pool
	batchSize int
}

func New(pool *pgxpool.Pool, batchSize int) *Inserter {
	return &Inserter{pool: pool, batchSize: batchSize}
}

// InsertBatch inserts events into security_event using a single multi-row INSERT.
// Returns the number of rows inserted.
func (ins *Inserter) InsertBatch(ctx context.Context, events []queue.Event) (int, error) {
	if len(events) == 0 {
		return 0, nil
	}

	// Collect unique IPs for geo lookup
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

	total := 0
	// Process in sub-batches to avoid exceeding PG parameter limits (65535 params)
	for i := 0; i < len(events); i += ins.batchSize {
		end := i + ins.batchSize
		if end > len(events) {
			end = len(events)
		}
		n, err := ins.insertChunk(ctx, events[i:end], geoMap)
		if err != nil {
			return total, err
		}
		total += n
	}
	return total, nil
}

func (ins *Inserter) insertChunk(ctx context.Context, events []queue.Event, geoMap map[string]geoip.Result) (int, error) {
	// 19 columns per row
	const cols = 19
	values := make([]string, 0, len(events))
	args := make([]interface{}, 0, len(events)*cols)

	for i, e := range events {
		ts, err := time.Parse(time.RFC3339, e.Timestamp)
		if err != nil {
			ts, err = time.Parse("2006-01-02T15:04:05-0700", e.Timestamp)
			if err != nil {
				ts, err = time.Parse("2006-01-02 15:04:05", e.Timestamp)
				if err != nil {
					ts = e.ReceivedAt
				}
			}
		}

		geo := geoMap[e.SourceIP]
		event := e.Event
		if event == "" {
			event = "unknown"
		}

		status := e.Status
		riskScore := computeRisk(e)
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
			"($%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d,$%d)",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7,
			base+8, base+9, base+10, base+11, base+12, base+13, base+14,
			base+15, base+16, base+17, base+18, base+19,
		))
		args = append(args,
			uuid.New().String(),  // id
			e.OrgID,              // organization_id
			event,                // event
			nilStr(status),       // status
			nilStr(e.AuthMethod), // auth_method
			nilStr(e.Host),       // host
			nilStr(e.User),       // user
			nilStr(e.Ruser),      // ruser
			nilStr(e.SourceIP),   // source_ip
			nilStr(e.Service),    // service
			nilStr(e.Tty),        // tty
			nilStr(e.PamType),    // pam_type
			nilStr(e.UA),         // ua
			geoCountry,           // geo_country
			geoCity,              // geo_city
			geoLat,               // geo_lat
			geoLon,               // geo_lon
			metaJSON,             // metadata
			ts,                   // timestamp
		)
	}

	query := fmt.Sprintf(`INSERT INTO security_event
		(id, organization_id, event, status, auth_method, host, "user", ruser,
		 source_ip, service, tty, pam_type, ua, geo_country, geo_city,
		 geo_lat, geo_lon, metadata, timestamp)
		VALUES %s`, strings.Join(values, ","))

	tag, err := ins.pool.Exec(ctx, query, args...)
	if err != nil {
		return 0, fmt.Errorf("batch insert: %w", err)
	}
	return int(tag.RowsAffected()), nil
}

func nilStr(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

// computeRisk is a simplified risk scorer matching the JS anomaly engine.
func computeRisk(e queue.Event) int {
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
