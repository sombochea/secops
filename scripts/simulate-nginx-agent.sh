#!/usr/bin/env bash
# simulate-nginx-agent.sh — writes nginx combined log lines to a file for the SecOps agent to tail
#
# Usage:
#   ./scripts/simulate-nginx-agent.sh [log_file] [count] [delay_ms]
#
# Examples:
#   ./scripts/simulate-nginx-agent.sh                              # /tmp/nginx.access.log, 200 lines, no delay
#   ./scripts/simulate-nginx-agent.sh /tmp/nginx.access.log 500   # 500 lines, no delay
#   ./scripts/simulate-nginx-agent.sh /tmp/nginx.access.log 500 200  # 200ms between lines
#
# Agent config (config.yaml):
#   logs:
#     - path: /tmp/nginx.access.log
#       format: nginx
#       host: prod-web-01
set -euo pipefail

LOG_FILE="${1:-/tmp/nginx.access.log}"
COUNT="${2:-200}"
DELAY_MS="${3:-0}"

ATTACKERS=("203.0.113.42" "198.51.100.7" "185.220.101.33" "45.155.205.99" "91.240.118.172" "178.128.23.15" "104.248.50.87" "159.89.173.104" "194.165.16.11" "5.188.206.14")
LEGIT_IPS=("10.0.0.5" "10.0.0.12" "192.168.1.100" "172.16.0.50" "10.0.1.20")

ATTACK_PATHS=(
  "/.env" "/.git/config" "/wp-login.php" "/wp-admin/"
  "/phpmyadmin/" "/admin" "/administrator" "/.aws/credentials"
  "/actuator/env" "/actuator/heapdump" "/shell.php" "/cmd.php"
  "/etc/passwd" "/../../../etc/passwd" "/xmlrpc.php" "/backup.sql"
  "/config.php.bak" "/db.sql" "/cgi-bin/test.cgi" "/upload.php"
)
LEGIT_PATHS=("/" "/index.html" "/api/health" "/api/v1/products" "/api/v1/orders" "/static/app.js" "/static/style.css" "/favicon.ico" "/robots.txt" "/api/v1/me")
LOGIN_PATHS=("/api/login" "/api/auth" "/wp-login.php" "/admin/login" "/api/v1/auth/token")

SCANNER_UAS=(
  "Nuclei - Open-source project (github.com/projectdiscovery/nuclei)"
  "sqlmap/1.7.8#stable (https://sqlmap.org)"
  "python-requests/2.31.0"
  "Go-http-client/1.1"
  "curl/7.88.1"
  "Nikto/2.1.6"
  "masscan/1.3.2"
  "WPScan v3.8.24"
  "zgrab/0.x"
  "Mozilla/5.0 (compatible; Nmap Scripting Engine)"
)
LEGIT_UAS=(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
  "Mozilla/5.0 (X11; Linux x86_64; rv:124.0) Gecko/20100101 Firefox/124.0"
)

rand() { echo $(( RANDOM % $1 )); }
pick() { local arr=("$@"); echo "${arr[$(rand ${#arr[@]})]}"; }

sleep_ms() {
  (( DELAY_MS == 0 )) && return
  sleep "$(echo "scale=3; $DELAY_MS / 1000" | bc)"
}

# Nginx combined log format:
# IP - user [DD/Mon/YYYY:HH:MM:SS +0000] "METHOD /path HTTP/1.1" STATUS BYTES "referer" "ua"
nginx_line() {
  local ip="$1" user="$2" method="$3" path="$4" code="$5" bytes="$6" ua="$7"
  local ts
  ts=$(date -u +"%d/%b/%Y:%H:%M:%S +0000")
  echo "${ip} - ${user} [${ts}] \"${method} ${path} HTTP/1.1\" ${code} ${bytes} \"-\" \"${ua}\""
}

echo "Writing $COUNT nginx log lines → $LOG_FILE (delay=${DELAY_MS}ms)"

for i in $(seq 1 "$COUNT"); do
  SCENARIO=$(rand 10)

  if (( SCENARIO < 4 )); then
    # Scanner / exploit attempt
    IP=$(pick "${ATTACKERS[@]}")
    PATH_=$(pick "${ATTACK_PATHS[@]}")
    UA=$(pick "${SCANNER_UAS[@]}")
    CODES=("400" "400" "403" "403" "404" "404" "404" "404" "200" "500")
    CODE=$(pick "${CODES[@]}")
    BYTES=$(( RANDOM % 2048 + 100 ))
    nginx_line "$IP" "-" "GET" "$PATH_" "$CODE" "$BYTES" "$UA" >> "$LOG_FILE"

  elif (( SCENARIO < 6 )); then
    # Brute force login
    IP=$(pick "${ATTACKERS[@]}")
    PATH_=$(pick "${LOGIN_PATHS[@]}")
    UA=$(pick "${SCANNER_UAS[@]}")
    CODES=("401" "401" "401" "403" "200")
    CODE=$(pick "${CODES[@]}")
    BYTES=$(( RANDOM % 512 + 50 ))
    nginx_line "$IP" "-" "POST" "$PATH_" "$CODE" "$BYTES" "$UA" >> "$LOG_FILE"

  elif (( SCENARIO < 9 )); then
    # Legit traffic
    IP=$(pick "${LEGIT_IPS[@]}")
    PATH_=$(pick "${LEGIT_PATHS[@]}")
    METHOD=$(pick "GET" "GET" "GET" "POST" "PUT")
    UA=$(pick "${LEGIT_UAS[@]}")
    CODES=("200" "200" "200" "201" "304" "404")
    CODE=$(pick "${CODES[@]}")
    BYTES=$(( RANDOM % 50000 + 500 ))
    nginx_line "$IP" "-" "$METHOD" "$PATH_" "$CODE" "$BYTES" "$UA" >> "$LOG_FILE"

  else
    # DDoS flood
    IP=$(pick "${ATTACKERS[@]}")
    UA=$(pick "${SCANNER_UAS[@]}")
    BYTES=$(( RANDOM % 200 + 50 ))
    nginx_line "$IP" "-" "GET" "/" "200" "$BYTES" "$UA" >> "$LOG_FILE"
  fi

  if (( i % 50 == 0 )); then
    echo "  [$i/$COUNT]"
  fi

  sleep_ms
done

echo "Done — wrote $COUNT lines to $LOG_FILE"
