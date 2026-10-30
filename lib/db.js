'use strict';
// The database: one SQLite file (sql.js, no native build) in the data folder.
// Every write is saved to disk at once through a temp file and rename, so a
// crash or power cut never leaves half a file. A copy is kept per day in
// backups/ and the oldest are pruned.

const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');

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
const ADDED_COLUMNS = { students: ['home_meds', 'med_consent', 'pharmacy', 'med_notes'] };

const KEEP_BACKUPS = 30;

class Db {
  static async open(dataDir) {
    const SQL = await initSqlJs();
    fs.mkdirSync(dataDir, { recursive: true });
    const file = path.join(dataDir, 'nurse-log.sqlite');
    const db = fs.existsSync(file) ? new SQL.Database(fs.readFileSync(file)) : new SQL.Database();
    const me = new Db(db, file, dataDir);
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

  save() {
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, Buffer.from(this.db.export()));
    fs.renameSync(tmp, this.file);
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

module.exports = { Db, localDate };
