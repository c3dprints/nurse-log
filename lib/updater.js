'use strict';
// Self-update from tagged GitHub releases, the same model as Claude Sessions:
// the installed copy is a git clone, a release is a `vX.Y.Z` tag, installing
// checks that tag out, refreshes node_modules when package-lock.json changed,
// and restarts the server. A copy sitting on a branch is a dev checkout and is
// never moved by the updater. Student data lives outside the app folder, so an
// update never touches it.
//
// A copy installed from NursesLog-Setup.exe (a `.setup` file sits in the app
// folder) updates from the public download repo instead: the newest release's
// Setup.exe is downloaded, checked against its .sha256 file and run silently. The
// installer stops this server, replaces the app and starts it again.

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execFile, spawn } = require('child_process');

const TAG_RE = /^v(\d+)\.(\d+)\.(\d+)$/;

function parseVersion(v) {
  const m = TAG_RE.exec(v.startsWith('v') ? v : 'v' + v);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
}

function compare(a, b) {
  const x = parseVersion(a);
  const y = parseVersion(b);
  if (!x || !y) throw new Error(`bad version: ${!x ? a : b}`);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
  return 0;
}

function latestTag(tags) {
  const good = tags.map((t) => t.trim()).filter((t) => TAG_RE.test(t));
  good.sort(compare);
  return good.length ? good[good.length - 1] : null;
}

function exec(cmd, args, cwd, timeout) {
  return new Promise((resolve, reject) => {
    execFile(cmd, args, {
      cwd,
      windowsHide: true,
      timeout,
      shell: cmd === 'npm', // npm is npm.cmd on Windows
      env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }, // never hang on a login prompt
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error((String(stderr).trim() || err.message).split('\n').pop()));
      resolve(String(stdout).trim());
    });
  });
}

const git = (appDir, args, timeout = 60000) => exec('git', args, appDir, timeout);

// Tests point this at a local fake (NL_RELEASES_URL); real copies only talk to GitHub.
const releasesUrl = () => process.env.NL_RELEASES_URL || 'https://api.github.com/repos/c3dprints/nurse-log-releases/releases';
const GITHUB_HOSTS = /^(api\.github\.com|github\.com|objects\.githubusercontent\.com|release-assets\.githubusercontent\.com)$/;
const SETUP_RE = /^NursesLog-Setup-\d+\.\d+\.\d+\.exe$/;

function fetchUrl(url, { json = false, max = 300 * 1024 * 1024, hops = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    if (!process.env.NL_RELEASES_URL && (u.protocol !== 'https:' || !GITHUB_HOSTS.test(u.hostname))) {
      return reject(new Error(`refusing to download from ${u.hostname}`));
    }
    const req = (u.protocol === 'https:' ? https : http).get(u, {
      headers: { 'User-Agent': 'nurse-log-updater', Accept: json ? 'application/vnd.github+json' : 'application/octet-stream' },
      timeout: 60000,
    }, (res) => {
      if ([301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
        res.resume();
        if (!hops) return reject(new Error('too many redirects'));
        return resolve(fetchUrl(new URL(res.headers.location, u).href, { json, max, hops: hops - 1 }));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(res.statusCode === 404 ? 'no release found yet' : `download failed (HTTP ${res.statusCode})`));
      }
      const chunks = [];
      let size = 0;
      res.on('data', (c) => {
        size += c.length;
        if (size > max) req.destroy(new Error('download too large'));
        else chunks.push(c);
      });
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        if (!json) return resolve(buf);
        try { resolve(JSON.parse(buf.toString('utf8'))); } catch { reject(new Error('bad answer from GitHub')); }
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('download timed out')));
    req.on('error', reject);
  });
}

async function latestSetup() {
  const rel = await fetchUrl(`${releasesUrl()}/latest`, { json: true });
  const tag = rel && rel.tag_name;
  if (!TAG_RE.test(tag || '')) throw new Error('no release found yet');
  const assets = rel.assets || [];
  const exe = assets.find((a) => SETUP_RE.test(a.name));
  const sum = exe && assets.find((a) => a.name === `${exe.name}.sha256`);
  if (!exe || !sum) throw new Error(`release ${tag} has no installer`);
  return { tag, name: exe.name, exe: exe.browser_download_url, sum: sum.browser_download_url };
}

// Downloads the newest Setup.exe, checks its SHA-256 and runs it silently.
async function installSetup(tag) {
  const r = await latestSetup();
  if (r.tag !== tag) throw new Error(`the newest release is now ${r.tag}, check again`);
  const [exe, sum] = await Promise.all([fetchUrl(r.exe), fetchUrl(r.sum, { max: 4096 })]);
  const want = String(sum).trim().split(/\s+/)[0].toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(want) || crypto.createHash('sha256').update(exe).digest('hex') !== want) {
    throw new Error('the downloaded installer failed its checksum, update stopped');
  }
  const file = path.join(os.tmpdir(), r.name);
  fs.writeFileSync(file, exe);
  if (process.env.NL_RELEASES_URL) return { file, restartsItself: false }; // tests never run it
  const child = spawn(file, ['/VERYSILENT', '/SUPPRESSMSGBOXES', '/NORESTART'], { detached: true, stdio: 'ignore', windowsHide: true });
  child.on('error', () => {});
  child.unref();
  return { file, restartsItself: true };
}

async function mode(appDir) {
  if (fs.existsSync(path.join(appDir, '.setup'))) return { kind: 'setup' };
  if (!fs.existsSync(path.join(appDir, '.git'))) return { kind: 'none' };
  try {
    const branch = await git(appDir, ['symbolic-ref', '--short', '-q', 'HEAD']);
    return { kind: 'dev', branch };
  } catch {
    return { kind: 'release' }; // detached at a tag
  }
}

async function check(appDir, current) {
  const m = await mode(appDir);
  if (m.kind === 'none') return { current, available: false, mode: 'none', error: 'not installed from git, updates are off' };
  if (m.kind === 'setup') {
    const r = await latestSetup();
    return { current, latest: r.tag, available: compare(r.tag, current) > 0, mode: 'setup', branch: null, error: null };
  }
  await git(appDir, ['fetch', '--tags', '--force', '--quiet', 'origin']);
  const latest = latestTag((await git(appDir, ['tag', '-l', 'v*'])).split('\n'));
  return {
    current,
    latest,
    available: !!latest && compare(latest, current) > 0,
    mode: m.kind,
    branch: m.branch || null,
    error: null,
  };
}

async function install(appDir, tag) {
  if (!TAG_RE.test(tag)) throw new Error('bad tag');
  const m = await mode(appDir);
  if (m.kind === 'setup') return installSetup(tag);
  if (m.kind !== 'release') throw new Error(m.kind === 'dev' ? `dev copy on branch ${m.branch}: use git pull` : 'not installed from git');
  const dirty = await git(appDir, ['status', '--porcelain', '--untracked-files=no']);
  if (dirty) throw new Error('install folder has local edits, update stopped so nothing is lost');
  const lock = (ref) => git(appDir, ['rev-parse', `${ref}:package-lock.json`]).catch(() => '');
  const before = await lock('HEAD');
  await git(appDir, ['checkout', '--quiet', `refs/tags/${tag}`]);
  if ((await lock('HEAD')) !== before) await exec('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], appDir, 300000);
}

module.exports = { parseVersion, compare, latestTag, check, install, mode };
