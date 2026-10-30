'use strict';
// Windows notifications for medication reminders (scripts/toast.ps1). Installed copies
// use the app's own ID, which the Start menu shortcut carries, so the notification
// shows the Nurse's Log name and icon and clicking it opens the app (nurseslog: link,
// registered by the installer). Other copies borrow PowerShell's ID.

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const APP_ID = 'c3dprints.NursesLog';
const POWERSHELL_ID = '{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\\WindowsPowerShell\\v1.0\\powershell.exe';

function appId() {
  const lnk = path.join(process.env.APPDATA || '', 'Microsoft', 'Windows', 'Start Menu', 'Programs', "Nurse's Log.lnk");
  return fs.existsSync(lnk) ? APP_ID : POWERSHELL_ID;
}

function showToast(appDir, { title, body, launch = 'nurseslog:today' }) {
  if (process.platform !== 'win32') return;
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', path.join(appDir, 'scripts', 'toast.ps1')], {
    stdio: 'ignore', windowsHide: true,
    env: { ...process.env, NL_TOAST_TITLE: title, NL_TOAST_BODY: body, NL_TOAST_LAUNCH: launch, NL_TOAST_APPID: appId() },
  });
  child.on('error', () => {});
  child.unref();
}

module.exports = { showToast };
