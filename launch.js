'use strict';
// One-click launcher: starts the server hidden if it is not running, then opens
// the app window. `--background` starts the server only; `nurseslog:<page>` (a clicked
// Windows notification, see scripts/launch.vbs) opens the window on that page.
// Safe to run any number of times.

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.NL_PORT || 8940);
const URL = `http://127.0.0.1:${PORT}/`;
const background = process.argv.includes('--background');
const link = process.argv.map((a) => /^nurseslog:(today|calendar)$/i.exec(a)).find(Boolean);
const START = link ? `${URL}#/${link[1].toLowerCase()}` : URL;

function ping() {
  return new Promise((resolve) => {
    const req = http.get({ host: '127.0.0.1', port: PORT, path: '/api/ping', timeout: 1500 }, (res) => {
      let s = '';
      res.on('data', (c) => { s += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(s).app === 'nurse-log'); } catch { resolve(false); }
      });
    });
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
  });
}

function startServer() {
  const child = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
    cwd: __dirname, detached: true, stdio: 'ignore', windowsHide: true,
  });
  child.unref();
}

function findBrowser() {
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
  const local = process.env.LOCALAPPDATA || '';
  return [
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
    path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
  ].find((p) => fs.existsSync(p));
}

function openWindow() {
  const browser = findBrowser();
  const child = browser
    ? spawn(browser, [`--app=${START}`, '--window-size=1180,860'], { detached: true, stdio: 'ignore' })
    : spawn('cmd.exe', ['/c', 'start', '', START], { detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  // The page asks the server for the app's taskbar icon once it loads (lib/windowicon.js).
}

(async () => {
  if (!(await ping())) {
    startServer();
    for (let i = 0; i < 40 && !(await ping()); i++) await new Promise((r) => setTimeout(r, 250));
  }
  if (!background) openWindow();
})();
