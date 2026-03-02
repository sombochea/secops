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

# Start development server
bun run dev
```

Open [http://localhost:3000](http://localhost:3000) and register your first account.

### Environment Variables

| Variable             | Description                                |
| -------------------- | ------------------------------------------ |
| `DATABASE_URL`       | PostgreSQL connection string               |
| `BETTER_AUTH_SECRET` | Secret key for session encryption          |
| `BETTER_AUTH_URL`    | Base URL of the application                |
| `WEBHOOK_SECRET`     | Secret for authenticating webhook requests |

## Webhook API

Send security events to `POST /api/webhook` with the following format:

```bash
curl -X POST http://localhost:3000/api/webhook \
  -H "Content-Type: application/json" \
  -H "x-webhook-secret: your-webhook-secret-here" \
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
    "timestamp": "2026-03-01T12:00:00+00:00"
  }'
```

Supports both single events and batch arrays.

### Event Fields

| Field         | Type              | Description                                                     |
| ------------- | ----------------- | --------------------------------------------------------------- |
| `event`       | string (required) | Event type (e.g., `ssh_session_close`, `ssh_attempt`)           |
| `status`      | string            | Event status (`closed`, `failed`, `success`)                    |
| `auth_method` | string            | Authentication method (`publickey`, `password`, `invalid_user`) |
| `host`        | string            | Target hostname                                                 |
| `user`        | string            | Local username                                                  |
| `ruser`       | string            | Remote username                                                 |
| `source_ip`   | string            | Source IP address                                               |
| `service`     | string            | Service name (e.g., `sshd`)                                     |
| `tty`         | string            | Terminal type                                                   |
| `pam_type`    | string            | PAM event type (`open_session`, `close_session`, `auth`)        |
| `timestamp`   | string (required) | ISO 8601 timestamp                                              |
| `metadata`    | object            | Additional arbitrary data                                       |

## Scripts

```bash
bun run dev          # Start dev server with Turbopack
bun run build        # Production build
bun run start        # Start production server
bun run db:generate  # Generate Drizzle migrations
bun run db:migrate   # Run migrations
bun run db:push      # Push schema directly to database
bun run db:studio    # Open Drizzle Studio
```

## Project Structure

```
src/
├── app/
│   ├── (auth)/login/          # Login page
│   ├── (auth)/register/       # Registration page
│   ├── (dashboard)/           # Main dashboard (auth-protected)
│   └── api/
│       ├── auth/[...all]/     # Better Auth handler
│       ├── events/            # Events API (filtered, paginated, aggregated)
│       └── webhook/           # Webhook ingestion endpoint
├── components/
│   ├── activity-timeline.tsx  # 14-day event activity area chart
│   ├── dashboard.tsx          # Main dashboard orchestrator
│   ├── dashboard-header.tsx   # Header with user menu and about dialog
│   ├── event-charts.tsx       # Pie + bar charts with click-to-filter
│   ├── event-detail-sheet.tsx # Slide-out event detail panel
│   ├── event-filters.tsx      # Search, filters, active filter badges
│   ├── events-table.tsx       # Paginated event table with status icons
│   ├── risk-sources.tsx       # Top threat IPs with fail2ban/iptables copy
│   └── stats-cards.tsx        # Summary stat cards
├── db/
│   ├── schema.ts              # Drizzle schema
│   └── index.ts               # Database connection
└── lib/
    ├── auth.ts                # Better Auth server config
    ├── auth-client.ts         # Better Auth React client
    ├── proxy.ts               # Server-side auth guard
    ├── types.ts               # Shared TypeScript types
    └── utils.ts               # Utility functions
```

## License

MIT — Free to use and customize.

Built by [Sambo Chea](https://github.com/sombochea) under [Cubis](https://github.com/cubetiq). If you find this project useful, consider starring the repo or contributing!
