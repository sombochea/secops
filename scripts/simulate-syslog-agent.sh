#!/usr/bin/env bash
# simulate-syslog-agent.sh — writes SSH/PAM syslog lines for the SecOps agent to tail
#
# Usage:
#   ./scripts/simulate-syslog-agent.sh [log_file] [count] [delay_ms]
#
# Examples:
#   ./scripts/simulate-syslog-agent.sh                                   # /tmp/auth.log, 200 lines
#   ./scripts/simulate-syslog-agent.sh /tmp/auth.log 500
#   ./scripts/simulate-syslog-agent.sh /tmp/auth.log 500 150             # 150ms between lines
#
# Agent config (config.yaml):
#   logs:
#     - path: /tmp/auth.log
#       format: syslog
#       host: prod-bastion-01
set -euo pipefail

LOG_FILE="${1:-/tmp/auth.log}"
COUNT="${2:-200}"
DELAY_MS="${3:-0}"

HOSTNAME="prod-bastion-01"

ATTACKERS=("203.0.113.42" "198.51.100.7" "185.220.101.33" "45.155.205.99" "91.240.118.172" "178.128.23.15" "104.248.50.87" "159.89.173.104" "194.165.16.11" "5.188.206.14")
LEGIT_IPS=("10.0.0.5" "10.0.0.12" "192.168.1.100" "172.16.0.50")

BAD_USERS=("admin" "root" "test" "guest" "oracle" "ftpuser" "support" "info" "user1" "backup" "ubuntu" "pi" "deploy" "git" "postgres" "mysql" "www-data")
LEGIT_USERS=("deploy" "ubuntu" "admin" "sysop")
AUTH_METHODS=("password" "publickey" "keyboard-interactive")

rand() { echo $(( RANDOM % $1 )); }
pick() { local arr=("$@"); echo "${arr[$(rand ${#arr[@]})]}"; }

sleep_ms() {
  (( DELAY_MS == 0 )) && return
  sleep "$(echo "scale=3; $DELAY_MS / 1000" | bc)"
}

# Syslog timestamp: "Mar  3 12:00:00"
syslog_ts() {
  date "+%b %e %H:%M:%S"
}

# Syslog prefix: "Mar  3 12:00:00 hostname sshd[PID]: "
prefix() {
  local pid=$(( RANDOM % 60000 + 1000 ))
  echo "$(syslog_ts) ${HOSTNAME} sshd[${pid}]:"
}

pam_prefix() {
  local pid=$(( RANDOM % 60000 + 1000 ))
  echo "$(syslog_ts) ${HOSTNAME} sshd[${pid}]:"
}

echo "Writing $COUNT syslog lines → $LOG_FILE (delay=${DELAY_MS}ms)"

for i in $(seq 1 "$COUNT"); do
  SCENARIO=$(rand 10)

  if (( SCENARIO < 4 )); then
    # Failed password / invalid user (brute force)
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "${BAD_USERS[@]}")
    PORT=$(( RANDOM % 40000 + 20000 ))
    if (( $(rand 2) == 0 )); then
      # Invalid user variant — triggers sshInvalidRe + sshFailedRe
      echo "$(prefix) Invalid user ${USER} from ${IP} port ${PORT}" >> "$LOG_FILE"
      echo "$(prefix) Failed password for invalid user ${USER} from ${IP} port ${PORT} ssh2" >> "$LOG_FILE"
    else
      # Known user, wrong password — triggers sshFailedRe
      echo "$(prefix) Failed password for ${USER} from ${IP} port ${PORT} ssh2" >> "$LOG_FILE"
    fi

  elif (( SCENARIO < 6 )); then
    # Successful login + session open (legit)
    IP=$(pick "${LEGIT_IPS[@]}")
    USER=$(pick "${LEGIT_USERS[@]}")
    PORT=$(( RANDOM % 40000 + 20000 ))
    AUTH=$(pick "${AUTH_METHODS[@]}")
    echo "$(prefix) Accepted ${AUTH} for ${USER} from ${IP} port ${PORT} ssh2" >> "$LOG_FILE"
    # PAM session opened
    local_pid=$(( RANDOM % 60000 + 1000 ))
    echo "$(syslog_ts) ${HOSTNAME} sshd[${local_pid}]: pam_unix(sshd:session): session opened for user ${USER} by (uid=0)" >> "$LOG_FILE"

  elif (( SCENARIO < 7 )); then
    # Session close (legit)
    USER=$(pick "${LEGIT_USERS[@]}")
    local_pid=$(( RANDOM % 60000 + 1000 ))
    echo "$(syslog_ts) ${HOSTNAME} sshd[${local_pid}]: pam_unix(sshd:session): session closed for user ${USER}" >> "$LOG_FILE"

  elif (( SCENARIO < 8 )); then
    # Repeated rapid failures from same IP (burst brute force)
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "${BAD_USERS[@]}")
    for _ in 1 2 3 4 5; do
      PORT=$(( RANDOM % 40000 + 20000 ))
      echo "$(prefix) Failed password for invalid user ${USER} from ${IP} port ${PORT} ssh2" >> "$LOG_FILE"
    done

  elif (( SCENARIO == 8 )); then
    # Disconnected / connection reset (noise)
    IP=$(pick "${ATTACKERS[@]}")
    PORT=$(( RANDOM % 40000 + 20000 ))
    echo "$(prefix) Received disconnect from ${IP} port ${PORT}:11: Bye Bye [preauth]" >> "$LOG_FILE"

  else
    # publickey failure (credential stuffing with stolen keys)
    IP=$(pick "${ATTACKERS[@]}")
    USER=$(pick "${LEGIT_USERS[@]}")
    PORT=$(( RANDOM % 40000 + 20000 ))
    echo "$(prefix) Failed publickey for ${USER} from ${IP} port ${PORT} ssh2" >> "$LOG_FILE"
  fi

  if (( i % 50 == 0 )); then
    echo "  [$i/$COUNT]"
  fi

  sleep_ms
done

echo "Done — wrote to $LOG_FILE"
