'use strict';
// Finds this PC's Tailscale address so the app can be opened from a phone on
// the same tailnet. Tailscale gives every device an IPv4 address in
// 100.64.0.0/10 and, with MagicDNS on, a name like pc.tailnet.ts.net.
// NL_TAILSCALE_IPS (comma separated) stands in for the real addresses in tests.

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
  if (process.env.NL_TAILSCALE_IPS) return Promise.resolve({ state: 'Running', dnsName: null, installed: true });
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

module.exports = { ips, status, inTailnet, isLoopback };
