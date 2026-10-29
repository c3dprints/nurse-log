'use strict';
// Nurse’s Log server. Listens on 127.0.0.1 only, so nothing on the network can
// reach it; the app window talks to it through a JSON API. Student data lives
// in %APPDATA%\NurseLog (or NL_DATA), never in the app folder, so updates and
// the git repo never carry student records.

const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const { Db, localDate } = require('./lib/db');
const { Auth, checkEmail, verify } = require('./lib/auth');
const { Records, dayRange } = require('./lib/records');
const excel = require('./lib/excel');
const mailer = require('./lib/mailer');
const dialogs = require('./lib/dialogs');
const updater = require('./lib/updater');
const pkg = require('./package.json');

const APP = 'nurse-log';
const APP_NAME = 'Nurse’s Log';
const APP_DIR = __dirname;
const PORT = Number(process.env.NL_PORT || 8940);
const HOST = '127.0.0.1';
const DATA_DIR = process.env.NL_DATA || path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'NurseLog');
const PUBLIC = path.join(APP_DIR, 'public');
const MAX_BODY = 2 * 1024 * 1024;
const COOKIE = 'nl_session';
const NO_DIALOGS = process.env.NL_NO_DIALOGS === '1'; // tests

fs.mkdirSync(DATA_DIR, { recursive: true });
const LOG_FILE = path.join(DATA_DIR, 'server.log');
function log(msg) {
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > 2 * 1024 * 1024) fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    fs.appendFileSync(LOG_FILE, `${new Date().toISOString()} ${msg}\n`);
  } catch { /* logging must never stop the app */ }
}

let db;
let auth;
let records;

const fail = (code, msg) => Object.assign(new Error(msg), { code });

// ---- updates -------------------------------------------------------------------

let updateBusy = false;
let updateState = { current: pkg.version, available: false, checkedAt: null, error: null };

async function checkForUpdate() {
  if (updateBusy) return updateState;
  updateBusy = true;
  try {
    updateState = { ...(await updater.check(APP_DIR, pkg.version)), checkedAt: Date.now() };
  } catch (e) {
    updateState = { current: pkg.version, available: false, error: e.message, checkedAt: Date.now() };
  } finally {
    updateBusy = false;
  }
  if (updateState.available && db.setting('autoUpdate', false) && updateState.mode === 'release') {
    installUpdate(updateState.latest, null).catch((e) => log(`auto update failed: ${e.message}`));
  }
  return updateState;
}

async function installUpdate(tag, user) {
  if (updateBusy) throw new Error('an update is already running');
  updateBusy = true;
  try {
    await updater.install(APP_DIR, tag);
    db.audit(user, 'app.update', { details: `${pkg.version} -> ${tag}` });
    log(`installed ${tag}, restarting`);
    restart();
  } finally {
    updateBusy = false;
  }
}

// The new process waits for the port in listen(), so it is safe to start it first.
function restart() {
  const child = spawn(process.execPath, [path.join(APP_DIR, 'server.js')], {
    cwd: APP_DIR, detached: true, stdio: 'ignore', windowsHide: true, env: process.env,
  });
  child.unref();
  setTimeout(() => process.exit(0), 300);
}

// ---- exports -------------------------------------------------------------------

function fileStamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${localDate(d.getTime())}_${p(d.getHours())}${p(d.getMinutes())}`;
}

const safeName = (s) => String(s).replace(/[^A-Za-z0-9 _.-]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'export';

// from/to are local dates (YYYY-MM-DD), both days included.
function rangeOf(q) {
  const day = /^\d{4}-\d\d-\d\d$/;
  return {
    from: day.test(q.from || '') ? dayRange(q.from)[0] : null,
    to: day.test(q.to || '') ? dayRange(q.to)[1] : null,
    q: String(q.q || ''),
  };
}

async function buildExport(user, body) {
  const meta = { by: `${user.full_name} (${user.username})`, at: Date.now() };
  const kind = String(body.kind || '');
  let data;
  let base;
  let studentId = null;
  if (kind === 'student') {
    studentId = Number(body.studentId);
    const s = records.student(studentId);
    data = {
      student: s,
      medications: db.all('SELECT * FROM medications WHERE student_id = ? ORDER BY active DESC, name', [studentId]),
      given: records.givenLog({ studentId, limit: 10000 }),
      visits: records.visitLog({ studentId, limit: 10000 }),
    };
    base = `${safeName(s.last_name)}_${safeName(s.first_name)}`;
  } else if (kind === 'students') {
    data = records.searchStudents({ q: body.q || '', grade: body.grade || '', archived: !!body.archived, limit: 2000 });
    base = 'Students';
  } else if (kind === 'visits') {
    data = records.visitLog({ ...rangeOf(body), limit: 10000 });
    base = 'Visit-log';
  } else if (kind === 'given') {
    data = records.givenLog({ ...rangeOf(body), limit: 10000 });
    base = 'Medication-log';
  } else if (kind === 'audit') {
    if (user.role !== 'admin') throw fail(403, 'only an admin can export the audit log');
    data = records.auditLog({ ...rangeOf(body), limit: 20000 });
    base = 'Audit-log';
  } else if (kind === 'all') {
    data = {
      students: db.all('SELECT * FROM students ORDER BY last_name, first_name'),
      medications: db.all('SELECT m.*, s.first_name, s.last_name FROM medications m JOIN students s ON s.id = m.student_id ORDER BY s.last_name, s.first_name, m.name'),
      given: records.givenLog({ limit: 10000 }),
      visits: records.visitLog({ limit: 10000 }),
    };
    base = 'Nurse-Log-all-records';
  } else {
    throw fail(400, 'unknown export');
  }
  const buf = await excel.build(kind, data, meta);
  return { buf, name: `${base}_${fileStamp()}.xlsx`, studentId };
}

// Writes buf where the nurse asked: a Save As dialog, the default save folder,
// or back to the app window as a download. Every export is audited.
async function deliver(user, { buf, name, studentId }, target, what) {
  const folder = db.setting('exportFolder', '') || '';
  let file = null;
  if (target === 'saveas') {
    if (NO_DIALOGS) throw fail(400, 'dialogs are off');
    const filter = name.endsWith('.xlsx') ? 'Excel workbook (*.xlsx)|*.xlsx' : 'Nurse’s Log backup (*.sqlite)|*.sqlite';
    file = await dialogs.saveAs({ defaultName: name, folder, filter });
    if (!file) return { cancelled: true };
  } else if (target === 'folder') {
    if (!folder) throw fail(400, 'set a default save folder in Settings first');
    if (!fs.existsSync(folder)) throw fail(400, `save folder not found: ${folder}`);
    file = path.join(folder, name);
  } else if (target !== 'download') {
    throw fail(400, 'bad target');
  }
  if (file) fs.writeFileSync(file, buf);
  db.audit(user, `export.${what}`, { studentId, details: { to: target, file: file || name, bytes: buf.length } });
  return file ? { path: file } : { download: true };
}

// ---- http ----------------------------------------------------------------------

const ALLOWED_HOSTS = new Set([`127.0.0.1:${PORT}`, `localhost:${PORT}`]);
const ALLOWED_ORIGINS = new Set([`http://127.0.0.1:${PORT}`, `http://localhost:${PORT}`]);

// Any web page can fire requests at localhost. The Host check stops DNS
// rebinding; Sec-Fetch-Site and Origin keep other sites off the API; the custom
// header on POST forces a CORS preflight we never answer.
function guard(req) {
  if (!ALLOWED_HOSTS.has(req.headers.host)) return 'bad host';
  const site = req.headers['sec-fetch-site'];
  if (req.url.startsWith('/api/') && site && site !== 'same-origin' && site !== 'none') return 'cross-site request';
  const o = req.headers.origin;
  if (o && !ALLOWED_ORIGINS.has(o)) return 'bad origin';
  if (req.method === 'POST' && req.headers['x-nurse-log'] !== '1') return 'missing header';
  return null;
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; img-src 'self' data: blob:; frame-ancestors 'none'",
};

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  const data = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body);
  res.writeHead(code, { 'Content-Type': type, ...SECURITY_HEADERS, ...extra });
  res.end(data);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
    });
    req.on('end', () => {
      if (size > MAX_BODY) return reject(fail(413, 'body too large'));
      if (!chunks.length) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(fail(400, 'bad json')); }
    });
    req.on('error', reject);
  });
}

