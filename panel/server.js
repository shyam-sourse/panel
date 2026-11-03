"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

require("./lib/env").loadEnv(path.resolve(__dirname, "..", ".env"));

const { Store, hashPassword, verifyPassword } = require("./lib/store");
const { Auth, loadSecret } = require("./lib/auth");
const { NodeClient } = require("./lib/node-client");
const { TunnelManager } = require("./lib/tunnel");
const { installDaemon } = require("./lib/ssh-bootstrap");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.resolve(process.env.TP_DATA_DIR || path.join(ROOT, "data"));
const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || "0.0.0.0";
const EGGS_DIR = path.join(ROOT, "eggs");

const store = new Store(DATA_DIR);
const secret = loadSecret(DATA_DIR);
const auth = new Auth(store, secret);
const tunnel = new TunnelManager(store, DATA_DIR);

const installJobs = new Map();

function uid(prefix) {
  return prefix + crypto.randomBytes(9).toString("hex");
}

function loadEggs() {
  const eggs = {};
  if (!fs.existsSync(EGGS_DIR)) return eggs;
  for (const file of fs.readdirSync(EGGS_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const egg = JSON.parse(fs.readFileSync(path.join(EGGS_DIR, file), "utf8"));
      if (egg.id) eggs[egg.id] = egg;
    } catch (err) {
      console.warn(`[terrypanel] Skipping bad egg ${file}: ${err.message}`);
    }
  }
  return eggs;
}

function bootstrapAdmin() {
  const users = store.users();
  if (users.length > 0) return;
  const username = process.env.ADMIN_USERNAME || "admin";
  const password = process.env.ADMIN_PASSWORD || "admin123";
  const user = {
    id: uid("usr_"),
    username,
    role: "admin",
    password: hashPassword(password),
    serverIds: [],
    createdAt: new Date().toISOString(),
  };
  store.saveUsers([user]);
  store.audit("bootstrap_admin", username);
  console.log(`[terrypanel] Created admin user "${username}" (password: ${password === "admin123" ? "admin123 - change this!" : "set from env"})`);
}

function redactSettings(settings) {
  const copy = JSON.parse(JSON.stringify(settings));
  if (copy.tunnel) copy.tunnel.token = copy.tunnel.token ? "••••••••" : "";
  return copy;
}

function nodeSummary(node) {
  return {
    id: node.id,
    name: node.name,
    host: node.host,
    port: node.port,
    secure: Boolean(node.secure),
    description: node.description || "",
    createdAt: node.createdAt,
    lastSeen: node.lastSeen || null,
    lastStatus: node.lastStatus || "unknown",
  };
}

function getNode(id) {
  return store.nodes().find((n) => n.id === id) || null;
}

function getServer(id) {
  return store.servers().find((s) => s.id === id) || null;
}

function saveServer(server) {
  const servers = store.servers();
  const idx = servers.findIndex((s) => s.id === server.id);
  if (idx >= 0) servers[idx] = server;
  else servers.push(server);
  store.saveServers(servers);
}

function renderTemplate(text, env) {
  return String(text ?? "").replace(/\{\{(\w+)\}\}/g, (_, key) => env[key] || "");
}

function resolveVariables(egg, provided) {
  const env = {};
  const secrets = {};
  const providedMap = provided || {};
  const secretKeys = [];
  for (const variable of egg.variables || []) {
    const isSecret = Boolean(variable.secret);
    const supplied = providedMap[variable.key];
    const value = supplied !== undefined && supplied !== ""
      ? String(supplied)
      : String(variable.default ?? "");
    if (isSecret) {
      secretKeys.push(variable.key);
      if (value) secrets[variable.key] = value;
    } else {
      env[variable.key] = value;
    }
  }
  const all = { ...env, ...secrets };
  const startup = renderTemplate(egg.startup || "", all);
  const files = {};
  for (const [file, content] of Object.entries(egg.files || {})) {
    files[file] = renderTemplate(content, all);
  }
  return { env, secrets, startup, files, secretKeys };
}

function mergeEnv(server) {
  const secrets = store.serverSecrets(server.id);
  return { ...(server.env || {}), ...secrets };
}

function sanitizeLimits(input, fallback) {
  const base = fallback || {};
  const out = {
    memoryMb: Number(input && input.memoryMb !== undefined ? input.memoryMb : base.memoryMb || 1024),
    diskMb: Number(input && input.diskMb !== undefined ? input.diskMb : base.diskMb || 5120),
    cpuPercent: Number(input && input.cpuPercent !== undefined ? input.cpuPercent : base.cpuPercent || 100),
  };
  if (!Number.isFinite(out.memoryMb) || out.memoryMb < 128) out.memoryMb = Number(base.memoryMb) || 1024;
  if (!Number.isFinite(out.diskMb) || out.diskMb < 128) out.diskMb = Number(base.diskMb) || 5120;
  if (!Number.isFinite(out.cpuPercent) || out.cpuPercent < 5) out.cpuPercent = Number(base.cpuPercent) || 100;
  out.memoryMb = Math.min(out.memoryMb, 1024 * 1024);
  out.diskMb = Math.min(out.diskMb, 1024 * 1024);
  out.cpuPercent = Math.min(out.cpuPercent, 100000);
  return out;
}

const MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";

