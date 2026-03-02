#!/usr/bin/env bash
# simulate-attacks.sh — generates realistic security events with exponential burst pattern
#
# Usage:
#   ./scripts/simulate-attacks.sh [output_file] [count] [delay_ms]
#
# Examples:
#   ./scripts/simulate-attacks.sh /tmp/events.jsonl 100          # instant, no delay
#   ./scripts/simulate-attacks.sh /tmp/events.jsonl 1000 100     # 100ms base delay, bursts accelerate
#
# With delay_ms set, events are written in waves that simulate escalating attacks:
#   Wave 1: slow (delay × 4)  — reconnaissance
#   Wave 2: medium (delay × 2) — probing
#   Wave 3: fast (delay × 1)   — active attack
#   Wave 4: burst (delay × 0.25) — full brute force
#   Then cycles back to slow
set -euo pipefail

OUT="${1:-/tmp/events.jsonl}"
COUNT="${2:-100}"
DELAY_MS="${3:-0}"

ATTACKERS=("203.0.113.42" "198.51.100.7" "185.220.101.33" "45.155.205.99" "91.240.118.172" "178.128.23.15" "104.248.50.87" "159.89.173.104")
LEGIT_IPS=("10.0.0.5" "10.0.0.12" "192.168.1.100" "172.16.0.50")
HOSTS=("prod-web-01" "prod-db-01" "prod-api-02" "staging-app-01" "bastion-01" "prod-worker-03")
BAD_USERS=("admin" "root" "test" "guest" "oracle" "ftpuser" "support" "info" "user1" "backup")
SERVICES=("sshd" "nginx" "postgresql" "mysql" "httpd")
AUTH_METHODS=("password" "publickey" "keyboard-interactive")
UA_LIST=(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  "curl/7.88.1"
  "python-requests/2.31.0"
  "Go-http-client/1.1"
)
HTTP_PATHS=("/" "/api/login" "/api/users" "/admin" "/wp-login.php" "/.env" "/api/v1/tokens" "/phpmyadmin" "/actuator/health")

# Wave multipliers: slow → medium → fast → burst
WAVE_MULT=(4.0 2.0 1.0 0.25)
WAVE_SIZE=$(( COUNT / 4 ))
(( WAVE_SIZE < 1 )) && WAVE_SIZE=1

rand() { echo $(( RANDOM % $1 )); }
pick() { local arr=("$@"); echo "${arr[$(rand ${#arr[@]})]}"; }

sleep_wave() {
  (( DELAY_MS == 0 )) && return
  local wave=$(( ($1 / WAVE_SIZE) % 4 ))
  local mult="${WAVE_MULT[$wave]}"
  local ms
  ms=$(printf '%.0f' "$(echo "$DELAY_MS * $mult" | bc)")
  # Convert ms to seconds for sleep
  local secs
  secs=$(echo "scale=3; $ms / 1000" | bc)
  sleep "$secs"
}

echo "Generating $COUNT events → $OUT (delay=${DELAY_MS}ms, wave_size=${WAVE_SIZE})"
if (( DELAY_MS > 0 )); then
  echo "  Waves: slow(${DELAY_MS}×4ms) → medium(${DELAY_MS}×2ms) → fast(${DELAY_MS}×1ms) → burst(${DELAY_MS}×0.25ms) → repeat"
fi

for i in $(seq 1 "$COUNT"); do
  TS=$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")
  HOST=$(pick "${HOSTS[@]}")
  SCENARIO=$(rand 10)

  if (( SCENARIO < 4 )); then
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "${BAD_USERS[@]}")
    AM="invalid_user"
    (( $(rand 10) >= 8 )) && AM="password"
    LINE="{\"event\":\"ssh_attempt\",\"status\":\"failed\",\"auth_method\":\"$AM\",\"host\":\"$HOST\",\"user\":\"$USER\",\"source_ip\":\"$IP\",\"service\":\"sshd\",\"pam_type\":\"auth\",\"timestamp\":\"$TS\"}"

  elif (( SCENARIO < 6 )); then
    IP=$(pick "${LEGIT_IPS[@]}")
    USER=$(pick "deploy" "ubuntu" "admin")
    AUTH=$(pick "${AUTH_METHODS[@]}")
    EV="ssh_session_open"; ST="success"
    (( $(rand 2) == 0 )) && EV="ssh_session_close" && ST="closed"
    LINE="{\"event\":\"$EV\",\"status\":\"$ST\",\"auth_method\":\"$AUTH\",\"host\":\"$HOST\",\"user\":\"$USER\",\"source_ip\":\"$IP\",\"service\":\"sshd\",\"pam_type\":\"session\",\"timestamp\":\"$TS\"}"

  elif (( SCENARIO < 8 )); then
    P=$(pick "${HTTP_PATHS[@]}")
    UA=$(pick "${UA_LIST[@]}")
    CODE="200"; STATUS="success"; IP=$(pick "${LEGIT_IPS[@]}")
    case "$P" in
      /.env|/wp-login.php|/phpmyadmin) IP=$(pick "${ATTACKERS[@]}"); CODE="404"; STATUS="failed" ;;
      /admin) IP=$(pick "${ATTACKERS[@]}"); CODE="403"; STATUS="failed" ;;
      *) (( $(rand 5) == 0 )) && CODE="500" && STATUS="failed" ;;
    esac
    LINE="{\"event\":\"http_request\",\"status\":\"$STATUS\",\"host\":\"$HOST\",\"source_ip\":\"$IP\",\"service\":\"nginx\",\"ua\":\"$UA\",\"timestamp\":\"$TS\",\"metadata\":{\"path\":\"$P\",\"status_code\":\"$CODE\"}}"

  elif (( SCENARIO == 8 )); then
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "root" "admin" "postgres" "sa")
    DB=$(pick "postgresql" "mysql")
    LINE="{\"event\":\"${DB}_auth\",\"status\":\"failed\",\"host\":\"$HOST\",\"user\":\"$USER\",\"source_ip\":\"$IP\",\"service\":\"$DB\",\"timestamp\":\"$TS\"}"

  else
    IP=$(pick "${LEGIT_IPS[@]}")
    USER=$(pick "app_user" "deploy" "postgres")
    DB=$(pick "postgresql" "mysql")
    LINE="{\"event\":\"${DB}_connect\",\"status\":\"success\",\"host\":\"$HOST\",\"user\":\"$USER\",\"source_ip\":\"$IP\",\"service\":\"$DB\",\"timestamp\":\"$TS\"}"
  fi

  echo "$LINE" >> "$OUT"

  # Progress
  if (( i % 50 == 0 )); then
    WAVE=$(( ((i-1) / WAVE_SIZE) % 4 ))
    LABELS=("RECON/slow" "PROBE/medium" "ATTACK/fast" "BRUTE/burst")
    echo "  [$i/$COUNT] ${LABELS[$WAVE]}"
  fi

  sleep_wave "$((i - 1))"
done

echo "Done — wrote $COUNT events to $OUT"
