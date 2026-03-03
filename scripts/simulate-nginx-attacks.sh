#!/usr/bin/env bash
# simulate-nginx-attacks.sh — sends realistic nginx access log events to SecOps webhook
#
# Usage:
#   ./scripts/simulate-nginx-attacks.sh <webhook_url> <webhook_key> [count] [delay_ms]
#
# Examples:
#   ./scripts/simulate-nginx-attacks.sh http://localhost:3000 whk_xxx 200
#   ./scripts/simulate-nginx-attacks.sh http://localhost:3000 whk_xxx 500 100
set -euo pipefail

WEBHOOK_URL="${1:-http://localhost:3000}"
WEBHOOK_KEY="${2:?Usage: $0 <webhook_url> <webhook_key> [count] [delay_ms]}"
COUNT="${3:-200}"
DELAY_MS="${4:-0}"

ATTACKERS=("203.0.113.42" "198.51.100.7" "185.220.101.33" "45.155.205.99" "91.240.118.172" "178.128.23.15" "104.248.50.87" "159.89.173.104" "194.165.16.11" "5.188.206.14")
LEGIT_IPS=("10.0.0.5" "10.0.0.12" "192.168.1.100" "172.16.0.50" "10.0.1.20")
HOSTS=("prod-web-01" "prod-web-02" "prod-api-01" "staging-web-01" "cdn-edge-01")

# Attack paths — scanners, exploits, recon
ATTACK_PATHS=(
  "/.env" "/.git/config" "/wp-login.php" "/wp-admin/" "/phpmyadmin/"
  "/admin" "/administrator" "/manager/html" "/.aws/credentials"
  "/api/v1/users" "/api/v1/admin" "/actuator/env" "/actuator/heapdump"
  "/cgi-bin/test.cgi" "/shell.php" "/cmd.php" "/upload.php"
  "/etc/passwd" "/proc/self/environ" "/../../../etc/passwd"
  "/xmlrpc.php" "/config.php.bak" "/backup.sql" "/db.sql"
)

# Legit paths
LEGIT_PATHS=("/" "/index.html" "/api/health" "/api/v1/products" "/api/v1/orders" "/static/app.js" "/static/style.css" "/favicon.ico" "/robots.txt" "/api/v1/me")

# User agents
SCANNER_UAS=(
  "Nuclei - Open-source project (github.com/projectdiscovery/nuclei)"
  "sqlmap/1.7.8#stable (https://sqlmap.org)"
  "Mozilla/5.0 (compatible; Nmap Scripting Engine)"
  "python-requests/2.31.0"
  "Go-http-client/1.1"
  "curl/7.88.1"
  "Nikto/2.1.6"
  "masscan/1.3.2"
  "zgrab/0.x"
  "WPScan v3.8.24"
)
LEGIT_UAS=(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
  "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"
)

METHODS=("GET" "POST" "PUT" "DELETE" "HEAD" "OPTIONS")
ATTACK_METHODS=("GET" "GET" "GET" "POST" "POST" "HEAD")

rand() { echo $(( RANDOM % $1 )); }
pick() { local arr=("$@"); echo "${arr[$(rand ${#arr[@]})]}"; }

sleep_ms() {
  (( DELAY_MS == 0 )) && return
  sleep "$(echo "scale=3; $DELAY_MS / 1000" | bc)"
}

send() {
  curl -sf -X POST "${WEBHOOK_URL}/api/webhook" \
    -H "Content-Type: application/json" \
    -H "x-webhook-secret: ${WEBHOOK_KEY}" \
    -d "$1" > /dev/null
}

echo "Sending $COUNT nginx events → ${WEBHOOK_URL} (delay=${DELAY_MS}ms)"

OK=0; FAIL=0