function serverView(server, req) {
  const isAdmin = req && req.user && req.user.role === "admin";
  const secrets = store.serverSecrets(server.id);
  const secretKeys = server.secretKeys || Object.keys(secrets);
  const env = { ...(server.env || {}) };
  const copy = {
    id: server.id,
    name: server.name,
    eggId: server.eggId,
    eggName: server.eggName,
    nodeId: server.nodeId,
    ownerId: server.ownerId,
    ownerName: server.ownerName || "",
    domain: server.domain || "",
    env,
    secretKeys,
    startup: server.startup,
    autoRestart: Boolean(server.autoRestart),
    createdAt: server.createdAt,
    installed: Boolean(server.installed),
    status: server.status || "offline",
    limits: server.limits || null,
    live: server.live || null,
  };
  if (isAdmin) {
    copy.secretEnv = { ...secrets };
  } else {
    const maskedSecrets = {};
    for (const key of secretKeys) maskedSecrets[key] = secrets[key] ? MASK : "";
    copy.secretEnv = maskedSecrets;
    delete copy.limits;
    delete copy.ownerName;
  }
  return copy;
}


function probeDomain(domain) {
  return new Promise((resolve) => {
    if (!domain) return resolve("none");
    const raw = /^https?:\/\//i.test(domain) ? domain : `https://${domain}`;
    let url;
    try {
      url = new URL(raw);
    } catch {
      return resolve("invalid");
    }
    const lib = url.protocol === "http:" ? require("http") : require("https");
    const req = lib.request(
      { method: "GET", hostname: url.hostname, port: url.port || undefined, path: url.pathname || "/", timeout: 4000 },
      (res) => {
        res.resume();
        resolve(res.statusCode && res.statusCode < 500 ? "online" : "offline");
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve("offline");
    });
    req.on("error", () => resolve("offline"));
    req.end();
  });
}

function maskServer(server, req) {
  return serverView(server, req);
}

async function withNode(nodeId, fn) {
  const node = getNode(nodeId);
  if (!node) {
    const err = new Error("Node not found");
    err.status = 404;
    throw err;
  }
  const client = new NodeClient(node);
  return fn(client, node);
}

