# TerryPanel

A lightweight game, bot, and app hosting panel for **any VPS** — including cheap OpenVZ / LXC containers that cannot run KVM-based panels like Pterodactyl.

TerryPanel gives you a familiar Pterodactyl-style experience without Docker, KVM, or kernel modules. It manages real Linux processes, so it runs anywhere Node.js runs: budget VPS, OpenVZ, LXC, bare metal, ARM SBCs, even a Raspberry Pi.

```
 +---------------------+          HTTPS/HTTP           +----------------------------+
 |   Panel (web UI)    |  -------------------------->  |   Node daemon (tiny)       |
 |   Express + WebUI   |   token-authenticated API     |   zero dependencies         |
 +---------------------+                               +----------------------------+
            |                                                        |
            | Cloudflare Tunnel (token only)                        | spawns / manages
            v                                                        v
    panel.yourdomain.com                              Minecraft, Discord bots, Node/Python apps
```

## Features

- **Works on non-KVM VPS** — no Docker, no KVM, no OpenVZ restrictions. Uses plain processes.
- **One-token Cloudflare Tunnel** — paste only the tunnel token and the panel exposes itself publicly.
- **SSH node onboarding** — add a VPS with user, password/key, IP and SSH port. The panel installs Node.js, uploads the daemon, registers a systemd service and verifies health automatically.
- **Multi-node** — attach as many VPSes as you want, each with its own daemon.
- **Admin customization** — panel name, tagline, logo, accent colors, light/dark theme, announcements, default egg, public status toggle.
- **Real-time console** — live output, command input, CPU / memory / uptime stats, auto-restart on crash.
- **Built-in file manager** — browse, edit, upload, create, rename, and delete files per server.
- **Eggs (templates)** — one-click deploy for Discord bots (discord.js / discord.py), Minecraft Paper & Vanilla, Express, Flask, and generic Node/Python apps.
- **Status command** — `npm run status` prints a colored table of every server with running/offline/errored state, uptime, CPU and memory.
- **Public status page** — optional JSON status endpoint and an in-panel live status view.
- **Users & roles** — admin and user accounts, per-server ownership, password reset.
- **Audit log** — logins, server actions, node installs, settings changes.

## Requirements

| Component | Requirement |
|-----------|-------------|
| Panel host | Node.js 18+ (20+ recommended), 512 MB RAM |
| Node (game) host | Node.js 18+, any Linux VPS (KVM, LXC, OpenVZ, ARM) |
| Minecraft egg | Java 17+ installed on the node |
| Tunnel | Nothing extra — `cloudflared` is downloaded automatically |

## Quick start (one command)

On the machine that will run the **panel**:

```bash
curl -fsSL https://raw.githubusercontent.com/shyam-sourse/panel/main/scripts/install.sh | bash
```

This installs Node.js if needed, clones the repo to `~/terrypanel`, creates `.env`, installs dependencies, and starts a systemd service. The default login is printed at the end (`admin` / `admin123`) — **change it immediately**.

## Manual install

```bash
git clone https://github.com/yourname/terrypanel.git
cd terrypanel
npm install --omit=dev
cp .env.example .env
```

Edit `.env`:

```env
PORT=3000
HOST=0.0.0.0
TP_DATA_DIR=./data
TP_SECRET=replace-with-a-long-random-string
ADMIN_USERNAME=admin
ADMIN_PASSWORD=change-me
DAEMON_PORT=8081
DAEMON_TOKEN=
PUBLIC_URL=http://localhost:3000
```

Start the panel:

```bash
npm start
```

Open `http://<server-ip>:3000` and log in.

## Adding your first node

You have two options.

### Option A — Automatic over SSH (recommended)

1. Go to **Nodes → Add node via SSH**.
2. Enter name, IP/hostname, SSH port (default 22), SSH username, and either a password or a private key.
3. Click **Install node**.

The panel will:

