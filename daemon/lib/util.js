"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body),
    "cache-control": "no-store",
  });
  res.end(body);
}

function error(res, status, message) {
  json(res, status, { error: message });
}

function readBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("Request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJson(req, limit) {
  const raw = await readBody(req, limit);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw new Error("Invalid JSON body");
  }
}

function safeJoin(root, relative) {
  const cleaned = String(relative || "")
    .replace(/\\/g, "/")
    .replace(/^\/+/, "");
  const target = path.resolve(root, cleaned);
  const resolvedRoot = path.resolve(root);
  if (target !== resolvedRoot && !target.startsWith(resolvedRoot + path.sep)) {
    throw new Error("Path escapes the server directory");
  }
  return target;
}

function tokenOk(req, url, expected) {
  if (!expected) return true;
  const header = req.headers["authorization"] || "";
  const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
  const supplied = bearer || url.searchParams.get("token") || "";
  if (supplied.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}

function randomId(prefix = "") {
  return prefix + crypto.randomBytes(8).toString("hex");
}

function tailFile(file, lines) {
  try {
    const stat = fs.statSync(file);
    const max = Math.min(stat.size, 512 * 1024);
    const fd = fs.openSync(file, "r");
    const buffer = Buffer.alloc(max);
    fs.readSync(fd, buffer, 0, max, stat.size - max);
    fs.closeSync(fd);
    const text = buffer.toString("utf8");
    const parts = text.split(/\r?\n/);
    if (parts.length > lines) parts.splice(0, parts.length - lines);
    return parts.join("\n");
  } catch {
    return "";
  }
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

module.exports = {
  json,
  error,
  readBody,
  readJson,
  safeJoin,
  tokenOk,
  randomId,
  tailFile,
  ensureDir,
};
