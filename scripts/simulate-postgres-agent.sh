#!/usr/bin/env bash
# simulate-postgres-agent.sh — writes PostgreSQL log lines for the SecOps agent to tail
#
# Usage:
#   ./scripts/simulate-postgres-agent.sh [log_file] [count] [delay_ms]
#
# Examples:
#   ./scripts/simulate-postgres-agent.sh
#   ./scripts/simulate-postgres-agent.sh /tmp/postgresql.log 500 150
#
# Agent config (config.yaml):
#   logs:
#     - path: /tmp/postgresql.log
#       format: postgres
#       host: prod-db-01
set -euo pipefail

LOG_FILE="${1:-/tmp/postgresql.log}"
COUNT="${2:-200}"
DELAY_MS="${3:-0}"

ATTACKERS=("203.0.113.42" "198.51.100.7" "185.220.101.33" "45.155.205.99" "91.240.118.172" "178.128.23.15")
LEGIT_IPS=("10.0.0.5" "10.0.0.12" "192.168.1.100" "172.16.0.50")

BAD_USERS=("root" "admin" "sa" "test" "postgres" "superuser" "dba" "backup" "replicator")
LEGIT_USERS=("app_user" "readonly" "deploy" "reporting" "analytics")
DATABASES=("app_db" "analytics" "reporting" "users_db")
LOG_LEVELS=("LOG" "WARNING" "ERROR" "FATAL")

rand() { echo $(( RANDOM % $1 )); }
pick() { local arr=("$@"); echo "${arr[$(rand ${#arr[@]})]}"; }

sleep_ms() {
  (( DELAY_MS == 0 )) && return
  sleep "$(echo "scale=3; $DELAY_MS / 1000" | bc)"
}

# PostgreSQL log timestamp: "2024-01-15 10:30:00.000 UTC"
pg_ts() { date -u +"%Y-%m-%d %H:%M:%S.000 UTC"; }

# PostgreSQL log prefix: "2024-01-15 10:30:00.000 UTC [12345] user@db LOG:  "
prefix() {
  local pid=$(( RANDOM % 90000 + 10000 ))
  local user="${1:-}"
  local db="${2:-}"
  local level="${3:-LOG}"
  if [[ -n "$user" && -n "$db" ]]; then
    echo "$(pg_ts) [${pid}] ${user}@${db} ${level}: "
  else
    echo "$(pg_ts) [${pid}] ${level}: "
  fi
}

echo "Writing $COUNT PostgreSQL log lines → $LOG_FILE (delay=${DELAY_MS}ms)"

for i in $(seq 1 "$COUNT"); do
  SCENARIO=$(rand 10)

  if (( SCENARIO < 4 )); then
    # Authentication failed — triggers pgAuthFailed
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "${BAD_USERS[@]}")
    DB=$(pick "${DATABASES[@]}")
    echo "$(prefix "$USER" "$DB" "FATAL") password authentication failed for user \"${USER}\" (client: ${IP})" >> "$LOG_FILE"

  elif (( SCENARIO < 5 )); then
    # pg_hba.conf rejection — also triggers pgAuthFailed
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "${BAD_USERS[@]}")
    DB=$(pick "${DATABASES[@]}")
    echo "$(prefix "" "" "FATAL") no pg_hba.conf entry for host \"${IP}\", user \"${USER}\", database \"${DB}\"" >> "$LOG_FILE"

  elif (( SCENARIO < 6 )); then
    # Burst: rapid auth failures from same IP
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "${BAD_USERS[@]}")
    DB=$(pick "${DATABASES[@]}")
    for _ in 1 2 3 4 5; do
      echo "$(prefix "$USER" "$DB" "FATAL") password authentication failed for user \"${USER}\" (client: ${IP})" >> "$LOG_FILE"
    done

  elif (( SCENARIO < 8 )); then
    # Legit connection authorized — triggers pgConnection
    IP=$(pick "${LEGIT_IPS[@]}")
    USER=$(pick "${LEGIT_USERS[@]}")
    DB=$(pick "${DATABASES[@]}")
    echo "$(prefix "$USER" "$DB" "LOG") connection authorized: user=${USER} database=${DB} host=${IP}" >> "$LOG_FILE"

  elif (( SCENARIO == 8 )); then
    # Connection received (before auth) — triggers pgConnection
    IP=$(pick "${ATTACKERS[@]}")
    echo "$(prefix "" "" "LOG") connection received: host=${IP} port=$(( RANDOM % 40000 + 20000 ))" >> "$LOG_FILE"

  else
    # Generic log noise
    USER=$(pick "${LEGIT_USERS[@]}")
    DB=$(pick "${DATABASES[@]}")
    echo "$(prefix "$USER" "$DB" "LOG") disconnection: session time: 0:00:$(printf '%02d' $(( RANDOM % 60 ))) user=${USER} database=${DB}" >> "$LOG_FILE"
  fi

  if (( i % 50 == 0 )); then echo "  [$i/$COUNT]"; fi
  sleep_ms
done

echo "Done — wrote to $LOG_FILE"
