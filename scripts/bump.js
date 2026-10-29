'use strict';
// Sets the next version: `npm run bump`
// Reads the newest release tag, works out the next number by the rule in
// version.js, writes it to package.json and package-lock.json, and adds an
// empty CHANGELOG.md entry to fill in before `npm run release`.

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { nextVersion } = require('./version');
const { latestTag } = require('../lib/updater');

const ROOT = path.join(__dirname, '..');
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim();

try { git(['fetch', '--tags', '--quiet', 'origin']); } catch { /* offline: use local tags */ }
const latest = latestTag(git(['tag', '-l', 'v*']).split('\n'));
const next = nextVersion(latest);

for (const file of ['package.json', 'package-lock.json']) {
  const p = path.join(ROOT, file);
  const j = JSON.parse(fs.readFileSync(p, 'utf8'));
  j.version = next;
  if (j.packages && j.packages['']) j.packages[''].version = next;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
}

const logFile = path.join(ROOT, 'CHANGELOG.md');
const log = fs.readFileSync(logFile, 'utf8').replace(/\r\n/g, '\n');
if (!log.includes(`## ${next}\n`)) fs.writeFileSync(logFile, log.replace('# Changelog\n\n', `# Changelog\n\n## ${next}\n\n- \n\n`));

console.log(`${latest || 'no release yet'} -> ${next}. Fill in CHANGELOG.md, commit, then npm run release.`);
