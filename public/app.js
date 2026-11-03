"use strict";

const state = {
  user: null,
  settings: null,
  eggs: [],
  nodes: [],
  servers: [],
  currentServer: null,
  consoleStream: null,
  view: "overview",
  serverTab: "console",
  filePath: "",
};

const ICONS = {
  overview: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg>',
  servers: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><circle cx="7" cy="7.5" r="1"/><circle cx="7" cy="16.5" r="1"/></svg>',
  nodes: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M12 3v6M12 15v6M3 12h6M15 12h6"/></svg>',
  eggs: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3c3.5 0 6 4.5 6 9a6 6 0 0 1-12 0c0-4.5 2.5-9 6-9z"/></svg>',
  status: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 12h4l3-7 4 14 3-7h4"/></svg>',
  tunnel: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 15a8 8 0 0 1 16 0"/><path d="M7 18a5 5 0 0 1 10 0"/><circle cx="12" cy="20" r="1"/></svg>',
  settings: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9v.05a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/></svg>',
  users: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14c2.3.8 4 3 4 6"/></svg>',
  logout: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/></svg>',
  play: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M7 4l13 8-13 8z"/></svg>',
  stop: '<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="5" y="5" width="14" height="14" rx="2"/></svg>',
  restart: '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>',
  trash: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>',
  folder: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>',
  file: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/></svg>',
};

const EGG_ICONS = {
  discord: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M20.3 4.4A19 19 0 0 0 15.6 3l-.2.4a17 17 0 0 0-6.8 0L8.4 3a19 19 0 0 0-4.7 1.4C1.3 8.1.7 11.7 1 15.3a19 19 0 0 0 5.8 2.9l.7-1.2c-.7-.3-1.4-.6-2-1l.5-.4a13.6 13.6 0 0 0 12 0l.5.4c-.6.4-1.3.7-2 1l.7 1.2a19 19 0 0 0 5.8-2.9c.4-4.2-.6-7.8-2.7-10.9zM8.7 13.3c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.7.8 1.6 1.8c0 1-.7 1.8-1.6 1.8zm6.6 0c-.9 0-1.6-.8-1.6-1.8s.7-1.8 1.6-1.8 1.7.8 1.6 1.8c0 1-.7 1.8-1.6 1.8z"/></svg>',
  minecraft: '<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor"><path d="M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z"/></svg>',
  node: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 2l8 4.5v11L12 22l-8-4.5v-11z"/><path d="M12 22V11l8-4.5M12 11L4 6.5"/></svg>',
  python: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3c-3 0-4 1.4-4 3v2h5v1H6c-2 0-3 1.3-3 3s1 3 3 3h1v-2c0-1.7 1.4-3 3-3h4c1.7 0 3-1.3 3-3V6c0-1.6-1-3-4-3h-1z"/><path d="M12 21c3 0 4-1.4 4-3v-2h-5v-1h7c2 0 3-1.3 3-3s-1-3-3-3h-1v2c0 1.7-1.4 3-3 3h-4c-1.7 0-3 1.3-3 3v3c0 1.6 1 3 4 3h1z"/></svg>',
  app: '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M7 6.5h.01M10 6.5h.01"/></svg>',
};

function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function fmtBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 ? 1 : 0)} ${units[i]}`;
}

function fmtUptime(seconds) {
  const s = Math.max(0, Math.floor(Number(seconds) || 0));
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function timeAgo(iso) {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

async function api(path, options = {}) {
  const res = await fetch(`/api${path}`, {
    credentials: "same-origin",
    headers: options.body && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)
      ? { "content-type": "application/json" }
      : undefined,
    ...options,
    body: options.body && typeof options.body === "object" && !(options.body instanceof Blob) && !(options.body instanceof ArrayBuffer)
      ? JSON.stringify(options.body)
      : options.body,
  });
  const isJson = (res.headers.get("content-type") || "").includes("application/json");
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

function toast(message, kind = "") {
  const root = document.getElementById("toast-root");
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = message;
  root.appendChild(el);
  setTimeout(() => {
    el.style.opacity = "0";
    el.style.transition = "opacity 0.3s";
    setTimeout(() => el.remove(), 320);
  }, 3600);
}

function applyTheme(settings) {
  document.documentElement.dataset.theme = settings.theme === "light" ? "light" : "dark";
  if (settings.accent) document.documentElement.style.setProperty("--accent", settings.accent);
  if (settings.accent2) document.documentElement.style.setProperty("--accent2", settings.accent2);
  document.title = settings.panelName || "TerryPanel";
}

const app = document.getElementById("app");

function badge(status) {
  const label = String(status || "unknown");
  return `<span class="badge ${esc(label)}">${esc(label.replace(/-/g, " "))}</span>`;
}

/* ---------------- Login ---------------- */
function renderLogin() {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="login-form">
        <div class="login-brand">
          <div class="brand-logo">T</div>
          <div>
            <div class="login-title">${esc((state.settings && state.settings.panelName) || "TerryPanel")}</div>
            <div class="login-sub">${esc((state.settings && state.settings.tagline) || "Sign in to manage your servers")}</div>
          </div>
        </div>
        <div class="field">
          <label>Username</label>
          <input class="input" name="username" autocomplete="username" autofocus required />
        </div>
        <div class="field">
          <label>Password</label>
          <input class="input" name="password" type="password" autocomplete="current-password" required />
        </div>
        <button class="btn btn-primary" style="width:100%;padding:12px" type="submit">Sign in</button>
        ${state.settings && state.settings.registrationOpen && state.settings.hostingMode === "public" ? `<div class="hint" style="text-align:center;margin-top:16px">No account? <a href="#" id="show-register">Create one</a></div>` : `<div class="hint" style="text-align:center;margin-top:16px">Private panel - owner sign in</div>`}
      </form>
    </div>`;
  const form = document.getElementById("login-form");
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(form);
    try {
      await api("/auth/login", { method: "POST", body: { username: data.get("username"), password: data.get("password") } });
      await boot();
    } catch (err) {
      toast(err.message, "error");
    }
  });
  const reg = document.getElementById("show-register");
  if (reg) reg.addEventListener("click", (e) => { e.preventDefault(); renderRegister(); });
}

