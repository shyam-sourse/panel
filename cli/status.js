#!/usr/bin/env node
"use strict";

const http = require("http");
const https = require("https");
const { URL } = require("url");

const VERSION = "1.0.0";

function usage() {
  console.log(`TerryPanel status CLI v${VERSION}

Usage:
  terrypanel-status [panel-url] [options]

Options:
  --url <url>        Panel base URL (default: $PUBLIC_URL or http://localhost:3000)
  --json             Print raw JSON
  --filter <text>    Only show servers whose name/egg/node/domain contains text
  --domains          Only show servers that have a domain configured
  --no-color         Disable ANSI colors
  --help             Show this help

Examples:
  terrypanel-status
  terrypanel-status https://panel.example.com
  terrypanel-status --url https://panel.example.com --filter minecraft
  terrypanel-status --domains
  terrypanel-status --json

Exit codes:
  0  All servers running
  1  At least one server is not running
  2  Panel unreachable or request failed
`);
}

function parseArgs(argv) {
  const opts = { url: process.env.PUBLIC_URL || process.env.TP_PANEL_URL || "http://localhost:3000", json: false, filter: "", domains: false, color: true };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") return { help: true };
    else if (arg === "--json") opts.json = true;
    else if (arg === "--domains" || arg === "--domain") opts.domains = true;
    else if (arg === "--no-color") opts.color = false;
    else if (arg === "--url") opts.url = argv[++i];
    else if (arg === "--filter") opts.filter = (argv[++i] || "").toLowerCase();
    else if (!arg.startsWith("-")) rest.push(arg);
  }
  if (rest[0]) opts.url = rest[0];
  return opts;
}

function fetchJson(base, path) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(path, base);
    } catch {
      return reject(new Error("Invalid panel URL"));
    }
    const lib = target.protocol === "https:" ? https : http;
    const req = lib.get(
      {
        protocol: target.protocol,
        hostname: target.hostname,
        port: target.port || (target.protocol === "https:" ? 443 : 80),
        path: target.pathname + target.search,
        timeout: 12000,
        headers: { accept: "application/json", "user-agent": `terrypanel-status/${VERSION}` },
        rejectUnauthorized: process.env.TP_TLS_STRICT !== "0",
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const body = Buffer.concat(chunks).toString("utf8");
          let data;
          try {
            data = JSON.parse(body);
          } catch {
            return reject(new Error(`Unexpected response from panel (HTTP ${res.statusCode})`));
          }
          if (res.statusCode >= 400) return reject(new Error(data.error || `Panel returned HTTP ${res.statusCode}`));
          resolve(data);
        });
      }
    );
    req.on("timeout", () => req.destroy(new Error("Request timed out")));
    req.on("error", reject);
  });
}

const COLORS = {
  reset: "\x1b[0m", bold: "\x1b[1m", dim: "\x1b[2m",
  red: "\x1b[31m", green: "\x1b[32m", yellow: "\x1b[33m",
  blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m",
};

function makeColor(enabled) {
  return (name, text) => (enabled ? `${COLORS[name]}${text}${COLORS.reset}` : text);
}

function statusColor(status) {
  if (status === "running") return "green";
  if (status === "starting" || status === "stopping" || status === "unknown") return "yellow";
  if (status === "offline") return "dim";
  return "red";
}

function fmtUptime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d) return `${d}d ${h}h`;
  if (h) return `${h}h ${m}m`;
  return `${m}m`;
}

function fmtBytes(n) {
  n = Number(n) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${units[i]}`;
}

function pad(text, width) {
  const visible = String(text).replace(/\x1b\[[0-9;]*m/g, "");
  return String(text) + " ".repeat(Math.max(0, width - visible.length));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) return usage();
  const c = makeColor(opts.color);
  let data;
  try {
    data = await fetchJson(opts.url, "/api/status");
  } catch (err) {
    console.error(c("red", `Error: ${err.message}`));
    console.error(c("dim", `Tried: ${opts.url}/api/status`));
    process.exit(2);
  }

  let servers = data.servers || [];
  if (opts.domains) servers = servers.filter((s) => s.domain);
  if (opts.filter) {
    servers = servers.filter((s) =>
      [s.name, s.egg, s.node, s.domain].join(" ").toLowerCase().includes(opts.filter)
    );
  }

  if (opts.json) {
    console.log(JSON.stringify({ ...data, servers }, null, 2));
    process.exit(servers.every((s) => s.status === "running") ? 0 : 1);
  }

  console.log("");
  console.log(c("bold", `  ${data.panel} - live status`));
  console.log(c("dim", `  ${data.generatedAt}  ${opts.url}`));
  console.log("");

  console.log(c("bold", "  Nodes"));
  if (!(data.nodes || []).length) {
    console.log(c("dim", "    no nodes configured"));
  } else {
    for (const node of data.nodes) {
      const color = node.status === "online" ? "green" : node.status === "offline" ? "red" : "yellow";
      console.log(`    ${pad(c(color, "●"), 4)} ${pad(node.name, 24)} ${c("dim", node.host || "")}  ${c(color, node.status || "unknown")}`);
    }
  }
  console.log("");

  const header = `  ${pad("SERVER", 24)}${pad("STATUS", 12)}${pad("DOMAIN", 34)}${pad("DOMAIN", 10)}${pad("UPTIME", 10)}${pad("CPU", 7)}MEMORY`;
  console.log(c("bold", "  Servers"));
  console.log(c("dim", header));
  console.log(c("dim", "  " + "-".repeat(122)));
  if (!servers.length) {
    console.log(c("dim", "    no servers"));
  } else {
    for (const srv of servers) {
      const color = statusColor(srv.status);
      const dot = "●";
      const domainStatus = srv.domain ? srv.domainStatus || "unknown" : "none";
      const domainColor =
        domainStatus === "online" ? "green" : domainStatus === "none" ? "dim" : "red";
      console.log(
        `  ${c(color, dot)} ${pad(srv.name, 22)}${pad(c(color, srv.status || "unknown"), 12)}${pad(srv.domain || "-", 34)}${pad(c(domainColor, domainStatus), 10)}${pad(fmtUptime(srv.uptime), 10)}${pad(`${Number(srv.cpu || 0).toFixed(0)}%`, 7)}${fmtBytes(srv.memory)}`
      );
    }
  }

  const domains = (data.servers || []).filter((s) => s.domain);
  if (domains.length) {
    console.log("");
    console.log(c("bold", "  Domains"));
    for (const srv of domains) {
      const online = srv.domainStatus === "online";
      console.log(
        `  ${pad(c(online ? "green" : "red", online ? "● online" : "● offline"), 12)}${pad(srv.domain, 40)}${c("dim", srv.name)}`
      );
    }
  }

  const summary = data.summary || { total: servers.length };
  console.log("");
  const allRunning = servers.every((s) => s.status === "running");
  console.log(
    "  " +
      [
        c("bold", `${summary.total ?? servers.length} total`),
        c("green", `${summary.running ?? 0} running`),
        c("dim", `${summary.offline ?? 0} offline`),
        c("red", `${summary.errored ?? 0} errored`),
        c("green", `${summary.domainsOnline ?? 0} domains up`),
        c("red", `${summary.domainsOffline ?? 0} domains down`),
      ].join(c("dim", "  |  "))
  );
  console.log("");

  process.exit(allRunning ? 0 : 1);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(2);
});