function createApp(express) {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "8mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use(express.static(path.join(ROOT, "public"), { extensions: ["html"] }));

  const requireAuth = auth.middleware();
  const requireAdmin = auth.adminOnly();

  app.get("/api/health", (req, res) => {
    res.json({ ok: true, service: "terrypanel", version: "1.0.0", uptime: process.uptime() });
  });

  app.post("/api/auth/login", (req, res) => {
    const { username, password } = req.body || {};
    const user = store.findUser((u) => u.username === String(username || "").toLowerCase());
    if (!user || !verifyPassword(password, user.password)) {
      store.audit("login_failed", username);
      return res.status(401).json({ error: "Invalid username or password" });
    }
    const token = auth.createSession(user);
    res.cookie("tp_session", token, auth.cookieOptions());
    store.audit("login", user.username);
    res.json({ user: { id: user.id, username: user.username, role: user.role } });
  });

  app.post("/api/auth/register", (req, res) => {
    const settings = store.getSettings();
    if ((settings.hostingMode || "private") !== "public") {
      return res.status(403).json({ error: "This panel is private. Ask the owner for an account." });
    }
    if (!settings.registrationOpen) return res.status(403).json({ error: "Registration is closed" });
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username and password required" });
    if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    const users = store.users();
    const name = String(username).toLowerCase().trim();
    if (!/^[a-z0-9_.-]{3,32}$/.test(name)) {
      return res.status(400).json({ error: "Username must be 3-32 chars (letters, numbers, . _ -)" });
    }
    if (users.some((u) => u.username === name)) return res.status(400).json({ error: "Username already exists" });
    const user = {
      id: uid("usr_"),
      username: name,
      role: "user",
      password: hashPassword(password),
      serverIds: [],
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    store.saveUsers(users);
    store.audit("register", name);
    const token = auth.createSession(user);
    res.cookie("tp_session", token, auth.cookieOptions());
    res.status(201).json({ user: { id: user.id, username: user.username, role: user.role } });
  });

  app.post("/api/auth/logout", (req, res) => {
    res.clearCookie("tp_session", { path: "/" });
    res.json({ ok: true });
  });

  app.get("/api/auth/me", requireAuth, (req, res) => {
    res.json({ user: req.user, settings: publicSettings() });
  });

  app.post("/api/auth/password", requireAuth, (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ error: "New password must be at least 6 characters" });
    }
    const users = store.users();
    const user = users.find((u) => u.id === req.user.id);
    if (!user || !verifyPassword(currentPassword, user.password)) {
      return res.status(400).json({ error: "Current password is incorrect" });
    }
    user.password = hashPassword(newPassword);
    store.saveUsers(users);
    store.audit("password_change", req.user.username);
    res.json({ ok: true });
  });

  function publicSettings() {
    const s = store.getSettings();
    return {
      panelName: s.panelName,
      tagline: s.tagline,
      logoUrl: s.logoUrl,
      accent: s.accent,
      accent2: s.accent2,
      theme: s.theme,
      registrationOpen: s.registrationOpen,
      publicStatus: s.publicStatus,
      hostingMode: s.hostingMode || "public",
      statusDomain: s.statusDomain || "",
      supportUrl: s.supportUrl || "",
      announcements: s.announcements || [],
      defaultEgg: s.defaultEgg,
      setupComplete: Boolean(s.setupComplete),
      hasTunnelToken: Boolean(s.tunnel && s.tunnel.token),
      rules: s.rules || "",
    };
  }

  app.get("/api/config", (req, res) => {
    res.json({
      settings: publicSettings(),
      tunnel: {
        status: tunnel.info().status,
        publicUrl: tunnel.info().publicUrl,
        mode: tunnel.info().mode,
      },
    });
  });

  app.get("/api/setup", (req, res) => {
    const settings = store.getSettings();
    res.json({
      needsSetup: store.users().length === 0,
      setupComplete: Boolean(settings.setupComplete),
      hasTunnelToken: Boolean(settings.tunnel && settings.tunnel.token),
      publicUrl: (settings.tunnel && settings.tunnel.publicUrl) || "",
      adminExists: store.users().some((u) => u.role === "admin"),
      panelName: settings.panelName,
    });
  });

  app.post("/api/setup/admin", async (req, res) => {
    if (store.users().length > 0) return res.status(400).json({ error: "An administrator account already exists" });
    const { username, password, panelName } = req.body || {};
    const name = String(username || "").toLowerCase().trim();
    if (!/^[a-z0-9_.-]{3,32}$/.test(name)) {
      return res.status(400).json({ error: "Username must be 3-32 chars (letters, numbers, . _ -)" });
    }
    if (!password || String(password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    const user = {
      id: uid("usr_"),
      username: name,
      role: "admin",
      password: hashPassword(password),
      serverIds: [],
      createdAt: new Date().toISOString(),
    };
    store.saveUsers([user]);
    if (panelName) store.updateSettings({ panelName: String(panelName).slice(0, 60) });
    store.audit("setup_admin", name);
    const token = auth.createSession(user);
    res.cookie("tp_session", token, auth.cookieOptions());
    res.status(201).json({ user: { id: user.id, username: user.username, role: user.role } });
  });

  app.post("/api/setup/tunnel", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const token = String((req.body || {}).token || "").trim();
      if (!token) return res.status(400).json({ error: "Paste your Cloudflare tunnel token" });
      const settings = store.getSettings();
      store.updateSettings({
        tunnel: { ...(settings.tunnel || {}), token, mode: "token", enabled: true },
      });
      const info = await tunnel.start(`http://127.0.0.1:${PORT}`);
      store.updateSettings({ setupComplete: true });
      store.audit("setup_tunnel", req.user.username);
      res.json({ ok: true, tunnel: info });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/setup/complete", requireAuth, requireAdmin, (req, res) => {
    store.updateSettings({ setupComplete: true });
    res.json({ ok: true });
  });

  app.get("/api/eggs", requireAuth, (req, res) => {
    res.json({ eggs: Object.values(loadEggs()) });
  });

  app.get("/api/eggs/:id", requireAuth, (req, res) => {
    const egg = loadEggs()[req.params.id];
    if (!egg) return res.status(404).json({ error: "Egg not found" });
    res.json({ egg });
  });

  app.get("/api/nodes/available", requireAuth, (req, res) => {
    res.json({
      nodes: store
        .nodes()
        .filter((n) => n.lastStatus !== "offline")
        .map((n) => ({ id: n.id, name: n.name, host: n.host, port: n.port, status: n.lastStatus })),
    });
  });

  app.get("/api/nodes", requireAuth, requireAdmin, (req, res) => {
    res.json({ nodes: store.nodes().map(nodeSummary) });
  });

  app.post("/api/nodes", requireAuth, requireAdmin, (req, res) => {
    const { name, host, port, token, secure, description } = req.body || {};
    if (!name || !host || !token) {
      return res.status(400).json({ error: "name, host and token are required" });
    }
    const node = {
      id: uid("node_"),
      name,
      host: String(host).trim(),
      port: Number(port || 8081),
      token,
      secure: Boolean(secure),
      description: description || "",
      createdAt: new Date().toISOString(),
      lastStatus: "unknown",
    };
    const nodes = store.nodes();
    nodes.push(node);
    store.saveNodes(nodes);
    store.audit("node_create", req.user.username, node.name);
    res.status(201).json({ node: nodeSummary(node) });
  });

  app.get("/api/nodes/:id/join-command", requireAuth, requireAdmin, (req, res) => {
    const node = getNode(req.params.id);
    if (!node) return res.status(404).json({ error: "Node not found" });
    const panelUrl = process.env.PUBLIC_URL || `http://${req.headers.host || "localhost"}`;
    const command = `curl -fsSL ${panelUrl.replace(/\/+$/, "")}/install-node.sh | bash -s -- --panel ${panelUrl.replace(/\/+$/, "")} --token ${node.token} --port ${node.port}`;
    res.json({
      node: nodeSummary(node),
      command,
      docker: `docker run -d --name terrypanel-wings --restart=always -e DAEMON_PORT=${node.port} -e DAEMON_TOKEN=${node.token} -v /var/lib/terrypanel:/data ghcr.io/terrypanel/wings:latest`,
    });
  });

  app.post("/api/nodes/:id/rotate-token", requireAuth, requireAdmin, (req, res) => {
    const nodes = store.nodes();
    const idx = nodes.findIndex((n) => n.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "Node not found" });
    nodes[idx].token = crypto.randomBytes(24).toString("hex");
    store.saveNodes(nodes);
    store.audit("node_rotate_token", req.user.username, nodes[idx].name);
    res.json({ node: nodeSummary(nodes[idx]), token: nodes[idx].token });
  });

  app.post("/api/nodes/:id/test", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const node = getNode(req.params.id);
      if (!node) return res.status(404).json({ error: "Node not found" });
      const client = new NodeClient(node);
      const health = await client.health();
      const nodes = store.nodes();
      const idx = nodes.findIndex((n) => n.id === node.id);
      nodes[idx] = { ...nodes[idx], lastSeen: new Date().toISOString(), lastStatus: "online" };
      store.saveNodes(nodes);
      res.json({ ok: true, health });
    } catch (err) {
      const nodes = store.nodes();
      const idx = nodes.findIndex((n) => n.id === req.params.id);
      if (idx >= 0) {
        nodes[idx] = { ...nodes[idx], lastSeen: new Date().toISOString(), lastStatus: "offline" };
        store.saveNodes(nodes);
      }
      res.status(502).json({ error: err.message });
    }
  });

  app.get("/api/nodes/:id/system", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const node = getNode(req.params.id);
      if (!node) return res.status(404).json({ error: "Node not found" });
      res.json(await new NodeClient(node).system());
    } catch (err) {
      next(err);
    }
  });

  app.patch("/api/nodes/:id", requireAuth, requireAdmin, (req, res) => {
    const nodes = store.nodes();
    const idx = nodes.findIndex((n) => n.id === req.params.id);
    if (idx < 0) return res.status(404).json({ error: "Node not found" });
    const allowed = ["name", "host", "port", "token", "secure", "description"];
    for (const key of allowed) {
      if (req.body[key] !== undefined) nodes[idx][key] = req.body[key];
    }
    store.saveNodes(nodes);
    store.audit("node_update", req.user.username, nodes[idx].name);
    res.json({ node: nodeSummary(nodes[idx]) });
  });

  app.delete("/api/nodes/:id", requireAuth, requireAdmin, (req, res) => {
    const nodes = store.nodes();
    const node = nodes.find((n) => n.id === req.params.id);
    if (!node) return res.status(404).json({ error: "Node not found" });
    const attached = store.servers().filter((s) => s.nodeId === node.id);
    if (attached.length > 0) {
      return res.status(400).json({ error: `Node still hosts ${attached.length} server(s)` });
    }
    store.saveNodes(nodes.filter((n) => n.id !== node.id));
    store.audit("node_delete", req.user.username, node.name);
    res.json({ ok: true });
  });

  app.post("/api/nodes/ssh-install", requireAuth, requireAdmin, (req, res) => {
    const config = req.body || {};
    if (!config.host || !config.username) {
      return res.status(400).json({ error: "host and username are required" });
    }
    if (!config.password && !config.privateKey) {
      return res.status(400).json({ error: "Provide a password or private key" });
    }
    const jobId = uid("job_");
    const token = config.token || crypto.randomBytes(24).toString("hex");
    const job = { id: jobId, status: "running", logs: [], result: null, error: null, startedAt: Date.now() };
    installJobs.set(jobId, job);
    res.status(202).json({ jobId });

    installDaemon(
      { ...config, token },
      { onLog: (line) => job.logs.push(line) }
    )
      .then((result) => {
        const node = {
          id: uid("node_"),
          name: config.name || `Node ${config.host}`,
          host: result.host,
          port: result.port,
          token,
          secure: false,
          description: `Auto-installed over SSH at ${new Date().toISOString()}`,
          createdAt: new Date().toISOString(),
          lastStatus: "online",
          lastSeen: new Date().toISOString(),
        };
        const nodes = store.nodes();
        nodes.push(node);
        store.saveNodes(nodes);
        job.status = "done";
        job.result = { node: nodeSummary(node), ...result };
        job.logs.push(`Node "${node.name}" added successfully.`);
        store.audit("node_ssh_install", req.user.username, node.name);
      })
      .catch((err) => {
        job.status = "error";
        job.error = err.message;
        job.logs.push(`ERROR: ${err.message}`);
      });
  });

  app.get("/api/nodes/ssh-install/:jobId", requireAuth, requireAdmin, (req, res) => {
    const job = installJobs.get(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    res.json(job);
  });

  app.get("/api/servers", requireAuth, async (req, res) => {
    const servers = store.servers();
    const visible = req.user.role === "admin"
      ? servers
      : servers.filter((s) => auth.canAccessServer(req, s));
    const nodes = store.nodes();
    const enriched = await Promise.all(
      visible.map(async (s) => {
        const node = nodes.find((n) => n.id === s.nodeId);
        let status = s.status || "offline";
        if (node) {
          try {
            const live = await new NodeClient(node).server(s.id);
            status = live.status || status;
            if (s.status !== status) {
              s.status = status;
              saveServer(s);
            }
          } catch {
            status = s.status || "offline";
          }
        }
        return {
          ...maskServer(s, req),
          status,
          nodeName: node ? node.name : "Unknown node",
          nodeHost: node ? `${node.host}:${node.port}` : "",
        };
      })
    );
    res.json({ servers: enriched });
  });

  app.post("/api/servers", requireAuth, async (req, res, next) => {
    try {
      const { name, eggId, nodeId, variables, autoRestart, domain } = req.body || {};
      const settings = store.getSettings();
      if ((settings.hostingMode || "private") !== "public" && req.user.role !== "admin") {
        return res.status(403).json({ error: "This panel is private. Only the owner can create servers." });
      }
      const eggs = loadEggs();
      const egg = eggs[eggId];
      if (!egg) return res.status(400).json({ error: "Unknown egg" });
      const node = getNode(nodeId);
      if (!node) return res.status(400).json({ error: "Select a valid node" });
      if (!name) return res.status(400).json({ error: "Server name is required" });

      const missing = (egg.variables || []).filter(
        (v) => v.required && (variables?.[v.key] === undefined || variables[v.key] === "")
      );
      if (missing.length) {
        return res.status(400).json({ error: `Missing required variable: ${missing.map((m) => m.label).join(", ")}` });
      }

      const { env, secrets, startup, files, secretKeys } = resolveVariables(egg, variables);
      const serverId = uid("srv_");
      const limits = sanitizeLimits(
        req.user.role === "admin" ? (req.body || {}).limits : null,
        settings.defaultLimits || {}
      );
      const meta = {
        name,
        egg: egg.id,
        eggName: egg.name,
        startup,
        command: startup,
        env: { ...env, ...secrets },
        files,
        autoRestart: Boolean(autoRestart),
        eggInstall: egg.installScript || "",
        limits,
        memoryLimit: limits.memoryMb,
        diskLimit: limits.diskMb,
        cpuLimit: limits.cpuPercent,
      };

      const client = new NodeClient(node);
      await client.createServer({ ...meta, id: serverId });

      const server = {
        id: serverId,
        name,
        eggId: egg.id,
        eggName: egg.name,
        nodeId: node.id,
        ownerId: req.user.id,
        ownerName: req.user.username,
        domain: domain ? String(domain).trim() : "",
        env,
        secretKeys,
        startup,
        autoRestart: Boolean(autoRestart),
        limits,
        createdAt: new Date().toISOString(),
        installed: false,
        status: "offline",
      };
      if (Object.keys(secrets).length) store.saveServerSecrets(serverId, secrets);
      saveServer(server);
      store.audit("server_create", req.user.username, name);
      res.status(201).json({ server: maskServer(server, req) });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/servers/:id", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      let live = null;
      let stats = null;
      try {
        const node = getNode(server.nodeId);
        if (node) {
          const client = new NodeClient(node);
          live = await client.server(server.id);
          stats = await client.stats(server.id);
        }
      } catch (err) {
        live = { status: "unreachable", error: err.message };
      }
      res.json({ server: maskServer(server, req), live, stats });
    } catch (err) {
      next(err);
    }
  });

  app.patch("/api/servers/:id", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      const allowed = ["name", "startup", "autoRestart", "domain"];
      for (const key of allowed) {
        if (req.body[key] !== undefined) server[key] = req.body[key];
      }
      if (req.body.env !== undefined && typeof req.body.env === "object") {
        server.env = { ...req.body.env };
      }
      if (req.body.secrets !== undefined && typeof req.body.secrets === "object") {
        const current = store.serverSecrets(server.id);
        const nextSecrets = { ...current };
        for (const [key, value] of Object.entries(req.body.secrets)) {
          if (value === MASK) continue;
          if (value === "" || value === null) delete nextSecrets[key];
          else nextSecrets[key] = String(value);
        }
        store.saveServerSecrets(server.id, nextSecrets);
        server.secretKeys = Object.keys(nextSecrets);
      }
      if (req.body.limits !== undefined) {
        if (req.user.role !== "admin") return res.status(403).json({ error: "Only administrators can change resource limits" });
        server.limits = sanitizeLimits(req.body.limits, server.limits || store.getSettings().defaultLimits || {});
      }
      saveServer(server);
      const merged = mergeEnv(server);
      try {
        const node = getNode(server.nodeId);
        if (node) {
          const client = new NodeClient(node);
          await client.updateServer(server.id, {
            name: server.name,
            env: merged,
            startup: server.startup,
            command: server.startup,
            autoRestart: server.autoRestart,
            limits: server.limits || null,
          });
          if (req.body.env !== undefined || req.body.secrets !== undefined) {
            const egg = loadEggs()[server.eggId];
            if (egg) {
              for (const [file, content] of Object.entries(egg.files || {})) {
                await client.writeFile(server.id, file, renderTemplate(content, merged)).catch(() => {});
              }
            }
          }
        }
      } catch {}
      store.audit("server_update", req.user.username, server.name);
      res.json({ server: maskServer(server, req) });
    } catch (err) {
      next(err);
    }
  });

  app.delete("/api/servers/:id", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      try {
        const node = getNode(server.nodeId);
        if (node) await new NodeClient(node).deleteServer(server.id);
      } catch {}
      store.deleteServerSecrets(server.id);
      store.saveServers(store.servers().filter((s) => s.id !== server.id));
      store.audit("server_delete", req.user.username, server.name);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/servers/:id/install", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      const egg = loadEggs()[server.eggId];
      if (!egg) return res.status(400).json({ error: "Egg missing" });
      const client = new NodeClient(getNode(server.nodeId));
      const render = (text) => renderTemplate(text, mergeEnv(server));
      const installCmd = render(egg.installScript || "true");
      await client.exec(server.id, installCmd);
      server.installed = true;
      saveServer(server);
      res.json({ ok: true, command: installCmd });
    } catch (err) {
      next(err);
    }
  });

  const serverAction = (action) => async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      const node = getNode(server.nodeId);
      if (!node) return res.status(400).json({ error: "Node not found" });
      const client = new NodeClient(node);
      const result = await client.action(server.id, action);
      store.audit(`server_${action}`, req.user.username, server.name);
      res.json({ ok: true, state: result });
    } catch (err) {
      next(err);
    }
  };

  for (const action of ["start", "stop", "restart", "kill"]) {
    app.post(`/api/servers/:id/${action}`, requireAuth, serverAction(action));
  }

  app.post("/api/servers/:id/command", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      if (!req.body.command) return res.status(400).json({ error: "Command required" });
      const client = new NodeClient(getNode(server.nodeId));
      await client.command(server.id, req.body.command);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/servers/:id/console", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      const client = new NodeClient(getNode(server.nodeId));
      const data = await client.console(server.id, Number(req.query.lines || 300));
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/servers/:id/stats", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      const client = new NodeClient(getNode(server.nodeId));
      res.json(await client.stats(server.id));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/servers/:id/files", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      const client = new NodeClient(getNode(server.nodeId));
      res.json(await client.files(server.id, req.query.path || ""));
    } catch (err) {
      next(err);
    }
  });

  app.get("/api/servers/:id/files/read", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      const client = new NodeClient(getNode(server.nodeId));
      res.json(await client.readFile(server.id, req.query.path));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/servers/:id/files/write", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      const client = new NodeClient(getNode(server.nodeId));
      res.json(await client.writeFile(server.id, req.body.path, req.body.content));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/servers/:id/files/mkdir", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      const client = new NodeClient(getNode(server.nodeId));
      res.json(await client.mkdir(server.id, req.body.path));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/servers/:id/files/rename", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      const client = new NodeClient(getNode(server.nodeId));
      res.json(await client.rename(server.id, req.body.from, req.body.to));
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/servers/:id/files/delete", requireAuth, async (req, res, next) => {
    try {
      const server = getServer(req.params.id);
      if (!server) return res.status(404).json({ error: "Server not found" });
      if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
      const client = new NodeClient(getNode(server.nodeId));
      res.json(await client.deleteFile(server.id, req.body.path));
    } catch (err) {
      next(err);
    }
  });

  app.post(
    "/api/servers/:id/files/upload",
    requireAuth,
    express.raw({ type: "application/octet-stream", limit: "100mb" }),
    async (req, res, next) => {
      try {
        const server = getServer(req.params.id);
        if (!server) return res.status(404).json({ error: "Server not found" });
        if (!auth.canAccessServer(req, server)) return res.status(403).json({ error: "Forbidden" });
        const client = new NodeClient(getNode(server.nodeId));
        res.json(await client.uploadFile(server.id, req.query.path, req.body));
      } catch (err) {
        next(err);
      }
    }
  );

  app.get("/api/status", async (req, res) => {
    const settings = store.getSettings();
    if (!settings.publicStatus) return res.status(403).json({ error: "Public status is disabled" });
    const nodes = store.nodes();
    const servers = store.servers();
    const nodeStatuses = new Map();
    for (const node of nodes) {
      try {
        const health = await new NodeClient(node).health();
        nodeStatuses.set(node.id, health && health.ok ? "online" : "offline");
      } catch {
        nodeStatuses.set(node.id, "offline");
      }
    }
    const results = [];
    for (const server of servers) {
      const node = nodes.find((n) => n.id === server.nodeId);
      let state = "unknown";
      let stats = null;
      if (node) {
        try {
          const client = new NodeClient(node);
          const live = await client.server(server.id);
          state = live.status || "unknown";
          stats = { cpu: live.stats?.cpu || 0, memory: live.stats?.memory || 0, uptime: live.stats?.uptime || 0 };
        } catch {
          state = "node-offline";
        }
      }
      results.push({
        id: server.id,
        name: server.name,
        egg: server.eggName,
        node: node ? node.name : "unknown",
        domain: server.domain || "",
        domainStatus: await probeDomain(server.domain),
        status: state,
        uptime: stats ? stats.uptime : 0,
        cpu: stats ? stats.cpu : 0,
        memory: stats ? stats.memory : 0,
      });
    }
    res.json({
      panel: settings.panelName,
      generatedAt: new Date().toISOString(),
      nodes: nodes.map((n) => ({
        id: n.id,
        name: n.name,
        status: nodeStatuses.get(n.id) || "unknown",
        host: n.host,
      })),
      servers: results,
      summary: {
        total: results.length,
        running: results.filter((r) => r.status === "running").length,
        offline: results.filter((r) => r.status === "offline").length,
        errored: results.filter((r) => r.status === "crashed" || r.status === "node-offline").length,
        domainsOnline: results.filter((r) => r.domainStatus === "online").length,
        domainsOffline: results.filter((r) => r.domain && r.domainStatus !== "online").length,
      },
      statusDomain: settings.statusDomain || "",
    });
  });

  app.get("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
    res.json({
      users: store.users().map((u) => ({
        id: u.id,
        username: u.username,
        role: u.role,
        serverIds: u.serverIds || [],
        createdAt: u.createdAt,
      })),
    });
  });

  app.post("/api/admin/users", requireAuth, requireAdmin, (req, res) => {
    const { username, password, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "username and password required" });
    if (String(password).length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });
    const users = store.users();
    if (users.some((u) => u.username === String(username).toLowerCase())) {
      return res.status(400).json({ error: "Username already exists" });
    }
    const user = {
      id: uid("usr_"),
      username: String(username).toLowerCase(),
      role: role === "admin" ? "admin" : "user",
      password: hashPassword(password),
      serverIds: [],
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    store.saveUsers(users);
    store.audit("user_create", req.user.username, user.username);
    res.status(201).json({ user: { id: user.id, username: user.username, role: user.role } });
  });

  app.patch("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
    const users = store.users();
    const target = users.find((u) => u.id === req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (req.body.role !== undefined) {
      if (target.id === req.user.id && req.body.role !== "admin") {
        return res.status(400).json({ error: "You cannot demote yourself" });
      }
      target.role = req.body.role === "admin" ? "admin" : "user";
    }
    if (Array.isArray(req.body.serverIds)) {
      const valid = new Set(store.servers().map((s) => s.id));
      target.serverIds = req.body.serverIds.filter((id) => valid.has(id));
    }
    store.saveUsers(users);
    store.audit("user_update", req.user.username, target.username);
    res.json({ user: { id: target.id, username: target.username, role: target.role, serverIds: target.serverIds || [] } });
  });

  app.delete("/api/admin/users/:id", requireAuth, requireAdmin, (req, res) => {
    const users = store.users();
    const target = users.find((u) => u.id === req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (target.id === req.user.id) return res.status(400).json({ error: "You cannot delete yourself" });
    store.saveUsers(users.filter((u) => u.id !== target.id));
    store.audit("user_delete", req.user.username, target.username);
    res.json({ ok: true });
  });

  app.post("/api/admin/users/:id/reset-password", requireAuth, requireAdmin, (req, res) => {
    const users = store.users();
    const target = users.find((u) => u.id === req.params.id);
    if (!target) return res.status(404).json({ error: "User not found" });
    if (!req.body.password || String(req.body.password).length < 6) {
      return res.status(400).json({ error: "Password must be at least 6 characters" });
    }
    target.password = hashPassword(req.body.password);
    store.saveUsers(users);
    store.audit("user_reset_password", req.user.username, target.username);
    res.json({ ok: true });
  });

  app.get("/api/settings", requireAuth, (req, res) => {
    res.json({ settings: redactSettings(store.getSettings()) });
  });

  app.patch("/api/settings", requireAuth, requireAdmin, (req, res) => {
    const allowed = [
      "panelName",
      "tagline",
      "logoUrl",
      "accent",
      "accent2",
      "theme",
      "registrationOpen",
      "publicStatus",
      "hostingMode",
      "statusDomain",
      "supportUrl",
      "announcements",
      "defaultEgg",
      "rules",
      "defaultLimits",
    ];
    const patch = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.defaultLimits) {
      const settings = store.getSettings();
      patch.defaultLimits = sanitizeLimits(patch.defaultLimits, settings.defaultLimits || {});
    }
    if (req.body.tunnel) {
      const current = store.getSettings().tunnel || {};
      patch.tunnel = { ...current };
      for (const key of ["token", "mode", "customHostname", "enabled"]) {
        if (req.body.tunnel[key] !== undefined && req.body.tunnel[key] !== "••••••••") {
          patch.tunnel[key] = req.body.tunnel[key];
        }
      }
    }
    const next = store.updateSettings(patch);
    store.audit("settings_update", req.user.username, Object.keys(patch).join(","));
    res.json({ settings: redactSettings(next) });
  });

  app.get("/api/tunnel", requireAuth, requireAdmin, (req, res) => {
    res.json(tunnel.info());
  });

  app.post("/api/tunnel/start", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      if (req.body && req.body.token) {
        const settings = store.getSettings();
        store.updateSettings({ tunnel: { ...(settings.tunnel || {}), token: req.body.token } });
      }
      const info = await tunnel.start(`http://127.0.0.1:${PORT}`);
      res.json(info);
    } catch (err) {
      next(err);
    }
  });

  app.post("/api/tunnel/stop", requireAuth, requireAdmin, (req, res) => {
    res.json(tunnel.stop());
  });

  app.get("/api/tunnel/events", requireAuth, requireAdmin, (req, res) => {
    res.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
    });
    const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    send("info", tunnel.info());
    const onLog = (line) => send("log", { line });
    const onStatus = (status) => send("status", { status, ...tunnel.info() });
    const onUrl = (url) => send("url", { url });
    tunnel.on("log", onLog);
    tunnel.on("status", onStatus);
    tunnel.on("url", onUrl);
    const heartbeat = setInterval(() => res.write(": ping\n\n"), 15000);
    req.on("close", () => {
      clearInterval(heartbeat);
      tunnel.off("log", onLog);
      tunnel.off("status", onStatus);
      tunnel.off("url", onUrl);
    });
  });

  function enrollmentKey() {
    const settings = store.getSettings();
    const secret = settings.adminSecret || secretFallback();
    const issued = Date.now();
    const body = Buffer.from(JSON.stringify({ exp: issued + 1000 * 60 * 60 })).toString("base64url");
    const sig = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    return `${body}.${sig}`;
  }

  function verifyEnrollment(key) {
    if (!key || typeof key !== "string") return false;
    const [body, sig] = key.split(".");
    if (!body || !sig) return false;
    const settings = store.getSettings();
    const secret = settings.adminSecret || secretFallback();
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    if (Buffer.from(expected).length !== Buffer.from(sig).length) return false;
    if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig))) return false;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      return payload.exp > Date.now();
    } catch {
      return false;
    }
  }

  function secretFallback() {
    return secret;
  }

  app.get("/api/nodes/enrollment-key", requireAuth, requireAdmin, (req, res) => {
    const panelUrl = process.env.PUBLIC_URL || `http://${req.headers.host || "localhost"}`;
    const base = panelUrl.replace(/\/+$/, "");
    res.json({
      key: enrollmentKey(),
      panelUrl: base,
      expiresInSeconds: 3600,
      command: `curl -fsSL ${base}/install-node.sh | bash -s -- --panel ${base} --enroll ${enrollmentKey()}`,
    });
  });

  app.post("/api/nodes/self-register", (req, res) => {
    const { enroll, name, host, port, token } = req.body || {};
    if (!verifyEnrollment(enroll)) {
      return res.status(403).json({ error: "Invalid or expired enrollment key. Generate a new one in the panel." });
    }
    if (!token || !host) return res.status(400).json({ error: "host and token are required" });
    const nodes = store.nodes();
    const existing = nodes.find((n) => n.host === String(host) && Number(n.port) === Number(port || 8081));
    const record = {
      id: existing ? existing.id : uid("node_"),
      name: name || existing?.name || String(host),
      host: String(host),
      port: Number(port || 8081),
      token: String(token),
      secure: false,
      description: existing?.description || `Self-registered at ${new Date().toISOString()}`,
      createdAt: existing?.createdAt || new Date().toISOString(),
      lastStatus: "online",
      lastSeen: new Date().toISOString(),
    };
    if (existing) nodes[nodes.indexOf(existing)] = record;
    else nodes.push(record);
    store.saveNodes(nodes);
    store.audit("node_self_register", name || host);
    res.status(existing ? 200 : 201).json({ node: nodeSummary(record) });
  });

  app.get(/^\/daemon\/(.+)$/, (req, res) => {
    const rel = String(req.params[0] || "").replace(/^\/+/, "");
    const allowed = ["daemon.js", "lib/env.js", "lib/util.js", "lib/system.js", "lib/process-manager.js"];
    if (!allowed.includes(rel)) return res.status(404).type("text/plain").send("Not found");
    const file = path.join(ROOT, "daemon", rel);
    if (!fs.existsSync(file)) return res.status(404).type("text/plain").send("Not found");
    res.type("text/plain").send(fs.readFileSync(file, "utf8"));
  });

  app.get("/install-node.sh", (req, res) => {
    const file = path.join(ROOT, "scripts", "install-node.sh");
    if (!fs.existsSync(file)) return res.status(404).type("text/plain").send("Not found");
    res.type("text/plain").send(fs.readFileSync(file, "utf8"));
  });

  app.get("/api/admin/audit", requireAuth, requireAdmin, (req, res) => {
    const file = path.join(DATA_DIR, "audit.log");
    try {
      const lines = fs.readFileSync(file, "utf8").trim().split("\n").slice(-200);
      res.json({ entries: lines.map((l) => JSON.parse(l)).reverse() });
    } catch {
      res.json({ entries: [] });
    }
  });

  app.use((err, req, res, next) => {
    console.error("[terrypanel]", err.message);
    if (res.headersSent) return next(err);
    res.status(err.status || 500).json({ error: err.message || "Internal server error" });
  });

  return app;
}

function start() {
  bootstrapAdmin();
  let express;
  try {
    express = require("express");
  } catch {
    console.error("Express is not installed. Run: npm install");
    process.exit(1);
  }
  const app = createApp(express);

  const settings = store.getSettings();
  if (settings.tunnel && settings.tunnel.enabled && settings.tunnel.token) {
    tunnel.start(`http://127.0.0.1:${PORT}`).catch((err) => {
      console.warn(`[terrypanel] Tunnel auto-start failed: ${err.message}`);
    });
  }

  const server = app.listen(PORT, HOST, () => {
    console.log(`\n  TerryPanel v1.0.0`);
    console.log(`  Panel:  http://${HOST === "0.0.0.0" ? "localhost" : HOST}:${PORT}`);
    console.log(`  Data:   ${DATA_DIR}`);
    console.log(`  Nodes:  ${store.nodes().length} | Servers: ${store.servers().length}\n`);
  });

  process.on("SIGINT", () => {
    tunnel.stop();
    server.close(() => process.exit(0));
  });
  return { app, server };
}

if (require.main === module) start();

module.exports = { createApp, start, store, auth, tunnel, loadEggs, DATA_DIR };
