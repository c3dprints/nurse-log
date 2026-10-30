'use strict';
// Accounts, sign-in sessions and password resets.
// Passwords and codes are stored only as scrypt hashes. Five wrong passwords
// lock the account for 10 minutes. A session ends after the idle timeout set
// in Settings (15 minutes by default) so an unattended office PC locks itself.

const crypto = require('crypto');

const LOCK_AFTER = 5;
const LOCK_MS = 10 * 60 * 1000;
const RESET_MS = 15 * 60 * 1000;
const RESET_TRIES = 5;
const ROLES = ['admin', 'nurse'];
const DEVICE_DAYS = 30;
const PIN_TRIES = 5;

function hash(secret) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(secret), salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${salt.toString('base64')}$${key.toString('base64')}`;
}

function verify(secret, stored) {
  if (!stored) return false;
  const [kind, salt, key] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const want = Buffer.from(key, 'base64');
  const got = crypto.scryptSync(String(secret), Buffer.from(salt, 'base64'), want.length, { N: 16384, r: 8, p: 1 });
  return crypto.timingSafeEqual(want, got);
}

function checkPassword(pw) {
  pw = String(pw || '');
  if (pw.length < 10) return 'password needs at least 10 characters';
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) return 'password needs letters and numbers';
  return null;
}

// Phone PINs: 4 to 8 digits, not all one digit and not a straight run like 1234.
function checkPin(pin) {
  pin = String(pin || '');
  if (!/^\d{4,8}$/.test(pin)) return 'PIN must be 4 to 8 digits';
  if (/^(\d)\1+$/.test(pin) || '01234567890'.includes(pin) || '09876543210'.includes(pin)) return 'pick a PIN that is harder to guess';
  return null;
}

// Device tokens are long random values, so a plain SHA-256 is enough to look them up.
const sha = (t) => crypto.createHash('sha256').update(String(t)).digest('base64');

function checkEmail(email) {
  return /^[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[^\s@<>()"',;]+$/.test(String(email || '').trim()) ? null : 'enter a valid email address';
}

// Groups of 4 letters/digits without look-alikes (0/O, 1/I/L).
function recoveryCode() {
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 16; i++) s += abc[crypto.randomInt(abc.length)] + (i % 4 === 3 && i < 15 ? '-' : '');
  return s;
}

const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

class Auth {
  constructor(db) {
    this.db = db;
    this.sessions = new Map(); // token -> { userId, last }
  }

  idleMs() {
    return Math.max(1, Number(this.db.setting('idleMinutes', 15))) * 60 * 1000;
  }

  needsSetup() {
    return !this.db.get('SELECT id FROM users LIMIT 1');
  }

  publicUser(u) {
    if (!u) return null;
    return {
      id: u.id, username: u.username, fullName: u.full_name, email: u.email, role: u.role,
      active: !!u.active, mustChange: !!u.must_change, createdAt: u.created_at, lastLogin: u.last_login,
      photoAt: (this.db.get("SELECT updated_at FROM photos WHERE kind = 'user' AND owner_id = ?", [u.id]) || {}).updated_at || null,
    };
  }

  // Creates an account. Returns { user, recovery } where recovery is shown once.
  createUser({ username, fullName, email, password, role = 'nurse', mustChange = false }) {
    username = String(username || '').trim();
    fullName = String(fullName || '').trim();
    email = String(email || '').trim();
    if (!/^[A-Za-z0-9._-]{3,32}$/.test(username)) throw new Error('username: 3 to 32 letters, digits, dot, dash or underscore');
    if (!fullName) throw new Error('enter a full name');
    const e = checkEmail(email) || checkPassword(password);
    if (e) throw new Error(e);
    if (!ROLES.includes(role)) throw new Error('bad role');
    if (this.db.get('SELECT id FROM users WHERE username = ?', [username])) throw new Error('that username is taken');
    const recovery = recoveryCode();
    const { id } = this.db.run(
      'INSERT INTO users(username, full_name, email, role, pass_hash, must_change, recovery_hash, created_at) VALUES(?,?,?,?,?,?,?,?)',
      [username, fullName, email, role, hash(password), mustChange ? 1 : 0, hash(normCode(recovery)), Date.now()],
    );
    return { user: this.user(id), recovery };
  }

  user(id) {
    return this.db.get('SELECT * FROM users WHERE id = ?', [id]);
  }

  byLogin(login) {
    login = String(login || '').trim();
    return this.db.get('SELECT * FROM users WHERE username = ? OR lower(email) = lower(?) ORDER BY id LIMIT 1', [login, login]);
  }

  login(username, password) {
    const u = this.byLogin(username);
    const now = Date.now();
    if (!u || !u.active) {
      verify(password, hash('timing')); // same cost whether or not the name exists
      return { error: 'wrong username or password' };
    }
    if (u.locked_until > now) return { error: `too many tries, try again in ${Math.ceil((u.locked_until - now) / 60000)} min`, user: u };
    if (!verify(password, u.pass_hash)) {
      const failed = u.failed + 1;
      const lock = failed >= LOCK_AFTER ? now + LOCK_MS : 0;
      this.db.run('UPDATE users SET failed = ?, locked_until = ? WHERE id = ?', [lock ? 0 : failed, lock, u.id]);
      return { error: lock ? 'too many tries, account locked for 10 min' : 'wrong username or password', user: u };
    }
    this.db.run('UPDATE users SET failed = 0, locked_until = 0, last_login = ? WHERE id = ?', [now, u.id]);
    return { token: this.startSession(u.id), user: this.user(u.id) };
  }

  startSession(userId) {
    const token = crypto.randomBytes(32).toString('base64url');
    this.sessions.set(token, { userId, last: Date.now() });
    return token;
  }

  // Returns the signed-in user and refreshes the idle timer, or null.
  session(token, touch = true) {
    const s = token && this.sessions.get(token);
    if (!s) return null;
    const now = Date.now();
    if (now - s.last > this.idleMs()) {
      this.sessions.delete(token);
      return null;
    }
    const u = this.user(s.userId);
    if (!u || !u.active) {
      this.sessions.delete(token);
      return null;
    }
    if (touch) s.last = now;
    return u;
  }

  logout(token) {
    this.sessions.delete(token);
  }

  endSessionsFor(userId, except = null) {
    for (const [t, s] of this.sessions) if (s.userId === userId && t !== except) this.sessions.delete(t);
  }

  setPassword(userId, password, { mustChange = false } = {}) {
    const e = checkPassword(password);
    if (e) throw new Error(e);
    this.db.run('UPDATE users SET pass_hash = ?, must_change = ?, failed = 0, locked_until = 0 WHERE id = ?', [hash(password), mustChange ? 1 : 0, userId]);
    this.forgetDevices(userId); // a new password means every remembered phone signs in with it again
  }

  // ---- phones that stay signed in with a PIN ----
  // A remembered phone holds a random token in a cookie; the PIN unlocks it.
  // Five wrong PINs, a new password, a disabled account or 30 days forget it.

  rememberDevice(userId, pin, name) {
    const e = checkPin(pin);
    if (e) throw new Error(e);
    const token = crypto.randomBytes(32).toString('base64url');
    const now = Date.now();
    const { id } = this.db.run('INSERT INTO devices(user_id, token_hash, pin_hash, name, created_at, last_used, expires) VALUES(?,?,?,?,?,?,?)',
      [userId, sha(token), hash(pin), String(name || 'Phone').slice(0, 80), now, now, now + DEVICE_DAYS * 86400000]);
    return { id, token };
  }

  device(token) {
    if (!token) return null;
    const d = this.db.get('SELECT * FROM devices WHERE token_hash = ? AND revoked = 0', [sha(token)]);
    if (!d || d.expires < Date.now()) return null;
    const user = this.user(d.user_id);
    if (!user || !user.active) return null;
    return { ...d, user };
  }

  pinLogin(token, pin) {
    const d = this.device(token);
    if (!d) return { error: 'this phone is no longer remembered; sign in with your password', forgotten: true };
    if (d.user.locked_until > Date.now()) return { error: 'too many tries, sign in with your password later', device: d };
    if (!verify(String(pin || ''), d.pin_hash)) {
      const fails = d.pin_fails + 1;
      if (fails >= PIN_TRIES) {
        this.db.run('UPDATE devices SET revoked = 1, pin_fails = ? WHERE id = ?', [fails, d.id]);
        return { error: 'too many wrong PINs; this phone was forgotten, sign in with your password', device: d, forgotten: true };
      }
      this.db.run('UPDATE devices SET pin_fails = ? WHERE id = ?', [fails, d.id]);
      const left = PIN_TRIES - fails;
      return { error: `wrong PIN, ${left} ${left === 1 ? 'try' : 'tries'} left`, device: d };
    }
    const now = Date.now();
    this.db.run('UPDATE devices SET pin_fails = 0, last_used = ? WHERE id = ?', [now, d.id]);
    this.db.run('UPDATE users SET last_login = ? WHERE id = ?', [now, d.user_id]);
    return { token: this.startSession(d.user_id), user: this.user(d.user_id), device: d };
  }

  devices(userId) {
    return this.db.all('SELECT id, name, created_at, last_used, expires FROM devices WHERE user_id = ? AND revoked = 0 AND expires > ? ORDER BY last_used DESC', [userId, Date.now()]);
  }

  forgetDevice(id, userId) {
    return this.db.run('UPDATE devices SET revoked = 1 WHERE id = ? AND user_id = ? AND revoked = 0', [id, userId]).changes;
  }

  forgetDevices(userId = null) {
    if (userId == null) this.db.run('UPDATE devices SET revoked = 1 WHERE revoked = 0');
    else this.db.run('UPDATE devices SET revoked = 1 WHERE user_id = ? AND revoked = 0', [userId]);
  }

  changePassword(userId, current, next) {
    const u = this.user(userId);
    if (!u || !verify(current, u.pass_hash)) throw new Error('current password is wrong');
    if (current === next) throw new Error('choose a different password');
    this.setPassword(userId, next);
  }

  newRecoveryCode(userId) {
    const code = recoveryCode();
    this.db.run('UPDATE users SET recovery_hash = ? WHERE id = ?', [hash(normCode(code)), userId]);
    return code;
  }

  // Makes a 6 digit email code. Older unused codes for the user stop working.
  makeResetCode(userId) {
    const code = String(crypto.randomInt(0, 1000000)).padStart(6, '0');
    this.db.tx(() => {
      this.db.run('UPDATE reset_codes SET used = 1 WHERE user_id = ? AND used = 0', [userId]);
      this.db.run('INSERT INTO reset_codes(user_id, code_hash, expires) VALUES(?,?,?)', [userId, hash(code), Date.now() + RESET_MS]);
    });
    return code;
  }

  // Accepts either the emailed code or the account recovery code.
  // Returns 'email' or 'recovery' on success, throws otherwise.
  useResetCode(userId, code) {
    const u = this.user(userId);
    if (!u || !u.active) throw new Error('code is wrong or expired');
    const c = normCode(code);
    if (/^\d{6}$/.test(c)) {
      // Asking for a new code does not reset the count: 10 wrong codes in an hour stops email codes for a while.
      const wrong = this.db.get('SELECT COALESCE(SUM(tries), 0) AS n FROM reset_codes WHERE user_id = ? AND expires > ?', [userId, Date.now() - 45 * 60 * 1000]).n;
      if (wrong >= 10) throw new Error('too many wrong codes, try again in an hour or use the recovery code');
      const r = this.db.get('SELECT * FROM reset_codes WHERE user_id = ? AND used = 0 ORDER BY id DESC LIMIT 1', [userId]);
      if (!r || r.expires < Date.now() || r.tries >= RESET_TRIES) throw new Error('code is wrong or expired');
      if (!verify(c, r.code_hash)) {
        this.db.run('UPDATE reset_codes SET tries = tries + 1 WHERE id = ?', [r.id]);
        throw new Error('code is wrong or expired');
      }
      this.db.run('UPDATE reset_codes SET used = 1 WHERE id = ?', [r.id]);
      return 'email';
    }
    if (c.length === 16 && verify(c, u.recovery_hash)) return 'recovery';
    throw new Error('code is wrong or expired');
  }
}

module.exports = { Auth, hash, verify, checkPassword, checkEmail, checkPin, recoveryCode, ROLES };
