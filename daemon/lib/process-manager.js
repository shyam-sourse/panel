"use strict";

const fs = require("fs");
const path = require("path");
const { spawn, execFile } = require("child_process");
const EventEmitter = require("events");
const { ensureDir, tailFile } = require("./util");
const { processStats, computeCpu } = require("./system");

const MAX_SCROLLBACK_BYTES = 1024 * 1024;
const LIMIT_CHECK_MS = 15000;

class ProcManager extends EventEmitter {
  constructor(serversDir, logDir) {
    super();
    this.serversDir = serversDir;
    this.logDir = logDir;
    this.procs = new Map();
    ensureDir(serversDir);
    ensureDir(logDir);
  }

  serverDir(id) {
    return path.join(this.serversDir, id);
  }

  logPath(id) {
    return path.join(this.logDir, `${id}.log`);
  }

  metaPath(id) {
    return path.join(this.serverDir(id), "terrypanel.json");
  }

  readMeta(id) {
    try {
      return JSON.parse(fs.readFileSync(this.metaPath(id), "utf8"));
    } catch {
      return null;
    }
  }

  writeMeta(id, meta) {
    ensureDir(this.serverDir(id));
    fs.writeFileSync(this.metaPath(id), JSON.stringify(meta, null, 2));
  }

  state(id) {
    const proc = this.procs.get(id);
    if (!proc) {
      const meta = this.readMeta(id);
      return {
        status: "offline",
        pid: null,
        startedAt: null,
        exitCode: meta ? meta.exitCode ?? null : null,
        restartCount: meta ? meta.restartCount || 0 : 0,
      };
    }
    return {
      status: proc.status,
      pid: proc.child ? proc.child.pid : null,
      startedAt: proc.startedAt,
      exitCode: proc.exitCode ?? null,
      restartCount: proc.restartCount,
    };
  }

  create(id, meta) {
    ensureDir(this.serverDir(id));
    const existing = this.readMeta(id) || {};
    this.writeMeta(id, {
      ...existing,
      ...meta,
      id,
      createdAt: existing.createdAt || new Date().toISOString(),
    });
  }

  remove(id) {
    this.stop(id, true);
    this.stopLimitWatch(id);
    this.procs.delete(id);
    const dir = this.serverDir(id);
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
    const log = this.logPath(id);
    if (fs.existsSync(log)) fs.rmSync(log, { force: true });
  }

  ensureProcess(id) {
    let proc = this.procs.get(id);
    if (!proc) {
      proc = {
        child: null,
        status: "offline",
        startedAt: null,
        exitCode: null,
        restartCount: 0,
        buffer: "",
        subscribers: new Set(),
        stopping: false,
        restartTimer: null,
        limitTimer: null,
        limitWarned: false,
      };
      this.procs.set(id, proc);
    }
    return proc;
  }

  limitsOf(meta) {
    const limits = meta && meta.limits ? meta.limits : {};
    return {
      memoryMb: Number(limits.memoryMb || meta.memoryLimit || 0) || 0,
      diskMb: Number(limits.diskMb || meta.diskLimit || 0) || 0,
      cpuPercent: Number(limits.cpuPercent || meta.cpuLimit || 0) || 0,
    };
  }

