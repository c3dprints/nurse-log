'use strict';
// Real Windows "Save As" and folder pickers. The server runs as the signed-in
// Windows user on the same desktop, so it can open the dialogs itself; the
// result is the path the nurse picked, or null when they cancel.

const { execFile } = require('child_process');

const PRELUDE = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false; Width = 0; Height = 0; StartPosition = 'CenterScreen' }
$owner.Show(); $owner.Activate()
`;

function ps(script, env) {
  return new Promise((resolve, reject) => {
    execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', PRELUDE + script], {
      windowsHide: true, timeout: 10 * 60 * 1000, env: { ...process.env, ...env },
    }, (err, stdout, stderr) => {
      if (err) return reject(new Error(String(stderr).trim().split('\n').pop() || err.message));
      resolve(String(stdout).trim() || null);
    });
  });
}

function saveAs({ defaultName, folder, filter = 'Excel workbook (*.xlsx)|*.xlsx' }) {
  return ps(`
$d = New-Object System.Windows.Forms.SaveFileDialog
$d.Filter = $env:NL_FILTER
$d.FileName = $env:NL_NAME
if ($env:NL_FOLDER -and (Test-Path $env:NL_FOLDER)) { $d.InitialDirectory = $env:NL_FOLDER }
$d.OverwritePrompt = $true
if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.FileName) }
$owner.Close()
`, { NL_NAME: defaultName, NL_FOLDER: folder || '', NL_FILTER: filter });
}

function pickFolder({ folder, title = 'Choose a folder' }) {
  return ps(`
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = $env:NL_TITLE
$d.ShowNewFolderButton = $true
if ($env:NL_FOLDER -and (Test-Path $env:NL_FOLDER)) { $d.SelectedPath = $env:NL_FOLDER }
if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }
$owner.Close()
`, { NL_FOLDER: folder || '', NL_TITLE: title });
}

module.exports = { saveAs, pickFolder };
