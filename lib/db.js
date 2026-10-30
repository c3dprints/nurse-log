'use strict';
// The database: one SQLite file (sql.js, no native build) in the data folder.
// Every write is saved to disk at once through a temp file and rename, so a
// crash or power cut never leaves half a file. A copy is kept per day in
// backups/ and the oldest are pruned. Once encryption is on, the file and every
// backup are sealed with the data key (lib/vault.js).

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const vault = require('./vault');

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'nurse',
  pass_hash TEXT NOT NULL,
  must_change INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1,
  failed INTEGER NOT NULL DEFAULT 0,
  locked_until INTEGER NOT NULL DEFAULT 0,
  recovery_hash TEXT,
  created_at INTEGER NOT NULL,
  last_login INTEGER
);
CREATE TABLE IF NOT EXISTS reset_codes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  code_hash TEXT NOT NULL,
  expires INTEGER NOT NULL,
  tries INTEGER NOT NULL DEFAULT 0,
  used INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY,
  student_no TEXT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  dob TEXT,
  grade TEXT,
  homeroom TEXT,
  sex TEXT,
  guardian_name TEXT,
  guardian_phone TEXT,
  guardian2_name TEXT,
  guardian2_phone TEXT,
  physician TEXT,
  physician_phone TEXT,
  allergies TEXT,
  conditions TEXT,
  notes TEXT,
  home_meds TEXT,
  med_consent TEXT,
  pharmacy TEXT,
  med_notes TEXT,
  archived INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS medications (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  dose TEXT,
  route TEXT,
  times TEXT,
  prn INTEGER NOT NULL DEFAULT 0,
  start_date TEXT,
  end_date TEXT,
  prescriber TEXT,
  instructions TEXT,
  on_hand INTEGER,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS med_given (
  id INTEGER PRIMARY KEY,
  medication_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  given_at INTEGER NOT NULL,
  scheduled TEXT,
  dose TEXT,
  status TEXT NOT NULL DEFAULT 'given',
  notes TEXT,
  user_id INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS visits (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  visit_at INTEGER NOT NULL,
  complaint TEXT,
  assessment TEXT,
  treatment TEXT,
  disposition TEXT,
  temp TEXT,
  parent_contacted INTEGER NOT NULL DEFAULT 0,
  notes TEXT,
  user_id INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit (
  id INTEGER PRIMARY KEY,
  at INTEGER NOT NULL,
  user_id INTEGER,
  username TEXT,
  action TEXT NOT NULL,
  entity TEXT,
  entity_id INTEGER,
  student_id INTEGER,
  details TEXT
);
CREATE TABLE IF NOT EXISTS devices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  name TEXT,
  created_at INTEGER NOT NULL,
  last_used INTEGER,
  expires INTEGER NOT NULL,
  pin_fails INTEGER NOT NULL DEFAULT 0,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_devices_token ON devices(token_hash);
CREATE TABLE IF NOT EXISTS photos (
  kind TEXT NOT NULL,
  owner_id INTEGER NOT NULL,
  jpeg BLOB NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (kind, owner_id)
);
CREATE TABLE IF NOT EXISTS push_subs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS immunizations (
  id INTEGER PRIMARY KEY,
  student_id INTEGER NOT NULL,
  vaccine TEXT NOT NULL,
  dose_no TEXT,
  given_on TEXT,
  source TEXT,
  notes TEXT,
  user_id INTEGER,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_imm_student ON immunizations(student_id, vaccine);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
CREATE INDEX IF NOT EXISTS ix_students_name ON students(last_name, first_name);
CREATE INDEX IF NOT EXISTS ix_meds_student ON medications(student_id);
CREATE INDEX IF NOT EXISTS ix_given_student ON med_given(student_id, given_at);
CREATE INDEX IF NOT EXISTS ix_visits_student ON visits(student_id, visit_at);
CREATE INDEX IF NOT EXISTS ix_visits_at ON visits(visit_at);
CREATE INDEX IF NOT EXISTS ix_audit_at ON audit(at);
`;

// Columns added after 1.0.3; CREATE TABLE IF NOT EXISTS skips existing tables.
const ADDED_COLUMNS = {
  students: ['home_meds', 'med_consent', 'pharmacy', 'med_notes', 'med_alerts', 'archived_at', 'imm_status', 'imm_notes'],
  medications: ['days'],
  users: ['totp_secret', 'totp_on', 'totp_last'],
};

const KEEP_BACKUPS = 30;
const DB_FILE = 'nurse-log.sqlite';

// Thrown by Db.open when the records file is encrypted and this PC's key cannot
// open it; the records recovery key unlocks it (Db.unlock).
class LockedError extends Error {
  constructor() {
    super('the records file is encrypted and this Windows account does not have its key');
    this.locked = true;
  }
}

class Db {
  static async open(dataDir) {
    const SQL = await initSqlJs();
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, DB_FILE);
    let raw = fs.existsSync(file) ? fs.readFileSync(file) : null;
    let key = null;
    let header = null;
    if (raw && vault.isSealed(raw)) {
      ({ header } = vault.headerOf(raw));
      key = vault.loadKey(dataDir);
      if (!key || vault.check(key) !== header.check) throw new LockedError();
      raw = vault.unseal(raw, key);
    }
    const db = raw ? new SQL.Database(raw) : new SQL.Database();
    const me = new Db(db, file, dataDir);
    me.key = key;
    me.header = header;
    db.exec(SCHEMA);
    for (const [table, cols] of Object.entries(ADDED_COLUMNS)) {
      const have = new Set(me.all(`PRAGMA table_info(${table})`).map((c) => c.name));
      for (const c of cols) if (!have.has(c)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${c} TEXT`);
    }
    me.save();
    me.backup();
    return me;
  }

  constructor(db, file, dataDir) {
    this.db = db;
    this.file = file;
    this.dataDir = dataDir;
    this.inTx = false;
  }

  all(sql, params = []) {
    const st = this.db.prepare(sql);
    try {
      st.bind(params);
      const rows = [];
      while (st.step()) rows.push(st.getAsObject());
      return rows;
    } finally {
      st.free();
    }
  }

  get(sql, params = []) {
    return this.all(sql, params)[0] || null;
  }

  // Runs a write and saves the file, unless inside tx() which saves once at the end.
  run(sql, params = []) {
    this.db.run(sql, params);
    const changes = this.db.getRowsModified();
    const id = this.db.exec('SELECT last_insert_rowid()')[0].values[0][0];
    if (!this.inTx) this.save();
    return { id, changes };
  }

  tx(fn) {
    if (this.inTx) return fn();
    this.db.run('BEGIN');
    this.inTx = true;
    try {
      const out = fn();
      this.db.run('COMMIT');
      return out;
    } catch (e) {
      this.db.run('ROLLBACK');
      throw e;
    } finally {
      this.inTx = false;
      this.save();
    }
  }

  // The file's bytes as stored on disk: sealed when encryption is on.
  bytes() {
    const plain = Buffer.from(this.db.export());
    return this.key ? vault.seal(plain, this.key, this.header) : plain;
  }

  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, this.bytes());
    fs.renameSync(tmp, this.file);
  }

  get encrypted() {
    return !!this.key;
  }

  // Turns encryption on (or makes a new recovery key when it is on already).
  // Returns the recovery key, shown to the admin once. Older daily backups are
  // sealed too, so no plain copy is left behind.
  encrypt() {
    const code = vault.recoveryKey();
    const fresh = !this.key;
    const key = this.key || require('crypto').randomBytes(32);
    if (fresh) vault.saveKey(this.dataDir, key);
    this.key = key;
    this.header = vault.makeHeader(key, code);
    this.save();
    if (fresh) {
      const dir = path.join(this.dataDir, 'backups');
      for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
        const p = path.join(dir, f);
        const buf = fs.readFileSync(p);
        if (!vault.isSealed(buf)) fs.writeFileSync(p, vault.seal(buf, key, this.header));
      }
    }
    return code;
  }

  // Unlocks an encrypted records file with the recovery key and keeps the data
  // key for this Windows account, so the next start opens without asking.
  static unlock(dataDir, code) {
    const raw = fs.readFileSync(path.join(dataDir, DB_FILE));
    const h = vault.headerOf(raw);
    if (!h) throw new Error('the records file is not encrypted');
    const key = vault.keyFromRecovery(h.header, code);
    if (!key) throw new Error('that recovery key does not open these records');
    vault.saveKey(dataDir, key);
  }

  // Rewrites the file so deleted rows are gone from it, not just marked free.
  vacuum() {
    if (this.inTx) return;
    this.db.run('VACUUM');
    this.save();
  }

  // One copy per day, the newest KEEP_BACKUPS kept.
  backup() {
    const dir = path.join(this.dataDir, 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const target = path.join(dir, `nurse-log-${localDate(Date.now())}.sqlite`);
    if (!fs.existsSync(target)) fs.copyFileSync(this.file, target);
    const old = fs.readdirSync(dir).filter((f) => /^nurse-log-\d{4}-\d\d-\d\d\.sqlite$/.test(f)).sort();
    for (const f of old.slice(0, Math.max(0, old.length - KEEP_BACKUPS))) fs.unlinkSync(path.join(dir, f));
  }

  // Audit entries older than `days` (Settings > Audit log) are deleted; 0 keeps them all.
  pruneAudit(days) {
    if (!(days > 0)) return 0;
    return this.run('DELETE FROM audit WHERE at < ?', [Date.now() - days * 24 * 60 * 60 * 1000]).changes;
  }

  copyTo(target) {
    this.save();
    fs.copyFileSync(this.file, target);
  }

  // Deletes the records file, its key and every daily backup (Settings > Erase
  // everything). The Db must not be used afterwards.
  static erase(dataDir) {
    for (const f of [DB_FILE, DB_FILE + '.tmp', vault.KEY_FILE]) fs.rmSync(path.join(dataDir, f), { force: true });
    fs.rmSync(path.join(dataDir, 'backups'), { recursive: true, force: true });
  }

  setting(key, fallback = null) {
    const r = this.get('SELECT value FROM settings WHERE key = ?', [key]);
    if (!r) return fallback;
    try { return JSON.parse(r.value); } catch { return fallback; }
  }

  setSetting(key, value) {
    this.run('INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value', [key, JSON.stringify(value)]);
  }

  audit(user, action, { entity = null, entityId = null, studentId = null, details = null } = {}) {
    this.run(
      'INSERT INTO audit(at, user_id, username, action, entity, entity_id, student_id, details) VALUES(?,?,?,?,?,?,?,?)',
      [Date.now(), user ? user.id : null, user ? user.username : null, action, entity, entityId, studentId,
        details == null ? null : typeof details === 'string' ? details : JSON.stringify(details)],
    );
  }
}

function localDate(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

module.exports = { Db, LockedError, localDate };
