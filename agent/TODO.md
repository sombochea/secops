## ❌ Not Yet Supported

Tailing
- No from_beginning option — can't replay historical logs
- Log rotation via rename/copy+truncate (only Create is handled; rename + new file creation may be missed on some systems)
- No glob/wildcard paths (e.g. /var/log/nginx/access.*.log)
- No compressed log support (.gz rotated files)

Sending
- No retry / backoff on send failure — dropped silently
- No local disk buffer/queue for offline resilience
- No TLS client certificate support
- No HTTP proxy support

Parsing
- syslog: no RFC 5424 structured syslog (<priority>version timestamp host app msgid ...)
- syslog: no IPv6 source IP in SSH patterns
- nginx: only combined log format — no custom log_format support
- json: no nested field extraction (e.g. user.name)
- custom: event only supports full {{group}} substitution — no partial interpolation like "prefix_{{group}}_suffix"
- custom: timestamp captured as raw string — no parsing/normalization (sent as-is to webhook)
- No multiline log support (e.g. Java stack traces, PostgreSQL multi-line queries)

Config
- No config hot-reload (requires restart)
- No environment variable substitution in config values
- No per-source filter to drop unwanted lines before parsing

Observability
- No metrics endpoint (Prometheus/health check)
- No structured logging (plain log.Printf)
- Failed parse lines logged but not counted/exported