function renderRegister() {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="register-form">
        <div class="login-brand">
          <div class="brand-logo">T</div>
          <div>
            <div class="login-title">${esc((state.settings && state.settings.panelName) || "TerryPanel")}</div>
            <div class="login-sub">Create your account</div>
          </div>
        </div>
        <div class="field"><label>Username</label><input class="input" name="username" pattern="[A-Za-z0-9_.-]{3,32}" autocomplete="username" required /></div>
        <div class="field"><label>Password</label><input class="input" name="password" type="password" minlength="6" autocomplete="new-password" required /></div>
        <button class="btn btn-primary" style="width:100%;padding:12px" type="submit">Create account</button>
        <div class="hint" style="text-align:center;margin-top:16px"><a href="#" id="show-login">Back to sign in</a></div>
      </form>
    </div>`;
  document.getElementById("show-login").addEventListener("click", (e) => { e.preventDefault(); renderLogin(); });
  document.getElementById("register-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      await api("/auth/register", { method: "POST", body: { username: data.get("username"), password: data.get("password") } });
      await boot();
    } catch (err) { toast(err.message, "error"); }
  });
}

/* ---------------- Setup wizard ---------------- */
function renderSetup() {
  app.innerHTML = `
    <div class="login-wrap">
      <form class="login-card" id="setup-form">
        <div class="login-brand">
          <div class="brand-logo">T</div>
          <div>
            <div class="login-title">Welcome to TerryPanel</div>
            <div class="login-sub">Create the owner account for your hosting panel</div>
          </div>
        </div>
        <div class="field"><label>Panel name</label><input class="input" name="panelName" value="${esc((state.settings && state.settings.panelName) || "TerryPanel")}" /></div>
        <div class="field"><label>Owner username</label><input class="input" name="username" value="admin" autocomplete="username" required /></div>
        <div class="field"><label>Owner password</label><input class="input" name="password" type="password" minlength="6" autocomplete="new-password" required />
          <div class="hint">At least 6 characters. Change it any time in Settings.</div></div>
        <button class="btn btn-primary" style="width:100%;padding:12px" type="submit">Create owner account</button>
        <div class="hint" style="text-align:center;margin-top:16px">Next you can connect Cloudflare with a single tunnel token.</div>
      </form>
    </div>`;
  document.getElementById("setup-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    try {
      await api("/setup/admin", {
        method: "POST",
        body: {
          username: data.get("username"),
          password: data.get("password"),
          panelName: data.get("panelName"),
        },
      });
      await boot();
    } catch (err) {
      toast(err.message, "error");
    }
  });
}

async function renderWizard() {
  const view = document.getElementById("view");
  if (!view) return;
  view.innerHTML = pageHead("Quick setup", "Two steps to get your hosting panel online") + `
    <div class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">1. Expose the panel with Cloudflare</div>
        <p class="small muted">Create a tunnel in Cloudflare Zero Trust and paste only its token. TerryPanel downloads cloudflared, starts it, and keeps it running.</p>
        <div class="field"><label>Cloudflare tunnel token</label>
          <input class="input mono" id="wiz-token" placeholder="eyJhIjoi..." />
          <div class="hint">Optional. You can also skip and use a reverse proxy or a quick tunnel.</div>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-primary" id="wiz-connect">Connect tunnel</button>
          <button class="btn btn-ghost" id="wiz-quick">Temporary quick tunnel</button>
        </div>
        <div id="wiz-status" class="mt-16"></div>
        <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-ghost" id="wiz-skip">Skip for now</button></div>
      </div>
      <div class="card">
        <div class="card-title">2. Add a node</div>
        <p class="small muted">Nodes are the VPS machines that run your servers. Any KVM, LXC, OpenVZ, or ARM box works because the daemon only needs Node.js.</p>
        <div class="field"><label>Enrollment command</label>
          <div class="job-log" id="wiz-enroll" style="height:150px">Loading...</div>
        </div>
        <button class="btn" id="wiz-refresh">Refresh command</button>
        <button class="btn btn-primary" id="wiz-nodes">Open Nodes</button>
        <div class="hint mt-16">Paste the command on your VPS. It installs the daemon and registers itself with this panel.</div>
      </div>
    </div>`;

  async function loadEnroll() {
    const el = document.getElementById("wiz-enroll");
    if (!el) return;
    try {
      const data = await api("/nodes/enrollment-key");
      el.textContent = data.command;
    } catch (err) {
      el.textContent = err.message;
    }
  }
  loadEnroll();

  document.getElementById("wiz-refresh").addEventListener("click", loadEnroll);
  document.getElementById("wiz-nodes").addEventListener("click", () => navigate("nodes"));
  document.getElementById("wiz-skip").addEventListener("click", async () => {
    await api("/setup/complete", { method: "POST" }).catch(() => {});
    state.settings.setupComplete = true;
    navigate("overview");
  });

  const connect = async (token) => {
    const status = document.getElementById("wiz-status");
    try {
      status.innerHTML = `<span class="badge starting">starting</span>`;
      const res = await api("/setup/tunnel", { method: "POST", body: token ? { token } : {} });
      const url = (res.tunnel && res.tunnel.publicUrl) || "starting";
      status.innerHTML = `<div class="hint">Tunnel: <span class="mono">${esc(url)}</span></div>`;
      toast("Tunnel starting", "ok");
    } catch (err) {
      status.innerHTML = `<div class="hint" style="color:var(--danger)">${esc(err.message)}</div>`;
    }
  };
  document.getElementById("wiz-connect").addEventListener("click", () => {
    const token = document.getElementById("wiz-token").value.trim();
    if (!token) return toast("Paste a tunnel token first", "error");
    connect(token);
  });
  document.getElementById("wiz-quick").addEventListener("click", () => connect(""));
}

/* ---------------- Shell ---------------- */
function navItem(view, label, iconKey, adminOnly) {
  if (adminOnly && state.user.role !== "admin") return "";
  return `<button class="nav-item ${state.view === view ? "active" : ""}" data-view="${view}">
    <span class="ico">${ICONS[iconKey]}</span> ${label}
  </button>`;
}

function renderShell() {
  const s = state.settings;
  const logo = s.logoUrl
    ? `<img src="${esc(s.logoUrl)}" alt="logo" />`
    : (s.panelName || "T").charAt(0).toUpperCase();
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand">
          <div class="brand-logo">${logo}</div>
          <div>
            <div class="brand-name">${esc(s.panelName)}</div>
            <div class="brand-tag">${esc(s.tagline || "VPS hosting panel")}</div>
          </div>
        </div>
        <div class="nav-label">Panel</div>
        ${navItem("overview", "Overview", "overview")}
        ${navItem("servers", "Servers", "servers")}
        ${navItem("eggs", "Eggs", "eggs")}
        ${navItem("status", "Status", "status")}
        <div class="nav-label">Admin</div>
        ${navItem("nodes", "Nodes", "nodes", true)}
        ${navItem("tunnel", "Cloudflare Tunnel", "tunnel", true)}
        ${navItem("users", "Users", "users", true)}
        ${navItem("settings", "Settings", "settings", true)}
        <div class="sidebar-footer">
          <div class="userchip">
            <div class="avatar">${esc(state.user.username.charAt(0).toUpperCase())}</div>
            <div class="grow">
              <div style="font-size:13px;font-weight:600">${esc(state.user.username)}</div>
              <div class="small muted">${esc(state.user.role)}</div>
            </div>
            <button class="btn btn-icon btn-ghost" id="logout" title="Sign out">${ICONS.logout}</button>
          </div>
        </div>
      </aside>
      <main class="main" id="view"></main>
    </div>`;

  app.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => navigate(btn.dataset.view));
  });
  document.getElementById("logout").addEventListener("click", async () => {
    await api("/auth/logout", { method: "POST" });
    state.user = null;
    renderLogin();
  });
}

function navigate(view, params = {}) {
  state.view = view;
  Object.assign(state, params);
  if (state.consoleStream) {
    state.consoleStream.close();
    state.consoleStream = null;
  }
  app.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  const viewEl = document.getElementById("view");
  if (!viewEl) return renderShell();
  if (view === "overview") renderOverview();
  else if (view === "servers") renderServers();
  else if (view === "server") renderServer();
  else if (view === "create") renderCreateServer();
  else if (view === "eggs") renderEggs();
  else if (view === "nodes") renderNodes();
  else if (view === "tunnel") renderTunnel();
  else if (view === "users") renderUsers();
  else if (view === "settings") renderSettings();
  else if (view === "status") renderStatus();
}

function pageHead(title, sub, actions = "") {
  return `<div class="topbar">
    <div><h1 class="page-title">${esc(title)}</h1>${sub ? `<div class="page-sub">${esc(sub)}</div>` : ""}</div>
    <div class="topbar-actions">${actions}</div>
  </div>`;
}

/* ---------------- Overview ---------------- */
async function renderOverview() {
  const view = document.getElementById("view");
  view.innerHTML = pageHead("Overview", "Your hosting infrastructure at a glance");
  try {
    const { servers } = await api("/servers");
    state.servers = servers;
    const nodes = state.user.role === "admin" ? (await api("/nodes")).nodes : [];
    state.nodes = nodes;
    let online = 0;
    let system = null;
    if (nodes.length) {
      try { system = await api(`/nodes/${nodes[0].id}/system`).catch(() => null); } catch {}
    }
    const running = servers.filter((s) => s.status === "running").length;
    online = nodes.filter((n) => n.lastStatus === "online").length;
    const announcements = (state.settings.announcements || []).filter(Boolean);

    view.innerHTML = pageHead("Overview", "Your hosting infrastructure at a glance", `
      <button class="btn btn-primary" id="new-server">Create server</button>`) + `
      ${announcements.length ? announcements.map((a) => `<div class="card mb-16" style="border-left:3px solid var(--accent)">${esc(a)}</div>`).join("") : ""}
      <div class="grid grid-cols-4 mb-16">
        <div class="card stat-card"><div class="stat-icon">${ICONS.servers}</div><div class="stat-value">${servers.length}</div><div class="stat-sub">Total servers</div></div>
        <div class="card stat-card"><div class="stat-icon" style="color:var(--ok)">${ICONS.play}</div><div class="stat-value">${running}</div><div class="stat-sub">Running</div></div>
        <div class="card stat-card"><div class="stat-icon" style="color:var(--accent-2)">${ICONS.nodes}</div><div class="stat-value">${state.user.role === "admin" ? `${online}/${nodes.length}` : nodes.length}</div><div class="stat-sub">Nodes online</div></div>
        <div class="card stat-card"><div class="stat-icon" style="color:var(--warn)">${ICONS.status}</div><div class="stat-value">${servers.length - running}</div><div class="stat-sub">Stopped</div></div>
      </div>
      ${system ? `
      <div class="grid grid-cols-3 mb-16">
        <div class="card">
          <div class="card-title">CPU</div>
          <div class="stat-value">${Number(system.cpu.percent).toFixed(1)}%</div>
          <div class="meter mt-8"><span style="width:${Math.min(100, system.cpu.percent)}%"></span></div>
          <div class="stat-sub mt-8">${esc(system.cpu.model)} - ${system.cpu.cores} cores</div>
        </div>
        <div class="card">
          <div class="card-title">Memory</div>
          <div class="stat-value">${fmtBytes(system.memory.used)}</div>
          <div class="meter mt-8"><span style="width:${Math.min(100, system.memory.percent)}%"></span></div>
          <div class="stat-sub mt-8">of ${fmtBytes(system.memory.total)}</div>
        </div>
        <div class="card">
          <div class="card-title">Disk</div>
          <div class="stat-value">${system.disk ? fmtBytes(system.disk.used) : "n/a"}</div>
          <div class="meter mt-8"><span style="width:${system.disk ? Math.min(100, system.disk.percent) : 0}%"></span></div>
          <div class="stat-sub mt-8">${system.disk ? `of ${fmtBytes(system.disk.total)}` : "Not available"}</div>
        </div>
      </div>` : ""}
      <div class="card">
        <div class="flex-between mb-16"><div class="card-title mb-0">Recent servers</div><button class="btn btn-sm btn-ghost" id="view-all">View all</button></div>
        ${servers.length ? `<table class="table"><thead><tr><th>Name</th><th>Egg</th><th>Node</th><th>Status</th><th></th></tr></thead><tbody>
          ${servers.slice(0, 6).map((s) => `<tr>
            <td><strong>${esc(s.name)}</strong></td>
            <td class="muted">${esc(s.eggName || s.eggId)}</td>
            <td class="muted">${esc(s.nodeName)}</td>
            <td>${badge(s.status)}</td>
            <td style="text-align:right"><button class="btn btn-sm" data-open="${s.id}">Manage</button></td>
          </tr>`).join("")}
        </tbody></table>` : `<div class="empty"><div class="empty-icon">${ICONS.servers}</div><h3>No servers yet</h3><div>Add a node, then create your first server from an egg.</div></div>`}
      </div>`;

    view.querySelector("#new-server").addEventListener("click", () => navigate("create"));
    const viewAll = view.querySelector("#view-all");
    if (viewAll) viewAll.addEventListener("click", () => navigate("servers"));
    view.querySelectorAll("[data-open]").forEach((b) =>
      b.addEventListener("click", () => navigate("server", { currentServer: b.dataset.open, serverTab: "console" }))
    );
  } catch (err) {
    view.innerHTML += `<div class="card">${esc(err.message)}</div>`;
  }
}

