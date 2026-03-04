# SecOps Ingestion Worker

High-performance Go worker for processing webhook events at scale. Handles thousands of concurrent requests with guaranteed delivery through a Write-Ahead Log (WAL).

## Architecture

```
Agents/Webhooks → [HTTP Accept] → [WAL Persist] → 202 Accepted
                                        ↓
                              [Consumer Workers] → [Batch INSERT] → PostgreSQL
```

**Design principles:**

- **No event loss** — events are persisted to disk (WAL) before the HTTP response is sent
- **Sequential ordering** — WAL segments are processed in order, batch INSERTs preserve event sequence
- **High throughput** — accept path is O(1) append; heavy work (geo lookup, DB insert) happens asynchronously
- **Atomicity** — each WAL segment is inserted as a single transaction; on failure, the segment is retried
- **Backpressure** — WAL accumulates on disk if DB is slow; no events are dropped

## How It Works

1. HTTP handler validates the webhook key (cached 60s) and parses events
2. Events are appended to the active WAL segment file (JSONL, fsync'd)
3. HTTP 202 is returned immediately
4. A flush ticker rotates the WAL segment every N seconds
5. Consumer workers pick up completed segments, enrich with GeoIP, and batch-INSERT into PostgreSQL
6. Successfully inserted segments are deleted; failed segments are retried

## Configuration

| Flag            | Env            | Default           | Description                             |
| --------------- | -------------- | ----------------- | --------------------------------------- |
| `-addr`         | —              | `:4000`           | Listen address                          |
| `-db`           | `DATABASE_URL` | —                 | PostgreSQL connection string (required) |
| `-wal-dir`      | `WAL_DIR`      | `/tmp/secops-wal` | WAL directory for durable queuing       |
| `-workers`      | —              | `4`               | Number of concurrent insert workers     |
| `-batch`        | —              | `500`             | Max rows per INSERT statement           |
| `-flush`        | —              | `2s`              | WAL segment rotation interval           |
| `-segment-size` | —              | `10000`           | Max events per WAL segment file         |

## Run

```bash
# Build
cd worker && go build -o bin/worker ./cmd

# Run
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/secops \
  ./bin/worker -addr :4000 -workers 4 -batch 500
```

## Docker

```bash
docker build -t secops-worker ./worker
docker run -e DATABASE_URL=... -p 4000:4000 -v wal-data:/data/wal secops-worker
```

## Integration with Next.js App

Set `WEBHOOK_WORKER_URL=http://worker:4000` (or `http://localhost:4000` for local dev) in the app's environment. The Next.js `/api/webhook` endpoint will proxy requests to the worker automatically. If the worker is unavailable, it falls back to direct DB insert.

## Performance Testing

- Benchmark the in-memory queue and batch insert logic:

```bash
go test ./internal/queue/ -bench=. -benchmem -count=1
```

- Benchmark the full HTTP handler with a simulated load:

```bash
go test ./internal/handler/ -bench=. -benchmem -count=1
```

- Load test with a custom script that simulates concurrent webhook events:

```bash
# Build
go build -o bin/secops-loadtest ./cmd/loadtest

# Run against live worker
WEBHOOK_KEY=whk_xxx ./bin/secops-loadtest \
  -url http://localhost:4000/api/webhook \
  -n 100000 -c 50 -batch 50
```

Flags: `-n` total events, `-c` concurrency, `-batch` events per request. Prints live progress and final results (throughput, latency, success/fail counts).

## Performance Characteristics

| Metric           | Value                                                     |
| ---------------- | --------------------------------------------------------- |
| Accept latency   | < 1ms (WAL append + fsync)                                |
| Throughput       | 10,000+ events/sec per worker instance                    |
| Max batch INSERT | 500 rows (configurable, stays under PG 65535 param limit) |
| WAL durability   | fsync on every append batch                               |
| Key cache TTL    | 60 seconds                                                |
| GeoIP            | Batched (100 IPs/request), in-memory cached               |

## Scaling

- **Vertical**: increase `-workers` and `-batch` for more DB throughput
- **Horizontal**: run multiple worker instances behind a load balancer; each writes its own WAL directory
- **WAL storage**: use a fast local SSD for the WAL directory; size depends on DB insert speed vs event rate
