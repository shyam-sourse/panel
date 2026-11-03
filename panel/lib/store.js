"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

class Store {
  constructor(dataDir) {
    this.dataDir = path.resolve(dataDir);
    this.secretDir = path.join(this.dataDir, "secrets");
    this.files = {
      settings: path.join(this.dataDir, "settings.json"),
      users: path.join(this.dataDir, "users.json"),
      nodes: path.join(this.dataDir, "nodes.json"),
      servers: path.join(this.dataDir, "servers.json"),
      sessions: path.join(this.dataDir, "sessions.json"),
      audit: path.join(this.dataDir, "audit.log"),
    };
    fs.mkdirSync(this.dataDir, { recursive: true });
    fs.mkdirSync(this.secretDir, { recursive: true, mode: 0o700 });
    this.ensureDefaults();
  }

  read(name, fallback) {
    try {
      return JSON.parse(fs.readFileSync(this.files[name], "utf8"));
    } catch {
      return fallback;
    }
  }

  write(name, value) {
    const file = this.files[name];
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
    fs.renameSync(tmp, file);
    return value;
  }

  ensureDefaults() {
    if (!fs.existsSync(this.files.settings)) {
      const secret = crypto.randomBytes(32).toString("hex");
      this.write("settings", {
        panelName: "TerryPanel",
        tagline: "Game and bot hosting on any VPS",
        logoUrl: "",
        accent: "#7c5cff",
        accent2: "#38e1c4",
        theme: "dark",
        registrationOpen: true,
        publicStatus: true,
        hostingMode: "public",
        statusDomain: "",
        supportUrl: "",
        setupComplete: false,
        rules: "Be respectful. Do not abuse the hosting service. We may suspend servers that break the rules.",
        tunnel: {
          enabled: false,
          token: "",
          mode: "token",
          customHostname: "",
          lastStatus: "stopped",
          lastError: "",
          publicUrl: "",
        },
        defaultLimits: {
          memoryMb: 1024,
          diskMb: 5120,
          cpuPercent: 100,
        },
        announcements: [],
        defaultEgg: "generic-node",
        adminSecret: secret,
      });
    }
    if (!fs.existsSync(this.files.users)) this.write("users", []);
    if (!fs.existsSync(this.files.nodes)) this.write("nodes", []);
    if (!fs.existsSync(this.files.servers)) this.write("servers", []);
    if (!fs.existsSync(this.files.sessions)) this.write("sessions", []);
  }

  getSettings() {
    return this.read("settings", {});
  }

  updateSettings(patch) {
    const current = this.getSettings();
    const next = { ...current, ...patch };
    if (patch.tunnel) next.tunnel = { ...current.tunnel, ...patch.tunnel };
    return this.write("settings", next);
  }

  users() {
    return this.read("users", []);
  }

  saveUsers(users) {
    return this.write("users", users);
  }

  findUser(predicate) {
    return this.users().find(predicate) || null;
  }

  nodes() {
    return this.read("nodes", []);
  }

  saveNodes(nodes) {
    return this.write("nodes", nodes);
  }

  servers() {
    return this.read("servers", []);
  }

  saveServers(servers) {
    return this.write("servers", servers);
  }

  secretFile(serverId) {
    return path.join(this.secretDir, `${String(serverId).replace(/[^a-zA-Z0-9_-]/g, "")}.json`);
  }

  serverSecrets(serverId) {
    try {
      return JSON.parse(fs.readFileSync(this.secretFile(serverId), "utf8"));
    } catch {
      return {};
    }
  }

  saveServerSecrets(serverId, secrets) {
    const file = this.secretFile(serverId);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(secrets || {}, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, file);
    try {
      fs.chmodSync(file, 0o600);
    } catch {}
    return secrets;
  }

  deleteServerSecrets(serverId) {
    try {
      fs.unlinkSync(this.secretFile(serverId));
    } catch {}
  }

  audit(action, actor, detail) {
    const line = JSON.stringify({
      at: new Date().toISOString(),
      action,
      actor: actor || "system",
      detail: detail || "",
    });
    fs.appendFile(this.files.audit, line + "\n", () => {});
  }
}

function hashPassword(password, salt) {
  const useSalt = salt || crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(String(password), useSalt, 64).toString("hex");
  return `scrypt$${useSalt}$${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const parts = String(stored).split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const [, salt, hash] = parts;
  const candidate = crypto.scryptSync(String(password), salt, 64).toString("hex");
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(hash, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { Store, hashPassword, verifyPassword };
