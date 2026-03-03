#!/usr/bin/env bash
# simulate-mysql-agent.sh — writes MySQL general/error log lines for the SecOps agent to tail
#
# Usage:
#   ./scripts/simulate-mysql-agent.sh [log_file] [count] [delay_ms]
#
# Examples:
#   ./scripts/simulate-mysql-agent.sh
#   ./scripts/simulate-mysql-agent.sh /tmp/mysql.log 500 150
#
# Agent config (config.yaml):
#   logs:
#     - path: /tmp/mysql.log
#       format: mysql
#       host: prod-db-01
set -euo pipefail

LOG_FILE="${1:-/tmp/mysql.log}"
COUNT="${2:-200}"
DELAY_MS="${3:-0}"

ATTACKERS=("203.0.113.42" "198.51.100.7" "185.220.101.33" "45.155.205.99" "91.240.118.172" "178.128.23.15")
LEGIT_IPS=("10.0.0.5" "10.0.0.12" "192.168.1.100" "172.16.0.50")

BAD_USERS=("root" "admin" "sa" "test" "guest" "mysql" "backup" "dba" "oracle")
LEGIT_USERS=("app_user" "readonly" "deploy" "reporting")
LEVELS=("Note" "Warning" "Error")

rand() { echo $(( RANDOM % $1 )); }
pick() { local arr=("$@"); echo "${arr[$(rand ${#arr[@]})]}"; }

sleep_ms() {
  (( DELAY_MS == 0 )) && return
  sleep "$(echo "scale=3; $DELAY_MS / 1000" | bc)"
}

# MySQL log timestamp: 2024-01-15T10:30:00.000000Z
mysql_ts() { date -u +"%Y-%m-%dT%H:%M:%S.000000Z"; }

# MySQL log prefix: "2024-01-15T10:30:00.000000Z 123 [Note] "
prefix() {
  local tid=$(( RANDOM % 9000 + 1000 ))
  local level="${1:-Note}"
  echo "$(mysql_ts) ${tid} [${level}]"
}

echo "Writing $COUNT MySQL log lines → $LOG_FILE (delay=${DELAY_MS}ms)"

for i in $(seq 1 "$COUNT"); do
  SCENARIO=$(rand 10)

  if (( SCENARIO < 4 )); then
    # Access denied (brute force / credential stuffing) — triggers mysqlAccessDenied
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "${BAD_USERS[@]}")
    echo "$(prefix Warning) Access denied for user '${USER}'@'${IP}' (using password: YES)" >> "$LOG_FILE"

  elif (( SCENARIO < 6 )); then
    # Burst: rapid access denied from same IP
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "${BAD_USERS[@]}")
    for _ in 1 2 3 4 5; do
      echo "$(prefix Warning) Access denied for user '${USER}'@'${IP}' (using password: YES)" >> "$LOG_FILE"
    done

  elif (( SCENARIO < 8 )); then
    # Legit connect — triggers mysqlConnect
    IP=$(pick "${LEGIT_IPS[@]}")
    USER=$(pick "${LEGIT_USERS[@]}")
    echo "$(prefix Note) Connect ${USER}@${IP} on app_db" >> "$LOG_FILE"

  elif (( SCENARIO == 8 )); then
    # Too many connections (DoS indicator)
    IP=$(pick "${ATTACKERS[@]}")
    echo "$(prefix Error) Too many connections from '${IP}'" >> "$LOG_FILE"

  else
    # Generic note (noise)
    echo "$(prefix Note) Aborted connection from '$(pick "${LEGIT_IPS[@]}")' (Got an error reading communication packets)" >> "$LOG_FILE"
  fi

  if (( i % 50 == 0 )); then echo "  [$i/$COUNT]"; fi
  sleep_ms
done

echo "Done — wrote to $LOG_FILE"
