#!/usr/bin/env bash
# Start the Fictia dev stack in the background.
# Vite (5173) + Express (3001) only bind to 127.0.0.1; nginx exposes the public
# port with basic auth. Requires nginx to already be running and @fictia/shared
# built (install-dev.sh handles both).

set -e

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

LOG_DIR="$HOME/fictia-logs"
LOG_FILE="$LOG_DIR/dev.log"
PID_FILE="$LOG_DIR/dev.pid"
PORTS=(3001 5173)
PUBLIC_PORT="${FICTIA_PUBLIC_PORT:-8080}"

mkdir -p "$LOG_DIR"

# detect_public_ip: prefer env var, then external services, then local iface.
detect_public_ip() {
  if [ -n "${FICTIA_PUBLIC_IP:-}" ]; then
    echo "$FICTIA_PUBLIC_IP"
    return
  fi
  for svc in "https://api.ipify.org" "https://ifconfig.me" "https://icanhazip.com"; do
    local ip
    ip=$(curl -fsS --max-time 5 "$svc" 2>/dev/null | tr -d '[:space:]' || true)
    if [ -n "$ip" ] && [[ "$ip" =~ ^[0-9]{1,3}(\.[0-9]{1,3}){3}$ ]]; then
      echo "$ip"
      return
    fi
  done
  hostname -I 2>/dev/null | awk '{print $1}'
}

# 1. Sanity: shared must be built (Express imports @fictia/shared/dist/index.js)
if [ ! -f "packages/shared/dist/index.js" ]; then
  echo "==> @fictia/shared not built. Running build first..."
  pnpm --filter @fictia/shared build
fi

# 2. Sanity: if something is already on the dev ports, refuse to start
for p in "${PORTS[@]}"; do
  if ss -tlnH "sport = :$p" 2>/dev/null | grep -q LISTEN; then
    echo "✗ Port $p is already in use. Run ./stop-dev.sh first."
    ss -tlnp | grep ":$p " || true
    exit 1
  fi
done

# 3. Sanity: nginx should be up so the public port is reachable
if ! ss -tlnH "sport = :${PUBLIC_PORT}" 2>/dev/null | grep -q LISTEN; then
  echo "⚠ nginx is not listening on ${PUBLIC_PORT}. The app will run but won't be reachable publicly."
  echo "  Fix: sudo systemctl reload nginx"
fi

# 4. Launch
echo "==> Starting pnpm dev (logs: $LOG_FILE)"
nohup pnpm dev > "$LOG_FILE" 2>&1 &
PID=$!
disown
echo "$PID" > "$PID_FILE"
echo "==> pid=$PID"

# 5. Wait for ports to come up (max 20s)
echo -n "==> Waiting for 3001/5173"
for i in $(seq 1 20); do
  ok=true
  for p in "${PORTS[@]}"; do
    ss -tlnH "sport = :$p" 2>/dev/null | grep -q LISTEN || ok=false
  done
  $ok && { echo " — up"; break; }
  echo -n "."
  sleep 1
done

if ! $ok; then
  echo " ✗ (timeout)"
  echo "--- tail of dev.log ---"
  tail -40 "$LOG_FILE"
  exit 1
fi

DETECTED_IP="$(detect_public_ip || true)"

echo "==> Ready"
echo "    Local:   http://127.0.0.1:5173"
if [ -n "$DETECTED_IP" ]; then
  echo "    Public:  http://${DETECTED_IP}:${PUBLIC_PORT}  (basic auth required; see OPS.md)"
else
  echo "    Public:  (could not auto-detect IP; set FICTIA_PUBLIC_IP or check manually)"
fi
echo "    Logs:    tail -f $LOG_FILE"
echo "    Stop:    $ROOT/stop-dev.sh"