function cookieToken(req) {
  const m = /(?:^|;\s*)nl_session=([A-Za-z0-9_-]+)/.exec(req.headers.cookie || '');
  return m ? m[1] : null;
}

const setCookie = (token) => ({ 'Set-Cookie': `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/` });
const clearCookie = { 'Set-Cookie': `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` };

function settingsPublic() {
  const s = db.setting('smtp', {}) || {};
  return {
    schoolName: db.setting('schoolName', ''),
    idleMinutes: db.setting('idleMinutes', 15),
    exportFolder: db.setting('exportFolder', ''),
    autoUpdate: db.setting('autoUpdate', false),
    smtp: { host: s.host || '', port: s.port || 587, user: s.user || '', from: s.from || '', hasPass: !!s.pass },
    dataDir: DATA_DIR,
  };
}

// Reset emails: at most one a minute per account.
const lastResetMail = new Map();

// Routes. `open` ones work signed out; `admin` ones need the admin role;
// `allowMustChange` ones work before a temporary password has been replaced.
// Handlers get { body, query, params, user, token, res }.
const routes = [];
function route(method, pattern, opts, fn) {
  if (typeof opts === 'function') { fn = opts; opts = {}; }
  const re = new RegExp('^' + pattern.replace(/:id/g, '(\\d+)') + '$');
  routes.push({ method, re, fn, ...opts });
}

route('GET', '/api/ping', { open: true }, () => ({ app: APP, version: pkg.version }));

route('GET', '/api/state', { open: true }, ({ user }) => ({
  app: APP, version: pkg.version, needsSetup: auth.needsSetup(),
  schoolName: db.setting('schoolName', ''), user: auth.publicUser(user),
  emailReady: mailer.configured(db.setting('smtp', {})), idleMinutes: db.setting('idleMinutes', 15),
  exportFolder: user ? db.setting('exportFolder', '') : '',
}));

route('POST', '/api/setup', { open: true }, ({ body, res }) => {
  if (!auth.needsSetup()) throw fail(400, 'setup is already done');
  let made;
  try {
    made = auth.createUser({ ...body, role: 'admin' });
  } catch (e) {
    throw fail(400, e.message);
  }
  if (body.schoolName) db.setSetting('schoolName', String(body.schoolName).trim().slice(0, 120));
  db.run('UPDATE users SET last_login = ? WHERE id = ?', [Date.now(), made.user.id]);
  db.audit(made.user, 'setup', { details: 'first admin account created' });
  res.extraHeaders = setCookie(auth.startSession(made.user.id));
  return { user: auth.publicUser(made.user), recovery: made.recovery };
});

route('POST', '/api/login', { open: true }, ({ body, res }) => {
  const r = auth.login(body.username, body.password);
  if (r.error) {
    if (r.user) db.audit(r.user, 'login.failed', { details: r.error });
    throw fail(401, r.error);
  }
  db.audit(r.user, 'login');
  res.extraHeaders = setCookie(r.token);
  return { user: auth.publicUser(r.user) };
});

route('POST', '/api/logout', { open: true }, ({ user, token, body, res }) => {
  if (user) db.audit(user, body.idle ? 'logout.idle' : 'logout');
  auth.logout(token);
  res.extraHeaders = clearCookie;
  return { ok: true };
});

// Same answer whether or not the account exists, so the form cannot be used to find usernames.
route('POST', '/api/reset/request', { open: true }, async ({ body }) => {
  const smtp = db.setting('smtp', {});
  if (!mailer.configured(smtp)) return { sent: false, emailReady: false };
  const u = auth.byLogin(body.login);
  if (u && u.active && Date.now() - (lastResetMail.get(u.id) || 0) > 60000) {
    lastResetMail.set(u.id, Date.now());
    const code = auth.makeResetCode(u.id);
    try {
      await mailer.send(smtp, { to: u.email, subject: `${APP_NAME} password reset code`, text: mailer.resetText(u, code, APP_NAME) });
      db.audit(u, 'password.reset-requested', { details: 'code emailed' });
    } catch (e) {
      log(`reset mail failed: ${e.message}`);
      db.audit(u, 'password.reset-mail-failed', { details: e.message });
    }
  }
  return { sent: true, emailReady: true };
});

