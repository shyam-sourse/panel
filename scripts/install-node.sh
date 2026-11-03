#!/usr/bin/env bash
set -euo pipefail

# Install the TerryPanel node daemon (Wings-compatible) on any Linux VPS.
# Works on KVM, LXC, OpenVZ, ARM, and containers because it only needs Node.js.
#
# Easy connect (one paste from the panel):
#   curl -fsSL https://panel.example.com/install-node.sh | bash -s -- \
#     --panel https://panel.example.com --enroll <enrollment-key>
#
# Manual install:
#   curl -fsSL https://raw.githubusercontent.com/<you>/terrypanel/main/scripts/install-node.sh | bash -s -- --port 8081

PORT="8081"
TOKEN=""
DATA_DIR="$HOME/.terrypanel"
PANEL_URL=""
ENROLL_KEY=""
NODE_NAME="$(hostname 2>/dev/null || echo node)"
REPO_URL="${TERRYPANEL_REPO:-https://github.com/yourname/terrypanel.git}"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

while [ $# -gt 0 ]; do
  case "$1" in
    --port) PORT="$2"; shift 2 ;;
    --token) TOKEN="$2"; shift 2 ;;
    --dir) DATA_DIR="$2"; shift 2 ;;
    --panel) PANEL_URL="$2"; shift 2 ;;
    --enroll) ENROLL_KEY="$2"; shift 2 ;;
    --name) NODE_NAME="$2"; shift 2 ;;
    *) echo "Unknown argument: $1"; exit 1 ;;
  esac
done

if [ -z "$TOKEN" ]; then
  TOKEN="$(node -e 'console.log(require("crypto").randomBytes(24).toString("hex"))' 2>/dev/null || openssl rand -hex 24)"
fi

echo "==> TerryPanel node installer"

if ! command -v node >/dev/null 2>&1; then
  echo "  Node.js not found, installing Node.js 20..."
  if command -v apt-get >/dev/null 2>&1; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | (sudo -E bash - || bash -)
    (sudo -E apt-get install -y nodejs || apt-get install -y nodejs)
  elif command -v dnf >/dev/null 2>&1; then
    curl -fsSL https://rpm.nodesource.com/setup_20.x | (sudo -E bash - || bash -)
    (sudo -E dnf install -y nodejs || dnf install -y nodejs)
  else
    echo "  Install Node.js 18+ manually and retry."; exit 1
  fi
fi
echo "  ok Node.js $(node -v)"

mkdir -p "$DATA_DIR/daemon/lib"

# Prefer files served by the panel, fall back to cloning the repository.
if [ -n "$PANEL_URL" ] && curl -fsSL --max-time 20 "$PANEL_URL/install-node.sh" -o "$TMP_DIR/self.sh" 2>/dev/null; then
  echo "  ok connected to panel at $PANEL_URL"
fi

if command -v git >/dev/null 2>&1; then
  git clone --depth 1 "$REPO_URL" "$TMP_DIR/repo" >/dev/null 2>&1 && cp -r "$TMP_DIR/repo/daemon/." "$DATA_DIR/daemon/"
elif [ -n "$PANEL_URL" ]; then
  for file in daemon.js lib/env.js lib/util.js lib/system.js lib/process-manager.js; do
    mkdir -p "$DATA_DIR/daemon/$(dirname "$file")"
    curl -fsSL --max-time 20 "$PANEL_URL/daemon/$file" -o "$DATA_DIR/daemon/$file"
  done
else
  echo "  git not found. Please copy the daemon directory manually."
  exit 1
fi

if [ ! -f "$DATA_DIR/daemon/daemon.js" ]; then
  echo "  Could not download the daemon. Check the panel URL and retry."
  exit 1
fi

cat > "$DATA_DIR/daemon/.env" <<EOF
DAEMON_PORT=$PORT
DAEMON_HOST=0.0.0.0
DAEMON_TOKEN=$TOKEN
DAEMON_DATA_DIR=$DATA_DIR/data
EOF
chmod 600 "$DATA_DIR/daemon/.env"

cat > "$DATA_DIR/daemon/start.sh" <<EOF
#!/bin/sh
set -e
cd "\$(dirname "\$0")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
exec node daemon.js
EOF
chmod +x "$DATA_DIR/daemon/start.sh"

IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"

if command -v systemctl >/dev/null 2>&1; then
  UNIT_DIR="/etc/systemd/system"
  if [ "$(id -u)" != "0" ]; then
    UNIT_DIR="$HOME/.config/systemd/user"
    mkdir -p "$UNIT_DIR"
  fi
  cat > "$UNIT_DIR/terrypanel-node.service" <<EOF
[Unit]
Description=TerryPanel Node Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=$DATA_DIR/daemon
ExecStart=$DATA_DIR/daemon/start.sh
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
  if [ "$(id -u)" = "0" ]; then
    systemctl daemon-reload
    systemctl enable terrypanel-node
    systemctl restart terrypanel-node
  else
    systemctl --user daemon-reload
    systemctl --user enable terrypanel-node
    systemctl --user restart terrypanel-node
  fi
  echo "  ok systemd service terrypanel-node started"
else
  ( cd "$DATA_DIR/daemon" && nohup ./start.sh > "$DATA_DIR/daemon.log" 2>&1 & echo $! > "$DATA_DIR/daemon.pid" )
  echo "  ok daemon started in background"
fi

sleep 2

if [ -n "$PANEL_URL" ] && [ -n "$ENROLL_KEY" ]; then
  echo "  registering node with the panel..."
  REGISTER_BODY="$(DAEMON_PORT_VALUE="$PORT" DAEMON_TOKEN_VALUE="$TOKEN" node -e '
    const http = require("http");
    const https = require("https");
    const [panel, enroll, host, name] = process.argv.slice(1);
    const body = Buffer.from(JSON.stringify({
      enroll,
      host,
      port: Number(process.env.DAEMON_PORT_VALUE),
      token: process.env.DAEMON_TOKEN_VALUE,
      name,
    }));
    const url = new URL("/api/nodes/self-register", panel);
    const lib = url.protocol === "https:" ? https : http;
    const req = lib.request({
      method: "POST",
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: url.pathname,
      headers: { "content-type": "application/json", "content-length": body.length },
      timeout: 10000,
    }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => { console.log(data); process.exit(res.statusCode >= 400 ? 1 : 0); });
    });
    req.on("error", (e) => { console.error(e.message); process.exit(1); });
    req.on("timeout", () => { req.destroy(); process.exit(1); });
    req.write(body);
    req.end();
  ' "$PANEL_URL" "$ENROLL_KEY" "$IP" "$NODE_NAME" 2>/dev/null)" || true
  if [ -n "$REGISTER_BODY" ]; then
    echo "  ok panel registration response: $REGISTER_BODY"
  else
    echo "  !  automatic registration failed. Add the node manually using the values below."
  fi
fi

echo ""
echo "Node daemon is ready."
echo "  Host:  $IP"
echo "  Port:  $PORT"
echo "  Token: $TOKEN"
echo ""
if [ -n "$PANEL_URL" ] && [ -n "$ENROLL_KEY" ]; then
  echo "If auto-registration succeeded the node already appears in the panel."
else
  echo "Add this node in the panel: Admin > Nodes > Add existing node."
fi
