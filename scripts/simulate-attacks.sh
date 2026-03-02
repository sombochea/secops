#!/usr/bin/env bash
# simulate-attacks.sh — generates realistic security events into a JSONL file
# Usage: ./scripts/simulate-attacks.sh [output_file] [count]
set -euo pipefail

OUT="${1:-/tmp/events.jsonl}"
COUNT="${2:-100}"

ATTACKERS=("203.0.113.42" "198.51.100.7" "185.220.101.33" "45.155.205.99" "91.240.118.172" "178.128.23.15" "104.248.50.87" "159.89.173.104")
LEGIT_IPS=("10.0.0.5" "10.0.0.12" "192.168.1.100" "172.16.0.50")
HOSTS=("prod-web-01" "prod-db-01" "prod-api-02" "staging-app-01" "bastion-01" "prod-worker-03")
USERS=("root" "admin" "deploy" "ubuntu" "postgres" "nginx" "www-data")
BAD_USERS=("admin" "root" "test" "guest" "oracle" "ftpuser" "support" "info" "user1" "backup")
SERVICES=("sshd" "nginx" "postgresql" "mysql" "httpd")
AUTH_METHODS=("password" "publickey" "keyboard-interactive")
UA_LIST=(
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36"
  "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
  "curl/7.88.1"
  "python-requests/2.31.0"
  "Go-http-client/1.1"
  "Mozilla/5.0 (compatible; SecOpsBot/1.0)"
)
HTTP_PATHS=("/" "/api/login" "/api/users" "/admin" "/wp-login.php" "/.env" "/api/v1/tokens" "/phpmyadmin" "/actuator/health")

rand() { echo $(( RANDOM % $1 )); }
pick() { local arr=("$@"); echo "${arr[$(rand ${#arr[@]})]}"; }
now_minus() { date -u -v-"${1}"S +"%Y-%m-%dT%H:%M:%S+00:00" 2>/dev/null || date -u -d "-${1} seconds" +"%Y-%m-%dT%H:%M:%S+00:00"; }

echo "Generating $COUNT events → $OUT"

for i in $(seq 1 "$COUNT"); do
  # Time: spread over last 24 hours
  SECS=$(( RANDOM * 86400 / 32768 ))
  TS=$(now_minus "$SECS")
  HOST=$(pick "${HOSTS[@]}")
  SCENARIO=$(rand 10)

  if (( SCENARIO < 4 )); then
    # SSH brute force from attacker
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "${BAD_USERS[@]}")
    if (( $(rand 10) < 8 )); then
      echo "{\"event\":\"ssh_attempt\",\"status\":\"failed\",\"auth_method\":\"invalid_user\",\"host\":\"$HOST\",\"user\":\"$USER\",\"source_ip\":\"$IP\",\"service\":\"sshd\",\"pam_type\":\"auth\",\"timestamp\":\"$TS\"}"
    else
      echo "{\"event\":\"ssh_attempt\",\"status\":\"failed\",\"auth_method\":\"password\",\"host\":\"$HOST\",\"user\":\"$USER\",\"source_ip\":\"$IP\",\"service\":\"sshd\",\"pam_type\":\"auth\",\"timestamp\":\"$TS\"}"
    fi

  elif (( SCENARIO < 6 )); then
    # Legit SSH session
    IP=$(pick "${LEGIT_IPS[@]}")
    USER=$(pick "deploy" "ubuntu" "admin")
    AUTH=$(pick "${AUTH_METHODS[@]}")
    if (( $(rand 2) == 0 )); then
      echo "{\"event\":\"ssh_session_open\",\"status\":\"success\",\"auth_method\":\"$AUTH\",\"host\":\"$HOST\",\"user\":\"$USER\",\"source_ip\":\"$IP\",\"service\":\"sshd\",\"pam_type\":\"session\",\"timestamp\":\"$TS\"}"
    else
      echo "{\"event\":\"ssh_session_close\",\"status\":\"closed\",\"auth_method\":\"$AUTH\",\"host\":\"$HOST\",\"user\":\"$USER\",\"source_ip\":\"$IP\",\"service\":\"sshd\",\"pam_type\":\"session\",\"timestamp\":\"$TS\"}"
    fi

  elif (( SCENARIO < 8 )); then
    # HTTP requests (mix of legit and suspicious)
    PATH_=$(pick "${HTTP_PATHS[@]}")
    UA=$(pick "${UA_LIST[@]}")
    if [[ "$PATH_" == "/.env" || "$PATH_" == "/wp-login.php" || "$PATH_" == "/phpmyadmin" ]]; then
      IP=$(pick "${ATTACKERS[@]}")
      CODE="404"
      STATUS="failed"
    elif [[ "$PATH_" == "/admin" ]]; then
      IP=$(pick "${ATTACKERS[@]}")
      CODE="403"
      STATUS="failed"
    else
      IP=$(pick "${LEGIT_IPS[@]}" "${ATTACKERS[@]}")
      CODE=$(pick "200" "200" "200" "301" "404" "500")
      STATUS="success"
      (( CODE >= 400 )) && STATUS="failed"
    fi
    echo "{\"event\":\"http_request\",\"status\":\"$STATUS\",\"host\":\"$HOST\",\"source_ip\":\"$IP\",\"service\":\"nginx\",\"ua\":\"$UA\",\"timestamp\":\"$TS\",\"metadata\":{\"path\":\"$PATH_\",\"status_code\":\"$CODE\"}}"

  elif (( SCENARIO == 8 )); then
    # DB auth failure
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "root" "admin" "postgres" "sa")
    DB_SVC=$(pick "postgresql" "mysql")
    echo "{\"event\":\"${DB_SVC}_auth\",\"status\":\"failed\",\"host\":\"$HOST\",\"user\":\"$USER\",\"source_ip\":\"$IP\",\"service\":\"$DB_SVC\",\"timestamp\":\"$TS\"}"

  else
    # DB legit connection
    IP=$(pick "${LEGIT_IPS[@]}")
    USER=$(pick "app_user" "deploy" "postgres")
    DB_SVC=$(pick "postgresql" "mysql")
    echo "{\"event\":\"${DB_SVC}_connect\",\"status\":\"success\",\"host\":\"$HOST\",\"user\":\"$USER\",\"source_ip\":\"$IP\",\"service\":\"$DB_SVC\",\"timestamp\":\"$TS\"}"
  fi

done >> "$OUT"

echo "Done — wrote $COUNT events to $OUT"
