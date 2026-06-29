#!/usr/bin/env bash
# Stop the Fictia dev stack (vite + express) started by pnpm dev.
# Kills anything bound to 3001/5173 plus the tsx watch / vite parents.

set -u

PORTS=(3001 5173)
PATTERNS=("tsx watch" "vite" "concurrently.*fictia" "pnpm.*dev")

echo "==> Stopping Fictia dev stack"

for p in "${PORTS[@]}"; do
  pids=$(ss -tlnpH "sport = :$p" 2>/dev/null \
    | grep -oP 'pid=\K[0-9]+' \
    | sort -u)
  for pid in $pids; do
    [ "$pid" = "0" ] && continue
    # Walk up to kill the parent process group so vite/tsx wrappers die too
    pgid=$(ps -o pgid= -p "$pid" 2>/dev/null | tr -d ' ')
    if [ -n "$pgid" ]; then
      kill -TERM "-$pgid" 2>/dev/null && echo "  port $p -> pgid $pgid (TERM)"
    else
      kill -TERM "$pid" 2>/dev/null && echo "  port $p -> pid $pid (TERM)"
    fi
  done
done

for pat in "${PATTERNS[@]}"; do
  pids=$(pgrep -f "$pat" 2>/dev/null || true)
  for pid in $pids; do
    [ "$pid" = "$$" ] && continue
    kill -TERM "$pid" 2>/dev/null && echo "  matched '$pat' -> pid $pid (TERM)"
  done
done

sleep 2

# Force kill stragglers
for p in "${PORTS[@]}"; do
  pids=$(ss -tlnpH "sport = :$p" 2>/dev/null | grep -oP 'pid=\K[0-9]+' | sort -u)
  for pid in $pids; do
    [ "$pid" = "0" ] && continue
    kill -KILL "$pid" 2>/dev/null && echo "  port $p -> pid $pid (KILL)"
  done
done

sleep 1
if ss -tln | grep -qE ':(3001|5173) '; then
  echo "✗ Still listening:"
  ss -tln | grep -E ':(3001|5173) '
  exit 1
fi
echo "==> All clear (3001/5173 free)"