  dirBytes(dir, limit) {
    let total = 0;
    const walk = (current) => {
      if (total > limit) return;
      let entries;
      try {
        entries = fs.readdirSync(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        try {
          if (entry.isDirectory()) walk(full);
          else if (entry.isFile()) total += fs.statSync(full).size;
        } catch {}
        if (total > limit) return;
      }
    };
    walk(dir);
    return total;
  }

  startLimitWatch(id) {
    const proc = this.ensureProcess(id);
    if (proc.limitTimer) clearInterval(proc.limitTimer);
    proc.limitTimer = setInterval(() => {
      const current = this.procs.get(id);
      if (!current || !current.child) {
        this.stopLimitWatch(id);
        return;
      }
      const meta = this.readMeta(id);
      if (!meta) return;
      const limits = this.limitsOf(meta);
      const stats = this.stats(id);
      if (limits.memoryMb && stats.memory > limits.memoryMb * 1024 * 1024) {
        this.pushConsole(
          id,
          `[terrypanel] Memory limit exceeded (${(stats.memory / 1024 / 1024).toFixed(0)} MB > ${limits.memoryMb} MB). Stopping server.\n`
        );
        this.emit(`limit:${id}`, { kind: "memory", used: stats.memory, limit: limits.memoryMb * 1024 * 1024 });
        this.stop(id, true);
        return;
      }
      if (limits.cpuPercent && stats.cpu > limits.cpuPercent * 1.5 && !proc.limitWarned) {
        proc.limitWarned = true;
        this.pushConsole(
          id,
          `[terrypanel] CPU usage is above the ${limits.cpuPercent}% quota. Sustained usage may be throttled by your VPS provider.\n`
        );
      }
      if (limits.diskMb) {
        const used = this.dirBytes(this.serverDir(id), limits.diskMb * 1024 * 1024 + 1);
        if (used > limits.diskMb * 1024 * 1024) {
          this.pushConsole(
            id,
            `[terrypanel] Disk limit exceeded (${(used / 1024 / 1024).toFixed(0)} MB > ${limits.diskMb} MB). Stopping server.\n`
          );
          this.emit(`limit:${id}`, { kind: "disk", used, limit: limits.diskMb * 1024 * 1024 });
          this.stop(id, true);
        }
      }
    }, LIMIT_CHECK_MS);
    if (proc.limitTimer.unref) proc.limitTimer.unref();
  }

  stopLimitWatch(id) {
    const proc = this.procs.get(id);
    if (proc && proc.limitTimer) {
      clearInterval(proc.limitTimer);
      proc.limitTimer = null;
    }
  }

  usage(id) {
    const meta = this.readMeta(id);
    if (!meta) return { memory: 0, disk: 0, limits: null };
    const limits = this.limitsOf(meta);
    const stats = this.stats(id);
    const disk = limits.diskMb ? this.dirBytes(this.serverDir(id), limits.diskMb * 1024 * 1024 + 1) : 0;
    return {
      memory: stats.memory,
      disk,
      limits: {
        memoryMb: limits.memoryMb,
        diskMb: limits.diskMb,
        cpuPercent: limits.cpuPercent,
      },
    };
  }

  start(id) {
    const meta = this.readMeta(id);
    if (!meta) throw new Error("Unknown server");
    const proc = this.ensureProcess(id);
    if (proc.child) throw new Error("Server is already running");
    if (proc.restartTimer) {
      clearTimeout(proc.restartTimer);
      proc.restartTimer = null;
    }

    const cwd = this.serverDir(id);
    ensureDir(cwd);
    const log = this.logPath(id);
    if (!proc.buffer && fs.existsSync(log)) {
      proc.buffer = tailFile(log, 400);
    }

    const command = meta.startup || meta.command || "echo 'No startup command configured'";
    const shell = meta.shell || process.env.SHELL || "/bin/sh";
    const childEnv = {
      ...process.env,
      ...(meta.env || {}),
      TERRYPANEL_SERVER_ID: id,
      TERRYPANEL_SERVER_NAME: meta.name || id,
    };
    const portValue = (meta.env && meta.env.PORT) || meta.port;
    if (portValue) childEnv.PORT = String(portValue);
    const child = spawn(shell, ["-lc", command], {
      cwd,
      env: childEnv,
      stdio: ["pipe", "pipe", "pipe"],
      detached: false,
    });

    proc.child = child;
    proc.status = "starting";
    proc.startedAt = Date.now();
    proc.exitCode = null;
    proc.stopping = false;
    proc.restartCount = 0;

    const writeLog = (stream, kind) => {
      const text = stream.toString("utf8");
      this.pushConsole(id, text);
      const line = text.replace(/\r?\n/g, "\n");
      fs.appendFile(log, line, () => {});
      this.emit(`log:${id}`, { kind, text: line });
    };

    child.stdout.on("data", (d) => {
      proc.status = "running";
      writeLog(d, "stdout");
    });
    child.stderr.on("data", (d) => {
      proc.status = "running";
      writeLog(d, "stderr");
    });

    child.on("spawn", () => {
      proc.status = "running";
      this.emit(`state:${id}`, this.state(id));
    });

    child.on("error", (err) => {
      this.pushConsole(id, `\n[terrypanel] Failed to start: ${err.message}\n`);
      const entry = `[terrypanel] Failed to start: ${err.message}\n`;
      fs.appendFile(log, entry, () => {});
      proc.status = "crashed";
      this.emit(`state:${id}`, this.state(id));
    });

    child.on("exit", (code, signal) => {
      proc.exitCode = code;
      proc.child = null;
      this.stopLimitWatch(id);
      const wasStopping = proc.stopping;
      const crashed = !wasStopping && code !== 0;
      proc.status = wasStopping || code === 0 ? "offline" : "crashed";
      this.pushConsole(
        id,
        `\n[terrypanel] Process exited with code ${code}${signal ? ` (${signal})` : ""}\n`
      );
      fs.appendFile(
        log,
        `\n[terrypanel] Process exited with code ${code}${signal ? ` (${signal})` : ""}\n`,
        () => {}
      );
      this.emit(`state:${id}`, this.state(id));
      this.emit(`exit:${id}`, { code, signal, crashed });

      const current = this.readMeta(id);
      if (current) {
        this.writeMeta(id, { ...current, exitCode: code });
      }

      if (crashed && meta.autoRestart) {
        proc.restartCount += 1;
        const updated = this.readMeta(id);
        if (updated) this.writeMeta(id, { ...updated, restartCount: proc.restartCount });
        this.pushConsole(id, `[terrypanel] Auto-restart in 3s (attempt ${proc.restartCount})\n`);
        proc.restartTimer = setTimeout(() => {
          proc.restartTimer = null;
          try {
            this.start(id);
          } catch (err) {
            proc.status = "crashed";
          }
        }, 3000);
      }
    });

    this.pushConsole(id, `\n[terrypanel] Starting: ${command}\n`);
    fs.appendFile(log, `\n[terrypanel] Starting: ${command}\n`, () => {});
    this.startLimitWatch(id);
    this.emit(`state:${id}`, this.state(id));
    return this.state(id);
  }

  stop(id, force = false) {
    const proc = this.procs.get(id);
    if (!proc || !proc.child) {
      if (proc) proc.status = "offline";
      return this.state(id);
    }
    proc.stopping = true;
    if (proc.restartTimer) {
      clearTimeout(proc.restartTimer);
      proc.restartTimer = null;
    }
    const child = proc.child;
    this.pushConsole(id, "\n[terrypanel] Sending SIGTERM...\n");
    try {
      child.kill("SIGTERM");
    } catch {}
    if (force) {
      setTimeout(() => {
        try {
          if (child.exitCode === null) child.kill("SIGKILL");
        } catch {}
      }, 4000);
    }
    proc.status = "stopping";
    this.emit(`state:${id}`, this.state(id));
    return this.state(id);
  }

  restart(id) {
    const proc = this.procs.get(id);
    if (proc && proc.child) {
      proc.stopping = true;
      const child = proc.child;
      const done = () => {
        setTimeout(() => {
          try {
            this.start(id);
          } catch {}
        }, 500);
      };
      child.once("exit", done);
      try {
        child.kill("SIGTERM");
      } catch {}
      return this.state(id);
    }
    return this.start(id);
  }

  kill(id) {
    const proc = this.procs.get(id);
    if (proc && proc.child) {
      proc.stopping = true;
      try {
        proc.child.kill("SIGKILL");
      } catch {}
    }
    if (proc) proc.status = "offline";
    return this.state(id);
  }

  command(id, input) {
    const proc = this.procs.get(id);
    if (!proc || !proc.child) throw new Error("Server is not running");
    proc.child.stdin.write(input.endsWith("\n") ? input : input + "\n");
    this.pushConsole(id, `> ${input}\n`);
    return true;
  }

  exec(id, command) {
    const meta = this.readMeta(id);
    if (!meta) throw new Error("Unknown server");
    const cwd = this.serverDir(id);
    ensureDir(cwd);
    const log = this.logPath(id);
    const shell = meta.shell || process.env.SHELL || "/bin/sh";
    const childEnv = {
      ...process.env,
      ...(meta.env || {}),
      TERRYPANEL_SERVER_ID: id,
      TERRYPANEL_SERVER_NAME: meta.name || id,
    };
    const portValue = (meta.env && meta.env.PORT) || meta.port;
    if (portValue) childEnv.PORT = String(portValue);
    const child = spawn(shell, ["-lc", command], { cwd, env: childEnv, stdio: ["ignore", "pipe", "pipe"] });
    const banner = `\n[terrypanel] Running one-off task: ${command}\n`;
    this.pushConsole(id, banner);
    fs.appendFile(log, banner, () => {});
    const onData = (d) => {
      const text = d.toString("utf8");
      this.pushConsole(id, text);
      fs.appendFile(log, text, () => {});
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      const done = `\n[terrypanel] Task finished with exit code ${code}\n`;
      this.pushConsole(id, done);
      fs.appendFile(log, done, () => {});
      this.emit(`exec:${id}`, { code });
    });
    return { ok: true, pid: child.pid };
  }

