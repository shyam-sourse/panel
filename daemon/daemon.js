#!/usr/bin/env node
"use strict";

const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");
require("./lib/env").loadEnv(require("path").resolve(__dirname, ".env"));
const { ProcManager } = require("./lib/process-manager");
const { snapshot } = require("./lib/system");
const {
  json,
  error,
  readBody,
  readJson,
  safeJoin,
  tokenOk,
  randomId,
  ensureDir,
} = require("./lib/util");

const PORT = Number(process.env.DAEMON_PORT || process.env.PORT || 8081);
const HOST = process.env.DAEMON_HOST || "0.0.0.0";
const TOKEN = process.env.DAEMON_TOKEN || "";
const DATA_DIR = path.resolve(process.env.DAEMON_DATA_DIR || "./data/daemon");
const SERVERS_DIR = path.join(DATA_DIR, "servers");
const LOG_DIR = path.join(DATA_DIR, "logs");
const VERSION = "1.0.0";

ensureDir(SERVERS_DIR);
ensureDir(LOG_DIR);

const manager = new ProcManager(SERVERS_DIR, LOG_DIR);
const startedAt = Date.now();

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
function shutdown() {
  manager.stopAll();
  setTimeout(() => process.exit(0), 300);
}

function serverFilePath(id, relative) {
  return safeJoin(manager.serverDir(id), relative);
}

function listDir(dir) {
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .map((entry) => {
      const full = path.join(dir, entry.name);
      let size = 0;
      let modified = null;
      try {
        const stat = fs.statSync(full);
        size = stat.size;
        modified = stat.mtime.toISOString();
      } catch {}
      return {
        name: entry.name,
        type: entry.isDirectory() ? "dir" : "file",
        size,
        modified,
      };
    })
    .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "dir" ? -1 : 1));
}

function requireServer(id) {
  const meta = manager.readMeta(id);
  if (!meta) {
    const err = new Error("Server not found");
    err.status = 404;
    throw err;
  }
  return meta;
}

