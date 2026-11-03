"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");
const { EventEmitter } = require("events");

class TunnelManager extends EventEmitter {
  constructor(store, dataDir) {
    super();
    this.store = store;
    this.dataDir = dataDir;
    this.binDir = path.join(dataDir, "bin");
    this.proc = null;
    this.logs = [];
    this.publicUrl = "";
    this.status = "stopped";
    this.error = "";
    this.startedAt = null;
  }

  binaryPath() {
    const name = process.platform === "win32" ? "cloudflared.exe" : "cloudflared";
    return path.join(this.binDir, name);
  }

  hasBinary() {
    return fs.existsSync(this.binaryPath());
  }

  log(line) {
    const clean = String(line).replace(/\r/g, "");
    this.logs.push(`[${new Date().toISOString()}] ${clean}`);
    if (this.logs.length > 400) this.logs.splice(0, this.logs.length - 400);
    this.emit("log", clean);
    this.parseUrls(clean);
  }

  parseUrls(line) {
    const tryMatch = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (tryMatch) {
      this.publicUrl = tryMatch[0];
      this.emit("url", this.publicUrl);
    }
    const custom = line.match(/https?:\/\/[a-z0-9.-]+\.[a-z]{2,}[^\s]*/i);
    if (custom && !this.publicUrl) {
      this.publicUrl = custom[0];
      this.emit("url", this.publicUrl);
    }
  }

  async downloadBinary() {
    fs.mkdirSync(this.binDir, { recursive: true });
    const base =
      process.platform === "win32"
        ? "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        : process.platform === "darwin"
          ? "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-darwin-amd64.tgz"
          : process.arch === "arm64"
            ? "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64"
            : "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64";
    this.log(`Downloading cloudflared from ${base}`);
    const res = await fetch(base, { redirect: "follow" });
    if (!res.ok) throw new Error(`cloudflared download failed (${res.status})`);
    const buffer = Buffer.from(await res.arrayBuffer());
    const target = this.binaryPath();
    if (base.endsWith(".tgz")) {
      fs.writeFileSync(path.join(this.binDir, "cloudflared.tgz"), buffer);
      await new Promise((resolve, reject) => {
        execFile("tar", ["-xzf", path.join(this.binDir, "cloudflared.tgz"), "-C", this.binDir], (err) =>
          err ? reject(err) : resolve()
        );
      });
    } else {
      fs.writeFileSync(target, buffer, { mode: 0o755 });
    }
    if (process.platform !== "win32") fs.chmodSync(this.binaryPath(), 0o755);
    this.log("cloudflared downloaded.");
    return this.binaryPath();
  }

  async ensureBinary() {
    if (this.hasBinary()) return this.binaryPath();
    if (process.env.CLOUDFLARED_PATH && fs.existsSync(process.env.CLOUDFLARED_PATH)) {
      return process.env.CLOUDFLARED_PATH;
    }
    return this.downloadBinary();
  }

  async findSystemBinary() {
    return new Promise((resolve) => {
      execFile(process.platform === "win32" ? "where" : "which", ["cloudflared"], (err, stdout) => {
        if (err || !stdout) return resolve(null);
        resolve(String(stdout).trim().split(/\r?\n/)[0]);
      });
    });
  }

  async start(targetUrl = `http://127.0.0.1:${process.env.PORT || 3000}`) {
    if (this.proc) {
      this.log("Tunnel already running.");
      return this.info();
    }
    const settings = this.store.getSettings();
    const token = (settings.tunnel && settings.tunnel.token) || process.env.CF_TUNNEL_TOKEN || "";
    const mode = token ? "token" : "quick";

    let binary = await this.findSystemBinary();
    if (!binary) binary = await this.ensureBinary();

    const args = token ? ["tunnel", "--no-autoupdate", "run", "--token", token] : ["tunnel", "--no-autoupdate", "--url", targetUrl];

    this.status = "starting";
    this.error = "";
    this.publicUrl = "";
    this.startedAt = Date.now();
    this.emit("status", this.status);

    const child = spawn(binary, args, {
      cwd: this.binDir,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    this.proc = child;

    const onData = (chunk) => {
      const text = chunk.toString("utf8");
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;
        this.log(line);
        if (/Registered tunnel connection|Connection .* registered|INF Registered/i.test(line)) {
          this.status = "running";
          this.emit("status", this.status);
          this.persist();
        }
        if (/failed|error|unauthorized|invalid token/i.test(line) && this.status !== "running") {
          this.error = line.trim();
        }
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);

    child.on("exit", (code) => {
      this.proc = null;
      this.status = code === 0 ? "stopped" : "error";
      if (code !== 0) this.error = `cloudflared exited with code ${code}`;
      this.log(`cloudflared exited (code ${code})`);
      this.emit("status", this.status);
      this.persist();
    });

    child.on("error", (err) => {
      this.error = err.message;
      this.status = "error";
      this.proc = null;
      this.emit("status", this.status);
    });

    setTimeout(() => {
      if (this.status === "starting") {
        this.status = "running";
        this.emit("status", this.status);
        this.persist();
      }
    }, 12000);

    return this.info();
  }

  stop() {
    if (this.proc) {
      try {
        this.proc.kill("SIGTERM");
      } catch {}
      this.proc = null;
    }
    this.status = "stopped";
    this.emit("status", this.status);
    this.persist();
    return this.info();
  }

  persist() {
    try {
      const settings = this.store.getSettings();
      this.store.updateSettings({
        tunnel: {
          ...(settings.tunnel || {}),
          enabled: Boolean(this.proc),
          lastStatus: this.status,
          lastError: this.error,
          publicUrl: this.publicUrl,
        },
      });
    } catch {}
  }

  info() {
    const settings = this.store.getSettings();
    const token = (settings.tunnel && settings.tunnel.token) || process.env.CF_TUNNEL_TOKEN || "";
    return {
      status: this.status,
      running: Boolean(this.proc),
      publicUrl: this.publicUrl,
      mode: token ? "token" : "quick",
      hasToken: Boolean(token),
      hasBinary: this.hasBinary(),
      error: this.error,
      startedAt: this.startedAt,
      logs: this.logs.slice(-120),
    };
  }
}

module.exports = { TunnelManager };
