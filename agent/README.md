# SecOps Agent

A lightweight Go agent that monitors log files on your servers and sends security events to the SecOps Center dashboard in real-time.

## Supported Log Formats

| Format     | Description                | Auto-detected patterns                    |
| ---------- | -------------------------- | ----------------------------------------- |
| `syslog`   | Standard syslog / auth.log | SSH failed/accepted, invalid user, PAM    |
| `nginx`    | Nginx combined access log  | HTTP method, status, IP, user agent       |
| `postgres` | PostgreSQL server log      | Auth failures, connections                |
| `mysql`    | MySQL error/general log    | Access denied, connections                |
| `json`     | One JSON object per line   | Maps `event`, `status`, `user`, `ip`, etc |
| `csv`      | CSV with header row        | Maps columns by header name               |

## Install

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
sudo cp config.example.yaml /etc/secops-agent/config.yaml
# Edit with your endpoint and webhook key
```

See [config.example.yaml](config.example.yaml) for all options.

## Run

```bash
# Foreground
secops-agent -config /etc/secops-agent/config.yaml

# Systemd service
sudo cp secops-agent.service /etc/systemd/system/
sudo systemctl enable --now secops-agent
```

## Systemd Service

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

## How It Works

1. Tails each configured log file from the current end (like `tail -f`)
2. Parses each new line using the specified format parser
3. Batches events (default: 50 events or every 5 seconds)
4. Sends batches to `POST /api/webhook` with the configured webhook key
5. Handles log rotation automatically (detects file recreate)

## License

MIT
