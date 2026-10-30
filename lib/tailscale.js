'use strict';
// Finds this PC's Tailscale address so the app can be opened from a phone on
// the same tailnet. Tailscale gives every device an IPv4 address in
// 100.64.0.0/10 and, with MagicDNS on, a name like pc.tailnet.ts.net.
// NL_TAILSCALE_IPS (comma separated) and NL_TAILSCALE_DNS stand in for the real
// address and name in tests, and Tailscale Serve is then only pretended.

const os = require('os');
const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');

function inTailnet(ip) {
  const m = /^(?:::ffff:)?100\.(\d+)\.\d+\.\d+$/.exec(String(ip || ''));
  return !!m && Number(m[1]) >= 64 && Number(m[1]) <= 127;
}

const isLoopback = (ip) => /^(?:::ffff:)?127\./.test(String(ip || '')) || ip === '::1';

function ips() {
  if (process.env.NL_TAILSCALE_IPS) return process.env.NL_TAILSCALE_IPS.split(',').map((s) => s.trim()).filter(Boolean);
  const out = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const a of list || []) if ((a.family === 'IPv4' || a.family === 4) && inTailnet(a.address)) out.push(a.address);
  }
  return out;
}

function cli() {
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const exe = path.join(pf, 'Tailscale', 'tailscale.exe');
  return fs.existsSync(exe) ? exe : 'tailscale';
}

// { state, dnsName, installed } from `tailscale status --json`; never throws.
function status() {
  if (process.env.NL_TAILSCALE_IPS) return Promise.resolve({ state: 'Running', dnsName: process.env.NL_TAILSCALE_DNS || null, installed: true });
  return new Promise((resolve) => {
    execFile(cli(), ['status', '--json'], { windowsHide: true, timeout: 5000, maxBuffer: 8 * 1024 * 1024 }, (err, stdout) => {
      if (err && !stdout) return resolve({ state: err.code === 'ENOENT' ? 'NotInstalled' : 'Unknown', dnsName: null, installed: err.code !== 'ENOENT' });
      try {
        const j = JSON.parse(stdout);
        const name = j.Self && j.Self.DNSName ? j.Self.DNSName.replace(/\.$/, '') : null;
        resolve({ state: j.BackendState || 'Unknown', dnsName: name || null, installed: true });
      } catch {
        resolve({ state: 'Unknown', dnsName: null, installed: true });
      }
    });
  });
}

// HTTPS for phones goes through Tailscale Serve: https://<pc>.<tailnet>.ts.net:8943
// with a real certificate, reachable only on the tailnet, passed on to the app on
// 127.0.0.1. Port 443 is left free for other apps on this PC.
const SERVE_PORT = 8943;
const FAKE = () => !!process.env.NL_TAILSCALE_IPS;
let fakeServe = false;

function run(args, ms) {
  return new Promise((resolve) => {
    execFile(cli(), args, { windowsHide: true, timeout: ms }, (err, out, errOut) => resolve({ ok: !err, out: `${out || ''}${errOut || ''}` }));
  });
}

// True when Serve passes https://<dnsName>:8943 to this app.
async function serveState(dnsName, appPort) {
  if (FAKE()) return fakeServe;
  if (!dnsName) return false;
  const r = await run(['serve', 'status', '--json'], 6000);
  try {
    const web = (JSON.parse(r.out || '{}').Web || {})[`${dnsName}:${SERVE_PORT}`];
    const handler = web && web.Handlers && web.Handlers['/'];
    return !!handler && handler.Proxy === `http://127.0.0.1:${appPort}`;
  } catch {
    return false;
  }
}

// { ok, out } from turning the HTTPS address on or off.
async function serve(on, appPort) {
  if (FAKE()) { fakeServe = on; return { ok: true, out: '' }; }
  return on
    ? run(['serve', '--bg', '--yes', `--https=${SERVE_PORT}`, `http://127.0.0.1:${appPort}`], 30000)
    : run(['serve', `--https=${SERVE_PORT}`, 'off'], 15000);
}

module.exports = { ips, status, inTailnet, isLoopback, serve, serveState, SERVE_PORT };