for i in $(seq 1 "$COUNT"); do
  TS=$(date -u +"%Y-%m-%dT%H:%M:%S+00:00")
  HOST=$(pick "${HOSTS[@]}")
  SCENARIO=$(rand 10)

  if (( SCENARIO < 5 )); then
    # ── Attack: scanner / exploit attempt ──────────────────────────────────
    IP=$(pick "${ATTACKERS[@]}")
    PATH_=$(pick "${ATTACK_PATHS[@]}")
    METHOD=$(pick "${ATTACK_METHODS[@]}")
    UA=$(pick "${SCANNER_UAS[@]}")
    # Mostly 404/403/400, occasionally 200 (found something)
    CODES=("400" "400" "403" "403" "404" "404" "404" "404" "200" "500")
    CODE=$(pick "${CODES[@]}")
    [[ "$CODE" == "200" ]] && STATUS="suspicious" || STATUS="failed"
    BYTES=$(( RANDOM % 2048 + 100 ))
    PAYLOAD="{\"event\":\"http_request\",\"status\":\"$STATUS\",\"host\":\"$HOST\",\"source_ip\":\"$IP\",\"service\":\"nginx\",\"ua\":\"$UA\",\"timestamp\":\"$TS\",\"metadata\":{\"method\":\"$METHOD\",\"path\":\"$PATH_\",\"status_code\":$CODE,\"bytes\":$BYTES,\"type\":\"attack\"}}"

  elif (( SCENARIO < 7 )); then
    # ── Brute force: rapid POST to login endpoints ─────────────────────────
    IP=$(pick "${ATTACKERS[@]}")
    LOGIN_PATHS=("/api/login" "/api/auth" "/wp-login.php" "/admin/login" "/api/v1/auth/token")
    PATH_=$(pick "${LOGIN_PATHS[@]}")
    UA=$(pick "${SCANNER_UAS[@]}")
    CODES=("401" "401" "401" "403" "200")
    CODE=$(pick "${CODES[@]}")
    [[ "$CODE" == "200" ]] && STATUS="suspicious" || STATUS="failed"
    BYTES=$(( RANDOM % 512 + 50 ))
    PAYLOAD="{\"event\":\"http_brute_force\",\"status\":\"$STATUS\",\"host\":\"$HOST\",\"source_ip\":\"$IP\",\"service\":\"nginx\",\"ua\":\"$UA\",\"timestamp\":\"$TS\",\"metadata\":{\"method\":\"POST\",\"path\":\"$PATH_\",\"status_code\":$CODE,\"bytes\":$BYTES,\"type\":\"brute_force\"}}"

  elif (( SCENARIO < 9 )); then
    # ── Legit traffic ──────────────────────────────────────────────────────
    IP=$(pick "${LEGIT_IPS[@]}")
    PATH_=$(pick "${LEGIT_PATHS[@]}")
    METHOD=$(pick "GET" "GET" "GET" "POST" "PUT")
    UA=$(pick "${LEGIT_UAS[@]}")
    CODES=("200" "200" "200" "201" "304" "404" "500")
    CODE=$(pick "${CODES[@]}")
    [[ "$CODE" =~ ^(200|201|304)$ ]] && STATUS="success" || STATUS="failed"
    BYTES=$(( RANDOM % 50000 + 500 ))
    PAYLOAD="{\"event\":\"http_request\",\"status\":\"$STATUS\",\"host\":\"$HOST\",\"source_ip\":\"$IP\",\"service\":\"nginx\",\"ua\":\"$UA\",\"timestamp\":\"$TS\",\"metadata\":{\"method\":\"$METHOD\",\"path\":\"$PATH_\",\"status_code\":$CODE,\"bytes\":$BYTES,\"type\":\"legit\"}}"

  else
    # ── DDoS-style flood: high volume from single IP ───────────────────────
    IP=$(pick "${ATTACKERS[@]}")
    PATH_=$(pick "/" "/api/v1/products" "/api/health")
    UA=$(pick "${SCANNER_UAS[@]}")
    CODE="200"; STATUS="suspicious"
    BYTES=$(( RANDOM % 200 + 50 ))
    PAYLOAD="{\"event\":\"http_flood\",\"status\":\"$STATUS\",\"host\":\"$HOST\",\"source_ip\":\"$IP\",\"service\":\"nginx\",\"ua\":\"$UA\",\"timestamp\":\"$TS\",\"metadata\":{\"method\":\"GET\",\"path\":\"$PATH_\",\"status_code\":$CODE,\"bytes\":$BYTES,\"type\":\"flood\"}}"
  fi

  if send "$PAYLOAD"; then
    (( OK++ ))
  else
    (( FAIL++ ))
  fi

  if (( i % 50 == 0 )); then
    echo "  [$i/$COUNT] sent=$OK failed=$FAIL"
  fi

  sleep_ms
done

echo "Done — sent=$OK failed=$FAIL (total=$COUNT)"
