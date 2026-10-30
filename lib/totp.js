'use strict';
// Two-step sign-in codes (TOTP, RFC 6238): the 6 digit codes that Microsoft
// Authenticator, Google Authenticator, Authy or a phone's password manager show
// every 30 seconds. No outside service is involved.

const crypto = require('crypto');

const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP = 30;

function base32(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const b of buf) {
    value = ((value << 8) | b) & 0xffff;
    bits += 8;
    while (bits >= 5) { out += ABC[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ABC[(value << (5 - bits)) & 31];
  return out;
}

function unbase32(s) {
  const clean = String(s).toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const out = [];
  for (const c of clean) {
    value = ((value << 5) | ABC.indexOf(c)) & 0xffff;
    bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

const newSecret = () => base32(crypto.randomBytes(20));

function codeAt(secret, step) {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(step));
  const mac = crypto.createHmac('sha1', unbase32(secret)).update(msg).digest();
  const o = mac[mac.length - 1] & 15;
  return String((mac.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0');
}

const stepNow = (now = Date.now()) => Math.floor(now / 1000 / STEP);

// Returns the time step the code belongs to (one step either side allowed for a
// slow phone clock), or null. A step at or before `after` was used already.
function verify(secret, code, { after = -1, now = Date.now() } = {}) {
  const c = String(code || '').replace(/\D/g, '');
  if (c.length !== 6 || !secret) return null;
  const t = stepNow(now);
  for (const s of [t, t - 1, t + 1]) {
    if (s <= after) continue;
    if (crypto.timingSafeEqual(Buffer.from(codeAt(secret, s)), Buffer.from(c))) return s;
  }
  return null;
}

function uri(secret, account, issuer = 'Nurse’s Log') {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
}

module.exports = { newSecret, codeAt, verify, uri, stepNow, base32, unbase32 };
