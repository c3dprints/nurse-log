'use strict';
// Encryption of the records file at rest. The whole SQLite file is sealed with
// AES-256-GCM under a random data key. That key is kept two ways:
//  - in records.key next to the data, locked to this Windows user with DPAPI, so
//    the app opens without asking anything;
//  - inside every sealed file's header, locked with the records recovery key the
//    admin saved, so a backup opens on another PC (or after Windows is reinstalled)
//    with that key typed in.
// Tests and non-Windows dev copies keep the data key in records.key unprotected
// (NL_KEYSTORE=file); a school PC always uses DPAPI.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFileSync } = require('child_process');

const MAGIC = Buffer.from('NLENC1');
const SCRYPT = { N: 1 << 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const KEY_FILE = 'records.key';

// 6 groups of 4 letters/digits without look-alikes, like the account recovery codes.
function recoveryKey() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const groups = [];
  for (let g = 0; g < 6; g++) {
    let s = '';
    for (let i = 0; i < 4; i++) s += abc[crypto.randomInt(abc.length)];
    groups.push(s);
  }
  return groups.join('-');
}

const normKey = (k) => String(k || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const check = (key) => crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);

function gcm(key, plain, aad) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  if (aad) c.setAAD(aad);
  const ct = Buffer.concat([c.update(plain), c.final()]);
  return { iv, tag: c.getAuthTag(), ct };
}

function ungcm(key, { iv, tag, ct }, aad) {
  const d = crypto.createDecipheriv('aes-256-gcm', key, iv);
  if (aad) d.setAAD(aad);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(ct), d.final()]);
}

// The header every sealed file carries: which key sealed it and that key locked
// with the recovery key.
function makeHeader(dataKey, code) {
  const salt = crypto.randomBytes(16);
  const kek = crypto.scryptSync(normKey(code), salt, 32, SCRYPT);
  const w = gcm(kek, dataKey);
  return { v: 1, check: check(dataKey), salt: salt.toString('base64'), iv: w.iv.toString('base64'), tag: w.tag.toString('base64'), key: w.ct.toString('base64') };
}

function keyFromRecovery(header, code) {
  try {
    const kek = crypto.scryptSync(normKey(code), Buffer.from(header.salt, 'base64'), 32, SCRYPT);
    const key = ungcm(kek, { iv: Buffer.from(header.iv, 'base64'), tag: Buffer.from(header.tag, 'base64'), ct: Buffer.from(header.key, 'base64') });
    return check(key) === header.check ? key : null;
  } catch {
    return null;
  }
}

const isSealed = (buf) => Buffer.isBuffer(buf) && buf.length > MAGIC.length + 4 && buf.subarray(0, MAGIC.length).equals(MAGIC);

// MAGIC | header length (4 bytes) | header JSON | iv (12) | tag (16) | ciphertext.
// The header is authenticated too, so it cannot be swapped onto another file.
function seal(plain, dataKey, header) {
  const hj = Buffer.from(JSON.stringify(header));
  const len = Buffer.alloc(4);
  len.writeUInt32BE(hj.length);
  const pre = Buffer.concat([MAGIC, len, hj]);
  const { iv, tag, ct } = gcm(dataKey, plain, pre);
  return Buffer.concat([pre, iv, tag, ct]);
}

function headerOf(buf) {
  if (!isSealed(buf)) return null;
  const len = buf.readUInt32BE(MAGIC.length);
  const start = MAGIC.length + 4;
  return { header: JSON.parse(buf.subarray(start, start + len).toString('utf8')), end: start + len };
}

function unseal(buf, dataKey) {
  const { end } = headerOf(buf);
  return ungcm(dataKey, { iv: buf.subarray(end, end + 12), tag: buf.subarray(end + 12, end + 28), ct: buf.subarray(end + 28) }, buf.subarray(0, end));
}

// ---- the data key on this PC ----------------------------------------------------------

const keystoreKind = () => process.env.NL_KEYSTORE || (process.platform === 'win32' ? 'dpapi' : 'file');

// DPAPI through Windows PowerShell (64-bit, not detached, so it actually runs).
function dpapi(op, b64) {
  const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const script = 'Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); '
    + `[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${op}($b,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser))`;
  return execFileSync(ps, ['-NoProfile', '-NonInteractive', '-Command', script], { input: b64, encoding: 'utf8', windowsHide: true, timeout: 60000 }).trim();
}

function saveKey(dataDir, dataKey) {
  const kind = keystoreKind();
  const b64 = dataKey.toString('base64');
  const body = { v: 1, kind, check: check(dataKey), key: kind === 'dpapi' ? dpapi('Protect', b64) : b64 };
  const file = path.join(dataDir, KEY_FILE);
  fs.writeFileSync(file + '.tmp', JSON.stringify(body));
  fs.renameSync(file + '.tmp', file);
}

// The data key, or null when there is no key file or this Windows user cannot open it.
function loadKey(dataDir) {
  const file = path.join(dataDir, KEY_FILE);
  if (!fs.existsSync(file)) return null;
  try {
    const body = JSON.parse(fs.readFileSync(file, 'utf8'));
    const key = Buffer.from(body.kind === 'dpapi' ? dpapi('Unprotect', body.key) : body.key, 'base64');
    return key.length === 32 && check(key) === body.check ? key : null;
  } catch {
    return null;
  }
}

module.exports = { recoveryKey, normKey, makeHeader, keyFromRecovery, isSealed, seal, unseal, headerOf, saveKey, loadKey, check, KEY_FILE };