route('POST', '/api/reset/finish', { open: true }, ({ body }) => {
  const u = auth.byLogin(body.login);
  if (!u) throw fail(400, 'code is wrong or expired');
  let how;
  try {
    how = auth.useResetCode(u.id, body.code);
    auth.setPassword(u.id, body.password);
  } catch (e) {
    db.audit(u, 'password.reset-failed', { details: e.message });
    throw fail(400, e.message);
  }
  auth.endSessionsFor(u.id);
  db.audit(u, 'password.reset', { details: `with ${how} code` });
  return { ok: true, how };
});

// ---- records ----

route('GET', '/api/today', () => records.today());
route('GET', '/api/meds-due', ({ query }) => records.medsDue(/^\d{4}-\d\d-\d\d$/.test(query.day || '') ? query.day : null));

route('GET', '/api/students', ({ query }) => ({
  students: records.searchStudents({ q: query.q || '', grade: query.grade || '', archived: query.archived === '1' }),
  grades: records.grades(),
}));
route('POST', '/api/students', ({ body, user }) => records.createStudent(user, body));
route('GET', '/api/students/:id', ({ params, user }) => records.board(user, params.id));
route('POST', '/api/students/:id', ({ params, body, user }) => records.updateStudent(user, params.id, body));
route('POST', '/api/students/:id/archive', ({ params, body, user }) => records.setArchived(user, params.id, !!body.archived));
route('POST', '/api/students/:id/meds', ({ params, body, user }) => records.createMedication(user, params.id, body));
route('POST', '/api/students/:id/visits', ({ params, body, user }) => records.createVisit(user, params.id, body));

route('POST', '/api/meds/:id', ({ params, body, user }) => records.updateMedication(user, params.id, body));
route('POST', '/api/meds/:id/give', ({ params, body, user }) => records.recordGiven(user, params.id, body));
route('POST', '/api/given/:id/delete', { admin: true }, ({ params, user }) => { records.deleteGiven(user, params.id); return { ok: true }; });

route('POST', '/api/visits/:id', ({ params, body, user }) => records.updateVisit(user, params.id, body));
route('POST', '/api/visits/:id/delete', { admin: true }, ({ params, user }) => { records.deleteVisit(user, params.id); return { ok: true }; });

route('GET', '/api/visits', ({ query }) => records.visitLog({ ...rangeOf(query), limit: 2000 }));
route('GET', '/api/given', ({ query }) => records.givenLog({ ...rangeOf(query), limit: 2000 }));
route('GET', '/api/audit', { admin: true }, ({ query }) => records.auditLog({ ...rangeOf(query), limit: 2000 }));

route('POST', '/api/export', async ({ body, user, res }) => {
  const out = await buildExport(user, body);
  const r = await deliver(user, out, body.target || 'download', body.kind);
  if (r.download) res.fileDownload = out;
  return r;
});

route('POST', '/api/backup', { admin: true }, async ({ body, user }) => {
  db.save();
  const buf = fs.readFileSync(db.file);
  const target = body.target === 'folder' ? 'folder' : 'saveas';
  return deliver(user, { buf, name: `Nurse-Log-backup_${fileStamp()}.sqlite`, studentId: null }, target, 'backup');
});

// ---- account ----

route('POST', '/api/account', { allowMustChange: true }, ({ body, user }) => {
  const fullName = String(body.fullName ?? user.full_name).trim();
  const email = String(body.email ?? user.email).trim();
  if (!fullName) throw fail(400, 'enter a full name');
  const e = checkEmail(email);
  if (e) throw fail(400, e);
  db.run('UPDATE users SET full_name = ?, email = ? WHERE id = ?', [fullName, email, user.id]);
  db.audit(user, 'account.update', { details: { fullName, email } });
  return auth.publicUser(auth.user(user.id));
});

route('POST', '/api/account/password', { allowMustChange: true }, ({ body, user, token }) => {
  try {
    auth.changePassword(user.id, body.current, body.next);
  } catch (e) {
    throw fail(400, e.message);
  }
  auth.endSessionsFor(user.id, token);
  db.audit(user, 'password.change');
  return auth.publicUser(auth.user(user.id));
});

route('POST', '/api/account/recovery', { allowMustChange: true }, ({ body, user }) => {
  if (!verify(body.password, user.pass_hash)) throw fail(400, 'password is wrong');
  const code = auth.newRecoveryCode(user.id);
  db.audit(user, 'account.recovery-code');
  return { recovery: code };
});

