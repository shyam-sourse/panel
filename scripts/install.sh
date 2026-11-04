#!/usr/bin/env bash
set -euo pipefail

# TerryPanel one-line installer
# Usage: curl -fsSL https://raw.githubusercontent.com/<you>/terrypanel/main/scripts/install.sh | bash

REPO_URL="${TERRYPANEL_REPO:-https://github.com/shyam-sourse/panel.git}"
INSTALL_DIR="${TERRYPANEL_DIR:-$HOME/panel}"
PORT="${PORT:-3000}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123}"

color() { printf "\033[%sm%s\033[0m\n" "$1" "$2"; }
info() { color "36" "==> $1"; }
ok() { color "32" "  ok $1"; }
warn() { color "33" "  !  $1"; }
fail() { color "31" "  x  $1"; exit 1; }

info "TerryPanel installer"

if ! command -v node >/dev/null 2>&1; then
  warn "Node.js not found. Installing Node.js 20..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | (sudo -E bash - || bash -)
    (sudo -E apt-get install -y nodejs || apt-get install -y nodejs)
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | (sudo -E bash - || bash -)
    (sudo -E dnf install -y nodejs || dnf install -y nodejs)
  else
    fail "Please install Node.js 18+ manually and re-run."
  fi
fi

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 18 ]; then
  fail "Node.js 18+ is required (found $(node -v))."
fi
ok "Node.js $(node -v)"

if ! command -v git >/dev/null 2>&1; then
  warn "git not found, attempting to install..."
  if command -v apt-get >/dev/null 2>&1; then
    (sudo -E apt-get install -y git || apt-get install -y git)
  fi
fi

if [ -d "$INSTALL_DIR/.git" ]; then
  info "Updating existing installation in $INSTALL_DIR"
  git -C "$INSTALL_DIR" pull --ff-only
else
  info "Cloning TerryPanel into $INSTALL_DIR"
  git clone --depth 1 "$REPO_URL" "$INSTALL_DIR"
fi

cd "$INSTALL_DIR"
info "Installing dependencies"
npm install --omit=dev

if [ ! -f .env ]; then
  info "Generating .env"
  SECRET="$(node -e 'console.log(require("crypto").randomBytes(48).toString("hex"))')"
  cat > .env <<EOF
PORT=$PORT
HOST=0.0.0.0
TP_DATA_DIR=$INSTALL_DIR/data
TP_SECRET=$SECRET
ADMIN_USERNAME=$ADMIN_USERNAME
ADMIN_PASSWORD=$ADMIN_PASSWORD
PUBLIC_URL=http://localhost:$PORT
EOF
  chmod 600 .env
  ok "Created .env"
else
  ok "Keeping existing .env"
fi

info "Starting TerryPanel"

if command -v systemctl >/dev/null 2>&1 && [ "$(id -u)" = "0" ]; then
  cat > /etc/systemd/system/terrypanel.service <<EOF
[Unit]
Description=TerryPanel
After=network.target

[Service]
Type=simple
WorkingDirectory=$INSTALL_DIR
EnvironmentFile=$INSTALL_DIR/.env
ExecStart=$(command -v node) $INSTALL_DIR/panel/server.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
  systemctl enable terrypanel
  systemctl restart terrypanel
  ok "Systemd service terrypanel started"
  echo ""
  color "32" "TerryPanel is running at http://<server-ip>:$PORT"
  echo "  Login: $ADMIN_USERNAME / $ADMIN_PASSWORD"
  echo "  Logs:  journalctl -u terrypanel -f"
else
  warn "Not running as root or systemd missing. Starting in background with nohup."
  ( set -a; . ./.env; set +a; nohup node panel/server.js > terrypanel.log 2>&1 & echo $! > terrypanel.pid )
  sleep 2
  ok "Started with PID $(cat terrypanel.pid)"
  echo ""
  color "32" "TerryPanel is running at http://<server-ip>:$PORT"
  echo "  Login: $ADMIN_USERNAME / $ADMIN_PASSWORD"
  echo "  Logs:  tail -f $INSTALL_DIR/terrypanel.log"
fi

echo ""
echo "Next steps:"
echo "  1. Open the panel and change the admin password."
echo "  2. Go to Nodes > Add node via SSH to connect your VPSes."
echo "  3. Optional: Settings > Cloudflare Tunnel and paste your tunnel token."
echo "  4. Run: node $INSTALL_DIR/cli/status.js --url http://<server-ip>:$PORT"