1. Connect over SSH.
2. Install Node.js 20 if it is missing.
3. Upload the daemon to `~/.terrypanel/daemon`.
4. Create and start a systemd service (falls back to `nohup` if systemd is unavailable).
5. Verify the daemon health endpoint.
6. Register the node with a generated token.

No ports need to be opened in most cases because the panel talks to the daemon over the network directly. If the node has a firewall, allow the daemon port (default `8081`) from the panel IP.

### Option B — Install the daemon yourself

Run on the target VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/yourname/terrypanel/main/scripts/install-node.sh | bash -s -- --port 8081
```

It prints:

```
Host:  203.0.113.10
Port:  8081
Token: 4f8c...
```

Then in the panel go to **Nodes → Add existing node** and paste those values.

## Creating a server

1. **Servers → Create server**.
2. Pick an egg (for example *Discord Bot (discord.js)* or *Minecraft: Paper*).
3. Choose a node and fill in the egg variables (bot token, entry file, memory, etc.).
4. Click **Create server** — TerryPanel sends the install script to the node and opens the console.

Use the tabs inside a server to access **Console**, **Files**, **Startup & Env**, and **Info**.

## Eggs

Eggs live in `eggs/*.json`. An egg looks like this:

```json
{
  "id": "generic-node",
  "name": "Generic Node.js",
  "category": "application",
  "icon": "node",
  "description": "Run any Node.js application.",
  "installScript": "if [ -f package.json ]; then npm install --omit=dev || npm install; fi",
  "startup": "node {{ENTRY}}",
  "variables": [
    { "key": "ENTRY", "label": "Entry file", "default": "index.js", "required": true },
    { "key": "PORT", "label": "Port", "default": "3000" }
  ]
}
```

- `{{VARIABLE}}` placeholders are replaced with the values a user enters.
- `installScript` runs inside the server console after creation.
- Drop a new `.json` file into `eggs/` and restart the panel to register it.

### Included eggs

| Egg | Category | Notes |
|-----|----------|-------|
| Generic Node.js | application | Installs `package.json` deps, runs your entry file |
| Generic Python | application | Creates a venv, installs `requirements.txt` |
| Discord Bot (discord.js) | bot | Installs discord.js, pass `DISCORD_TOKEN` |
| Discord Bot (discord.py) | bot | Isolated venv, pass `DISCORD_TOKEN` |
| Minecraft: Paper | game | Downloads a Paper build, accepts EULA |
| Minecraft: Vanilla | game | Official Mojang server jar |
| Express Web App | application | Node web app scaffold |
| Flask Web App | application | Served with Gunicorn |

> Minecraft Paper builds change over time. If a download 404s, edit `eggs/minecraft-paper.json` and set `MC_VERSION` / `PAPER_BUILD` to a current build from <https://api.papermc.io>.

## Cloudflare Tunnel (token only)

1. In the Cloudflare Zero Trust dashboard create a tunnel and copy its token.
2. In TerryPanel go to **Cloudflare Tunnel**.
3. Paste the token and click **Start tunnel**.

That is all. The panel downloads `cloudflared` automatically if it is not on the system, starts it, and discovers the public URL. Add a public hostname in the Cloudflare dashboard pointing to `http://localhost:3000` (or the panel port).

Leave the token empty to start a temporary **quick tunnel** (`https://<random>.trycloudflare.com`) for testing without a Cloudflare account.

## Status command

The status CLI reads the public status API and prints a colored summary:

```bash
# Uses PUBLIC_URL or http://localhost:3000
npm run status

# Point at a remote panel
node cli/status.js --url https://panel.example.com

# Machine-readable JSON (great for cron / monitoring)
node cli/status.js --url https://panel.example.com --json

# Filter by name, egg, or node
node cli/status.js --filter minecraft
```

Example output:

```
  TerryPanel - live status
  2026-11-03T10:30:00.000Z  https://panel.example.com

  Nodes
    ● vps-1                    203.0.113.10  online

  Servers
  SERVER                    EGG                     STATUS        UPTIME    CPU     MEMORY
  ------------------------------------------------------------------------------------------------
  ● survival                Minecraft: Paper        running       2d 4h     12%     1.2 GB
  ● discord-bot             Discord Bot (discord.js) crashed      0m        0%      0 B

  3 total  |  1 running  |  1 offline  |  1 errored
```

Exit codes: `0` all running, `1` something is not running, `2` panel unreachable. This makes it usable directly in cron or uptime checks.

The same data is available as JSON at `GET /api/status` (toggle **Settings → Public status page**).

## Configuration reference

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Panel HTTP port |
| `HOST` | `0.0.0.0` | Panel bind address |
| `TP_DATA_DIR` | `./data` | Panel data directory (JSON store, audit log) |
| `TP_SECRET` | auto | Session signing secret. Auto-generated and saved if unset |
| `ADMIN_USERNAME` | `admin` | First-run admin username |
| `ADMIN_PASSWORD` | `admin123` | First-run admin password |
| `DAEMON_PORT` | `8081` | Default daemon port for SSH installs |
| `DAEMON_TOKEN` | empty | Default daemon token for manual daemon start |
| `CF_TUNNEL_TOKEN` | empty | Optional default Cloudflare tunnel token |
| `PUBLIC_URL` | `http://localhost:3000` | Used by the status command |
| `TP_SECURE_COOKIES` | `0` | Set to `1` when serving the panel over HTTPS |
| `TP_NODE_TLS_STRICT` | `1` | Set to `0` to allow self-signed node certificates |

Data is stored as plain JSON files under `TP_DATA_DIR`:

```
data/
  settings.json    panel branding + tunnel settings
  users.json       accounts (scrypt password hashes)
  nodes.json       registered nodes
  servers.json     server records
  sessions.json    reserved
  audit.log        JSON lines audit trail
  secret.key       auto-generated session secret
```

Node data lives on the node under `~/.terrypanel/` (`daemon/` and `data/servers/<id>/`).

## Security notes

- Change the default admin password on first login.
- Use Cloudflare Tunnel or a reverse proxy with HTTPS. Set `TP_SECURE_COOKIES=1` when HTTPS is enabled.
- Keep daemon tokens secret. They grant full process control on that node.
- The daemon API is token authenticated. Bind it to a private network or firewall it to the panel IP when possible.
- The SSH installer uses sudo on the remote host for systemd and Node.js installation.

## Development

```bash
npm install
npm run dev     # panel with file watching
npm run daemon  # run the daemon locally on port 8081
npm test        # end-to-end smoke test (panel + daemon)
```

The smoke test starts both processes, logs in, adds a node, creates a server, writes a file, starts it, reads the console, sends a command, stops it, checks the status API, and validates user permission boundaries.

### Project layout

```
panel/
  server.js             HTTP API + static hosting
  lib/store.js          JSON persistence, password hashing
  lib/auth.js           signed session cookies, RBAC
  lib/node-client.js    HTTP client for node daemons
  lib/tunnel.js         cloudflared download/run + URL discovery
  lib/ssh-bootstrap.js  SSH install of the daemon
daemon/
  daemon.js             standalone process manager API
  lib/process-manager.js spawn/console/restart
  lib/system.js         CPU/memory/disk stats
public/
  index.html, app.js, styles.css
eggs/                   deployment templates
cli/status.js           status command
scripts/                install.sh, install-node.sh
test/smoke.js           integration test
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| Node test fails with timeout | Open the daemon port from the panel IP, or check the daemon service: `journalctl -u terrypanel-node -f` |
| SSH install fails to install Node.js | Install Node.js 18+ manually on the node, then retry |
| Minecraft jar download 404 | Update `MC_VERSION` / `PAPER_BUILD` in the egg |
| Tunnel shows `error` | Verify the token is complete, and check the tunnel log in the UI |
| Panel works but tunnel URL doesn't | Add a public hostname in Cloudflare pointing to `http://localhost:3000` |
| Server says `crashed` | Open the console tab to see the stderr output |

## License

MIT. See [LICENSE](LICENSE).