/* ---------------- Servers list ---------------- */
function serverCard(server) {
  return `<div class="card server-card">
    <div class="server-head">
      <div>
        <div class="server-name">${esc(server.name)}</div>
        <div class="server-meta">${esc(server.eggName || server.eggId)} &middot; ${esc(server.nodeName)}</div>
      </div>
      ${badge(server.status)}
    </div>
    <div class="server-actions">
      <button class="btn btn-sm" data-open="${server.id}">Console</button>
      ${server.status === "running"
        ? `<button class="btn btn-sm btn-danger" data-act="stop" data-id="${server.id}">Stop</button>
           <button class="btn btn-sm" data-act="restart" data-id="${server.id}">Restart</button>`
        : `<button class="btn btn-sm btn-ok" data-act="start" data-id="${server.id}">Start</button>`}
    </div>
  </div>`;
}

async function renderServers() {
  const view = document.getElementById("view");
  view.innerHTML = pageHead("Servers", "Manage your hosted applications", `<button class="btn btn-primary" id="new-server">Create server</button><div id="servers-list"></div>`);
  view.querySelector("#new-server").addEventListener("click", () => navigate("create"));
  const list = document.getElementById("servers-list");
  list.className = "grid grid-cols-3 mt-16";
  try {
    const { servers } = await api("/servers");
    state.servers = servers;
    list.innerHTML = servers.length
      ? servers.map(serverCard).join("")
      : `<div class="card" style="grid-column:1/-1"><div class="empty"><div class="empty-icon">${ICONS.servers}</div><h3>No servers yet</h3><div>Create your first server from an egg.</div></div></div>`;
    list.querySelectorAll("[data-open]").forEach((b) =>
      b.addEventListener("click", () => navigate("server", { currentServer: b.dataset.open, serverTab: "console" }))
    );
    list.querySelectorAll("[data-act]").forEach((b) =>
      b.addEventListener("click", async () => {
        const id = b.dataset.id;
        try {
          await api(`/servers/${id}/${b.dataset.act}`, { method: "POST" });
          toast(`Server ${b.dataset.act} requested`, "ok");
          setTimeout(renderServers, 900);
        } catch (err) { toast(err.message, "error"); }
      })
    );
  } catch (err) {
    list.innerHTML = `<div class="card">${esc(err.message)}</div>`;
  }
}

/* ---------------- Create server ---------------- */
async function renderCreateServer() {
  const view = document.getElementById("view");
  view.innerHTML = pageHead("Create server", "Pick an egg, choose a node, and deploy");
  let eggs = state.eggs;
  if (!eggs.length) eggs = (await api("/eggs")).eggs;
  state.eggs = eggs;
  let nodes = [];
  try { nodes = (await api(state.user.role === "admin" ? "/nodes" : "/nodes/available")).nodes; } catch {}
  state.nodes = nodes;
  const defaultEgg = state.settings.defaultEgg || (eggs[0] && eggs[0].id);

  view.innerHTML += `
    <div class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">1. Choose an egg</div>
        <div class="egg-grid" id="egg-grid">
          ${eggs.map((egg) => `<div class="egg-card ${egg.id === defaultEgg ? "selected" : ""}" data-egg="${egg.id}">
            <div class="egg-icon">${EGG_ICONS[egg.icon] || EGG_ICONS.app}</div>
            <div class="egg-name">${esc(egg.name)}</div>
            <div class="egg-desc">${esc(egg.description || "")}</div>
          </div>`).join("")}
        </div>
      </div>
      <div class="card">
        <div class="card-title">2. Configure</div>
        <form id="create-form">
          <div class="field"><label>Server name</label><input class="input" name="name" placeholder="my-app" required /></div>
          <div class="field"><label>Node</label>
            <select class="select" name="nodeId" required>
              ${nodes.length ? nodes.map((n) => `<option value="${n.id}">${esc(n.name)} (${esc(n.host)})</option>`).join("") : `<option value="">No nodes yet - add one first</option>`}
            </select>
            ${nodes.length ? "" : `<div class="hint">Go to Nodes and add one via SSH install.</div>`}
          </div>
          <div class="field"><label>Domain (optional)</label><input class="input" name="domain" placeholder="app.example.com" />
            <div class="hint">Shown on the public status page and checked for online/offline.</div></div>
          <div class="hint mb-16" style="padding:10px 12px;border:1px dashed var(--border);border-radius:10px">
            Secrets such as bot tokens are not asked here. After the server is created add them under
            <strong>Startup &amp; Env</strong> - only the panel owner can read them, just like Pterodactyl.
          </div>
          <div id="variables"></div>
          <label class="switch mt-16"><input type="checkbox" name="autoRestart" /><span class="track"></span> Auto-restart on crash</label>
          <div class="modal-actions" style="justify-content:flex-start;margin-top:22px">
            <button class="btn btn-primary" type="submit">Create server</button>
            <button class="btn btn-ghost" type="button" id="cancel">Cancel</button>
          </div>
        </form>
      </div>
    </div>`;

  const eggGrid = document.getElementById("egg-grid");
  const variables = document.getElementById("variables");
  function selectEgg(id) {
    eggGrid.querySelectorAll(".egg-card").forEach((c) => c.classList.toggle("selected", c.dataset.egg === id));
    const egg = eggs.find((e) => e.id === id);
    const publicVars = (egg.variables || []).filter((v) => !v.secret);
    variables.innerHTML = publicVars.map((v) => `
      <div class="field">
        <label>${esc(v.label || v.key)}${v.required ? " *" : ""}</label>
        <input class="input" name="var_${esc(v.key)}" type="text" value="${esc(v.default ?? "")}" ${v.required ? "required" : ""} />
        <div class="hint">Environment variable: ${esc(v.key)}</div>
      </div>`).join("");
    state.selectedEgg = id;
  }
  eggGrid.querySelectorAll(".egg-card").forEach((c) => c.addEventListener("click", () => selectEgg(c.dataset.egg)));
  selectEgg(defaultEgg);
  document.getElementById("cancel").addEventListener("click", () => navigate("servers"));

  document.getElementById("create-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const data = new FormData(form);
    const egg = eggs.find((x) => x.id === state.selectedEgg);
    const vars = {};
    for (const v of egg.variables || []) vars[v.key] = data.get(`var_${v.key}`);
    const body = {
      name: data.get("name"),
      eggId: state.selectedEgg,
      nodeId: data.get("nodeId"),
      domain: data.get("domain") || "",
      variables: vars,
      autoRestart: data.get("autoRestart") === "on",
    };
    try {
      const { server } = await api("/servers", { method: "POST", body });
      toast("Server created. Running install script...", "ok");
      if (egg.installScript) {
        await api(`/servers/${server.id}/install`, { method: "POST" }).catch(() => {});
      }
      navigate("server", { currentServer: server.id, serverTab: "console" });
    } catch (err) { toast(err.message, "error"); }
  });
}

