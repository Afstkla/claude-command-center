#!/bin/bash
# Network connectivity monitor for debugging intermittent Tailscale/network issues
# Logs to: ~/Developer/claude-command-center/logs/network-monitor.log

LOG_DIR="$HOME/Developer/claude-command-center/logs"
LOG_FILE="$LOG_DIR/network-monitor.log"
INTERVAL=30  # seconds between checks

mkdir -p "$LOG_DIR"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG_FILE"
}

check_connectivity() {
  local ts
  ts=$(date '+%Y-%m-%d %H:%M:%S')

  # --- Interface status ---
  local en0_ip en1_ip ts_ip default_if
  en0_ip=$(ipconfig getifaddr en0 2>/dev/null || echo "DOWN")
  en1_ip=$(ipconfig getifaddr en1 2>/dev/null || echo "DOWN")
  ts_ip=$(tailscale ip -4 2>/dev/null || echo "DOWN")
  default_if=$(route -n get default 2>/dev/null | awk '/interface:/{print $2}')

  # --- Ping tests (1 packet, 2s timeout) ---
  local ping_gw ping_dns ping_api ping_ts
  ping_gw=$(ping -c1 -W2 192.168.68.1 2>&1 | awk -F'=' '/time=/{print $NF}' || echo "FAIL")
  ping_dns=$(ping -c1 -W2 1.1.1.1 2>&1 | awk -F'=' '/time=/{print $NF}' || echo "FAIL")
  ping_api=$(ping -c1 -W2 api.anthropic.com 2>&1 | awk -F'=' '/time=/{print $NF}' || echo "FAIL")

  # --- Tailscale status ---
  local ts_status ts_peers_offline
  ts_status=$(tailscale status --json 2>/dev/null | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('BackendState','unknown'))" 2>/dev/null || echo "error")
  ts_peers_offline=$(tailscale status 2>/dev/null | grep -c "offline" || echo "0")

  # --- DNS resolution test ---
  local dns_time
  dns_time=$(python3 -c "
import time, socket
start = time.time()
try:
    socket.getaddrinfo('api.anthropic.com', 443)
    print(f'{(time.time()-start)*1000:.0f}ms')
except:
    print('FAIL')
" 2>/dev/null)

  # --- TCP connect test to Anthropic API ---
  local tcp_time
  tcp_time=$(python3 -c "
import time, socket
start = time.time()
try:
    s = socket.create_connection(('api.anthropic.com', 443), timeout=5)
    s.close()
    print(f'{(time.time()-start)*1000:.0f}ms')
except Exception as e:
    print(f'FAIL:{e}')
" 2>/dev/null)

  # --- HTTPS test to Anthropic API ---
  local https_time
  https_time=$(curl -s -o /dev/null -w "%{time_total}" --connect-timeout 5 --max-time 10 https://api.anthropic.com 2>/dev/null || echo "FAIL")

  # --- Determine if there's a problem ---
  local status="OK"
  if [[ "$ping_gw" == "FAIL" ]] || [[ "$tcp_time" == FAIL* ]] || [[ "$https_time" == "FAIL" ]]; then
    status="PROBLEM"
  fi

  # --- Log ---
  log "$status | if=$default_if en0=$en0_ip en1=$en1_ip ts=$ts_ip | gw=${ping_gw} dns=${ping_dns} api=${ping_api} | dns_resolve=${dns_time} tcp=${tcp_time} https=${https_time}s | tailscale=$ts_status offline_peers=$ts_peers_offline"

  # --- Extra detail on problems ---
  if [[ "$status" == "PROBLEM" ]]; then
    log "DETAIL: route=$(route -n get default 2>&1 | grep -E 'gateway|interface' | tr '\n' ' ')"
    log "DETAIL: tailscale_status=$(tailscale status 2>&1 | head -5 | tr '\n' ' ')"
  fi
}

log "=== Monitor started (interval=${INTERVAL}s) ==="
log "Interfaces: en0=$(ipconfig getifaddr en0 2>/dev/null) en1=$(ipconfig getifaddr en1 2>/dev/null) ts=$(tailscale ip -4 2>/dev/null)"

while true; do
  check_connectivity
  sleep "$INTERVAL"
done
