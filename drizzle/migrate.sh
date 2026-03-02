#!/bin/sh
# ─────────────────────────────────────────────────────────────
#  migrate.sh — run Drizzle SQL migrations without node_modules
#
#  Reads the journal to apply migrations in order, skipping
#  any already tracked in the __drizzle_migrations table.
#
#  Requires: psql (available in postgres alpine images)
#  Usage:    DATABASE_URL=... sh drizzle/migrate.sh
# ─────────────────────────────────────────────────────────────
set -eu

DIR="$(cd "$(dirname "$0")" && pwd)"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "Error: DATABASE_URL is not set"
  exit 1
fi

# Create migrations tracking table if not exists
psql "$DATABASE_URL" -q <<'SQL'
CREATE TABLE IF NOT EXISTS "__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash TEXT NOT NULL,
  created_at BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT
);
SQL

# Read journal and apply each migration
JOURNAL="$DIR/meta/_journal.json"
if [ ! -f "$JOURNAL" ]; then
  echo "No migration journal found at $JOURNAL"
  exit 1
fi

# Parse entries from journal (lightweight, no jq needed — uses node if available, else grep/sed)
if command -v node >/dev/null 2>&1; then
  ENTRIES=$(node -e "
    const j = require('$JOURNAL');
    j.entries.forEach(e => console.log(e.idx + ':' + e.tag));
  ")
else
  # Fallback: extract from JSON with basic tools
  ENTRIES=$(grep -oE '"idx":\s*[0-9]+|"tag":\s*"[^"]+"' "$JOURNAL" | paste - - | sed 's/"idx":\s*//;s/\t"tag":\s*"/ /;s/"$//' | awk '{print $1":"$2}')
fi

APPLIED=0

echo "$ENTRIES" | while IFS=: read -r idx tag; do
  SQL_FILE="$DIR/${tag}.sql"

  if [ ! -f "$SQL_FILE" ]; then
    echo "Warning: $SQL_FILE not found, skipping"
    continue
  fi

  # Check if already applied
  EXISTS=$(psql "$DATABASE_URL" -tAc "SELECT 1 FROM __drizzle_migrations WHERE hash = '$tag' LIMIT 1" 2>/dev/null || echo "")

  if [ "$EXISTS" = "1" ]; then
    echo "✓ Already applied: $tag"
    continue
  fi

  echo "⌛ Applying: $tag ..."

  # Split on statement breakpoints and execute
  sed 's/--> statement-breakpoint//' "$SQL_FILE" | psql "$DATABASE_URL" -q --single-transaction

  # Record migration
  psql "$DATABASE_URL" -q -c "INSERT INTO __drizzle_migrations (hash) VALUES ('$tag');"

  echo "✓ Applied: $tag"
  APPLIED=$((APPLIED + 1))
done

echo "Migration complete ✅"
