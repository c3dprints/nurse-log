'use strict';
// Plain assert checks, no test framework. `node tests/run-all.js`
// Everything runs against a temp data folder; the HTTP checks start their own
// server on port 8941 so they never touch the real one on 8940 or real records.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');

const ROOT = path.join(__dirname, '..');
const { Db } = require('../lib/db');
const { Auth, hash, verify, checkPassword } = require('../lib/auth');
const { Records, parseTimes } = require('../lib/records');
const excel = require('../lib/excel');
const updater = require('../lib/updater');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nurse-log-test-'));
const results = [];
async function test(name, fn) {
  try {
    await fn();
    results.push([true, name]);
  } catch (e) {
    results.push([false, name, e]);
  }
}

const PW = 'Correct horse 42';

async function unit() {
  const db = await Db.open(path.join(tmp, 'unit'));
  const auth = new Auth(db);
  const rec = new Records(db);

  await test('password hashing', () => {
    const h = hash('abc');
    assert(verify('abc', h));
    assert(!verify('abd', h));
    assert(!verify('abc', 'garbage'));
    assert(checkPassword('short1'));
    assert(checkPassword('longenoughbutnodigits'));
    assert.strictEqual(checkPassword(PW), null);
  });

  let admin;
  let recovery;
  await test('create first user, login, lockout', () => {
    assert(auth.needsSetup());
    ({ user: admin, recovery } = auth.createUser({ username: 'nurse1', fullName: 'Pat Nurse', email: 'pat@example.org', password: PW, role: 'admin' }));
    assert(!auth.needsSetup());
    assert.throws(() => auth.createUser({ username: 'NURSE1', fullName: 'x', email: 'x@y.z', password: PW }), /taken/);
    assert(auth.login('nurse1', PW).token);
    assert(auth.login('pat@example.org', PW).token, 'email works as login');
    for (let i = 0; i < 4; i++) assert.match(auth.login('nurse1', 'wrong').error, /wrong/);
    assert.match(auth.login('nurse1', 'wrong').error, /locked/);
    assert.match(auth.login('nurse1', PW).error, /too many/);
    db.run('UPDATE users SET locked_until = 0 WHERE id = ?', [admin.id]);
    assert(auth.login('nurse1', PW).token);
  });

  await test('sessions expire when idle', () => {
    const t = auth.startSession(admin.id);
    assert(auth.session(t));
    auth.sessions.get(t).last -= 16 * 60 * 1000;
    assert.strictEqual(auth.session(t), null);
  });

  await test('reset codes: email code works once, recovery code works', () => {
    const code = auth.makeResetCode(admin.id);
    assert.throws(() => auth.useResetCode(admin.id, code === '000000' ? '111111' : '000000'), /wrong/);
    assert.strictEqual(auth.useResetCode(admin.id, code), 'email');
    assert.throws(() => auth.useResetCode(admin.id, code), /wrong/);
    assert.strictEqual(auth.useResetCode(admin.id, recovery.toLowerCase()), 'recovery');
    const c2 = auth.makeResetCode(admin.id);
    const c3 = auth.makeResetCode(admin.id);
    if (c2 !== c3) assert.throws(() => auth.useResetCode(admin.id, c2), /wrong/, 'older code stops working');
  });

  await test('parseTimes', () => {
    assert.deepStrictEqual(parseTimes('12:30, 8:00;1400 bad 25:00'), ['08:00', '12:30', '14:00']);
  });

  await test('students, meds, doses, visits, audit', () => {
    const s = rec.createStudent(admin, { first_name: 'Ana', last_name: 'Lopez', student_no: 'S100', grade: '3', allergies: 'Peanuts' });
    assert.throws(() => rec.createStudent(admin, { first_name: 'X', last_name: 'Y', student_no: 'S100' }), /already exists/);
    assert.strictEqual(rec.searchStudents({ q: 'lop' }).length, 1);
    assert.strictEqual(rec.searchStudents({ q: 'peanut' }).length, 1);
    assert.strictEqual(rec.searchStudents({ q: '100%' }).length, 0, 'LIKE wildcards are escaped');
    rec.updateStudent(admin, s.id, { homeroom: 'Rm 12' });
    const m = rec.createMedication(admin, s.id, { name: 'Albuterol', dose: '2 puffs', times: '9:00, 13:00', on_hand: 3 });
    assert.strictEqual(m.times, '09:00, 13:00');
    let due = rec.medsDue();
    assert.strictEqual(due.scheduled.length, 2);
    const g = rec.recordGiven(admin, m.id, { scheduled: '09:00' });
    assert.strictEqual(rec.medication(m.id).on_hand, 2);
    due = rec.medsDue();
    assert(due.scheduled.find((d) => d.time === '09:00').record);
    assert(!due.scheduled.find((d) => d.time === '13:00').record);
    rec.deleteGiven(admin, g.id);
    assert.strictEqual(rec.medication(m.id).on_hand, 3, 'deleting a given dose puts it back');
    const v = rec.createVisit(admin, s.id, { complaint: 'Headache', treatment: 'Rest' });
    assert.throws(() => rec.createVisit(admin, s.id, {}), /reason/);
    rec.updateVisit(admin, v.id, { disposition: 'Returned to class' });
    assert.strictEqual(rec.visitLog({ q: 'headache' }).length, 1);
    const board = rec.board(admin, s.id);
    assert.strictEqual(board.visits.length, 1);
    const actions = db.all('SELECT action FROM audit WHERE student_id = ? ORDER BY id', [s.id]).map((a) => a.action);
    for (const a of ['student.create', 'student.update', 'medication.create', 'med.given', 'med.delete', 'visit.create', 'visit.update', 'student.view']) assert(actions.includes(a), `audit has ${a}`);
    const upd = db.get("SELECT details FROM audit WHERE action = 'student.update'");
    assert.deepStrictEqual(JSON.parse(upd.details), { homeroom: { from: null, to: 'Rm 12' } });
    rec.setArchived(admin, s.id, true);
    assert.strictEqual(rec.searchStudents({}).length, 0);
    assert.strictEqual(rec.medsDue().scheduled.length, 0, 'archived students drop off Today');
    rec.setArchived(admin, s.id, false);
  });

  await test('database survives reopen and keeps a daily backup', async () => {
    const again = await Db.open(path.join(tmp, 'unit'));
    assert.strictEqual(again.get('SELECT COUNT(*) AS n FROM students').n, 1);
    assert.strictEqual(fs.readdirSync(path.join(tmp, 'unit', 'backups')).length, 1);
  });

  await test('excel workbook builds', async () => {
    const s = rec.searchStudents({})[0];
    const b = rec.board(admin, s.id);
    const buf = await excel.build('student', b, { by: 'Pat Nurse (nurse1)', at: Date.now() });
    assert.strictEqual(buf.slice(0, 2).toString(), 'PK');
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    assert.deepStrictEqual(wb.worksheets.map((w) => w.name), ['Student', 'Medications', 'Medication log', 'Visits']);
    assert.match(String(wb.worksheets[0].getCell('A1').value), /CONFIDENTIAL.*Pat Nurse/);
    assert.strictEqual(wb.getWorksheet('Visits').getCell('E3').value, 'Headache');
  });

  await test('version rule: patch counts to 100, then the next minor', () => {
    const { nextVersion } = require('../scripts/version');
    assert.strictEqual(nextVersion(null), '1.0.1');
    assert.strictEqual(nextVersion('v0.1.1'), '1.0.1');
    assert.strictEqual(nextVersion('v1.0.1'), '1.0.2');
    assert.strictEqual(nextVersion('v1.0.99'), '1.0.100');
    assert.strictEqual(nextVersion('v1.0.100'), '1.1.0');
    assert.strictEqual(nextVersion('v1.1.100'), '1.2.0');
    assert(updater.compare('v1.0.100', 'v1.0.99') > 0, 'updater sees 1.0.100 as newer than 1.0.99');
  });

  await test('updater version compare', () => {
    assert(updater.compare('v1.10.0', 'v1.9.9') > 0);
    assert.strictEqual(updater.latestTag(['v0.1.0', 'v0.10.0', 'v0.2.0', 'junk']), 'v0.10.0');
  });
}

