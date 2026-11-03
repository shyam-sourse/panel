"use strict";

const http = require("http");
const https = require("https");
const { URL } = require("url");

function request(baseUrl, method, endpoint, opts = {}) {
  const { token, body, buffer, contentType, timeout = 15000, raw = false } = opts;
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(endpoint, baseUrl);
    } catch {
      return reject(new Error("Invalid node URL"));
    }
    const isHttps = target.protocol === "https:";
    const lib = isHttps ? https : http;
    let payload = null;
    if (buffer !== undefined) payload = buffer;
    else if (body !== undefined) payload = Buffer.from(JSON.stringify(body));

    const headers = {};
    if (token) headers["authorization"] = `Bearer ${token}`;
    if (payload) {
      headers["content-type"] = contentType || (buffer !== undefined ? "application/octet-stream" : "application/json");
      headers["content-length"] = payload.length;
    }

    const req = lib.request(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (isHttps ? 443 : 80),
        path: target.pathname + target.search,
        method,
        headers,
        timeout,
        rejectUnauthorized: process.env.TP_NODE_TLS_STRICT !== "0",
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          if (raw) return resolve({ status: res.statusCode, text, headers: res.headers });
          let parsed = null;
          try {
            parsed = text ? JSON.parse(text) : null;
          } catch {
            parsed = { raw: text };
          }
          if (res.statusCode >= 400) {
            const err = new Error((parsed && parsed.error) || `Node returned ${res.statusCode}`);
            err.status = res.statusCode;
            err.body = parsed;
            return reject(err);
          }
          resolve(parsed);
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Node request timed out")));
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

class NodeClient {
  constructor(node) {
    this.node = node;
  }

  get baseUrl() {
    return `${this.node.secure ? "https" : "http"}://${this.node.host}:${this.node.port}`;
  }

  call(method, endpoint, body, opts = {}) {
    return request(this.baseUrl, method, endpoint, { token: this.node.token, body, ...opts });
  }

  health() {
    return this.call("GET", "/health", undefined, { timeout: 5000 });
  }

  system() {
    return this.call("GET", "/system", undefined, { timeout: 8000 });
  }

  listServers() {
    return this.call("GET", "/servers");
  }

  createServer(meta) {
    return this.call("POST", "/servers", meta);
  }

  updateServer(id, patch) {
    return this.call("PATCH", `/servers/${id}`, patch);
  }

  deleteServer(id) {
    return this.call("DELETE", `/servers/${id}`);
  }

  server(id) {
    return this.call("GET", `/servers/${id}`);
  }

  action(id, action) {
    return this.call("POST", `/servers/${id}/${action}`, {});
  }

  command(id, command) {
    return this.call("POST", `/servers/${id}/command`, { command });
  }

  exec(id, command) {
    return this.call("POST", `/servers/${id}/exec`, { command });
  }

  console(id, lines = 300) {
    return this.call("GET", `/servers/${id}/console?lines=${lines}`);
  }

  stats(id) {
    return this.call("GET", `/servers/${id}/stats`);
  }

  usage(id) {
    return this.call("GET", `/servers/${id}/usage`);
  }

  files(id, dirPath = "") {
    return this.call("GET", `/servers/${id}/files?path=${encodeURIComponent(dirPath)}`);
  }

  readFile(id, filePath) {
    return this.call("GET", `/servers/${id}/files/read?path=${encodeURIComponent(filePath)}`);
  }

  writeFile(id, filePath, content) {
    return this.call("POST", `/servers/${id}/files/write`, { path: filePath, content });
  }

  mkdir(id, dirPath) {
    return this.call("POST", `/servers/${id}/files/mkdir`, { path: dirPath });
  }

  rename(id, from, to) {
    return this.call("POST", `/servers/${id}/files/rename`, { from, to });
  }

  deleteFile(id, filePath) {
    return this.call("POST", `/servers/${id}/files/delete`, { path: filePath });
  }

  uploadFile(id, filePath, buffer) {
    return this.call("POST", `/servers/${id}/files/upload?path=${encodeURIComponent(filePath)}`, undefined, {
      buffer,
      contentType: "application/octet-stream",
      timeout: 120000,
      raw: true,
    });
  }
}

module.exports = { NodeClient, request };
