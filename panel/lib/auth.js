"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function loadSecret(dataDir) {
  if (process.env.TP_SECRET) return process.env.TP_SECRET;
  const file = path.join(dataDir, "secret.key");
  try {
    return fs.readFileSync(file, "utf8").trim();
  } catch {
    const secret = crypto.randomBytes(48).toString("hex");
    fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    return secret;
  }
}

class Auth {
  constructor(store, secret) {
    this.store = store;
    this.secret = secret;
    this.ttlMs = 1000 * 60 * 60 * 24 * 7;
  }

  sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    const sig = crypto.createHmac("sha256", this.secret).update(body).digest("base64url");
    return `${body}.${sig}`;
  }

  verifyToken(token) {
    if (!token || typeof token !== "string") return null;
    const [body, sig] = token.split(".");
    if (!body || !sig) return null;
    const expected = crypto.createHmac("sha256", this.secret).update(body).digest("base64url");
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
      if (!payload.exp || payload.exp < Date.now()) return null;
      return payload;
    } catch {
      return null;
    }
  }

  createSession(user) {
    return this.sign({
      sub: user.id,
      username: user.username,
      role: user.role,
      exp: Date.now() + this.ttlMs,
    });
  }

  cookieOptions() {
    return {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.TP_SECURE_COOKIES === "1",
      maxAge: this.ttlMs,
      path: "/",
    };
  }

  middleware() {
    return (req, res, next) => {
      const cookie = req.headers.cookie || "";
      const match = cookie.match(/(?:^|;\s*)tp_session=([^;]+)/);
      const payload = match ? this.verifyToken(decodeURIComponent(match[1])) : null;
      if (!payload) return res.status(401).json({ error: "Not authenticated" });
      const user = this.store.findUser((u) => u.id === payload.sub);
      if (!user) return res.status(401).json({ error: "User no longer exists" });
      req.user = { id: user.id, username: user.username, role: user.role, serverIds: user.serverIds || [] };
      next();
    };
  }

  adminOnly() {
    return (req, res, next) => {
      if (!req.user || req.user.role !== "admin") {
        return res.status(403).json({ error: "Administrator access required" });
      }
      next();
    };
  }

  canAccessServer(req, server) {
    if (!req.user) return false;
    if (req.user.role === "admin") return true;
    return server.ownerId === req.user.id || (req.user.serverIds || []).includes(server.id);
  }
}

module.exports = { Auth, loadSecret };
