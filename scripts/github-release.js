'use strict';
// Makes the GitHub releases for a pushed tag:
//  - in this (private) repo, with that version's CHANGELOG.md notes and the
//    one-click Git installer (scripts/Install-NursesLog.cmd);
//  - in the public download repo, with NursesLog-Setup-X.Y.Z.exe, its .sha256 and .sig,
//    which installed copies update from (lib/updater.js).
// `npm run release` calls it; `node scripts/github-release.js v1.2.3 [--setup-only]` redoes one by hand.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const INSTALLER = path.join(__dirname, 'Install-NursesLog.cmd');
const PUBLIC_REPO = 'c3dprints/nurse-log-releases';

function changes(version) {
  const log = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
  const m = log.match(new RegExp(`^## ${version.replace(/\./g, '\\.')}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1].trim() : '';
}

function notesFor(version) {
  return `${changes(version)}\n\n### Install on another PC\n\nEasiest: download **NursesLog-Setup-${version}.exe** from https://github.com/${PUBLIC_REPO}/releases/latest and run it; nothing else is needed.\n\nFor a Git copy instead, download **Install-NursesLog.cmd** below and double-click it (needs Git, Node.js LTS and a GitHub sign-in that can see this repo).\n`;
}

function publicNotes(version) {
  return `## Install\n\nDownload **NursesLog-Setup-${version}.exe** below and run it. It installs for the signed-in Windows user, with no admin rights, Git or Node.js needed, and puts Nurse's Log on the Desktop and in the Start menu.\n\nWindows may say "Windows protected your PC" because the installer is not code-signed yet: click **More info**, then **Run anyway**.\n\nInstalled copies update themselves from Settings > Updates. Student records stay on the PC (in %APPDATA%\\NurseLog) and are not touched by updates or by uninstalling.\n\n**Beta software** for evaluation and testing only; proprietary, all rights reserved (see the license shown by the installer).\n\n## Changes in ${version}\n\n${changes(version)}\n`;
}

function ghRelease(args, notes) {
  const file = path.join(os.tmpdir(), `nurse-log-notes-${process.pid}.md`);
  fs.writeFileSync(file, notes);
  try {
    execFileSync('gh', ['release', 'create', ...args, '--notes-file', file], { cwd: ROOT, stdio: 'inherit' });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

async function publishSetup(tag) {
  const version = tag.replace(/^v/, '');
  const { exe, sum, sig, version: built } = await require('./build-setup').build();
  if (built !== version) throw new Error(`package.json is ${built}, not ${version}; check out ${tag} first`);
  ghRelease([tag, exe, sum, sig, '--repo', PUBLIC_REPO, '--latest', '--title', `Nurse's Log ${version}`], publicNotes(version));
}

async function publish(tag, { setupOnly = false } = {}) {
  const version = tag.replace(/^v/, '');
  if (!setupOnly) ghRelease([tag, INSTALLER, '--verify-tag', '--latest', '--title', `Nurse's Log ${version}`], notesFor(version));
  await publishSetup(tag);
}

module.exports = { publish, notesFor, publicNotes };

if (require.main === module) {
  const tag = process.argv[2];
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) { console.error('usage: node scripts/github-release.js vX.Y.Z [--setup-only]'); process.exit(1); }
  publish(tag, { setupOnly: process.argv.includes('--setup-only') }).catch((e) => { console.error(e.message); process.exit(1); });
}
