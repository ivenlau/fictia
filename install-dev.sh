#!/usr/bin/env bash
# One-shot provisioning for the Fictia dev environment.
# Idempotent — safe to re-run.
#
# What it does:
#   1. Verifies Node + pnpm toolchain
#   2. Runs pnpm install (workspace)
#   3. Creates .env from .env.example (only if missing)
#   4. Builds @fictia/shared (needed because server imports its dist/)
#   5. Installs nginx + apache2-utils via apt (only if missing)
#   6. Writes /etc/nginx/.htpasswd and the 8080 reverse-proxy site
#   7. Enables the site and reloads nginx
#
# Configuration (all optional, env vars):
#   FICTIA_AUTH_USER  (default: admin)
#   FICTIA_AUTH_PASS  (default: yourpassword  ← insecure placeholder, CHANGE IT)
#   FICTIA_PUBLIC_IP  (auto-detected; override if detection fails)
#   FICTIA_PUBLIC_PORT (default: 8080)
#
# After this script finishes, run ./start-dev.sh to launch the app.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

AUTH_USER="${FICTIA_AUTH_USER:-admin}"
AUTH_PASS="${FICTIA_AUTH_PASS:-yourpassword}"
PUBLIC_PORT="${FICTIA_PUBLIC_PORT:-8080}"
SITE_NAME="fictia"
SITE_PATH="/etc/nginx/sites-available/$SITE_NAME"
HTPASSWD_FILE="/etc/nginx/.htpasswd"

log()  { printf "\033[1;34m==>\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m⚠\033[0m  %s\n" "$*"; }
fail() { printf "\033[1;31m✗\033[0m  %s\n" "$*"; exit 1; }

# detect_public_ip: prefer env var, then external services, then local iface.
# Echoes the detected IP, or empty string if all strategies fail.
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

# ---- 1. Toolchain ----------------------------------------------------------
log "Checking toolchain"
command -v node >/dev/null || fail "node not found. Install Node 18+ first."
command -v pnpm >/dev/null || fail "pnpm not found. Install pnpm first (npm i -g pnpm)."

NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
[ "$NODE_MAJOR" -ge 18 ] || fail "Node $NODE_MAJOR detected, need >= 18."

log "  node $(node -v), pnpm $(pnpm -v)"

# ---- 2. pnpm install -------------------------------------------------------
if [ -d "node_modules" ] && [ -d "apps/server/node_modules" ] && [ -d "apps/web/node_modules" ]; then
  log "node_modules already present, skipping pnpm install"
else
  log "Running pnpm install"
  pnpm install
fi

# ---- 3. .env ----------------------------------------------------------------
if [ -f ".env" ]; then
  log ".env already exists, leaving it alone"
else
  if [ ! -f ".env.example" ]; then
    fail ".env.example missing — cannot seed .env"
  fi
  log "Creating .env from .env.example"
  cp .env.example .env
  # Make sure dev binds to loopback by default
  if ! grep -q '^HOST=' .env; then
    printf '\nHOST=127.0.0.1\n' >> .env
  fi
  warn ".env has empty LLM API keys — fill them in via the Settings UI in the app."
fi

# ---- 4. Build shared --------------------------------------------------------
if [ -f "packages/shared/dist/index.js" ]; then
  log "@fictia/shared already built"
else
  log "Building @fictia/shared"
  pnpm --filter @fictia/shared build
fi

# ---- 5. nginx + htpasswd utils --------------------------------------------
log "Checking nginx + apache2-utils"
NEED_APT=()
command -v nginx      >/dev/null || NEED_APT+=(nginx)
command -v htpasswd   >/dev/null || NEED_APT+=(apache2-utils)

