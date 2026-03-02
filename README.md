# SecOps Center

A real-time Security Operations Center (SOC) dashboard for monitoring, tracking, and responding to security events across your infrastructure.

Built by [Sambo Chea](https://github.com/sombochea) · [Cubis](https://github.com/cubetiq)

## Features

- **Real-time event monitoring** — Auto-refreshing dashboard with 10-second polling via SWR
- **Webhook ingestion** — `POST /api/webhook` endpoint to receive events from external services (PAM, sshd, etc.)
- **Threat detection** — Automatically flags events with `status=failed`, `auth_method=invalid_user`, or `event=ssh_attempt`
- **Activity timeline** — 14-day area chart showing total events vs threats
- **Highest risk sources** — Ranked list of IPs with the most threat events
- **Quick mitigation** — One-click copy of `fail2ban` and `iptables` ban commands per IP or in bulk
- **Interactive charts** — Pie and bar charts for events by type, host, source IP, and service; click any segment to filter
- **Advanced filtering** — Search across all fields, filter by event type, host, IP, user, service; active filter badges
- **Paginated event table** — Configurable page size (10/20/50/100), status icons with tooltips, click to view details
- **Event detail drawer** — Slide-out panel with all event fields, grouped sections, threat badge, metadata viewer
- **Responsive design** — Mobile card layout for events, adaptive grids for all screen sizes
- **Dark mode** — Default dark theme for SOC aesthetic
- **Authentication** — Email/password auth via Better Auth with server-side session guard (`proxy.ts`)

## Tech Stack

| Layer         | Technology                          |
| ------------- | ----------------------------------- |
| Framework     | Next.js 16+ (App Router, Turbopack) |
| Runtime       | Bun                                 |
| UI            | Tailwind CSS, ShadCN UI, Recharts   |
| Data Fetching | SWR                                 |
| Database      | PostgreSQL + Drizzle ORM            |
| Auth          | Better Auth                         |

## Getting Started

### Prerequisites

- [Bun](https://bun.sh) installed
- PostgreSQL database running

### Setup

```bash
# Clone the repository
git clone https://github.com/sombochea/secops.git
cd secops

# Install dependencies
bun install

# Configure environment
cp .env.example .env
# Edit .env with your database URL and secrets

# Push schema to database
bun run db:push

# Or run existing migrations for production safety
bun run db:migrate:prod

# Start development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and register your first account.

### Environment Variables

| Variable              | Description                       |
| --------------------- | --------------------------------- |
| `DATABASE_URL`        | PostgreSQL connection string      |
| `BETTER_AUTH_SECRET`  | Secret key for session encryption |
| `BETTER_AUTH_URL`     | Base URL of the application       |
| `NEXT_PUBLIC_APP_URL` | Public URL for client-side use    |

## Getting Started Flow

1. Register at `/register`
2. The setup wizard guides you to create an organization
3. A webhook key is generated for your org
4. Use the key to send events from your servers
5. Dashboard shows events scoped to your active organization

## Webhook API

Webhook keys are created per-organization in **Settings → Webhook Keys**. Send security events to `POST /api/webhook` with the following format:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: whk_your_org_webhook_key" \
  -d '{
    "event": "ssh_attempt",
    "status": "failed",
    "auth_method": "invalid_user",
    "host": "prod-server-01.example.com",
    "user": "root",
    "ruser": "unknown",
    "source_ip": "203.0.113.42",
    "service": "sshd",
    "tty": "ssh",
    "pam_type": "auth",
    "timestamp": "2026-03-01T12:00:00+00:00",
    "metadata": {
      "attempted_password": "hunter2"
    },
    "ua": "Mozilla/5.0 (compatible; SecOpsBot/1.0; +https://github.com/sombochea/secops)"
  }'
```

Supports both single events and batch arrays.

### Event Fields

| Field         | Type              | Description                                                        |
| ------------- | ----------------- | ------------------------------------------------------------------ |
| `event`       | string (required) | Event type (e.g., `ssh_session_close`, `ssh_attempt`)              |
| `status`      | string            | Event status (`closed`, `failed`, `success`)                       |
| `auth_method` | string            | Authentication method (`publickey`, `password`, `invalid_user`)    |
| `host`        | string            | Target hostname                                                    |
| `user`        | string            | Local username                                                     |
| `ruser`       | string            | Remote username                                                    |
| `source_ip`   | string            | Source IP address                                                  |
| `service`     | string            | Service name (e.g., `sshd`)                                        |
| `tty`         | string            | Terminal type                                                      |
| `pam_type`    | string            | PAM event type (`open_session`, `close_session`, `auth`)           |
| `timestamp`   | string (required) | ISO 8601 timestamp                                                 |
| `ua`          | string            | User agent string (optional, auto-captured if sent from a browser) |
| `metadata`    | object            | Additional arbitrary data                                          |

## Scripts

```bash
bun run dev             # Start dev server with Turbopack
bun run build           # Production build
bun run start           # Start production server
bun run db:generate     # Generate Drizzle migrations
bun run db:migrate      # Run migrations
bun run db:migrate:prod # Run migrations in production (with safety checks)
bun run db:push         # Push schema directly to database
bun run db:studio       # Open Drizzle Studio
```

## Docker Deployment

```bash
# Configure secrets
cp .env.example .env
# Edit .env — set BETTER_AUTH_SECRET and optionally DB_PASSWORD (generate: `openssl rand -hex 32` for a secure random secret)

# Start everything
docker compose up -d --build # or docker compose up -d # if you already built the image

# Run database migrations
docker compose exec app bun run db:migrate:prod
```

## License

MIT — Free to use and customize.

Built by [Sambo Chea](https://github.com/sombochea) under [Cubis](https://github.com/cubetiq). If you find this project useful, consider starring the repo or contributing!
