"use strict";

const os = require("os");
const fs = require("fs");
const { execFile } = require("child_process");

let lastCpu = cpuSnapshot();

function cpuSnapshot() {
  const cpus = os.cpus() || [];
  let idle = 0;
  let total = 0;
  for (const cpu of cpus) {
    const t = cpu.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

function cpuPercent() {
  const now = cpuSnapshot();
  const idleDelta = now.idle - lastCpu.idle;
  const totalDelta = now.total - lastCpu.total;
  lastCpu = now;
  if (totalDelta <= 0) return 0;
  return Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100));
}

function diskInfo(dir) {
  return new Promise((resolve) => {
    execFile("df", ["-kP", dir || "/"], { timeout: 3000 }, (err, stdout) => {
      if (err) return resolve(null);
      const line = String(stdout).trim().split("\n")[1];
      if (!line) return resolve(null);
      const parts = line.split(/\s+/);
      const total = Number(parts[1]) * 1024;
      const used = Number(parts[2]) * 1024;
      const free = Number(parts[3]) * 1024;
      resolve({ total, used, free, percent: total ? (used / total) * 100 : 0 });
    });
  });
}

async function snapshot(dataDir) {
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const load = os.loadavg();
  return {
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    release: os.release(),
    uptime: os.uptime(),
    nodeUptime: process.uptime(),
    cpu: {
      percent: Number(cpuPercent().toFixed(1)),
      cores: (os.cpus() || []).length,
      model: ((os.cpus() || [])[0] || {}).model || "Unknown CPU",
      load,
    },
    memory: {
      total: totalMem,
      free: freeMem,
      used: totalMem - freeMem,
      percent: totalMem ? ((totalMem - freeMem) / totalMem) * 100 : 0,
    },
    disk: await diskInfo(dataDir || "/"),
    node: process.version,
  };
}

function processStats(pid) {
  if (!pid) return { cpu: 0, memory: 0, processes: 0, uptime: 0, ticks: 0 };
  try {
    const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
    const close = stat.lastIndexOf(")");
    const fields = stat.slice(close + 2).split(" ");
    const utime = Number(fields[11]);
    const stime = Number(fields[12]);
    const starttime = Number(fields[19]);
    const status = fs.readFileSync(`/proc/${pid}/status`, "utf8");
    const rss = Number((status.match(/VmRSS:\s+(\d+)/) || [])[1] || 0) * 1024;
    const hz = 100;
    const bootTime = Date.now() / 1000 - os.uptime();
    const started = bootTime + starttime / hz;
    return {
      cpu: 0,
      memory: rss,
      processes: 1,
      uptime: Math.max(0, Date.now() / 1000 - started),
      ticks: utime + stime,
    };
  } catch {
    return { cpu: 0, memory: 0, processes: 0, uptime: 0, ticks: 0 };
  }
}

function computeCpu(prev, current, seconds) {
  if (!prev || !current || seconds <= 0) return 0;
  const tickDelta = (current.ticks || 0) - (prev.ticks || 0);
  if (tickDelta <= 0) return 0;
  const percent = (tickDelta / 100 / seconds) * 100;
  return Math.max(0, Math.min(100 * (os.cpus() || []).length, percent));
}

module.exports = { snapshot, processStats, computeCpu, cpuPercent };