if [ ${#NEED_APT[@]} -gt 0 ]; then
  if [ "$(id -u)" -ne 0 ] && ! command -v sudo >/dev/null; then
    fail "Need to install ${NEED_APT[*]} but neither root nor sudo is available."
  fi
  SUDO=""
  [ "$(id -u)" -ne 0 ] && SUDO="sudo"
  log "Installing ${NEED_APT[*]} (needs root)"
  $SUDO apt-get update -y
  $SUDO apt-get install -y "${NEED_APT[@]}"
fi

# ---- 6. htpasswd ------------------------------------------------------------
SUDO=""
[ "$(id -u)" -ne 0 ] && SUDO="sudo"

if [ -f "$HTPASSWD_FILE" ] && grep -q "^${AUTH_USER}:" "$HTPASSWD_FILE" 2>/dev/null; then
  log "$HTPASSWD_FILE already has user '$AUTH_USER', leaving it alone"
  log "  (To change the password: sudo htpasswd $HTPASSWD_FILE $AUTH_USER)"
else
  if [ "$AUTH_PASS" = "yourpassword" ]; then
    warn "Using INSECURE default password 'yourpassword'."
    warn "Change it before exposing 8080 publicly:"
    warn "    sudo htpasswd $HTPASSWD_FILE $AUTH_USER"
  fi
  log "Writing basic auth to $HTPASSWD_FILE (user=$AUTH_USER)"
  $SUDO htpasswd -cb "$HTPASSWD_FILE" "$AUTH_USER" "$AUTH_PASS"
  $SUDO chmod 640 "$HTPASSWD_FILE"
  $SUDO chown root:www-data "$HTPASSWD_FILE"
fi

# ---- 7. nginx site ----------------------------------------------------------
log "Writing nginx site: $SITE_PATH"
$SUDO tee "$SITE_PATH" >/dev/null <<NGINX
# Fictia dev server reverse proxy
# Listens on 0.0.0.0:${PUBLIC_PORT}, gated by basic auth, proxies to Vite (127.0.0.1:5173).

server {
    listen ${PUBLIC_PORT} default_server;
    listen [::]:${PUBLIC_PORT} default_server;
    server_name _;

    auth_basic "Fictia Dev";
    auth_basic_user_file ${HTPASSWD_FILE};

    location / {
        proxy_pass http://127.0.0.1:5173;
        proxy_http_version 1.1;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;

        # WebSocket upgrade (Vite HMR)
        proxy_set_header Upgrade           \$http_upgrade;
        proxy_set_header Connection        "upgrade";
        proxy_read_timeout                 86400;

        proxy_buffering                    off;
        proxy_cache                        off;
    }
}
NGINX

ENABLED="/etc/nginx/sites-enabled/$SITE_NAME"
if [ ! -e "$ENABLED" ]; then
  log "Enabling site"
  $SUDO ln -s "$SITE_PATH" "$ENABLED"
fi

# If this is a fresh nginx install, the default "sites-enabled/default" site
# listens on :80 and would shadow nothing for us, but disable it to keep things clean.
if [ -e /etc/nginx/sites-enabled/default ]; then
  warn "Removing default nginx site (port 80) to avoid confusion"
  $SUDO rm -f /etc/nginx/sites-enabled/default
fi

log "Testing nginx config"
$SUDO nginx -t

log "Reloading nginx"
$SUDO systemctl reload nginx

# ---- 8. Done ---------------------------------------------------------------
DETECTED_IP="$(detect_public_ip || true)"

cat <<DONE

\033[1;32m==> Dev environment ready\033[0m

DONE

if [ -n "$DETECTED_IP" ]; then
  printf "  Public URL : http://%s:%s\n" "$DETECTED_IP" "$PUBLIC_PORT"
else
  warn "Could not auto-detect public IP. Set FICTIA_PUBLIC_IP and re-run, or check manually."
  printf "  Local URL  : http://127.0.0.1:%s\n" "$PUBLIC_PORT"
fi
cat <<DONE
  Username   : ${AUTH_USER}
  Password   : ${AUTH_PASS}

  Next step  : ./start-dev.sh
DONE
