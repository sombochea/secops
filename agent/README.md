# SecOps Agent

A lightweight Go agent that monitors log files on your servers and sends security events to the SecOps Center dashboard in real-time.

## Supported Log Formats

| Format     | Description                          | Auto-detected patterns                    |
| ---------- | ------------------------------------ | ----------------------------------------- |
| `syslog`   | Standard syslog / auth.log           | SSH failed/accepted, invalid user, PAM    |
| `nginx`    | Nginx combined access log            | HTTP method, status, IP, user agent       |
| `postgres` | PostgreSQL server log                | Auth failures, connections                |
| `mysql`    | MySQL error/general log              | Access denied, connections                |
| `json`     | One JSON object per line             | Maps `event`, `status`, `user`, `ip`, etc |
| `csv`      | CSV with header row                  | Maps columns by header name               |
| `custom`   | User-defined regex with named groups | Configurable field mapping                |

## Install

### Download binary

```bash
# Linux amd64
curl -fsSL https://github.com/sombochea/secops/releases/latest/download/secops-agent-linux-amd64 \
  -o /usr/local/bin/secops-agent
chmod +x /usr/local/bin/secops-agent
```

Binaries available for: linux/amd64, linux/arm64, linux/arm, darwin/amd64, darwin/arm64, windows/amd64, freebsd/amd64.

### From source

```bash
cd agent
go build -o bin/secops-agent ./cmd
sudo mv bin/secops-agent /usr/local/bin/
```

### Docker

```bash
docker build -t secops-agent ./agent
docker run -v /etc/secops-agent:/etc/secops-agent \
           -v /var/log:/var/log:ro \
           secops-agent
```

## Configure

```bash
sudo mkdir -p /etc/secops-agent
sudo cp agent/config.example.yaml /etc/secops-agent/config.yaml
# Edit with your endpoint and webhook key
```

See [config.example.yaml](config.example.yaml) for all options.

### Custom Format Parser

For log formats not covered by built-in parsers, use `format: custom` with a Go regex pattern using named capture groups:

```yaml
sources:
  - path: /var/log/firewall.log
    format: custom
    format_parser:
      pattern: '(?P<ts>\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}) (?P<action>ALLOW|DENY) (?P<src>[\d.]+)'
      event: "firewall_{{action}}"   # static string OR {{group_name}}
      mapping:
        timestamp: ts
        source_ip: src
        status: action
```

**Standard fields** (map these to capture groups): `status`, `user`, `source_ip`, `service`, `auth_method`, `timestamp`, `ua`, `ruser`, `tty`, `pam_type`

Any mapping key not in the standard set is stored as a `metadata` key-value pair.

**Ready-to-use patterns** for 10 common log formats are in [custom-format-examples.yaml](custom-format-examples.yaml):

| # | Format | Example log source |
|---|--------|--------------------|
| 1 | Generic firewall / packet filter | `/var/log/firewall.log` |
| 2 | Apache / Caddy combined access log | `/var/log/apache2/access.log` |
| 3 | Fail2ban action log | `/var/log/fail2ban.log` |
| 4 | HAProxy HTTP log | `/var/log/haproxy/haproxy.log` |
| 5 | Sudo / privilege escalation | `/var/log/auth.log` |
| 6 | OpenVPN auth log | `/var/log/openvpn/openvpn.log` |
| 7 | AWS CloudTrail JSON | `/var/log/cloudtrail/events.jsonl` |
| 8 | Postfix mail log | `/var/log/mail.log` |
| 9 | Kubernetes audit log | `/var/log/kubernetes/audit.log` |
| 10 | Custom app auth log | `/var/log/myapp/app.log` |

## Run

```bash
# Version info
secops-agent -version

# Foreground
secops-agent -config /etc/secops-agent/config.yaml
```

### Systemd Service

```ini
[Unit]
Description=SecOps Agent
After=network.target

[Service]
ExecStart=/usr/local/bin/secops-agent -config /etc/secops-agent/config.yaml
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

## Auto-Update

Enable in config to check GitHub releases on startup:

```yaml
auto_update: true
```

The agent checks for `agent-v*` tags on the configured repo, downloads the matching binary for your OS/arch, and atomically replaces itself. Restart the agent (or let systemd do it) to run the new version.

## How It Works

1. Tails each configured log file from the current end (like `tail -f`)
2. Parses each new line using the specified format parser
3. Batches events (default: 50 events or every 5 seconds)
4. Sends batches to `POST /api/webhook` with the configured webhook key
5. Handles log rotation automatically (detects file recreate)

## Release

```bash
# Tag a new agent release
git tag agent-v1.0.0
git push origin agent-v1.0.0
```

GitHub Actions builds binaries for all platforms and creates a release.

## License

MIT
