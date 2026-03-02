# ─── Stage 1: Install dependencies ────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production=false

# ─── Stage 2: Build ──────────────────────────────────────────────────────────
FROM oven/bun:1.3-alpine AS builder
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN bun run build

# ─── Stage 3: Production ─────────────────────────────────────────────────────
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Security: non-root user
RUN addgroup --system --gid 1001 secops && \
    adduser --system --uid 1001 secops

# Copy only what's needed to run
COPY --from=builder /app/public ./public
COPY --from=builder --chown=secops:secops /app/.next/standalone ./
COPY --from=builder --chown=secops:secops /app/.next/static ./.next/static

# Drop privileges
USER secops

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["node", "server.js"]
