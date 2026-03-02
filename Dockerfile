# ─── Stage 1: Install dependencies ────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# ─── Stage 1: Install dependencies ────────────────────────────────────────────
FROM base AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM base AS builder
WORKDIR /app

# For fetching git commit hash during build
RUN apk add --no-cache git

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN bun run build

# ─── Stage 3: Production ─────────────────────────────────────────────────────
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# psql for migrations, wget for healthcheck
RUN apk add --no-cache postgresql-client wget

# Security: non-root user
RUN addgroup --system --gid 1001 secops && \
    adduser --system --uid 1001 secops

# Copy only what's needed to run
COPY --from=builder /app/public ./public
COPY --from=builder --chown=secops:secops /app/.next/standalone ./
COPY --from=builder --chown=secops:secops /app/.next/static ./.next/static
COPY --from=builder --chown=secops:secops /app/drizzle ./drizzle

# Drop privileges
USER secops

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["bun", "server.js"]