  pushConsole(id, text) {
    const proc = this.ensureProcess(id);
    proc.buffer += text;
    if (proc.buffer.length > MAX_SCROLLBACK_BYTES) {
      proc.buffer = proc.buffer.slice(proc.buffer.length - MAX_SCROLLBACK_BYTES);
    }
  }

  console(id, lines = 300) {
    const proc = this.ensureProcess(id);
    if (proc.buffer) {
      const parts = proc.buffer.split(/\r?\n/);
      if (parts.length > lines) parts.splice(0, parts.length - lines);
      return parts.join("\n");
    }
    return tailFile(this.logPath(id), lines);
  }

  readLog(id, lines = 300) {
    return tailFile(this.logPath(id), lines);
  }

  stats(id) {
    const proc = this.procs.get(id);
    if (!proc || !proc.child) {
      return { cpu: 0, memory: 0, processes: 0, uptime: 0 };
    }
    const s = processStats(proc.child.pid);
    const now = Date.now();
    const cpu = computeCpu(proc.lastStat, s, (now - (proc.lastStatAt || now)) / 1000);
    if (s.ticks) {
      proc.lastStat = s;
      proc.lastStatAt = now;
    }
    return {
      cpu: Number(cpu.toFixed(1)),
      memory: s.memory,
      processes: s.processes,
      uptime: Math.floor(s.uptime || (Date.now() - proc.startedAt) / 1000),
    };
  }

  listRunning() {
    const out = [];
    for (const [id, proc] of this.procs.entries()) {
      if (proc.child) out.push({ id, ...this.state(id) });
    }
    return out;
  }

  stopAll() {
    for (const id of this.procs.keys()) {
      try {
        this.stop(id);
      } catch {}
    }
  }
}

module.exports = { ProcManager };