/* ---------------- Server detail ---------------- */
async function renderServer() {
  const view = document.getElementById("view");
  const id = state.currentServer;
  if (!id) return navigate("servers");
  view.innerHTML = `<div class="empty">Loading server...</div>`;
  let data;
  try { data = await api(`/servers/${id}`); } catch (err) {
    view.innerHTML = pageHead("Server", "") + `<div class="card">${esc(err.message)}</div>`;
    return;
  }
  const server = data.server;
  const live = data.live || {};
  const status = live.status || server.status || "offline";
  view.innerHTML = pageHead(server.name, `${server.eggName || server.eggId} on ${state.nodes.find((n) => n.id === server.nodeId)?.name || "node"}`, `
    <button class="btn btn-sm" id="s-start" ${status === "running" ? "disabled" : ""}>${ICONS.play} Start</button>
    <button class="btn btn-sm" id="s-restart">${ICONS.restart} Restart</button>
    <button class="btn btn-sm btn-danger" id="s-stop">${ICONS.stop} Stop</button>
    <button class="btn btn-sm btn-danger" id="s-delete">${ICONS.trash} Delete</button>`) + `
    <div class="tabs">
      <button class="tab ${state.serverTab === "console" ? "active" : ""}" data-tab="console">Console</button>
      <button class="tab ${state.serverTab === "files" ? "active" : ""}" data-tab="files">Files</button>
      <button class="tab ${state.serverTab === "settings" ? "active" : ""}" data-tab="settings">Startup & Env</button>
      <button class="tab ${state.serverTab === "info" ? "active" : ""}" data-tab="info">Info</button>
    </div>
    <div id="server-panel"></div>`;

  view.querySelectorAll("[data-tab]").forEach((t) =>
    t.addEventListener("click", () => { state.serverTab = t.dataset.tab; renderServer(); })
  );
  const act = async (action) => {
    try {
      await api(`/servers/${id}/${action}`, { method: "POST" });
      toast(`Server ${action} requested`, "ok");
      setTimeout(renderServer, 800);
    } catch (err) { toast(err.message, "error"); }
  };
  view.querySelector("#s-start").addEventListener("click", () => act("start"));
  view.querySelector("#s-stop").addEventListener("click", () => act("stop"));
  view.querySelector("#s-restart").addEventListener("click", () => act("restart"));
  view.querySelector("#s-delete").addEventListener("click", async () => {
    if (!confirm(`Delete "${server.name}" and all its files? This cannot be undone.`)) return;
    try {
      await api(`/servers/${id}`, { method: "DELETE" });
      toast("Server deleted", "ok");
      navigate("servers");
    } catch (err) { toast(err.message, "error"); }
  });

  const panel = document.getElementById("server-panel");
  if (state.serverTab === "console") renderConsolePanel(panel, server, status);
  else if (state.serverTab === "files") renderFilesPanel(panel, server);
  else if (state.serverTab === "settings") renderServerSettings(panel, server);
  else renderServerInfo(panel, server, live, data.stats);
}

function renderConsolePanel(panel, server, status) {
  panel.innerHTML = `
    <div class="split">
      <div class="card">
        <div class="flex-between mb-16">
          <div class="card-title mb-0">Live console</div>
          <div class="flex gap-8">${badge(status)}<button class="btn btn-sm btn-ghost" id="clear-console">Clear view</button></div>
        </div>
        <div class="console" id="console"></div>
        <div class="console-input-row">
          <input class="input" id="cmd" placeholder="Type a command and press Enter (e.g. stop, say hello)" />
          <button class="btn btn-primary" id="send">Send</button>
        </div>
      </div>
      <div class="card">
        <div class="card-title">Resources</div>
        <div id="stats-block" class="grid" style="gap:14px">
          <div><div class="small muted">CPU</div><div class="stat-value" id="st-cpu">0%</div></div>
          <div><div class="small muted">Memory</div><div class="stat-value" id="st-mem">0 MB</div></div>
          <div><div class="small muted">Uptime</div><div class="stat-value" id="st-up">0m</div></div>
        </div>
        <button class="btn btn-primary mt-16" id="install" style="width:100%">Re-run install script</button>
        <div class="hint">Install script runs inside the console on this server.</div>
      </div>
    </div>`;

  const consoleEl = document.getElementById("console");
  let lastLen = 0;
  const paintConsole = async () => {
    try {
      const d = await api(`/servers/${server.id}/console?lines=300`);
      const text = d.console || "";
      if (text.length !== lastLen) {
        const atBottom = consoleEl.scrollTop + consoleEl.clientHeight >= consoleEl.scrollHeight - 40;
        consoleEl.textContent = text;
        lastLen = text.length;
        if (atBottom) consoleEl.scrollTop = consoleEl.scrollHeight;
      }
    } catch {}
  };
  paintConsole();
  const consoleTimer = setInterval(() => {
    if (!document.getElementById("console")) return clearInterval(consoleTimer);
    paintConsole();
  }, 2000);

  const send = async () => {
    const input = document.getElementById("cmd");
    const value = input.value.trim();
    if (!value) return;
    input.value = "";
    try { await api(`/servers/${server.id}/command`, { method: "POST", body: { command: value } }); }
    catch (err) { toast(err.message, "error"); }
  };
  document.getElementById("send").addEventListener("click", send);
  document.getElementById("cmd").addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
  document.getElementById("clear-console").addEventListener("click", () => (consoleEl.textContent = ""));
  document.getElementById("install").addEventListener("click", async () => {
    try { await api(`/servers/${server.id}/install`, { method: "POST" }); toast("Install script sent", "ok"); }
    catch (err) { toast(err.message, "error"); }
  });

  const pollStats = async () => {
    try {
      const s = await api(`/servers/${server.id}/stats`);
      const cpu = document.getElementById("st-cpu");
      if (!cpu) return;
      cpu.textContent = `${Number(s.cpu || 0).toFixed(1)}%`;
      document.getElementById("st-mem").textContent = fmtBytes(s.memory || 0);
      document.getElementById("st-up").textContent = fmtUptime(s.uptime || 0);
    } catch {}
  };
  pollStats();
  const timer = setInterval(() => {
    if (!document.getElementById("st-cpu")) return clearInterval(timer);
    pollStats();
  }, 4000);
}

