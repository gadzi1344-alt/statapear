#!/usr/bin/env node
// PearGram status agent. Без зависимостей, нужен Node.js 18+ и Linux.
// Раз в 5 секунд снимает метрики из /proc и отдаёт их по GET /metrics с токеном.
//
// Переменные окружения:
//   AGENT_TOKEN  секрет (обязательно), тот же что в Vercel
//   PORT         порт, по умолчанию 9101
//   HOST         на каком адресе слушать, по умолчанию 127.0.0.1 (за nginx/Caddy)
//   DISK_PATH    какой диск показывать, по умолчанию /
//   SERVICES     службы через запятую: "Веб-сервер=nginx,База данных=postgresql,Кэш=redis-server"

'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');

const TOKEN = process.env.AGENT_TOKEN;
if (!TOKEN) { console.error('Задайте AGENT_TOKEN'); process.exit(1); }
const PORT = Number(process.env.PORT || 9101);
const HOST = process.env.HOST || '127.0.0.1';
const DISK_PATH = process.env.DISK_PATH || '/';
const SERVICES = (process.env.SERVICES || '').split(',').map((s) => s.trim()).filter(Boolean).map((s) => {
  const [label, unit] = s.includes('=') ? s.split('=') : [s, s];
  return { name: label.trim(), unit: unit.trim() };
});
const HIST = 36;
const SAMPLE_MS = 5000;

const hist = { cpu: [], rx: [], tx: [] };
const push = (a, v) => { a.push(v); while (a.length > HIST) a.shift(); };
const read = (p) => fs.readFileSync(p, 'utf8');

function cpuTimes() {
  const f = read('/proc/stat').split('\n')[0].trim().split(/\s+/).slice(1).map(Number);
  const idle = f[3] + (f[4] || 0);
  return { idle, total: f.reduce((a, b) => a + b, 0) };
}
function netBytes() {
  let rx = 0, tx = 0;
  for (const line of read('/proc/net/dev').split('\n').slice(2)) {
    const [name, rest] = line.split(':');
    if (!rest) continue;
    const n = name.trim();
    if (n === 'lo' || /^(docker|veth|br-)/.test(n)) continue;
    const c = rest.trim().split(/\s+/).map(Number);
    rx += c[0]; tx += c[8];
  }
  return { rx, tx };
}
function mem() {
  const m = {};
  for (const l of read('/proc/meminfo').split('\n')) {
    const [k, v] = l.split(':');
    if (v) m[k] = parseInt(v, 10) * 1024;
  }
  const total = m.MemTotal, used = total - (m.MemAvailable ?? m.MemFree);
  return { total, used, pct: +(used / total * 100).toFixed(1) };
}

let disk = { total: 0, used: 0, pct: 0 };
function refreshDisk() {
  execFile('df', ['-kP', DISK_PATH], (err, out) => {
    if (err) return;
    const c = out.trim().split('\n').pop().trim().split(/\s+/);
    const total = Number(c[1]) * 1024, used = Number(c[2]) * 1024;
    disk = { total, used, pct: +(used / total * 100).toFixed(1) };
  });
}

let services = SERVICES.map((s) => ({ name: s.name, up: false }));
function refreshServices() {
  Promise.all(SERVICES.map((s) => new Promise((ok) => {
    execFile('systemctl', ['is-active', '--quiet', s.unit], (err) => ok({ name: s.name, up: !err }));
  }))).then((r) => { services = r; });
}

let prevCpu = cpuTimes(), prevNet = netBytes(), prevAt = Date.now();
let cpu = 0, rx = 0, tx = 0;
function sample() {
  const c = cpuTimes(), n = netBytes(), now = Date.now();
  const dt = (now - prevAt) / 1000;
  const dTotal = c.total - prevCpu.total;
  cpu = dTotal > 0 ? +((1 - (c.idle - prevCpu.idle) / dTotal) * 100).toFixed(1) : 0;
  rx = Math.max(0, (n.rx - prevNet.rx) / dt);
  tx = Math.max(0, (n.tx - prevNet.tx) / dt);
  prevCpu = c; prevNet = n; prevAt = now;
  push(hist.cpu, cpu); push(hist.rx, rx); push(hist.tx, tx);
}

refreshDisk(); refreshServices(); setTimeout(sample, 1000);
setInterval(sample, SAMPLE_MS);
setInterval(refreshDisk, 30000);
setInterval(refreshServices, 15000);

function authorized(req) {
  const given = Buffer.from((req.headers.authorization || '').replace(/^Bearer\s+/i, ''));
  const want = Buffer.from(TOKEN);
  return given.length === want.length && crypto.timingSafeEqual(given, want);
}

http.createServer((req, res) => {
  if (req.method !== 'GET' || !req.url.startsWith('/metrics')) { res.writeHead(404).end(); return; }
  if (!authorized(req)) { res.writeHead(401).end(); return; }
  const body = JSON.stringify({
    cpu, cores: os.cpus().length, load: os.loadavg(),
    ram: mem(), disk, net: { rx, tx },
    uptime: Math.floor(parseFloat(read('/proc/uptime'))),
    services, history: hist,
  });
  res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' }).end(body);
}).listen(PORT, HOST, () => console.log(`PearGram agent: http://${HOST}:${PORT}/metrics`));
