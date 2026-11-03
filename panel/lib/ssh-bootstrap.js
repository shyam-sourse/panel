"use strict";

const fs = require("fs");
const path = require("path");
const { Client } = require("ssh2");

const DAEMON_FILES = ["lib/env.js", "lib/util.js", "lib/system.js", "lib/process-manager.js", "daemon.js"];
const DAEMON_ROOT = path.resolve(__dirname, "../../daemon");

function readDaemonFiles() {
  const out = {};
  for (const rel of DAEMON_FILES) {
    out[rel] = fs.readFileSync(path.join(DAEMON_ROOT, rel), "utf8");
  }
  return out;
}

function connect(config) {
  return new Promise((resolve, reject) => {
    const client = new Client();
    const options = {
      host: config.host,
      port: Number(config.port || 22),
      username: config.username,
      readyTimeout: 30000,
      tryKeyboard: true,
    };
    if (config.authType === "privateKey" || config.privateKey) {
      options.privateKey = config.privateKey;
      if (config.passphrase) options.passphrase = config.passphrase;
    } else {
      options.password = config.password;
    }
    client.on("keyboard-interactive", (name, instructions, lang, prompts, finish) => {
      finish([config.password || ""]);
    });
    client
      .on("ready", () => resolve(client))
      .on("error", (err) => reject(new Error(`SSH connection failed: ${err.message}`)))
      .connect(options);
  });
}

function exec(client, command, timeout = 180000) {
  return new Promise((resolve) => {
    client.exec(command, { pty: false }, (err, stream) => {
      if (err) return resolve({ code: 1, stdout: "", stderr: err.message });
      let stdout = "";
      let stderr = "";
      const timer = setTimeout(() => {
        try {
          stream.close();
        } catch {}
        resolve({ code: 124, stdout, stderr: stderr + "\nTimed out" });
      }, timeout);
      stream.on("data", (d) => (stdout += d.toString("utf8")));
      stream.stderr.on("data", (d) => (stderr += d.toString("utf8")));
      stream.on("close", (code) => {
        clearTimeout(timer);
        resolve({ code: typeof code === "number" ? code : 0, stdout, stderr });
      });
    });
  });
}

function putFile(sftp, remotePath, content) {
  return new Promise((resolve, reject) => {
    sftp.writeFile(remotePath, content, { mode: 0o644 }, (err) => (err ? reject(err) : resolve()));
  });
}

function openSftp(client) {
  return new Promise((resolve, reject) => {
    client.sftp((err, sftp) => (err ? reject(err) : resolve(sftp)));
  });
}