// ---- admin: users and settings ----

route('GET', '/api/users', { admin: true }, () => db.all('SELECT * FROM users ORDER BY active DESC, full_name').map((u) => auth.publicUser(u)));

route('POST', '/api/users', { admin: true }, ({ body, user }) => {
  let made;
  try {
    made = auth.createUser({ ...body, mustChange: true });
  } catch (e) {
    throw fail(400, e.message);
  }
  db.audit(user, 'user.create', { entity: 'user', entityId: made.user.id, details: { username: made.user.username, role: made.user.role } });
  return { user: auth.publicUser(made.user), recovery: made.recovery };
});

route('POST', '/api/users/:id', { admin: true }, ({ params, body, user }) => {
  const u = auth.user(params.id);
  if (!u) throw fail(404, 'user not found');
  const fullName = String(body.fullName ?? u.full_name).trim();
  const email = String(body.email ?? u.email).trim();
  const role = body.role ?? u.role;
  const active = body.active == null ? u.active : body.active ? 1 : 0;
  if (!fullName) throw fail(400, 'enter a full name');
  const e = checkEmail(email);
  if (e) throw fail(400, e);
  if (!['admin', 'nurse'].includes(role)) throw fail(400, 'bad role');
  if (u.role === 'admin' && (role !== 'admin' || !active)) {
    const admins = db.get("SELECT COUNT(*) AS n FROM users WHERE role = 'admin' AND active = 1").n;
    if (admins <= 1) throw fail(400, 'keep at least one active admin');
  }
  db.run('UPDATE users SET full_name = ?, email = ?, role = ?, active = ? WHERE id = ?', [fullName, email, role, active, u.id]);
  if (!active) auth.endSessionsFor(u.id);
  db.audit(user, 'user.update', { entity: 'user', entityId: u.id, details: { username: u.username, fullName, email, role, active: !!active } });
  return auth.publicUser(auth.user(u.id));
});

route('POST', '/api/users/:id/password', { admin: true }, ({ params, body, user }) => {
  const u = auth.user(params.id);
  if (!u) throw fail(404, 'user not found');
  try {
    auth.setPassword(u.id, body.password, { mustChange: true });
  } catch (e) {
    throw fail(400, e.message);
  }
  auth.endSessionsFor(u.id);
  db.audit(user, 'user.password-set', { entity: 'user', entityId: u.id, details: u.username });
  return { ok: true };
});

route('GET', '/api/settings', { admin: true }, () => ({ settings: settingsPublic(), update: { ...updateState, busy: updateBusy } }));

route('POST', '/api/settings', { admin: true }, ({ body, user }) => {
  const changed = {};
  if ('schoolName' in body) { db.setSetting('schoolName', String(body.schoolName || '').trim().slice(0, 120)); changed.schoolName = true; }
  if ('idleMinutes' in body) {
    const n = Math.round(Number(body.idleMinutes));
    if (!(n >= 1 && n <= 240)) throw fail(400, 'auto sign-out must be 1 to 240 minutes');
    db.setSetting('idleMinutes', n);
    changed.idleMinutes = n;
  }
  if ('exportFolder' in body) {
    const f = String(body.exportFolder || '').trim();
    if (f && !fs.existsSync(f)) throw fail(400, `folder not found: ${f}`);
    db.setSetting('exportFolder', f);
    changed.exportFolder = f;
  }
  if ('autoUpdate' in body) { db.setSetting('autoUpdate', !!body.autoUpdate); changed.autoUpdate = !!body.autoUpdate; }
  if (body.smtp) {
    const old = db.setting('smtp', {}) || {};
    const s = body.smtp;
    const next = {
      host: String(s.host || '').trim(),
      port: Number(s.port) || 587,
      user: String(s.user || '').trim(),
      from: String(s.from || '').trim(),
      pass: s.pass ? String(s.pass) : s.clearPass ? '' : old.pass || '',
    };
    db.setSetting('smtp', next);
    changed.smtp = { host: next.host, port: next.port, user: next.user, from: next.from, passChanged: !!s.pass || !!s.clearPass };
  }
  db.audit(user, 'settings.update', { details: changed });
  return settingsPublic();
});