async function renderFilesPanel(panel, server) {
  panel.innerHTML = `<div class="card">
    <div class="flex-between mb-16">
      <div class="card-title mb-0">File manager</div>
      <div class="flex gap-8">
        <button class="btn btn-sm" id="f-up">Upload</button>
        <button class="btn btn-sm" id="f-mkdir">New folder</button>
        <button class="btn btn-sm" id="f-refresh">Refresh</button>
      </div>
    </div>
    <div class="crumbs" id="crumbs"></div>
    <div id="file-list" class="small muted">Loading...</div>
    <input type="file" id="f-input" class="hidden" />
  </div>`;

  async function load(dirPath) {
    state.filePath = dirPath;
    const list = document.getElementById("file-list");
    const crumbs = document.getElementById("crumbs");
    crumbs.innerHTML = `<span data-crumb="">root</span>` + dirPath.split("/").filter(Boolean).map((p, i, arr) => {
      const full = arr.slice(0, i + 1).join("/");
      return `<span class="sep">/</span><span data-crumb="${esc(full)}">${esc(p)}</span>`;
    }).join("");
    crumbs.querySelectorAll("[data-crumb]").forEach((c) => c.addEventListener("click", () => load(c.dataset.crumb)));
    try {
      const data = await api(`/servers/${server.id}/files?path=${encodeURIComponent(dirPath)}`);
      const parent = dirPath.split("/").filter(Boolean).slice(0, -1).join("/");
      list.innerHTML = `
        ${dirPath ? `<div class="file-row"><span>${ICONS.folder}</span><span class="fname" data-dir="${esc(parent)}">..</span></div>` : ""}
        ${data.entries.length ? data.entries.map((e) => `
          <div class="file-row">
            <span>${e.type === "dir" ? ICONS.folder : ICONS.file}</span>
            <span class="fname" data-${e.type === "dir" ? "dir" : "file"}="${esc(dirPath ? `${dirPath}/${e.name}` : e.name)}">${esc(e.name)}</span>
            <span class="fsize">${e.type === "dir" ? "folder" : fmtBytes(e.size)}</span>
            <button class="btn btn-sm btn-ghost" data-del="${esc(dirPath ? `${dirPath}/${e.name}` : e.name)}">${ICONS.trash}</button>
          </div>`).join("") : `<div class="empty">Empty folder</div>`}`;
      list.querySelectorAll("[data-dir]").forEach((el) => el.addEventListener("click", () => load(el.dataset.dir)));
      list.querySelectorAll("[data-file]").forEach((el) => el.addEventListener("click", () => openFile(el.dataset.file)));
      list.querySelectorAll("[data-del]").forEach((el) => el.addEventListener("click", async () => {
        if (!confirm(`Delete ${el.dataset.del}?`)) return;
        try { await api(`/servers/${server.id}/files/delete`, { method: "POST", body: { path: el.dataset.del } }); load(dirPath); }
        catch (err) { toast(err.message, "error"); }
      }));
    } catch (err) {
      list.innerHTML = `<div class="empty">${esc(err.message)}</div>`;
    }
  }

  async function openFile(path) {
    try {
      const data = await api(`/servers/${server.id}/files/read?path=${encodeURIComponent(path)}`);
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.innerHTML = `<div class="modal modal-lg">
        <div class="modal-head"><h3 class="mono" style="font-size:14px">${esc(path)}</h3><button class="modal-close">&times;</button></div>
        <textarea class="textarea" style="height:400px" id="editor">${esc(data.content)}</textarea>
        <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="save-file">Save</button></div>
      </div>`;
      document.body.appendChild(backdrop);
      backdrop.querySelector(".modal-close").addEventListener("click", () => backdrop.remove());
      backdrop.querySelector("[data-close]").addEventListener("click", () => backdrop.remove());
      backdrop.querySelector("#save-file").addEventListener("click", async () => {
        try {
          await api(`/servers/${server.id}/files/write`, { method: "POST", body: { path, content: backdrop.querySelector("#editor").value } });
          toast("File saved", "ok");
          backdrop.remove();
        } catch (err) { toast(err.message, "error"); }
      });
    } catch (err) { toast(err.message, "error"); }
  }

  document.getElementById("f-refresh").addEventListener("click", () => load(state.filePath || ""));
  document.getElementById("f-mkdir").addEventListener("click", async () => {
    const name = prompt("Folder name:");
    if (!name) return;
    const target = state.filePath ? `${state.filePath}/${name}` : name;
    try { await api(`/servers/${server.id}/files/mkdir`, { method: "POST", body: { path: target } }); load(state.filePath || ""); }
    catch (err) { toast(err.message, "error"); }
  });
  const input = document.getElementById("f-input");
  document.getElementById("f-up").addEventListener("click", () => input.click());
  input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    const target = state.filePath ? `${state.filePath}/${file.name}` : file.name;
    try {
      const buffer = await file.arrayBuffer();
      await fetch(`/api/servers/${server.id}/files/upload?path=${encodeURIComponent(target)}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/octet-stream" },
        body: buffer,
      }).then(async (res) => { if (!res.ok) throw new Error((await res.json()).error); });
      toast("Uploaded", "ok");
      load(state.filePath || "");
    } catch (err) { toast(err.message, "error"); }
    input.value = "";
  });
  load(state.filePath || "");
}

function renderServerSettings(panel, server) {
  const vars = server.env || {};
  const secretVars = server.secretEnv || {};
  const isAdmin = state.user.role === "admin";
  panel.innerHTML = `<div class="grid grid-cols-2">
    <div class="card">
      <div class="card-title">Startup</div>
      <form id="srv-settings">
        <div class="field"><label>Server name</label><input class="input" name="name" value="${esc(server.name)}" /></div>
        <div class="field"><label>Domain (optional)</label><input class="input" name="domain" value="${esc(server.domain || "")}" placeholder="app.example.com" />
          <div class="hint">Used by the public status page to probe online/offline.</div></div>
        <div class="field"><label>Startup command</label><textarea class="textarea" name="startup">${esc(server.startup || "")}</textarea>
          <div class="hint">This shell command is executed in the server directory.</div></div>
        <div class="field"><label>Environment variables</label>
          ${Object.keys(vars).length ? Object.entries(vars).map(([k, v]) => `
            <div class="input-row" style="margin-bottom:8px"><input class="input" style="max-width:220px" value="${esc(k)}" disabled /><input class="input" name="env_${esc(k)}" value="${esc(v)}" /></div>`).join("") : `<div class="hint">No public variables</div>`}
          <div class="input-row mt-8"><input class="input" id="new-env-key" placeholder="NEW_KEY" /><input class="input" id="new-env-val" placeholder="value" /></div>
        </div>
        <label class="switch mt-16"><input type="checkbox" name="autoRestart" ${server.autoRestart ? "checked" : ""} /><span class="track"></span> Auto-restart on crash</label>
        <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-primary" type="submit">Save changes</button></div>
      </form>
    </div>
    <div class="card">
      <div class="card-title">Secrets ${isAdmin ? "" : `<span class="tag">owner only</span>`}</div>
      <p class="small muted">Tokens and passwords live in a separate secrets file with mode 600. ${isAdmin ? "As owner you can read and edit them." : "Values are hidden. Only the panel owner can read them."}</p>
      <form id="secret-form">
        ${Object.keys(secretVars).length ? Object.entries(secretVars).map(([k, v]) => `
          <div class="field"><label class="mono" style="font-size:12px">${esc(k)}</label>
            <input class="input mono" name="secret_${esc(k)}" type="text" value="${esc(isAdmin ? v : (v ? MASK_PLACEHOLDER : ""))}" ${isAdmin ? "" : "readonly"} placeholder="not set" />
          </div>`).join("") : `<div class="hint">No secret variables for this egg.</div>`}
        ${isAdmin ? `<div class="input-row mt-8"><input class="input" id="new-secret-key" placeholder="NEW_SECRET" /><input class="input" id="new-secret-val" placeholder="value" /></div>
        <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-primary" type="submit">Save secrets</button></div>` : ""}
      </form>
      ${isAdmin ? `
      <div class="card-title mt-24">Resource limits</div>
      <form id="limit-form">
        <div class="input-row mb-16"><div class="grow"><label class="small muted">Memory (MB)</label><input class="input" name="memoryMb" type="number" min="128" value="${esc((server.limits && server.limits.memoryMb) || 1024)}" /></div>
        <div class="grow"><label class="small muted">Disk (MB)</label><input class="input" name="diskMb" type="number" min="128" value="${esc((server.limits && server.limits.diskMb) || 5120)}" /></div>
        <div class="grow"><label class="small muted">CPU (%)</label><input class="input" name="cpuPercent" type="number" min="5" value="${esc((server.limits && server.limits.cpuPercent) || 100)}" /></div></div>
        <div class="hint mb-16">Users never see these numbers. The daemon stops a server that exceeds its memory or disk quota.</div>
        <button class="btn" type="submit">Update limits</button>
      </form>` : ""}
    </div>
  </div>`;

  document.getElementById("srv-settings").addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target;
    const env = {};
    for (const [k] of Object.entries(vars)) {
      const input = form.querySelector(`[name="env_${CSS.escape(k)}"]`);
      if (input) env[k] = input.value;
    }
    const newKey = document.getElementById("new-env-key").value.trim();
    const newVal = document.getElementById("new-env-val").value;
    if (newKey) env[newKey] = newVal;
    try {
      await api(`/servers/${server.id}`, { method: "PATCH", body: {
        name: form.name.value,
        domain: form.domain.value,
        startup: form.startup.value,
        env,
        autoRestart: form.autoRestart.checked,
      }});
      toast("Saved", "ok");
      renderServer();
    } catch (err) { toast(err.message, "error"); }
  });

  const secretForm = document.getElementById("secret-form");
  if (secretForm && isAdmin) {
    secretForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const secrets = {};
      for (const k of Object.keys(secretVars)) {
        const input = secretForm.querySelector(`[name="secret_${CSS.escape(k)}"]`);
        if (input) secrets[k] = input.value;
      }
      const newKey = document.getElementById("new-secret-key").value.trim();
      const newVal = document.getElementById("new-secret-val").value;
      if (newKey) secrets[newKey] = newVal;
      try {
        await api(`/servers/${server.id}`, { method: "PATCH", body: { secrets } });
        toast("Secrets saved", "ok");
        renderServer();
      } catch (err) { toast(err.message, "error"); }
    });
  }

  const limitForm = document.getElementById("limit-form");
  if (limitForm) {
    limitForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api(`/servers/${server.id}`, { method: "PATCH", body: {
          limits: {
            memoryMb: Number(f.memoryMb.value),
            diskMb: Number(f.diskMb.value),
            cpuPercent: Number(f.cpuPercent.value),
          },
        }});
        toast("Limits updated", "ok");
        renderServer();
      } catch (err) { toast(err.message, "error"); }
    });
  }
}

function renderServerInfo(panel, server, live, stats) {
  panel.innerHTML = `<div class="grid grid-cols-2">
    <div class="card">
      <div class="card-title">Details</div>
      <table class="table">
        <tr><td class="muted">Server ID</td><td class="mono small">${esc(server.id)}</td></tr>
        <tr><td class="muted">Egg</td><td>${esc(server.eggName || server.eggId)}</td></tr>
        <tr><td class="muted">Node</td><td>${esc(state.nodes.find((n) => n.id === server.nodeId)?.name || "")}</td></tr>
        <tr><td class="muted">Domain</td><td>${server.domain ? esc(server.domain) : `<span class="muted">Not set</span>`}</td></tr>
        <tr><td class="muted">Status</td><td>${badge(live.status || server.status)}</td></tr>
        <tr><td class="muted">Created</td><td>${esc(new Date(server.createdAt).toLocaleString())}</td></tr>
        <tr><td class="muted">Auto restart</td><td>${server.autoRestart ? "Enabled" : "Disabled"}</td></tr>
      </table>
    </div>
    <div class="card">
      <div class="card-title">Environment</div>
      ${Object.keys(server.env || {}).length ? `<table class="table">${Object.entries(server.env).map(([k, v]) => `<tr><td class="mono small">${esc(k)}</td><td class="mono small muted">${esc(String(v).slice(0, 60))}</td></tr>`).join("")}</table>` : `<div class="muted small">None</div>`}
    </div>
  </div>`;
}

/* ---------------- Eggs ---------------- */
async function renderEggs() {
  const view = document.getElementById("view");
  const { eggs } = await api("/eggs");
  state.eggs = eggs;
  view.innerHTML = pageHead("Eggs", "Templates to deploy new services") + `
    <div class="egg-grid">
      ${eggs.map((egg) => `<div class="card" style="cursor:default">
        <div class="egg-icon">${EGG_ICONS[egg.icon] || EGG_ICONS.app}</div>
        <div class="egg-name">${esc(egg.name)}</div>
        <div class="egg-desc">${esc(egg.description || "")}</div>
        <div class="tag mt-8" style="display:inline-block">${esc(egg.category || "app")}</div>
        <div class="mono small muted mt-16" style="word-break:break-all">${esc(egg.startup)}</div>
        <button class="btn btn-sm mt-16" data-use="${egg.id}">Use egg</button>
      </div>`).join("")}
    </div>`;
  view.querySelectorAll("[data-use]").forEach((b) => b.addEventListener("click", () => navigate("create")));
}

/* ---------------- Nodes ---------------- */
async function renderNodes() {
  const view = document.getElementById("view");
  view.innerHTML = pageHead("Nodes", "Daemons running on your VPS instances", `<button class="btn" id="add-node-manual">Add existing node</button><button class="btn btn-primary" id="add-node">Add node via SSH</button><div id="nodes-body"></div>`);
  document.getElementById("add-node").addEventListener("click", openAddNodeModal);
  document.getElementById("add-node-manual").addEventListener("click", openManualNodeModal);
  const body = document.getElementById("nodes-body");
  try {
    const { nodes } = await api("/nodes");
    state.nodes = nodes;
    body.className = "mt-16";
    body.innerHTML = nodes.length ? `<div class="grid grid-cols-2">${nodes.map((n) => `
      <div class="card">
        <div class="flex-between">
          <div><div class="server-name">${esc(n.name)}</div><div class="server-meta mono">${esc(n.host)}:${n.port}</div></div>
          ${badge(n.lastStatus === "online" ? "running" : n.lastStatus)}
        </div>
        <div class="small muted mt-8">${esc(n.description || "")}</div>
        <div class="small muted mt-8">Last seen: ${esc(timeAgo(n.lastSeen))}</div>
        <div class="flex gap-8 mt-16">
          <button class="btn btn-sm" data-test="${n.id}">Test connection</button>
          <button class="btn btn-sm btn-danger" data-del-node="${n.id}">Remove</button>
        </div>
      </div>`).join("")}</div>` : `<div class="card"><div class="empty"><div class="empty-icon">${ICONS.nodes}</div><h3>No nodes</h3><div>Add a VPS with the SSH installer. It works on any KVM, LXC, OpenVZ, or bare-metal server.</div></div></div>`;

    body.querySelectorAll("[data-test]").forEach((b) => b.addEventListener("click", async () => {
      b.disabled = true;
      try { const r = await api(`/nodes/${b.dataset.test}/test`, { method: "POST" }); toast(`Node online: v${r.health.version}`, "ok"); }
      catch (err) { toast(err.message, "error"); }
      b.disabled = false;
      renderNodes();
    }));
    body.querySelectorAll("[data-del-node]").forEach((b) => b.addEventListener("click", async () => {
      if (!confirm("Remove this node from the panel? Files on the VPS are kept.")) return;
      try { await api(`/nodes/${b.dataset.delNode}`, { method: "DELETE" }); toast("Node removed", "ok"); renderNodes(); }
      catch (err) { toast(err.message, "error"); }
    }));
  } catch (err) {
    body.innerHTML = `<div class="card">${esc(err.message)}</div>`;
  }
}

function openManualNodeModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal">
    <div class="modal-head"><h3>Add existing node</h3><button class="modal-close">&times;</button></div>
    <p class="small muted">Use this after running <span class="mono">scripts/install-node.sh</span> on a VPS. It prints the host, port, and token.</p>
    <form id="manual-node-form">
      <div class="field"><label>Node name</label><input class="input" name="name" placeholder="vps-1" required /></div>
      <div class="grid grid-cols-2" style="gap:12px">
        <div class="field"><label>Host / IP</label><input class="input" name="host" placeholder="203.0.113.10" required /></div>
        <div class="field"><label>Daemon port</label><input class="input" name="port" value="8081" /></div>
      </div>
      <div class="field"><label>Daemon token</label><input class="input mono" name="token" required /></div>
      <label class="switch"><input type="checkbox" name="secure" /><span class="track"></span> Use HTTPS (reverse proxy)</label>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Add node</button></div>
    </form>
  </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector("[data-close]").addEventListener("click", close);
  backdrop.querySelector("#manual-node-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api("/nodes", { method: "POST", body: {
        name: f.name.value,
        host: f.host.value,
        port: Number(f.port.value || 8081),
        token: f.token.value,
        secure: f.secure.checked,
      }});
      toast("Node added", "ok");
      close();
      renderNodes();
    } catch (err) { toast(err.message, "error"); }
  });
}

function openAddNodeModal() {
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  backdrop.innerHTML = `<div class="modal">
    <div class="modal-head"><h3>Add node over SSH</h3><button class="modal-close">&times;</button></div>
    <p class="small muted">TerryPanel connects to your VPS over SSH, installs Node.js if missing, uploads the daemon, and registers it. No KVM or Docker needed.</p>
    <form id="node-form">
      <div class="field"><label>Node name</label><input class="input" name="name" placeholder="vps-1" required /></div>
      <div class="grid grid-cols-2" style="gap:12px">
        <div class="field"><label>IP / hostname</label><input class="input" name="host" placeholder="203.0.113.10" required /></div>
        <div class="field"><label>SSH port</label><input class="input" name="sshPort" value="22" /></div>
      </div>
      <div class="field"><label>SSH username</label><input class="input" name="username" value="root" required /></div>
      <div class="field"><label>Authentication</label>
        <select class="select" name="authType"><option value="password">Password</option><option value="privateKey">Private key</option></select>
      </div>
      <div class="field" id="pw-field"><label>SSH password</label><input class="input" name="password" type="password" /></div>
      <div class="field hidden" id="key-field"><label>Private key (PEM)</label><textarea class="textarea" name="privateKey" placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"></textarea></div>
      <div class="grid grid-cols-2" style="gap:12px">
        <div class="field"><label>Daemon port</label><input class="input" name="daemonPort" value="8081" /></div>
        <div class="field"><label>Install directory</label><input class="input" name="installDir" value="~/.terrypanel" /></div>
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Install node</button></div>
    </form>
    <div id="job-wrap" class="hidden mt-16">
      <div class="card-title">Installation log</div>
      <div class="job-log" id="job-log"></div>
    </div>
  </div>`;
  document.body.appendChild(backdrop);
  const close = () => backdrop.remove();
  backdrop.querySelector(".modal-close").addEventListener("click", close);
  backdrop.querySelector("[data-close]").addEventListener("click", close);
  const authType = backdrop.querySelector('[name="authType"]');
  authType.addEventListener("change", () => {
    backdrop.querySelector("#pw-field").classList.toggle("hidden", authType.value !== "password");
    backdrop.querySelector("#key-field").classList.toggle("hidden", authType.value !== "privateKey");
  });
  backdrop.querySelector("#node-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      name: f.name.value,
      host: f.host.value,
      port: Number(f.sshPort.value || 22),
      username: f.username.value,
      authType: f.authType.value,
      password: f.password.value,
      privateKey: f.privateKey.value,
      daemonPort: Number(f.daemonPort.value || 8081),
      installDir: f.installDir.value,
    };
    const submit = f.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.textContent = "Installing...";
    backdrop.querySelector("#job-wrap").classList.remove("hidden");
    const logEl = backdrop.querySelector("#job-log");
    try {
      const { jobId } = await api("/nodes/ssh-install", { method: "POST", body });
      let done = false;
      while (!done) {
        await new Promise((r) => setTimeout(r, 1200));
        const job = await api(`/nodes/ssh-install/${jobId}`);
        logEl.textContent = job.logs.join("\n");
        logEl.scrollTop = logEl.scrollHeight;
        if (job.status === "done") {
          done = true;
          toast("Node installed and online", "ok");
          setTimeout(() => { close(); renderNodes(); }, 900);
        } else if (job.status === "error") {
          done = true;
          toast(job.error, "error");
          submit.disabled = false;
          submit.textContent = "Retry";
        }
      }
    } catch (err) {
      toast(err.message, "error");
      submit.disabled = false;
      submit.textContent = "Install node";
    }
  });
}

/* ---------------- Tunnel ---------------- */
async function renderTunnel() {
  const view = document.getElementById("view");
  view.innerHTML = pageHead("Cloudflare Tunnel", "Expose the panel publicly without port forwarding");
  const info = await api("/tunnel").catch(() => null);
  const settings = (await api("/settings").catch(() => ({ settings: {} }))).settings;
  const token = settings.tunnel && settings.tunnel.token;
  view.innerHTML += `
    <div class="split">
      <div class="card">
        <div class="card-title">Connect with a tunnel token</div>
        <p class="small muted">Paste the token from Cloudflare Zero Trust &rarr; Networks &rarr; Tunnels. Leave empty to use a temporary quick tunnel (no account required).</p>
        <div class="field"><label>Tunnel token</label>
          <input class="input mono" id="cf-token" placeholder="eyJhIjoi... (optional)" value="">
          <div class="hint">${token ? "A token is already saved. Leave blank to keep it." : "No token saved yet."}</div>
        </div>
        <div class="flex gap-8">
          <button class="btn btn-primary" id="cf-start">Start tunnel</button>
          <button class="btn btn-danger" id="cf-stop">Stop</button>
        </div>
        <div class="mt-16" id="cf-status"></div>
        ${info && info.publicUrl ? `<div class="copy-box mt-16"><input class="input" readonly value="${esc(info.publicUrl)}" /><button class="btn" id="copy-url">Copy</button></div>` : ""}
      </div>
      <div class="card">
        <div class="card-title">Tunnel log</div>
        <div class="job-log" id="tunnel-log">${esc((info?.logs || []).join("\n"))}</div>
      </div>
    </div>`;

  const statusEl = document.getElementById("cf-status");
  const logEl = document.getElementById("tunnel-log");
  const paintStatus = (i) => {
    if (!i) return;
    statusEl.innerHTML = `<div class="flex gap-8">${badge(i.status === "running" ? "running" : i.status)}<span class="small muted">${i.mode === "token" ? "Token tunnel" : "Quick tunnel"} &middot; binary ${i.hasBinary ? "ready" : "not downloaded"}</span></div>
      ${i.publicUrl ? `<div class="hint mt-8">Public URL: <span class="mono">${esc(i.publicUrl)}</span></div>` : ""}
      ${i.error ? `<div class="hint" style="color:var(--danger)">${esc(i.error)}</div>` : ""}`;
  };
  paintStatus(info);

  document.getElementById("cf-start").addEventListener("click", async () => {
    const tokenVal = document.getElementById("cf-token").value.trim();
    try {
      statusEl.innerHTML = `<span class="badge starting">starting</span>`;
      await api("/tunnel/start", { method: "POST", body: tokenVal ? { token: tokenVal } : {} });
      toast("Tunnel starting - first run downloads cloudflared", "ok");
    } catch (err) { toast(err.message, "error"); }
  });
  document.getElementById("cf-stop").addEventListener("click", async () => {
    try { await api("/tunnel/stop", { method: "POST" }); toast("Tunnel stopped", "ok"); renderTunnel(); }
    catch (err) { toast(err.message, "error"); }
  });
  const copy = document.getElementById("copy-url");
  if (copy) copy.addEventListener("click", () => navigator.clipboard.writeText(copy.closest(".copy-box").querySelector("input").value).then(() => toast("Copied", "ok")));

  const es = new EventSource("/api/tunnel/events");
  es.addEventListener("info", (e) => { try { paintStatus(JSON.parse(e.data)); } catch {} });
  es.addEventListener("status", (e) => { try { const d = JSON.parse(e.data); paintStatus(d); } catch {} });
  es.addEventListener("log", (e) => {
    try { logEl.textContent += `\n${JSON.parse(e.data).line}`; logEl.scrollTop = logEl.scrollHeight; } catch {}
  });
  es.addEventListener("url", (e) => { try { toast(`Tunnel URL: ${JSON.parse(e.data).url}`, "ok"); } catch {} });
  setTimeout(() => es.close(), 10 * 60 * 1000);
}

/* ---------------- Users ---------------- */
async function renderUsers() {
  const view = document.getElementById("view");
  view.innerHTML = pageHead("Users", "Panel accounts and access", `<button class="btn btn-primary" id="add-user">Create user</button>`);
  const [{ users }, { servers }] = await Promise.all([api("/admin/users"), api("/servers")]);
  view.innerHTML += `<div class="card mt-16">
    <table class="table"><thead><tr><th>Username</th><th>Role</th><th>Servers</th><th>Created</th><th></th></tr></thead><tbody>
    ${users.map((u) => `<tr>
      <td><strong>${esc(u.username)}</strong></td>
      <td><span class="tag">${esc(u.role)}</span></td>
      <td class="muted">${u.role === "admin" ? "all" : `${(u.serverIds || []).length} assigned`}</td>
      <td class="muted">${esc(new Date(u.createdAt).toLocaleDateString())}</td>
      <td style="text-align:right">
        ${u.role === "admin" ? "" : `<button class="btn btn-sm btn-ghost" data-access="${u.id}">Manage access</button>`}
        <button class="btn btn-sm btn-ghost" data-reset="${u.id}">Reset password</button>
        ${u.id === state.user.id ? "" : `<button class="btn btn-sm btn-danger" data-del-user="${u.id}">Delete</button>`}
      </td>
    </tr>`).join("")}
    </tbody></table>
  </div>`;

  document.getElementById("add-user").addEventListener("click", () => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal">
      <div class="modal-head"><h3>Create user</h3><button class="modal-close">&times;</button></div>
      <form id="user-form">
        <div class="field"><label>Username</label><input class="input" name="username" required /></div>
        <div class="field"><label>Password</label><input class="input" name="password" type="password" minlength="6" required /></div>
        <div class="field"><label>Role</label><select class="select" name="role"><option value="user">User</option><option value="admin">Admin</option></select></div>
        <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" type="submit">Create</button></div>
      </form>
    </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector(".modal-close").addEventListener("click", () => backdrop.remove());
    backdrop.querySelector("[data-close]").addEventListener("click", () => backdrop.remove());
    backdrop.querySelector("#user-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.target;
      try {
        await api("/admin/users", { method: "POST", body: { username: f.username.value, password: f.password.value, role: f.role.value } });
        toast("User created", "ok");
        backdrop.remove();
        renderUsers();
      } catch (err) { toast(err.message, "error"); }
    });
  });

  view.querySelectorAll("[data-del-user]").forEach((b) => b.addEventListener("click", async () => {
    if (!confirm("Delete this user?")) return;
    try { await api(`/admin/users/${b.dataset.delUser}`, { method: "DELETE" }); toast("User deleted", "ok"); renderUsers(); }
    catch (err) { toast(err.message, "error"); }
  }));
  view.querySelectorAll("[data-access]").forEach((b) => b.addEventListener("click", () => {
    const user = users.find((u) => u.id === b.dataset.access);
    if (!user) return;
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<div class="modal">
      <div class="modal-head"><h3>Server access for ${esc(user.username)}</h3><button class="modal-close">&times;</button></div>
      <p class="small muted">Select which servers this user can manage.</p>
      <div id="access-list">
        ${servers.length ? servers.map((s) => `<label class="switch mb-16"><input type="checkbox" value="${s.id}" ${(user.serverIds || []).includes(s.id) ? "checked" : ""} /><span class="track"></span> ${esc(s.name)} <span class="tag">${esc(s.eggName || s.eggId)}</span></label>`).join("") : `<div class="muted small">No servers exist yet.</div>`}
      </div>
      <div class="modal-actions"><button type="button" class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="save-access">Save access</button></div>
    </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector(".modal-close").addEventListener("click", () => backdrop.remove());
    backdrop.querySelector("[data-close]").addEventListener("click", () => backdrop.remove());
    backdrop.querySelector("#save-access").addEventListener("click", async () => {
      const ids = [...backdrop.querySelectorAll("#access-list input:checked")].map((i) => i.value);
      try {
        await api(`/admin/users/${user.id}`, { method: "PATCH", body: { serverIds: ids } });
        toast("Access updated", "ok");
        backdrop.remove();
        renderUsers();
      } catch (err) { toast(err.message, "error"); }
    });
  }));
  view.querySelectorAll("[data-reset]").forEach((b) => b.addEventListener("click", async () => {
    const password = prompt("New password (min 6 chars):");
    if (!password) return;
    try { await api(`/admin/users/${b.dataset.reset}/reset-password`, { method: "POST", body: { password } }); toast("Password reset", "ok"); }
    catch (err) { toast(err.message, "error"); }
  }));
}

/* ---------------- Settings ---------------- */
async function renderSettings() {
  const view = document.getElementById("view");
  const { settings } = await api("/settings");
  view.innerHTML = pageHead("Settings", "Customize your panel") + `
    <form id="settings-form" class="grid grid-cols-2">
      <div class="card">
        <div class="card-title">Branding</div>
        <div class="field"><label>Panel name</label><input class="input" name="panelName" value="${esc(settings.panelName)}" /></div>
        <div class="field"><label>Tagline</label><input class="input" name="tagline" value="${esc(settings.tagline || "")}" /></div>
        <div class="field"><label>Logo URL</label><input class="input" name="logoUrl" value="${esc(settings.logoUrl || "")}" placeholder="https://..." /></div>
        <div class="grid grid-cols-2" style="gap:12px">
          <div class="field"><label>Accent color</label><input class="input" type="color" name="accent" value="${esc(settings.accent || "#7c5cff")}" /></div>
          <div class="field"><label>Secondary color</label><input class="input" type="color" name="accent2" value="${esc(settings.accent2 || "#38e1c4")}" /></div>
        </div>
        <div class="field"><label>Theme</label><select class="select" name="theme"><option value="dark" ${settings.theme === "dark" ? "selected" : ""}>Dark</option><option value="light" ${settings.theme === "light" ? "selected" : ""}>Light</option></select></div>
        <div class="field"><label>Default egg</label><select class="select" name="defaultEgg">
          ${state.eggs.map((e) => `<option value="${e.id}" ${settings.defaultEgg === e.id ? "selected" : ""}>${esc(e.name)}</option>`).join("")}
        </select></div>
      </div>
      <div class="card">
        <div class="card-title">Options</div>
        <div class="field"><label>Hosting mode</label>
          <select class="select" name="hostingMode">
            <option value="private" ${settings.hostingMode !== "public" ? "selected" : ""}>Private - only owner can create servers</option>
            <option value="public" ${settings.hostingMode === "public" ? "selected" : ""}>Public - users can register and host</option>
          </select>
          <div class="hint">Private is best when you are the only owner. Public turns this into a multi-user hosting panel.</div></div>
        <div class="field"><label>Status domain</label><input class="input" name="statusDomain" value="${esc(settings.statusDomain || "")}" placeholder="status.example.com" />
          <div class="hint">Domain shown at the top of the status page and CLI.</div></div>
        <div class="field"><label>Support URL</label><input class="input" name="supportUrl" value="${esc(settings.supportUrl || "")}" placeholder="https://discord.gg/..." /></div>
        <label class="switch mb-16"><input type="checkbox" name="publicStatus" ${settings.publicStatus ? "checked" : ""} /><span class="track"></span> Public status page</label>
        <label class="switch mb-16"><input type="checkbox" name="registrationOpen" ${settings.registrationOpen ? "checked" : ""} /><span class="track"></span> Allow user registration</label>
        <div class="field mt-16"><label>Announcements (one per line)</label><textarea class="textarea" name="announcements">${esc((settings.announcements || []).join("\n"))}</textarea></div>
        <div class="modal-actions" style="justify-content:flex-start"><button class="btn btn-primary" type="submit">Save settings</button></div>
      </div>
    </form>
    <div class="card mt-16">
      <div class="card-title">Change your password</div>
      <form id="pw-form" class="grid grid-cols-3" style="gap:12px;align-items:end">
        <div class="field mb-0"><label>Current password</label><input class="input" name="currentPassword" type="password" required /></div>
        <div class="field mb-0"><label>New password</label><input class="input" name="newPassword" type="password" minlength="6" required /></div>
        <button class="btn btn-primary" type="submit">Update password</button>
      </form>
    </div>`;

  document.getElementById("settings-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      panelName: f.panelName.value,
      tagline: f.tagline.value,
      logoUrl: f.logoUrl.value,
      accent: f.accent.value,
      accent2: f.accent2.value,
      theme: f.theme.value,
      defaultEgg: f.defaultEgg.value,
      hostingMode: f.hostingMode.value,
      statusDomain: f.statusDomain.value,
      supportUrl: f.supportUrl.value,
      publicStatus: f.publicStatus.checked,
      registrationOpen: f.registrationOpen.checked,
      announcements: f.announcements.value.split("\n").map((s) => s.trim()).filter(Boolean),
    };
    try {
      const res = await api("/settings", { method: "PATCH", body });
      state.settings = { ...state.settings, ...res.settings };
      applyTheme(state.settings);
      toast("Settings saved", "ok");
      renderShell();
      navigate("settings");
    } catch (err) { toast(err.message, "error"); }
  });

  document.getElementById("pw-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    try {
      await api("/auth/password", { method: "POST", body: { currentPassword: f.currentPassword.value, newPassword: f.newPassword.value } });
      toast("Password updated", "ok");
      f.reset();
    } catch (err) { toast(err.message, "error"); }
  });
}

/* ---------------- Status ---------------- */
async function renderStatus() {
  const view = document.getElementById("view");
  view.innerHTML = pageHead("Status", "Live view of nodes and servers", `<button class="btn" id="refresh-status">Refresh</button><span id="status-body"></span>`);
  const body = document.getElementById("status-body");
  body.className = "mt-16";
  async function load() {
    try {
      const data = await api("/status");
      body.innerHTML = `
        <div class="grid grid-cols-4 mb-16">
          <div class="card stat-card"><div class="stat-value">${data.summary.total}</div><div class="stat-sub">Servers</div></div>
          <div class="card stat-card"><div class="stat-value" style="color:var(--ok)">${data.summary.running}</div><div class="stat-sub">Running</div></div>
          <div class="card stat-card"><div class="stat-value">${data.summary.offline}</div><div class="stat-sub">Offline</div></div>
          <div class="card stat-card"><div class="stat-value" style="color:var(--danger)">${data.summary.errored}</div><div class="stat-sub">Errored</div></div>
        </div>
        <div class="card mb-16">
          <div class="card-title">Nodes</div>
          <table class="table"><thead><tr><th>Name</th><th>Host</th><th>Status</th></tr></thead><tbody>
          ${data.nodes.map((n) => `<tr><td>${esc(n.name)}</td><td class="mono small">${esc(n.host)}</td><td>${badge(n.status === "online" ? "running" : n.status)}</td></tr>`).join("") || `<tr><td colspan="3" class="muted">No nodes</td></tr>`}
          </tbody></table>
        </div>
        <div class="card">
          <div class="card-title">Servers</div>
          <table class="table"><thead><tr><th>Name</th><th>Egg</th><th>Node</th><th>Status</th><th>Uptime</th><th>CPU</th><th>Memory</th></tr></thead><tbody>
          ${data.servers.map((s) => `<tr>
            <td><strong>${esc(s.name)}</strong></td><td class="muted">${esc(s.egg)}</td><td class="muted">${esc(s.node)}</td>
            <td>${badge(s.status)}</td><td>${fmtUptime(s.uptime)}</td><td>${Number(s.cpu || 0).toFixed(1)}%</td><td>${fmtBytes(s.memory || 0)}</td>
          </tr>`).join("") || `<tr><td colspan="7" class="muted">No servers</td></tr>`}
          </tbody></table>
          <div class="hint mt-16">Generated ${esc(new Date(data.generatedAt).toLocaleString())}</div>
        </div>`;
    } catch (err) {
      body.innerHTML = `<div class="card">${esc(err.message)}</div>`;
    }
  }
  document.getElementById("refresh-status").addEventListener("click", load);
  await load();
}

/* ---------------- Boot ---------------- */
async function boot() {
  try {
    const config = await api("/config");
    state.settings = config.settings;
    applyTheme(state.settings);
    const setup = await api("/setup").catch(() => null);
    if (setup && setup.needsSetup) return renderSetup();
    let me;
    try { me = await api("/auth/me"); } catch { return renderLogin(); }
    state.user = me.user;
    state.settings = me.settings || state.settings;
    applyTheme(state.settings);
    const eggsData = await api("/eggs").catch(() => ({ eggs: [] }));
    state.eggs = eggsData.eggs;
    renderShell();
    if (setup && !setup.setupComplete && state.user.role === "admin") return renderWizard();
    navigate("overview");
  } catch (err) {
    app.innerHTML = `<div class="login-wrap"><div class="login-card"><div class="login-title">Cannot reach panel API</div><div class="hint mt-8">${esc(err.message)}</div></div></div>`;
  }
}

boot();