async function installDaemon(config, callbacks = {}) {
  const log = (line) => callbacks.onLog && callbacks.onLog(line);
  const port = Number(config.daemonPort || 8081);
  const token = config.token;
  const installDir = (config.installDir || "~/.terrypanel").replace(/\/+$/, "");

  log("Connecting over SSH...");
  const client = await connect(config);
  try {
    log("Checking remote Node.js...");
    const nodeCheck = await exec(client, "command -v node >/dev/null 2>&1 && node -v || echo MISSING");
    let nodeVersion = (nodeCheck.stdout || "").trim();
    if (!/^v\d+/.test(nodeVersion)) {
      log("Node.js not found. Installing Node.js 20 with NodeSource...");
      const install = await exec(
        client,
        "curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs || (curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs)",
        600000
      );
      log(install.stdout.split("\n").slice(-5).join("\n"));
      const recheck = await exec(client, "node -v");
      nodeVersion = (recheck.stdout || "").trim();
      if (!/^v\d+/.test(nodeVersion)) {
        throw new Error("Failed to install Node.js on the remote host. Install Node.js 18+ manually and retry.");
      }
    }
    log(`Remote Node.js: ${nodeVersion}`);

    log("Preparing install directory...");
    const prep = await exec(client, `mkdir -p ${installDir}/daemon/lib ${installDir}/data && cd ${installDir} && pwd`);
    if (prep.code !== 0) throw new Error(prep.stderr || "Failed to create install directory");

    log("Uploading daemon files...");
    const sftp = await openSftp(client);
    const files = readDaemonFiles();
    for (const [rel, content] of Object.entries(files)) {
      await putFile(sftp, `${installDir}/daemon/${rel}`, content);
    }
    const envContent = [
      `DAEMON_PORT=${port}`,
      `DAEMON_HOST=0.0.0.0`,
      `DAEMON_TOKEN=${token}`,
      `DAEMON_DATA_DIR=${installDir}/data`,
      "",
    ].join("\n");
    await putFile(sftp, `${installDir}/daemon/.env`, envContent);
    const pkg = {
      name: "terrypanel-daemon",
      version: "1.0.0",
      private: true,
      type: "commonjs",
      main: "daemon.js",
      scripts: { start: "node daemon.js" },
    };
    await putFile(sftp, `${installDir}/daemon/package.json`, JSON.stringify(pkg, null, 2));
    sftp.end();

    log("Starting daemon service...");
    const startScript = `#!/bin/sh
set -e
cd "$(dirname "$0")"
if [ -f .env ]; then set -a; . ./.env; set +a; fi
exec node daemon.js
`;
    const sftp2 = await openSftp(client);
    await putFile(sftp2, `${installDir}/daemon/start.sh`, startScript);
    sftp2.end();
    await exec(client, `chmod +x ${installDir}/daemon/start.sh`);

    const hasSystemd = await exec(client, "command -v systemctl >/dev/null 2>&1 && echo yes || echo no");
    if ((hasSystemd.stdout || "").includes("yes")) {
      const unit = `[Unit]
Description=TerryPanel Node Daemon
After=network.target

[Service]
Type=simple
WorkingDirectory=${installDir}/daemon
ExecStart=${installDir}/daemon/start.sh
Restart=always
RestartSec=3
User=${config.username}

[Install]
WantedBy=multi-user.target
`;
      const sftp3 = await openSftp(client);
      const remoteUnit = `${installDir}/terrypanel-daemon.service`;
      await putFile(sftp3, remoteUnit, unit);
      sftp3.end();
      const copyUnit = await exec(
        client,
        `sudo cp ${remoteUnit} /etc/systemd/system/terrypanel-daemon.service && sudo systemctl daemon-reload && sudo systemctl enable terrypanel-daemon && sudo systemctl restart terrypanel-daemon`
      );
      if (copyUnit.code !== 0) {
        log("systemd install failed, falling back to nohup.");
        await exec(client, `pkill -f 'terrypanel/daemon/daemon.js' >/dev/null 2>&1 || true; cd ${installDir}/daemon && nohup ./start.sh > ${installDir}/daemon.log 2>&1 & echo started`);
      }
    } else {
      await exec(
        client,
        `pkill -f 'daemon.js' >/dev/null 2>&1 || true; cd ${installDir}/daemon && nohup ./start.sh > ${installDir}/daemon.log 2>&1 & echo started`
      );
    }

    await new Promise((r) => setTimeout(r, 2500));
    log("Verifying daemon...");
    const verify = await exec(client, `curl -fsS -H "Authorization: Bearer ${token}" http://127.0.0.1:${port}/health || echo FAILED`);
    if (!(verify.stdout || "").includes('"ok":true')) {
      const daemonLog = await exec(client, `tail -n 40 ${installDir}/daemon.log 2>/dev/null || journalctl -u terrypanel-daemon -n 40 --no-pager 2>/dev/null || true`);
      throw new Error(`Daemon did not come up. Remote output:\n${verify.stdout}\n${daemonLog.stdout}`.slice(0, 4000));
    }
    log("Daemon is online.");
    const ip = await exec(client, `curl -fsS --max-time 5 https://api.ipify.org || echo ${config.host}`);
    const publicHost = (ip.stdout || "").trim() || config.host;
    return { ok: true, host: publicHost, port, token, version: nodeVersion, installDir };
  } finally {
    client.end();
  }
}

module.exports = { installDaemon, connect, exec };