route('POST', '/api/settings/test-email', { admin: true }, async ({ user }) => {
  try {
    await mailer.send(db.setting('smtp', {}), { to: user.email, subject: `${APP_NAME} test email`, text: `Email from ${APP_NAME} works. Password reset codes will arrive like this one.` });
  } catch (e) {
    throw fail(400, `send failed: ${e.message}`);
  }
  db.audit(user, 'settings.test-email', { details: user.email });
  return { sentTo: user.email };
});

route('POST', '/api/settings/pick-folder', { admin: true }, async () => {
  if (NO_DIALOGS) throw fail(400, 'dialogs are off');
  return { folder: await dialogs.pickFolder({ folder: db.setting('exportFolder', ''), title: 'Default folder for "Save to folder"' }) };
});

route('POST', '/api/update/check', { admin: true }, () => checkForUpdate());
route('POST', '/api/update/install', { admin: true }, ({ user }) => {
  if (!updateState.available) throw fail(400, 'no update available');
  installUpdate(updateState.latest, user).catch((e) => log(`update failed: ${e.message}`));
  return { installing: updateState.latest };
});

// ---- static ----

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };

function serveStatic(pathname, res) {
  let rel;
  try { rel = decodeURIComponent(pathname); } catch { return send(res, 400, 'bad path', 'text/plain'); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return send(res, 404, 'not found', 'text/plain');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
}

async function handle(req, res) {
  const bad = guard(req);
  if (bad) return send(res, 403, { error: bad });
  const url = new URL(req.url, 'http://x');
  if (!url.pathname.startsWith('/api/')) return req.method === 'GET' ? serveStatic(url.pathname, res) : send(res, 405, { error: 'method' });

  const r = routes.find((x) => x.method === req.method && x.re.test(url.pathname));
  if (!r) return send(res, 404, { error: 'not found' });
  const m = r.re.exec(url.pathname);
  const params = { id: m[1] ? Number(m[1]) : null };

  const token = cookieToken(req);
  const user = auth.session(token);
  try {
    if (!r.open) {
      if (!user) throw fail(401, 'signed out');
      if (user.must_change && !r.allowMustChange) throw fail(403, 'change your password first');
      if (r.admin && user.role !== 'admin') throw fail(403, 'admins only');
    }
    const body = req.method === 'POST' ? await readBody(req) : {};
    const out = await r.fn({ body, query: Object.fromEntries(url.searchParams), params, user, token, res });
    if (res.fileDownload) {
      const { buf, name } = res.fileDownload;
      return send(res, 200, buf, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', {
        'Content-Disposition': `attachment; filename="${name}"`,
      });
    }
    send(res, 200, out ?? { ok: true }, undefined, res.extraHeaders || {});
  } catch (e) {
    const code = Number.isInteger(e.code) && e.code >= 400 && e.code < 600 ? e.code : 500;
    if (code === 500) log(`${req.method} ${url.pathname}: ${e.stack || e.message}`);
    send(res, code, { error: code === 500 ? `something went wrong: ${e.message}` : e.message }, undefined, res.extraHeaders || {});
  }
}

const server = http.createServer((req, res) => {
  handle(req, res).catch((e) => {
    log(`unhandled: ${e.stack || e.message}`);
    if (!res.headersSent) send(res, 500, { error: 'server error' });
  });
});

server.once('listening', () => log(`v${pkg.version} listening on http://${HOST}:${PORT}, data in ${DATA_DIR}`));

// After an update the old server may still hold the port for a moment.
let tries = 0;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE' && tries++ < 40) return setTimeout(() => server.listen(PORT, HOST), 250);
  log(`listen failed: ${e.message}`);
  process.exit(1);
});

(async () => {
  db = await Db.open(DATA_DIR);
  auth = new Auth(db);
  records = new Records(db);
  server.listen(PORT, HOST);
  if (process.env.NL_NO_UPDATE_CHECK !== '1') {
    setTimeout(() => checkForUpdate().catch(() => {}), 15000);
    setInterval(() => checkForUpdate().catch(() => {}), 6 * 60 * 60 * 1000).unref();
  }
  setInterval(() => { try { db.backup(); } catch (e) { log(`backup failed: ${e.message}`); } }, 60 * 60 * 1000).unref();
})().catch((e) => {
  log(`start failed: ${e.stack || e.message}`);
  process.exit(1);
});
