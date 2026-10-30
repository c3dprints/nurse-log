'use strict';
// Builds the Windows installer: `npm run build:setup` -> dist\NursesLog-Setup-X.Y.Z.exe
// plus its .sha256. The installer carries its own Node.js, so the PC needs nothing
// else. Needs Inno Setup 6 (ISCC.exe) on the build PC.

const fs = require('fs');
const path = require('path');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const NODE_VERSION = '22.11.0'; // LTS shipped inside the installer
const BUILD = path.join(ROOT, 'build');
const STAGE = path.join(BUILD, 'stage');
const CACHE = path.join(BUILD, 'cache');
const DIST = path.join(ROOT, 'dist');
// What the installed app needs; everything else (tests, build scripts) stays out.
const APP_FILES = ['server.js', 'launch.js', 'package.json', 'package-lock.json', 'LICENSE', 'lib', 'public', 'scripts/launch.vbs', 'scripts/window-icon.ps1', 'scripts/toast.ps1'];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function download(url, hops = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'nurse-log-build' } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && hops) {
        res.resume();
        return resolve(download(new URL(res.headers.location, url).href, hops - 1));
      }
      if (res.statusCode !== 200) { res.resume(); return reject(new Error(`${url}: HTTP ${res.statusCode}`)); }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    }).on('error', reject);
  });
}

// node.exe and its license from nodejs.org, checked against the published SHA-256 list.
async function nodeRuntime() {
  const name = `node-v${NODE_VERSION}-win-x64`;
  const dir = path.join(CACHE, name);
  if (fs.existsSync(path.join(dir, 'node.exe'))) return dir;
  fs.mkdirSync(CACHE, { recursive: true });
  const base = `https://nodejs.org/dist/v${NODE_VERSION}/`;
  const sums = (await download(base + 'SHASUMS256.txt')).toString();
  const want = (sums.split('\n').find((l) => l.trim().endsWith(`  ${name}.zip`)) || '').split(' ')[0];
  console.log(`downloading Node.js ${NODE_VERSION}...`);
  const zip = await download(base + `${name}.zip`);
  if (!want || sha256(zip) !== want) throw new Error('the Node.js download failed its checksum');
  const zipFile = path.join(CACHE, `${name}.zip`);
  fs.writeFileSync(zipFile, zip);
  // Windows' own tar reads zip files (Git's tar does not).
  execFileSync(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', zipFile, '-C', CACHE, `${name}/node.exe`, `${name}/LICENSE`]);
  fs.rmSync(zipFile, { force: true });
  return dir;
}

function iscc() {
  const found = [
    process.env.ISCC,
    path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Inno Setup 6', 'ISCC.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Inno Setup 6', 'ISCC.exe'),
    path.join(process.env.ProgramFiles || '', 'Inno Setup 6', 'ISCC.exe'),
  ].find((p) => p && fs.existsSync(p));
  if (!found) throw new Error('Inno Setup 6 is not installed (winget install JRSoftware.InnoSetup)');
  return found;
}

async function build() {
  const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
  const node = await nodeRuntime();

  fs.rmSync(STAGE, { recursive: true, force: true });
  const app = path.join(STAGE, 'app');
  for (const f of APP_FILES) fs.cpSync(path.join(ROOT, f), path.join(app, f), { recursive: true });
  // Tells the updater this copy came from the installer (lib/updater.js).
  fs.writeFileSync(path.join(app, '.setup'), 'Installed by NursesLog-Setup.exe. Updates come from github.com/c3dprints/nurse-log-releases.\n');
  console.log('installing packages...');
  execFileSync('npm', ['ci', '--omit=dev', '--no-audit', '--no-fund'], { cwd: app, shell: true, stdio: 'inherit' });
  fs.mkdirSync(path.join(STAGE, 'node'), { recursive: true });
  fs.copyFileSync(path.join(node, 'node.exe'), path.join(STAGE, 'node', 'node.exe'));
  fs.copyFileSync(path.join(node, 'LICENSE'), path.join(STAGE, 'node', 'LICENSE'));

  fs.mkdirSync(DIST, { recursive: true });
  execFileSync(iscc(), ['/Q', `/DAppVer=${version}`, `/O${DIST}`, path.join(ROOT, 'installer', 'nurse-log.iss')], { stdio: 'inherit' });
  const exe = path.join(DIST, `NursesLog-Setup-${version}.exe`);
  const sum = `${exe}.sha256`;
  fs.writeFileSync(sum, `${sha256(fs.readFileSync(exe))}  ${path.basename(exe)}\n`);
  return { exe, sum, version };
}

module.exports = { build };

if (require.main === module) {
  build().then(({ exe }) => console.log(`built ${exe}`), (e) => { console.error(`build stopped: ${e.message}`); process.exit(1); });
}