// ---- http -------------------------------------------------------------------------

const PORT = 8941;
let cookie = '';
function req(method, url, body, { headers = {}, raw = false } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: '127.0.0.1', port: PORT, path: url, method,
      headers: {
        Host: `127.0.0.1:${PORT}`,
        ...(method === 'POST' ? { 'Content-Type': 'application/json', 'X-Nurse-Log': '1' } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...headers,
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const buf = Buffer.concat(chunks);
        const sc = res.headers['set-cookie'];
        if (sc) { const kv = sc[0].split(';')[0]; cookie = kv.endsWith('=') ? '' : kv; }
        let json = null;
        if (!raw) try { json = JSON.parse(buf.toString()); } catch { /* not json */ }
        resolve({ status: res.statusCode, json, buf, headers: res.headers });
      });
    });
    r.on('error', reject);
    if (data) r.write(data);
    r.end();
  });
}

async function httpTests() {
  const dataDir = path.join(tmp, 'http');
  const exportDir = path.join(tmp, 'exports');
  fs.mkdirSync(exportDir);
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, NL_PORT: String(PORT), NL_DATA: dataDir, NL_NO_DIALOGS: '1', NL_NO_UPDATE_CHECK: '1' },
    stdio: 'ignore', windowsHide: true,
  });
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await req('GET', '/api/ping')).json?.app === 'nurse-log') break; } catch { /* starting */ }
      await new Promise((r) => setTimeout(r, 100));
    }

    await test('http: guard blocks other sites and missing header', async () => {
      assert.strictEqual((await req('GET', '/api/ping', null, { headers: { Host: 'evil.com' } })).status, 403);
      assert.strictEqual((await req('POST', '/api/login', {}, { headers: { 'X-Nurse-Log': '' } })).status, 403);
      assert.strictEqual((await req('GET', '/api/state', null, { headers: { 'Sec-Fetch-Site': 'cross-site' } })).status, 403);
      assert.strictEqual((await req('GET', '/..%2fserver.js')).status, 404);
    });

    let recovery;
    await test('http: first-time setup', async () => {
      assert.strictEqual((await req('GET', '/api/state')).json.needsSetup, true);
      assert.strictEqual((await req('GET', '/api/students')).status, 401);
      const r = await req('POST', '/api/setup', { schoolName: 'Test School', username: 'admin', fullName: 'Ada Admin', email: 'ada@example.org', password: PW });
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      recovery = r.json.recovery;
      assert.match(recovery, /^[A-Z2-9]{4}(-[A-Z2-9]{4}){3}$/);
      assert.strictEqual((await req('POST', '/api/setup', { username: 'x2', fullName: 'x', email: 'x@y.z', password: PW })).status, 400);
      assert.strictEqual((await req('GET', '/api/state')).json.user.username, 'admin');
    });

    let sid;
    await test('http: student board, search, meds, visits', async () => {
      const s = await req('POST', '/api/students', { first_name: 'Ben', last_name: 'Ortiz', grade: '5', allergies: 'Bees' });
      sid = s.json.id;
      assert.strictEqual((await req('GET', '/api/students?q=ort')).json.students.length, 1);
      const m = await req('POST', `/api/students/${sid}/meds`, { name: 'Ritalin', dose: '5 mg', times: '12:00' });
      assert.strictEqual((await req('POST', `/api/meds/${m.json.id}/give`, { scheduled: '12:00' })).json.status, 'given');
      assert.strictEqual((await req('POST', `/api/students/${sid}/visits`, { complaint: 'Bee sting', treatment: 'Ice' })).status, 200);
      const b = (await req('GET', `/api/students/${sid}`)).json;
      assert.strictEqual(b.given.length, 1);
      assert.strictEqual(b.visits[0].nurse, 'Ada Admin');
      assert.strictEqual((await req('GET', '/api/visits?q=sting')).json.length, 1);
      assert.strictEqual((await req('GET', '/api/today')).json.visits.length, 1);
    });

    await test('http: excel export download and save to folder, audited', async () => {
      const d = await req('POST', '/api/export', { kind: 'student', studentId: sid, target: 'download' }, { raw: true });
      assert.strictEqual(d.status, 200);
      assert.strictEqual(d.buf.slice(0, 2).toString(), 'PK');
      assert.match(d.headers['content-disposition'], /Ortiz_Ben_\d{4}-\d\d-\d\d_\d{4}\.xlsx/);
      assert.match((await req('POST', '/api/export', { kind: 'visits', target: 'folder' })).json.error, /Settings/);
      assert.strictEqual((await req('POST', '/api/settings', { exportFolder: exportDir })).status, 200);
      const f = await req('POST', '/api/export', { kind: 'all', target: 'folder' });
      assert(fs.existsSync(f.json.path), JSON.stringify(f.json));
      const bk = await req('POST', '/api/backup', { target: 'folder' });
      assert(fs.statSync(bk.json.path).size > 1000);
      const audit = (await req('GET', '/api/audit?q=export')).json.map((a) => a.action);
      assert(audit.includes('export.student') && audit.includes('export.all'), audit.join());
      assert((await req('GET', '/api/audit?q=backup')).json.length >= 1);
    });

    await test('http: nurse account, temp password, admin-only routes', async () => {
      const r = await req('POST', '/api/users', { username: 'nina', fullName: 'Nina Nurse', email: 'nina@example.org', password: 'Temporary 123', role: 'nurse' });
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      const adminCookie = cookie;
      cookie = '';
      await req('POST', '/api/login', { username: 'nina', password: 'Temporary 123' });
      assert.strictEqual((await req('GET', '/api/students')).status, 403, 'must change password first');
      assert.strictEqual((await req('POST', '/api/account/password', { current: 'Temporary 123', next: 'Nina own pass 9' })).status, 200);
      assert.strictEqual((await req('GET', '/api/students')).status, 200);
      assert.strictEqual((await req('GET', '/api/audit')).status, 403);
      assert.strictEqual((await req('GET', '/api/settings')).status, 403);
      assert.strictEqual((await req('POST', '/api/export', { kind: 'audit', target: 'download' })).status, 403);
      await req('POST', '/api/logout');
      assert.strictEqual((await req('GET', '/api/students')).status, 401);
      cookie = adminCookie;
    });

    await test('http: each user keeps their own theme', async () => {
      assert.strictEqual((await req('GET', '/api/state')).json.theme, 'system');
      assert.strictEqual((await req('POST', '/api/account/theme', { theme: 'lavender' })).status, 200);
      assert.strictEqual((await req('GET', '/api/state')).json.theme, 'lavender');
      assert.strictEqual((await req('POST', '/api/account/theme', { theme: 'neon' })).status, 400);
      const css = (await req('GET', '/style.css', null, { raw: true })).buf.toString();
      for (const t of ['ocean', 'lavender', 'rose', 'sage', 'sunshine', 'night', 'midnight']) assert(css.includes(`[data-theme="${t}"]`), `style.css has ${t}`);
    });

    await test('http: last admin cannot be demoted', async () => {
      const users = (await req('GET', '/api/users')).json;
      const me = users.find((u) => u.username === 'admin');
      assert.match((await req('POST', `/api/users/${me.id}`, { role: 'nurse' })).json.error, /at least one/);
    });

    await test('http: settings never send the SMTP password back', async () => {
      await req('POST', '/api/settings', { smtp: { host: 'smtp.example.org', port: 587, user: 'u', pass: 'secret-pass', from: 'Nurse <n@example.org>' } });
      const s = (await req('GET', '/api/settings')).json.settings;
      assert.strictEqual(s.smtp.hasPass, true);
      assert(!JSON.stringify(s).includes('secret-pass'));
      await req('POST', '/api/settings', { smtp: { host: 'smtp.example.org', port: 587, user: 'u', from: 'Nurse <n@example.org>' } });
      assert.strictEqual((await req('GET', '/api/settings')).json.settings.smtp.hasPass, true, 'blank password keeps the saved one');
      await req('POST', '/api/settings', { smtp: { host: '', port: 587, user: '', from: '', clearPass: true } });
    });

    await test('http: password reset with recovery code, email not set up', async () => {
      cookie = '';
      assert.strictEqual((await req('POST', '/api/reset/request', { login: 'admin' })).json.emailReady, false);
      assert.strictEqual((await req('POST', '/api/reset/finish', { login: 'admin', code: 'AAAA-AAAA-AAAA-AAAA', password: 'New password 77' })).status, 400);
      const r = await req('POST', '/api/reset/finish', { login: 'admin', code: recovery, password: 'New password 77' });
      assert.strictEqual(r.json.how, 'recovery', JSON.stringify(r.json));
      assert.strictEqual((await req('POST', '/api/login', { username: 'admin', password: PW })).status, 401);
      assert.strictEqual((await req('POST', '/api/login', { username: 'admin', password: 'New password 77' })).status, 200);
      const acts = (await req('GET', '/api/audit?q=password')).json.map((a) => a.action);
      assert(acts.includes('password.reset') && acts.includes('password.reset-failed'), acts.join());
    });

    await test('http: static files', async () => {
      const r = await req('GET', '/', null, { raw: true });
      assert.match(r.buf.toString(), /<title>Nurse’s Log<\/title>/);
      assert.match(r.headers['content-security-policy'], /script-src 'self'/);
      assert.strictEqual((await req('GET', '/app.js', null, { raw: true })).status, 200);
    });
  } finally {
    child.kill();
  }
}

(async () => {
  await unit();
  await httpTests();
  let failed = 0;
  for (const [ok, name, e] of results) {
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}`);
    if (!ok) { failed++; console.log('     ' + (e.stack || e.message).split('\n').slice(0, 4).join('\n     ')); }
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  setTimeout(() => {
    try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* file still locked on Windows */ }
    process.exit(failed ? 1 : 0);
  }, 300);
})();
