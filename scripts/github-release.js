'use strict';
// Makes the GitHub release for a pushed tag, with that version's CHANGELOG.md notes
// and the one-click installer (scripts/Install-NursesLog.cmd) as the download.
// `npm run release` calls it; `node scripts/github-release.js v1.2.3` redoes one by hand.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const INSTALLER = path.join(__dirname, 'Install-NursesLog.cmd');

function notesFor(version) {
  const log = fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8').replace(/\r\n/g, '\n');
  const m = log.match(new RegExp(`^## ${version.replace(/\./g, '\\.')}\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  const body = m ? m[1].trim() : '';
  return `${body}\n\n### Install on another PC\n\nDownload **Install-NursesLog.cmd** below and double-click it. It needs Git and Node.js LTS (it opens their download pages if they are missing) and a GitHub sign-in that can see this repo. Already installed copies update themselves from Settings > Updates.\n`;
}

function publish(tag) {
  const notesFile = path.join(os.tmpdir(), `nurse-log-notes-${tag}.md`);
  fs.writeFileSync(notesFile, notesFor(tag.replace(/^v/, '')));
  try {
    execFileSync('gh', ['release', 'create', tag, INSTALLER, '--verify-tag', '--latest', '--title', `Nurse's Log ${tag.replace(/^v/, '')}`, '--notes-file', notesFile],
      { cwd: ROOT, stdio: 'inherit' });
  } finally {
    fs.rmSync(notesFile, { force: true });
  }
}

module.exports = { publish, notesFor };

if (require.main === module) {
  const tag = process.argv[2];
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '')) { console.error('usage: node scripts/github-release.js vX.Y.Z'); process.exit(1); }
  publish(tag);
}
