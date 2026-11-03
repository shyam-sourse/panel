"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const http = require("http");

const ROOT = path.resolve(__dirname, "..");
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "terrypanel-test-"));
const DAEMON_PORT = 18081;
const PANEL_PORT = 13000;
const DAEMON_TOKEN = "test-token-123";
const BASE = `http://127.0.0.1:${PANEL_PORT}`;

let failures = 0;
function ok(name, cond, extra = "") {
  if (cond) console.log(`  PASS ${name}`);
  else {
    failures++;
    console.log(`  FAIL ${name} ${extra}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function rawRequest(method, url, { body, headers = {}, cookie } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const payload = body === undefined ? null : Buffer.from(typeof body === "string" ? body : JSON.stringify(body));
    const h = { ...headers };
    if (payload) {
      h["content-length"] = payload.length;
      if (!h["content-type"]) h["content-type"] = "application/json";
    }
    if (cookie) h.cookie = cookie;
    const req = http.request(
      {
        hostname: u.hostname,
        port: u.port,
        path: u.pathname + u.search,
        method,
        headers: h,
        timeout: 15000,
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let data = null;
          try { data = JSON.parse(text); } catch { data = text; }
          resolve({ status: res.statusCode, data, headers: res.headers, text });
        });
      }
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function waitFor(url, timeout = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await rawRequest("GET", url);
      if (res.status < 500) return true;
    } catch {}
    await sleep(250);
  }
  return false;
}

async function main() {
  console.log("TerryPanel smoke test\n");
  console.log(`Temp dir: ${TMP}\n`);

  const env = {
    ...process.env,
    TP_DATA_DIR: path.join(TMP, "panel-data"),
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "testpassword",
    PORT: String(PANEL_PORT),
    TP_SECRET: "test-secret-key",
  };

  const daemon = spawn(process.execPath, [path.join(ROOT, "daemon/daemon.js")], {
    env: {
      ...process.env,
      DAEMON_PORT: String(DAEMON_PORT),
      DAEMON_TOKEN,
      DAEMON_DATA_DIR: path.join(TMP, "daemon-data"),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let daemonOut = "";
  daemon.stdout.on("data", (d) => (daemonOut += d));
  daemon.stderr.on("data", (d) => (daemonOut += d));

  const panel = spawn(process.execPath, [path.join(ROOT, "panel/server.js")], {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  let panelOut = "";
  panel.stdout.on("data", (d) => (panelOut += d));
  panel.stderr.on("data", (d) => (panelOut += d));

  const cleanup = () => {
    try { panel.kill("SIGKILL"); } catch {}
    try { daemon.kill("SIGKILL"); } catch {}
  };

  try {
    ok("daemon started", await waitFor(`http://127.0.0.1:${DAEMON_PORT}/health`));
    ok("panel started", await waitFor(`${BASE}/api/health`));

    const health = await rawRequest("GET", `${BASE}/api/health`);
    ok("panel health", health.status === 200 && health.data.ok === true);

    const loginBad = await rawRequest("POST", `${BASE}/api/auth/login`, {
      body: { username: "admin", password: "wrong" },
    });
    ok("rejects bad login", loginBad.status === 401);

    const login = await rawRequest("POST", `${BASE}/api/auth/login`, {
      body: { username: "admin", password: "testpassword" },
    });
    ok("admin login", login.status === 200);
    const cookie = (login.headers["set-cookie"] || [])[0]?.split(";")[0];
    ok("session cookie set", Boolean(cookie));

    const me = await rawRequest("GET", `${BASE}/api/auth/me`, { cookie });
    ok("auth me", me.status === 200 && me.data.user.role === "admin");

    const unauth = await rawRequest("GET", `${BASE}/api/servers`);
    ok("blocks unauthenticated", unauth.status === 401);

    const eggs = await rawRequest("GET", `${BASE}/api/eggs`, { cookie });
    const ids = (eggs.data.eggs || []).map((e) => e.id);
    ok("eggs loaded", ids.length >= 5, ids.join(","));
    for (const required of ["discordjs-bot", "discordpy-bot", "minecraft-paper", "minecraft-vanilla", "generic-python", "generic-node"]) {
      ok(`egg present: ${required}`, ids.includes(required));
    }

    const nodeCreate = await rawRequest("POST", `${BASE}/api/nodes`, {
      cookie,
      body: { name: "local", host: "127.0.0.1", port: DAEMON_PORT, token: DAEMON_TOKEN },
    });
    ok("create node", nodeCreate.status === 201);
    const nodeId = nodeCreate.data.node.id;

    const nodeTest = await rawRequest("POST", `${BASE}/api/nodes/${nodeId}/test`, { cookie });
    ok("node health test", nodeTest.status === 200 && nodeTest.data.health.ok === true);

    const system = await rawRequest("GET", `${BASE}/api/nodes/${nodeId}/system`, { cookie });
    ok("node system stats", system.status === 200 && system.data.memory.total > 0);

    const serverCreate = await rawRequest("POST", `${BASE}/api/servers`, {
      cookie,
      body: {
        name: "Test App",
        eggId: "generic-node",
        nodeId,
        variables: { ENTRY: "app.js", PORT: "3999" },
      },
    });
    ok("create server", serverCreate.status === 201);
    const serverId = serverCreate.data.server.id;
    ok("startup rendered", serverCreate.data.server.startup === "node app.js");

    const missingVar = await rawRequest("POST", `${BASE}/api/servers`, {
      cookie,
      body: { name: "Bad", eggId: "discordjs-bot", nodeId, variables: {} },
    });
    ok("validates required vars", missingVar.status === 400);

    const writeFile = await rawRequest("POST", `${BASE}/api/servers/${serverId}/files/write`, {
      cookie,
      body: { path: "app.js", content: "console.log('hello from terrypanel');\nsetInterval(()=>{}, 1000);\n" },
    });
    ok("write file", writeFile.status === 200);

    const fileList = await rawRequest("GET", `${BASE}/api/servers/${serverId}/files?path=`, { cookie });
    ok("list files", fileList.status === 200 && fileList.data.entries.some((e) => e.name === "app.js"));

    const readFile = await rawRequest("GET", `${BASE}/api/servers/${serverId}/files/read?path=app.js`, { cookie });
    ok("read file", readFile.status === 200 && readFile.data.content.includes("hello"));

    const start = await rawRequest("POST", `${BASE}/api/servers/${serverId}/start`, { cookie });
    ok("start server", start.status === 200);
    await sleep(1500);

    const consoleRes = await rawRequest("GET", `${BASE}/api/servers/${serverId}/console`, { cookie });
    ok("console output", (consoleRes.data.console || "").includes("hello from terrypanel"), consoleRes.data.console);

    const stats = await rawRequest("GET", `${BASE}/api/servers/${serverId}/stats`, { cookie });
    ok("server stats", stats.status === 200 && stats.data.status === "running");

    const cmd = await rawRequest("POST", `${BASE}/api/servers/${serverId}/command`, {
      cookie,
      body: { command: "console.log('command works')" },
    });
    ok("send command", cmd.status === 200);
    await sleep(800);
    const console2 = await rawRequest("GET", `${BASE}/api/servers/${serverId}/console`, { cookie });
    ok("command echoed", (console2.data.console || "").includes("command works"), console2.data.console);

    const stop = await rawRequest("POST", `${BASE}/api/servers/${serverId}/stop`, { cookie });
    ok("stop server", stop.status === 200);
    await sleep(1200);
    const stats2 = await rawRequest("GET", `${BASE}/api/servers/${serverId}/stats`, { cookie });
    ok("server stopped", stats2.data.status === "offline", JSON.stringify(stats2.data));

    const status = await rawRequest("GET", `${BASE}/api/status`);
    ok("public status", status.status === 200 && status.data.servers.length === 1);
    ok("status summary", status.data.summary.total === 1);

    const settings = await rawRequest("PATCH", `${BASE}/api/settings`, {
      cookie,
      body: { panelName: "MyPanel", accent: "#ff0000", announcements: ["Hello"] },
    });
    ok("update settings", settings.status === 200 && settings.data.settings.panelName === "MyPanel");

    const config = await rawRequest("GET", `${BASE}/api/config`);
    ok("public config reflects branding", config.data.settings.panelName === "MyPanel");

    const tunnelInfo = await rawRequest("GET", `${BASE}/api/tunnel`, { cookie });
    ok("tunnel info", tunnelInfo.status === 200 && tunnelInfo.data.status === "stopped");

    const userCreate = await rawRequest("POST", `${BASE}/api/admin/users`, {
      cookie,
      body: { username: "player1", password: "playerpass", role: "user" },
    });
    ok("create user", userCreate.status === 201);

    const userLogin = await rawRequest("POST", `${BASE}/api/auth/login`, {
      body: { username: "player1", password: "playerpass" },
    });
    ok("user login", userLogin.status === 200);
    const userCookie = (userLogin.headers["set-cookie"] || [])[0]?.split(";")[0];

    const userServers = await rawRequest("GET", `${BASE}/api/servers`, { cookie: userCookie });
    ok("user sees no foreign servers", userServers.data.servers.length === 0);

    const userAdmin = await rawRequest("GET", `${BASE}/api/admin/users`, { cookie: userCookie });
    ok("user blocked from admin", userAdmin.status === 403);

    const del = await rawRequest("DELETE", `${BASE}/api/servers/${serverId}`, { cookie });
    ok("delete server", del.status === 200);

    const after = await rawRequest("GET", `${BASE}/api/servers`, { cookie });
    ok("server removed", after.data.servers.length === 0);

    const badPath = await rawRequest("GET", `${BASE}/api/servers/${serverId}/files?path=../../`, { cookie });
    ok("deleted server inaccessible", badPath.status === 404);

    const regClosed = await rawRequest("POST", `${BASE}/api/auth/register`, {
      body: { username: "newsignup", password: "secret123" },
    });
    ok("registration closed by default", regClosed.status === 403);

    await rawRequest("PATCH", `${BASE}/api/settings`, { cookie, body: { registrationOpen: true } });
    const reg = await rawRequest("POST", `${BASE}/api/auth/register`, {
      body: { username: "newsignup", password: "secret123" },
    });
    ok("registration works when enabled", reg.status === 201 && reg.data.user.role === "user");

    const server2 = await rawRequest("POST", `${BASE}/api/servers`, {
      cookie,
      body: { name: "Access Test", eggId: "generic-node", nodeId, variables: { ENTRY: "x.js" } },
    });
    const s2id = server2.data.server.id;
    const regId = reg.data.user.id;
    const assign = await rawRequest("PATCH", `${BASE}/api/admin/users/${regId}`, {
      cookie,
      body: { serverIds: [s2id] },
    });
    ok("assign server access", assign.status === 200 && assign.data.user.serverIds.includes(s2id));

    const regLogin = await rawRequest("POST", `${BASE}/api/auth/login`, {
      body: { username: "newsignup", password: "secret123" },
    });
    const regCookie = (regLogin.headers["set-cookie"] || [])[0]?.split(";")[0];
    const regServers = await rawRequest("GET", `${BASE}/api/servers`, { cookie: regCookie });
    ok("assigned user sees their server", regServers.data.servers.some((s) => s.id === s2id));

    const regOther = await rawRequest("GET", `${BASE}/api/servers/${serverId}`, { cookie: regCookie });
    ok("assigned user blocked from other servers", regOther.status === 404 || regOther.status === 403);

    const exec = await rawRequest("POST", `${BASE}/api/servers/${s2id}/install`, { cookie });
    ok("install script executes", exec.status === 200 && exec.data.command.includes("npm"));
    await sleep(800);
    const execLog = await rawRequest("GET", `${BASE}/api/servers/${s2id}/console`, { cookie });
    ok("install output in console", (execLog.data.console || "").includes("one-off task"), execLog.data.console);

    const upload = await rawRequest("POST", `${BASE}/api/servers/${s2id}/files/upload?path=uploaded.txt`, {
      cookie,
      headers: { "content-type": "application/octet-stream" },
      body: "uploaded-content",
    });
    ok("upload file", upload.status === 200);
    const uploaded = await rawRequest("GET", `${BASE}/api/servers/${s2id}/files/read?path=uploaded.txt`, { cookie });
    ok("uploaded content readable", uploaded.data.content === "uploaded-content");

    const mkdir = await rawRequest("POST", `${BASE}/api/servers/${s2id}/files/mkdir`, { cookie, body: { path: "plugins/sub" } });
    ok("create directory", mkdir.status === 200);
    const renamed = await rawRequest("POST", `${BASE}/api/servers/${s2id}/files/rename`, {
      cookie,
      body: { from: "uploaded.txt", to: "renamed.txt" },
    });
    ok("rename file", renamed.status === 200);

    const audit = await rawRequest("GET", `${BASE}/api/admin/audit`, { cookie });
    ok("audit log populated", audit.status === 200 && audit.data.entries.length > 3);

    const statusDisabled = await rawRequest("PATCH", `${BASE}/api/settings`, { cookie, body: { publicStatus: false } });
    ok("disable public status", statusDisabled.status === 200);
    const statusBlocked = await rawRequest("GET", `${BASE}/api/status`);
    ok("status blocked when disabled", statusBlocked.status === 403);
  } catch (err) {
    failures++;
    console.log(`  FAIL unexpected: ${err.message}`);
    console.log(err.stack);
  } finally {
    cleanup();
    await sleep(300);
    if (failures) {
      console.log("\n--- panel output ---\n" + panelOut.slice(-3000));
      console.log("\n--- daemon output ---\n" + daemonOut.slice(-3000));
    }
    console.log(`\n${failures === 0 ? "ALL TESTS PASSED" : `${failures} TEST(S) FAILED`}`);
    process.exit(failures === 0 ? 0 : 1);
  }
}

main();