async function handle(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
  const parts = url.pathname.split("/").filter(Boolean);
  const method = req.method || "GET";

  if (!tokenOk(req, url, TOKEN)) {
    return error(res, 401, "Invalid daemon token");
  }

  if (url.pathname === "/health") {
    return json(res, 200, {
      ok: true,
      version: VERSION,
      uptime: Math.floor((Date.now() - startedAt) / 1000),
      running: manager.listRunning().length,
      hostname: require("os").hostname(),
      platform: require("os").platform(),
      arch: require("os").arch(),
      node: process.version,
      dataDir: DATA_DIR,
      capability: { limits: true, files: true, console: true, usage: true },
    });
  }

  if (url.pathname === "/join" && method === "POST") {
    const body = await readJson(req);
    if (!body.panelUrl) return error(res, 400, "panelUrl is required");
    const panel = new URL(body.panelUrl);
    const payload = Buffer.from(
      JSON.stringify({
        name: body.name || require("os").hostname(),
        host: body.host || "",
        port: PORT,
        token: TOKEN,
        secure: panel.protocol === "https:",
      })
    );
    const lib = panel.protocol === "https:" ? require("https") : require("http");
    const target = new URL("/api/nodes/self-register", panel);
    const result = await new Promise((resolve) => {
      const req2 = lib.request(
        {
          method: "POST",
          hostname: target.hostname,
          port: target.port || (target.protocol === "https:" ? 443 : 80),
          path: target.pathname,
          headers: { "content-type": "application/json", "content-length": payload.length },
          timeout: 10000,
        },
        (r) => {
          const chunks = [];
          r.on("data", (c) => chunks.push(c));
          r.on("end", () => {
            try {
              resolve({ status: r.statusCode, body: JSON.parse(Buffer.concat(chunks).toString("utf8")) });
            } catch {
              resolve({ status: r.statusCode, body: {} });
            }
          });
        }
      );
      req2.on("error", (err) => resolve({ status: 0, body: { error: err.message } }));
      req2.on("timeout", () => {
        req2.destroy();
        resolve({ status: 0, body: { error: "timeout" } });
      });
      req2.write(payload);
      req2.end();
    });
    if (result.status >= 400 || result.status === 0) {
      return error(res, result.status || 502, (result.body && result.body.error) || "Panel rejected registration");
    }
    return json(res, 200, { ok: true, panel: body.panelUrl, result: result.body });
  }

  if (url.pathname === "/system") {
    return json(res, 200, await snapshot(DATA_DIR));
  }

  if (url.pathname === "/servers" && method === "GET") {
    const metas = fs.existsSync(SERVERS_DIR)
      ? fs
          .readdirSync(SERVERS_DIR, { withFileTypes: true })
          .filter((d) => d.isDirectory())
          .map((d) => {
            const meta = manager.readMeta(d.name);
            if (!meta) return null;
            return { ...meta, ...manager.state(d.name) };
          })
          .filter(Boolean)
      : [];
    return json(res, 200, metas);
  }

  if (url.pathname === "/servers" && method === "POST") {
    const body = await readJson(req);
    if (!body.name) return error(res, 400, "Server name is required");
    const id = body.id || randomId("srv_");
    manager.create(id, {
      name: body.name,
      egg: body.egg || "generic",
      startup: body.startup || "",
      command: body.command || "",
      env: body.env || {},
      autoRestart: Boolean(body.autoRestart),
      port: body.port || null,
      memoryLimit: body.memoryLimit || null,
      diskLimit: body.diskLimit || null,
      cpuLimit: body.cpuLimit || null,
      limits: body.limits || null,
    });
    if (body.files && typeof body.files === "object") {
      const root = manager.serverDir(id);
      for (const [rel, content] of Object.entries(body.files)) {
        try {
          const file = safeJoin(root, rel);
          ensureDir(path.dirname(file));
          fs.writeFileSync(file, String(content ?? ""), "utf8");
        } catch (err) {
          console.warn(`[terrypanel-daemon] Skipped template file ${rel}: ${err.message}`);
        }
      }
    }
    const meta = manager.readMeta(id);
    return json(res, 201, { ...meta, ...manager.state(id) });
  }

  if (parts[0] === "servers" && parts[1]) {
    const id = parts[1];
    if (parts.length === 2 && method === "GET") {
      const meta = requireServer(id);
      return json(res, 200, { ...meta, ...manager.state(id), stats: manager.stats(id) });
    }
    if (parts.length === 2 && method === "PATCH") {
      const meta = requireServer(id);
      const body = await readJson(req);
      const allowed = ["name", "startup", "command", "env", "autoRestart", "port", "memoryLimit", "diskLimit", "cpuLimit", "limits", "egg"];
      const next = { ...meta };
      for (const key of allowed) {
        if (body[key] !== undefined) next[key] = body[key];
      }
      manager.writeMeta(id, next);
      return json(res, 200, { ...next, ...manager.state(id) });
    }
    if (parts.length === 2 && method === "DELETE") {
      requireServer(id);
      manager.remove(id);
      return json(res, 200, { ok: true });
    }

    const action = parts[2];
    if (action === "start" && method === "POST") return json(res, 200, manager.start(id));
    if (action === "stop" && method === "POST") return json(res, 200, manager.stop(id));
    if (action === "restart" && method === "POST") return json(res, 200, manager.restart(id));
    if (action === "kill" && method === "POST") return json(res, 200, manager.kill(id));

    if (action === "command" && method === "POST") {
      requireServer(id);
      const body = await readJson(req);
      if (!body.command) return error(res, 400, "command is required");
      manager.command(id, String(body.command));
      return json(res, 200, { ok: true });
    }

    if (action === "exec" && method === "POST") {
      requireServer(id);
      const body = await readJson(req);
      if (!body.command) return error(res, 400, "command is required");
      return json(res, 200, manager.exec(id, String(body.command)));
    }

    if (action === "console" && method === "GET") {
      requireServer(id);
      const lines = Number(url.searchParams.get("lines") || 300);
      return json(res, 200, { console: manager.console(id, lines), state: manager.state(id) });
    }

    if (action === "console" && parts[3] === "stream" && method === "GET") {
      requireServer(id);
      res.writeHead(200, {
        "content-type": "text/event-stream",
        "cache-control": "no-cache",
        connection: "keep-alive",
        "x-accel-buffering": "no",
      });
      const initial = manager.console(id, 300);
      res.write(`event: console\ndata: ${JSON.stringify({ text: initial })}\n\n`);
      const onLog = (payload) => {
        res.write(`event: console\ndata: ${JSON.stringify(payload)}\n\n`);
      };
      const onState = (state) => {
        res.write(`event: state\ndata: ${JSON.stringify(state)}\n\n`);
      };
      const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
      manager.on(`log:${id}`, onLog);
      manager.on(`state:${id}`, onState);
      req.on("close", () => {
        clearInterval(heartbeat);
        manager.off(`log:${id}`, onLog);
        manager.off(`state:${id}`, onState);
      });
      return;
    }

    if (action === "log" && method === "GET") {
      requireServer(id);
      const lines = Number(url.searchParams.get("lines") || 300);
      return json(res, 200, { log: manager.readLog(id, lines) });
    }

    if (action === "stats" && method === "GET") {
      requireServer(id);
      return json(res, 200, { ...manager.stats(id), ...manager.state(id) });
    }

    if (action === "usage" && method === "GET") {
      requireServer(id);
      const usage = manager.usage(id);
      return json(res, 200, { ...usage, ...manager.state(id) });
    }

    if (action === "files") {
      requireServer(id);
      const sub = parts[3] || "";
      if (sub === "" && method === "GET") {
        const rel = url.searchParams.get("path") || "";
        const dir = serverFilePath(id, rel);
        if (!fs.existsSync(dir)) return error(res, 404, "Directory not found");
        if (!fs.statSync(dir).isDirectory()) return error(res, 400, "Not a directory");
        return json(res, 200, { path: rel, entries: listDir(dir) });
      }
      if (sub === "read" && method === "GET") {
        const rel = url.searchParams.get("path");
        if (!rel) return error(res, 400, "path is required");
        const file = serverFilePath(id, rel);
        if (!fs.existsSync(file)) return error(res, 404, "File not found");
        const stat = fs.statSync(file);
        if (stat.isDirectory()) return error(res, 400, "Is a directory");
        if (stat.size > 2 * 1024 * 1024) return error(res, 400, "File is larger than 2MB");
        return json(res, 200, { path: rel, content: fs.readFileSync(file, "utf8") });
      }
      if (sub === "write" && method === "POST") {
        const body = await readJson(req, 4 * 1024 * 1024);
        if (!body.path) return error(res, 400, "path is required");
        const file = serverFilePath(id, body.path);
        ensureDir(path.dirname(file));
        fs.writeFileSync(file, body.content ?? "", "utf8");
        return json(res, 200, { ok: true });
      }
      if (sub === "mkdir" && method === "POST") {
        const body = await readJson(req);
        if (!body.path) return error(res, 400, "path is required");
        ensureDir(serverFilePath(id, body.path));
        return json(res, 200, { ok: true });
      }
      if (sub === "rename" && method === "POST") {
        const body = await readJson(req);
        if (!body.from || !body.to) return error(res, 400, "from and to are required");
        fs.renameSync(serverFilePath(id, body.from), serverFilePath(id, body.to));
        return json(res, 200, { ok: true });
      }
      if (sub === "delete" && method === "POST") {
        const body = await readJson(req);
        if (!body.path) return error(res, 400, "path is required");
        const target = serverFilePath(id, body.path);
        fs.rmSync(target, { recursive: true, force: true });
        return json(res, 200, { ok: true });
      }
      if (sub === "upload" && method === "POST") {
        const rel = url.searchParams.get("path");
        if (!rel) return error(res, 400, "path is required");
        const file = serverFilePath(id, rel);
        ensureDir(path.dirname(file));
        const raw = await readBody(req, 200 * 1024 * 1024);
        fs.writeFileSync(file, raw);
        return json(res, 200, { ok: true, size: raw.length });
      }
    }
  }

  return error(res, 404, "Not found");
}

const server = http.createServer((req, res) => {
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-headers", "authorization, content-type");
  res.setHeader("access-control-allow-methods", "GET, POST, PATCH, DELETE, OPTIONS");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    return res.end();
  }
  handle(req, res).catch((err) => {
    if (!res.headersSent) error(res, err.status || 500, err.message || "Internal error");
    else res.end();
  });
});

server.listen(PORT, HOST, () => {
  console.log(`[terrypanel-daemon] v${VERSION} listening on http://${HOST}:${PORT}`);
  console.log(`[terrypanel-daemon] data: ${DATA_DIR}`);
  if (!TOKEN) console.log("[terrypanel-daemon] WARNING: DAEMON_TOKEN is empty (open access)");
});

module.exports = { server, manager };
