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
const { Auth, hash, verify, checkPassword, checkPin } = require('../lib/auth');
const { Records, parseTimes, phone } = require('../lib/records');
const ai = require('../lib/ai');
const excel = require('../lib/excel');
const updater = require('../lib/updater');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nurse-log-test-'));
// The data key in plain files here; one test below checks the real DPAPI keystore.
process.env.NL_KEYSTORE = 'file';
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

  await test('audit entries older than the kept days are deleted, newer ones stay', () => {
    const day = 24 * 60 * 60 * 1000;
    db.run('INSERT INTO audit(at, action) VALUES(?, ?)', [Date.now() - 20 * day, 'old.thing']);
    db.run('INSERT INTO audit(at, action) VALUES(?, ?)', [Date.now() - 2 * day, 'new.thing']);
    assert.strictEqual(db.pruneAudit(0), 0, '0 keeps everything');
    db.pruneAudit(14);
    const left = db.all("SELECT action FROM audit WHERE action IN ('old.thing', 'new.thing')").map((a) => a.action);
    assert.deepStrictEqual(left, ['new.thing']);
  });

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

  await test('phone PINs: rules, five wrong forget the phone, new password forgets', () => {
    for (const bad of ['123', '1234', '0000', '987654', '12a4', '123456789']) assert(checkPin(bad), bad);
    assert.strictEqual(checkPin('4719'), null);
    const { token } = auth.rememberDevice(admin.id, '4719', 'iPhone, Safari');
    assert.strictEqual(auth.device(token).user.id, admin.id);
    assert(auth.pinLogin(token, '4719').token);
    for (let i = 0; i < 4; i++) assert.match(auth.pinLogin(token, '0001').error, /wrong PIN/);
    assert.match(auth.pinLogin(token, '0001').error, /forgotten/);
    assert.strictEqual(auth.device(token), null);
    assert.match(auth.pinLogin(token, '4719').error, /no longer remembered/);
    const again = auth.rememberDevice(admin.id, '4719', 'iPhone, Safari');
    assert.strictEqual(auth.devices(admin.id).length, 1);
    auth.setPassword(admin.id, PW);
    assert.strictEqual(auth.device(again.token), null, 'a new password forgets phones');
    assert.strictEqual(auth.devices(admin.id).length, 0);
  });

  await test('reset codes: wrong guesses add up across new codes', () => {
    for (let i = 0; i < 2; i++) {
      auth.makeResetCode(admin.id);
      for (let j = 0; j < 5; j++) assert.throws(() => auth.useResetCode(admin.id, '000000'), /wrong or expired/);
    }
    const code = auth.makeResetCode(admin.id);
    assert.throws(() => auth.useResetCode(admin.id, code), /too many wrong codes/, 'even the right code waits after 10 wrong ones');
    db.run('DELETE FROM reset_codes WHERE user_id = ?', [admin.id]);
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
    const m = rec.createMedication(admin, s.id, { name: 'Albuterol', dose: '2 puffs', times: '9:00, 13:00', days: '7,1,2,3,4,5,6,9', on_hand: 3 });
    assert.strictEqual(m.times, '09:00, 13:00');
    assert.strictEqual(m.days, '1,2,3,4,5,6,7', 'every day, out-of-range days dropped');
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

  await test('medications follow their weekdays and the no-school days', () => {
    const s = rec.createStudent(admin, { first_name: 'Wes', last_name: 'Day' });
    const school = rec.createMedication(admin, s.id, { name: 'SchoolDaysMed', times: '10:00' });
    const mwf = rec.createMedication(admin, s.id, { name: 'MwfMed', times: '11:00', days: '1,3,5' });
    const names = (date) => rec.medsDue(date).scheduled.filter((r) => r.student_id === s.id).map((r) => r.name);
    assert.deepStrictEqual(names('2026-11-02'), ['SchoolDaysMed', 'MwfMed'], 'Monday');
    assert.deepStrictEqual(names('2026-11-03'), ['SchoolDaysMed'], 'Tuesday');
    assert.deepStrictEqual(names('2026-11-07'), [], 'Saturday: blank days means school days only');
    db.setSetting('noSchool', [{ from: '2026-11-25', to: '2026-11-27', label: 'Thanksgiving break' }]);
    assert.deepStrictEqual(names('2026-11-25'), []);
    assert.strictEqual(rec.medsDue('2026-11-26').closed, 'Thanksgiving break');
    assert.deepStrictEqual(names('2026-11-30'), ['SchoolDaysMed', 'MwfMed']);
    const cal = rec.calendar('2026-11');
    assert.strictEqual(cal.days.length, 30);
    assert.strictEqual(cal.days.find((d) => d.date === '2026-11-26').closed, 'Thanksgiving break');
    assert(cal.days.find((d) => d.date === '2026-11-02').due >= 2);
    assert.throws(() => rec.calendar('Nov'), /month/);
    db.setSetting('noSchool', []);
    for (const t of ['medications', 'students']) db.run(`DELETE FROM ${t} WHERE ${t === 'students' ? 'id' : 'student_id'} = ?`, [s.id]);
    assert.ok(school.id && mwf.id);
  });

  await test('reminders: before the dose, again while not recorded, never when turned off', async () => {
    const { Alerts, message } = require('../lib/alerts');
    const s = rec.createStudent(admin, { first_name: 'Rae', last_name: 'Minder', allergies: 'Latex' });
    const m = rec.createMedication(admin, s.id, { name: 'Ritalin', dose: '10 mg', times: '12:00', days: '1,2,3,4,5,6,7' });
    const sent = [];
    const al = new Alerts(db, rec, async (items, msg) => { sent.push({ keys: items.map((i) => `${i.medication_id}:${i.stage}`), msg }); });
    const at = (hm) => new Date(`2026-11-04T${hm}:00`).getTime();
    const mine = (list) => list.filter((i) => i.medication_id === m.id);
    db.setSetting('medAlerts', { on: true, lead: 10, repeat: 15, windows: false, phone: false });
    assert.strictEqual(mine(al.open(at('11:49'))).length, 0, 'not yet');
    assert.strictEqual(mine(await al.tick(at('11:50'))).length, 1, '10 minutes before');
    assert.strictEqual(mine(await al.tick(at('11:55'))).length, 0, 'sent once');
    assert.strictEqual(mine(await al.tick(at('12:15')))[0].stage, 1, 'reminder after 15 minutes');
    assert.match(sent[0].msg.title, /^Rae M\.: Ritalin 10 mg$/, 'first name and initial only');
    assert.match(message([{ ...mine(al.open(at('12:16')))[0] }]).body, /Still not recorded/);
    rec.recordGiven(admin, m.id, { scheduled: '12:00', given_at: at('12:20') });
    assert.strictEqual(mine(al.open(at('12:31'))).length, 0, 'recorded doses stop');
    rec.createMedication(admin, s.id, { name: 'Second', times: '13:00', days: '1,2,3,4,5,6,7' });
    rec.setStudentAlerts(admin, s.id, false);
    assert.strictEqual(al.open(at('13:00')).filter((i) => i.student_id === s.id).length, 0, 'student turned off');
    rec.setStudentAlerts(admin, s.id, true);
    assert.strictEqual(al.open(at('13:00')).filter((i) => i.student_id === s.id).length, 1);
    db.setSetting('medAlerts', { on: false, lead: 0, repeat: 0, windows: false, phone: false });
    assert.strictEqual(al.open(at('13:00')).length, 0, 'turned off for everyone');
    db.setSetting('medAlerts', {});
    for (const t of ['med_given', 'medications', 'students']) db.run(`DELETE FROM ${t} WHERE ${t === 'students' ? 'id' : 'student_id'} = ?`, [s.id]);
  });

  await test('guardian phones: 10 digits, formatted', () => {
    assert.strictEqual(phone('555.201.3344', 'Phone'), '(555) 201-3344');
    assert.strictEqual(phone('+1 (555) 201-3344', 'Phone'), '(555) 201-3344');
    assert.strictEqual(phone('', 'Phone'), null);
    assert.throws(() => phone('555-201-33445', 'Guardian phone'), /Guardian phone must be 10 digits/);
    assert.throws(() => phone('201-3344', 'Phone'), /10 digits/);
    const s = rec.searchStudents({})[0];
    assert.throws(() => rec.updateStudent(admin, s.id, { guardian_phone: '12345' }), /10 digits/);
    assert.strictEqual(rec.updateStudent(admin, s.id, { guardian_phone: '5552013344', med_consent: 'On file', home_meds: 'Zyrtec 10 mg' }).guardian_phone, '(555) 201-3344');
    assert.throws(() => rec.updateStudent(admin, s.id, { med_consent: 'Maybe' }), /permission/);
  });

  await test('older databases get the medication info columns', async () => {
    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const old = new SQL.Database();
    old.exec('CREATE TABLE students (id INTEGER PRIMARY KEY, first_name TEXT NOT NULL, last_name TEXT NOT NULL, archived INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL)');
    old.exec("INSERT INTO students(first_name, last_name, created_at, updated_at) VALUES('Old', 'Row', 1, 1)");
    const dir = path.join(tmp, 'old');
    fs.mkdirSync(dir);
    fs.writeFileSync(path.join(dir, 'nurse-log.sqlite'), Buffer.from(old.export()));
    const db2 = await Db.open(dir);
    const cols = db2.all('PRAGMA table_info(students)').map((c) => c.name);
    for (const c of ['home_meds', 'med_consent', 'pharmacy', 'med_notes']) assert(cols.includes(c), c);
    assert.strictEqual(db2.get('SELECT first_name FROM students').first_name, 'Old');
  });

  await test('dictation schema: every field required, choices kept', () => {
    const sc = ai.schemaFor([{ name: 'sex', label: 'Sex', type: 'select', choices: ['', 'F', 'M'] }, { name: 'prn', label: 'PRN', type: 'check', choices: [] }]);
    assert.deepStrictEqual(sc.required, ['sex', 'prn']);
    assert.deepStrictEqual(sc.properties.sex.enum, ['F', 'M', null]);
    assert.deepStrictEqual(sc.properties.prn.type, ['boolean', 'null']);
    assert.strictEqual(sc.additionalProperties, false);
  });

  await test('database survives reopen and keeps a daily backup', async () => {
    const again = await Db.open(path.join(tmp, 'unit'));
    assert.strictEqual(again.get('SELECT COUNT(*) AS n FROM students').n, 1);
    assert.strictEqual(fs.readdirSync(path.join(tmp, 'unit', 'backups')).length, 1);
  });

  await test('two-step codes: RFC 6238 test vector, one use per code, recovery code works', () => {
    const totp = require('../lib/totp');
    const secret = totp.base32(Buffer.from('12345678901234567890'));
    assert.strictEqual(secret, 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    assert.strictEqual(totp.codeAt(secret, 1), '287082', 'RFC 6238 at T=59s');
    assert.strictEqual(totp.verify(secret, '287082', { now: 59000 }), 1);
    assert.strictEqual(totp.verify(secret, '287082', { now: 59000, after: 1 }), null, 'a used code is refused');
    const u = auth.createUser({ username: 'twostep', fullName: 'Two Step', email: 'ts@example.org', password: PW });
    const { secret: s2 } = auth.startTotp(u.user.id);
    assert.throws(() => auth.confirmTotp(u.user.id, '000000'), /does not match/);
    auth.confirmTotp(u.user.id, totp.codeAt(s2, totp.stepNow()));
    const first = auth.login('twostep', PW);
    assert(first.needCode && first.ticket && !first.token, 'the password alone does not sign in');
    assert.match(auth.loginCode(first.ticket, '123456').error, /wrong code/);
    assert.match(auth.loginCode(first.ticket, totp.codeAt(s2, totp.stepNow())).error, /wrong code/, 'the code used to set it up cannot be used again');
    assert.strictEqual(auth.loginCode(first.ticket, u.recovery).how, 'recovery');
    assert.match(auth.loginCode(first.ticket, u.recovery).error, /password again/, 'a ticket works once');
    const again = auth.login('twostep', PW);
    for (let i = 0; i < 4; i++) auth.loginCode(again.ticket, '000000');
    assert(auth.loginCode(again.ticket, '000000').restart, 'five wrong codes end the ticket');
    auth.clearTotp(u.user.id);
    assert(auth.login('twostep', PW).token, 'with it off the password is enough');
  });

  await test('roles: aides record doses and visits, viewers only read', () => {
    const { can } = require('../lib/auth');
    assert(can({ role: 'nurse' }, 'export') && can({ role: 'admin' }, 'edit'));
    assert(can({ role: 'aide' }, 'dose') && can({ role: 'aide' }, 'visit') && !can({ role: 'aide' }, 'edit') && !can({ role: 'aide' }, 'export'));
    assert(!can({ role: 'viewer' }, 'dose') && !can({ role: 'viewer' }, 'dictate') && !can(null, 'dose'));
    assert(auth.createUser({ username: 'aide1', fullName: 'Ann Aide', email: 'a@example.org', password: PW, role: 'aide' }).user);
    assert.throws(() => auth.createUser({ username: 'boss1', fullName: 'B', email: 'b@example.org', password: PW, role: 'superuser' }), /bad role/);
  });

  await test('immunizations: doses, status, compliance report', () => {
    const s = rec.createStudent(admin, { first_name: 'Ivy', last_name: 'Imm', grade: '6', student_no: 'IMM1' });
    assert.throws(() => rec.updateStudent(admin, s.id, { imm_status: 'Mostly' }), /immunization status/);
    rec.updateStudent(admin, s.id, { imm_status: 'In progress', imm_notes: 'Tdap due' });
    const d1 = rec.createImmunization(admin, s.id, { vaccine: 'MMR', dose_no: '1', given_on: '2016-05-01' });
    rec.createImmunization(admin, s.id, { vaccine: 'MMR', dose_no: '2', given_on: '2019-06-01' });
    assert.throws(() => rec.createImmunization(admin, s.id, { vaccine: 'MMR', given_on: '5/1/2016' }), /date given/);
    assert.throws(() => rec.createImmunization(admin, s.id, { given_on: '2016-05-01' }), /vaccine/);
    rec.updateImmunization(admin, d1.id, { source: 'State registry' });
    assert.strictEqual(rec.board(admin, s.id).immunizations.length, 2);
    const r = rec.immunizationReport({ grade: '6' });
    const row = r.students.find((x) => x.id === s.id);
    assert.deepStrictEqual(row.doses.MMR, ['2016-05-01', '2019-06-01']);
    assert.strictEqual(r.counts['In progress'], 1);
    assert(r.vaccines.includes('DTaP / Tdap'));
  });

  await test('roster import: matches by ID or name and birth date, never blanks a value, full roster archives the rest', async () => {
    const roster = require('../lib/roster');
    // Its own records file, since a full roster archives everyone else.
    const rec = new Records(await Db.open(path.join(tmp, 'roster')));
    const before = rec.createStudent(admin, { first_name: 'Rosa', last_name: 'Ster', student_no: 'R100', allergies: 'Peanuts', grade: '3' });
    const noId = rec.createStudent(admin, { first_name: 'Nia', last_name: 'Noid', dob: '2015-02-03' });
    const leaving = rec.createStudent(admin, { first_name: 'Leo', last_name: 'Left', student_no: 'R999' });
    const csv = [
      'School roster export',
      'Student Number,Last Name,First Name,Birthdate,Grade Level,Homeroom Teacher,Gender,Parent Phone,Allergies',
      'R100,Ster,Rosa,9/30/2016,4,Ms. Lee,Female,555-201-3344,',
      'R200,"New, Jr.",Ned,2016-01-02,K,Mr. Park,M,12345,',
      'R300,Noid,Nia,02/03/2015,2,,F,,',
      ',Nobody,,,,,,,',
      'R200,Twice,Tom,,1,,,,',
    ].join('\r\n');
    const parsed = await roster.read(Buffer.from(csv), 'roster.csv');
    assert(parsed.columns.includes('dob') && parsed.columns.includes('homeroom') && parsed.columns.includes('guardian_phone'));
    const plan = rec.importStudents(admin, parsed, { fullRoster: true });
    assert.strictEqual(plan.applied, undefined, 'preview changes nothing');
    assert.strictEqual(rec.student(before.id).grade, '3');
    assert.strictEqual(plan.create, 1, 'Ned is new');
    assert.strictEqual(plan.update, 2, 'Rosa by ID, Nia by name and birth date');
    assert(plan.archive >= 1 && plan.archiveNames.includes('Left, Leo'));
    assert(plan.errors.some((e) => e.line === 6) && plan.errors.some((e) => /twice/.test(e.msg)));
    assert(plan.notes.some((n) => /not 10 digits/.test(n.msg)));
    const done = rec.importStudents(admin, parsed, { apply: true, fullRoster: true });
    assert(done.applied);
    const rosa = rec.student(before.id);
    assert.strictEqual(rosa.grade, '4');
    assert.strictEqual(rosa.dob, '2016-09-30');
    assert.strictEqual(rosa.sex, 'F');
    assert.strictEqual(rosa.guardian_phone, '(555) 201-3344');
    assert.strictEqual(rosa.allergies, 'Peanuts', 'a blank cell never clears a value');
    assert.strictEqual(rec.student(noId.id).student_no, 'R300');
    assert.strictEqual(rec.student(leaving.id).archived, 1);
    assert(rec.searchStudents({ q: 'Ned' }).some((x) => x.last_name === 'New, Jr.'));
    assert.strictEqual(rec.importStudents(admin, parsed, { fullRoster: true }).update, 0, 'importing the same file again changes nothing');
    await assert.rejects(roster.read(Buffer.from('a,b\n1,2'), 'x.csv'), /First name and Last name/);
    await assert.rejects(roster.read(Buffer.from('x'), 'old.xls'), /\.xls/);
  });

  await test('retention: archived students are deleted for good after the chosen years', () => {
    const s = rec.createStudent(admin, { first_name: 'Old', last_name: 'Timer', student_no: 'OT1' });
    rec.createVisit(admin, s.id, { complaint: 'Headache' });
    rec.createImmunization(admin, s.id, { vaccine: 'MMR', given_on: '2010-01-01' });
    assert.throws(() => rec.purgeStudent(admin, s.id), /archive the student first/);
    rec.setArchived(admin, s.id, true);
    assert.deepStrictEqual(rec.purgeDue(1).filter((id) => id === s.id), [], 'archived today is kept');
    const fourYears = Date.now() + 4 * 366 * 24 * 60 * 60 * 1000;
    assert(rec.purgeDue(3, fourYears).includes(s.id));
    db.run('UPDATE students SET archived_at = ? WHERE id = ?', [String(Date.now() - 4 * 366 * 24 * 60 * 60 * 1000), s.id]);
    assert(rec.purgeExpired(3) >= 1);
    assert.throws(() => rec.student(s.id), /not found/);
    assert.strictEqual(db.get('SELECT COUNT(*) AS n FROM visits WHERE student_id = ?', [s.id]).n, 0);
    assert.strictEqual(db.get('SELECT COUNT(*) AS n FROM immunizations WHERE student_id = ?', [s.id]).n, 0);
    const trail = db.all('SELECT * FROM audit WHERE student_id = ? ORDER BY id', [s.id]);
    assert(trail.length > 2, 'who did what is kept');
    assert(trail.slice(0, -1).every((a) => a.details === null), 'but not the health details');
    assert.strictEqual(trail[trail.length - 1].action, 'student.delete-retention');
    assert.strictEqual(rec.purgeExpired(0), 0, 'off keeps everyone');
  });

  await test('encryption at rest: sealed file and backups, wrong key refused, recovery key reopens', async () => {
    const vault = require('../lib/vault');
    const dir = path.join(tmp, 'sealed');
    const d1 = await Db.open(dir);
    d1.setSetting('schoolName', 'Secret Elementary');
    assert(!d1.encrypted);
    assert.match(fs.readFileSync(d1.file).subarray(0, 16).toString(), /^SQLite format 3/);
    const code = d1.encrypt();
    assert.match(code, /^([A-Z0-9]{4}-){5}[A-Z0-9]{4}$/);
    const raw = fs.readFileSync(d1.file);
    assert(vault.isSealed(raw) && !raw.includes(Buffer.from('Secret Elementary')), 'nothing readable on disk');
    for (const f of fs.readdirSync(path.join(dir, 'backups'))) assert(vault.isSealed(fs.readFileSync(path.join(dir, 'backups', f))), 'older backups are sealed too');
    d1.setSetting('after', 1);
    assert.strictEqual((await Db.open(dir)).setting('schoolName'), 'Secret Elementary', 'reopens with the key on this PC');
    const tampered = Buffer.from(raw);
    tampered[tampered.length - 5] ^= 1;
    fs.writeFileSync(path.join(tmp, 'tampered.sqlite'), tampered);
    assert.throws(() => vault.unseal(tampered, vault.loadKey(dir)), /authenticate|auth/i, 'a changed byte is caught');
    // Another PC: the file without its key file.
    const moved = path.join(tmp, 'sealed-moved');
    fs.mkdirSync(moved);
    fs.copyFileSync(d1.file, path.join(moved, 'nurse-log.sqlite'));
    await assert.rejects(Db.open(moved), (e) => e.locked);
    assert.throws(() => Db.unlock(moved, 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF'), /does not open/);
    Db.unlock(moved, code.toLowerCase().replace(/-/g, ' '));
    assert.strictEqual((await Db.open(moved)).setting('after'), 1);
    // A new recovery key: the new one opens the file, the old one only older copies.
    const code2 = d1.encrypt();
    assert.notStrictEqual(code2, code);
    const h2 = vault.headerOf(fs.readFileSync(d1.file)).header;
    assert(vault.keyFromRecovery(h2, code2) && !vault.keyFromRecovery(h2, code));
    Db.erase(dir);
    assert(!fs.existsSync(path.join(dir, 'nurse-log.sqlite')) && !fs.existsSync(path.join(dir, 'records.key')) && !fs.existsSync(path.join(dir, 'backups')));
  });

  if (process.platform === 'win32') {
    await test('encryption at rest: the key file is locked to this Windows user (DPAPI)', () => {
      const vault = require('../lib/vault');
      const dir = path.join(tmp, 'dpapi');
      fs.mkdirSync(dir);
      const was = process.env.NL_KEYSTORE;
      process.env.NL_KEYSTORE = 'dpapi';
      try {
        const key = require('crypto').randomBytes(32);
        vault.saveKey(dir, key);
        const body = JSON.parse(fs.readFileSync(path.join(dir, 'records.key'), 'utf8'));
        assert.strictEqual(body.kind, 'dpapi');
        assert.notStrictEqual(body.key, key.toString('base64'), 'the key is not stored as is');
        assert(vault.loadKey(dir).equals(key));
      } finally {
        if (was === undefined) delete process.env.NL_KEYSTORE; else process.env.NL_KEYSTORE = was;
      }
    });
  }

  await test('excel workbook builds', async () => {
    const s = rec.searchStudents({ q: 'S100' })[0]; // Ana Lopez, with the Headache visit
    const b = rec.board(admin, s.id);
    const buf = await excel.build('student', b, { by: 'Pat Nurse (nurse1)', at: Date.now() });
    assert.strictEqual(buf.slice(0, 2).toString(), 'PK');
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    assert.deepStrictEqual(wb.worksheets.map((w) => w.name), ['Student', 'Medications', 'Medication log', 'Visits', 'Immunizations']);
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
const AI_PORT = 8942; // fake OpenAI API

// Stands in for api.openai.com: checks the key, answers with fixed text and values.
function fakeOpenAI() {
  const seen = [];
  const srv = http.createServer((rq, rs) => {
    const chunks = [];
    rq.on('data', (c) => chunks.push(c));
    rq.on('end', () => {
      const body = Buffer.concat(chunks);
      seen.push({ url: rq.url, auth: rq.headers.authorization, body });
      const out = (code, o) => { rs.writeHead(code, { 'Content-Type': 'application/json' }); rs.end(JSON.stringify(o)); };
      if (rq.headers.authorization !== 'Bearer sk-test-key') return out(401, { error: { message: 'bad key' } });
      if (rq.url === '/v1/models') return out(200, { data: [{ id: 'gpt-4o-mini' }, { id: 'gpt-4o-mini-transcribe' }] });
      if (rq.url === '/v1/audio/transcriptions') return out(200, { text: 'Mom is Jane Smith five five five two zero one three three four four.' });
      if (rq.url === '/v1/chat/completions') {
        const j = JSON.parse(body.toString());
        const v = Object.fromEntries(Object.keys(j.response_format.json_schema.schema.properties).map((k) => [k, null]));
        Object.assign(v, { guardian_name: 'Jane Smith', guardian_phone: '5552013344', med_consent: 'On file', sex: 'Q' });
        return out(200, { choices: [{ message: { content: JSON.stringify(v) } }] });
      }
      out(404, { error: { message: 'no' } });
    });
  });
  srv.seen = seen;
  return new Promise((resolve) => srv.listen(AI_PORT, '127.0.0.1', () => resolve(srv)));
}

const TS_IP = '127.0.0.2'; // stands in for this PC's Tailscale address
const TS_DNS = 'nurse-pc.tail-test.ts.net';
let cookie = '';
function req(method, url, body, { headers = {}, raw = false, ip = '127.0.0.1', from, port = PORT } = {}) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: ip, port, path: url, method, localAddress: from,
      headers: {
        Host: `${ip}:${port}`,
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
        if (sc) { // a small cookie jar: the session cookie plus a phone's PIN cookie
          const jar = new Map(cookie ? cookie.split('; ').map((kv) => [kv.split('=')[0], kv]) : []);
          for (const c of sc) {
            const kv = c.split(';')[0];
            if (kv.endsWith('=')) jar.delete(kv.split('=')[0]); else jar.set(kv.split('=')[0], kv);
          }
          cookie = [...jar.values()].join('; ');
        }
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

// Copies installed from Setup.exe: update check and download against a fake GitHub.
async function setupUpdaterTests() {
  const updater = require('../lib/updater');
  const crypto = require('crypto');
  const exe = Buffer.from('fake installer');
  const good = crypto.createHash('sha256').update(exe).digest('hex');
  let sum = good;
  // A throwaway release key; the real public key stays in lib/release-key.js.
  const keys = crypto.generateKeyPairSync('ed25519');
  const other = crypto.generateKeyPairSync('ed25519');
  let sig = crypto.sign(null, exe, keys.privateKey).toString('base64');
  let withSig = true;
  const srv = http.createServer((q, s) => {
    const base = `http://127.0.0.1:${srv.address().port}`;
    if (q.url === '/latest') {
      s.setHeader('Content-Type', 'application/json');
      return s.end(JSON.stringify({ tag_name: 'v9.9.9', assets: [
        { name: 'NursesLog-Setup-9.9.9.exe', browser_download_url: `${base}/dl/setup.exe` },
        { name: 'NursesLog-Setup-9.9.9.exe.sha256', browser_download_url: `${base}/dl/setup.sha256` },
        ...(withSig ? [{ name: 'NursesLog-Setup-9.9.9.exe.sig', browser_download_url: `${base}/dl/setup.sig` }] : []),
      ] }));
    }
    if (q.url === '/dl/setup.exe') { s.writeHead(302, { Location: '/files/setup.exe' }); return s.end(); }
    if (q.url === '/files/setup.exe') return s.end(exe);
    if (q.url === '/dl/setup.sha256') return s.end(`${sum}  NursesLog-Setup-9.9.9.exe\n`);
    if (q.url === '/dl/setup.sig') return s.end(`${sig}\n`);
    s.writeHead(404); s.end();
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  process.env.NL_RELEASES_URL = `http://127.0.0.1:${srv.address().port}`;
  process.env.NL_RELEASE_PUBKEY = keys.publicKey.export({ type: 'spki', format: 'pem' });
  const appDir = path.join(tmp, 'setup-app');
  fs.mkdirSync(appDir, { recursive: true });
  fs.writeFileSync(path.join(appDir, '.setup'), 'x');
  try {
    await test('setup.exe copies: update check and checksum-verified download', async () => {
      assert.strictEqual((await updater.mode(appDir)).kind, 'setup');
      const c = await updater.check(appDir, '1.0.0');
      assert.strictEqual(c.latest, 'v9.9.9');
      assert.strictEqual(c.available, true);
      assert.strictEqual(c.mode, 'setup');
      const r = await updater.install(appDir, 'v9.9.9');
      assert.deepStrictEqual(fs.readFileSync(r.file), exe, 'downloaded through the redirect');
      await assert.rejects(updater.install(appDir, 'v9.9.8'), /newest release is now v9\.9\.9/);
      sum = '0'.repeat(64);
      await assert.rejects(updater.install(appDir, 'v9.9.9'), /checksum/);
      sum = good;
    });
    await test('setup.exe copies: an unsigned or wrongly signed installer is never run', async () => {
      withSig = false;
      await assert.rejects(updater.install(appDir, 'v9.9.9'), /not signed/);
      withSig = true;
      sig = crypto.sign(null, exe, other.privateKey).toString('base64');
      await assert.rejects(updater.install(appDir, 'v9.9.9'), /not signed by/);
      sig = crypto.sign(null, exe, keys.privateKey).toString('base64');
      assert(await updater.install(appDir, 'v9.9.9'));
      delete process.env.NL_RELEASE_PUBKEY;
      await assert.rejects(updater.install(appDir, 'v9.9.9'), /not signed by/, 'the real key does not accept a test signature');
    });
  } finally {
    delete process.env.NL_RELEASES_URL;
    delete process.env.NL_RELEASE_PUBKEY;
    srv.close();
  }
}

// Encryption, roles, two-step sign-in, import, deleting and erasing over HTTP, on a
// server and records folder of their own.
const SR_PORT = 8946;
async function startServer(dataDir, port) {
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, NL_PORT: String(port), NL_DATA: dataDir, NL_NO_DIALOGS: '1', NL_NO_UPDATE_CHECK: '1', NL_KEYSTORE: 'file', NL_MAIL_RELAY: '' },
    stdio: 'ignore', windowsHide: true,
  });
  for (let i = 0; i < 100; i++) {
    try { if ((await req('GET', '/api/ping', null, { port })).json?.app === 'nurse-log') break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  return child;
}

async function schoolReadyTests() {
  const totp = require('../lib/totp');
  const vault = require('../lib/vault');
  const dataDir = path.join(tmp, 'school-ready');
  const call = (m, u, b, o = {}) => req(m, u, b, { ...o, port: SR_PORT });
  const as = async (username, password) => { cookie = ''; return call('POST', '/api/login', { username, password }); };
  cookie = '';
  let child = await startServer(dataDir, SR_PORT);
  try {
    let recordsKey;
    await test('http: a new install encrypts its records and shows the records recovery key once', async () => {
      const r = await call('POST', '/api/setup', { schoolName: 'Sealed School', username: 'boss', fullName: 'Bo Boss', email: 'bo@example.org', password: PW });
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      recordsKey = r.json.recordsKey;
      assert.match(recordsKey, /^([A-Z0-9]{4}-){5}[A-Z0-9]{4}$/);
      assert.strictEqual((await call('GET', '/api/state')).json.encrypted, true);
      const raw = fs.readFileSync(path.join(dataDir, 'nurse-log.sqlite'));
      assert(vault.isSealed(raw) && !raw.includes(Buffer.from('Sealed School')));
      assert.strictEqual((await call('POST', '/api/records/encrypt', { password: 'wrong' })).status, 400);
    });

    let sid;
    let medId;
    await test('http: roles: an aide records doses and visits only, a viewer only reads', async () => {
      sid = (await call('POST', '/api/students', { first_name: 'Rita', last_name: 'Role', student_no: 'RR1' })).json.id;
      medId = (await call('POST', `/api/students/${sid}/meds`, { name: 'Albuterol', times: '10:00' })).json.id;
      for (const [username, role] of [['aide1', 'aide'], ['view1', 'viewer']]) {
        assert.strictEqual((await call('POST', '/api/users', { username, fullName: username, email: `${username}@example.org`, password: 'Temporary 123', role })).status, 200);
      }
      assert.strictEqual((await call('POST', '/api/users', { username: 'x9', fullName: 'x', email: 'x9@example.org', password: 'Temporary 123', role: 'owner' })).status, 400);
      const boss = cookie;
      await as('aide1', 'Temporary 123');
      await call('POST', '/api/account/password', { current: 'Temporary 123', next: 'Aide own pass 9' });
      assert.deepStrictEqual((await call('GET', '/api/state')).json.user.perms, ['dose', 'visit', 'dictate']);
      assert.strictEqual((await call('GET', `/api/students/${sid}`)).status, 200);
      assert.strictEqual((await call('POST', `/api/meds/${medId}/give`, { scheduled: '10:00' })).status, 200);
      assert.strictEqual((await call('POST', `/api/students/${sid}/visits`, { complaint: 'Cough' })).status, 200);
      for (const [u, b] of [['/api/students', { first_name: 'A', last_name: 'B' }], [`/api/students/${sid}`, { allergies: 'x' }], [`/api/students/${sid}/meds`, { name: 'x' }],
        [`/api/meds/${medId}`, { dose: '9' }], ['/api/export', { kind: 'students', target: 'download' }], ['/api/import/students', { name: 'a.csv', data: 'eA==' }],
        [`/api/students/${sid}/immunizations`, { vaccine: 'MMR' }]]) {
        const r = await call('POST', u, b);
        assert.strictEqual(r.status, 403, `aide ${u}`);
        assert.match(r.json.error, /role \(aide\)/);
      }
      await as('view1', 'Temporary 123');
      await call('POST', '/api/account/password', { current: 'Temporary 123', next: 'View own pass 9' });
      assert.strictEqual((await call('GET', '/api/today')).status, 200);
      assert.strictEqual((await call('GET', `/api/students/${sid}`)).status, 200);
      for (const [u, b] of [[`/api/meds/${medId}/give`, {}], [`/api/students/${sid}/visits`, { complaint: 'x' }], ['/api/ai/fill', { notes: 'x' }], ['/api/export', { kind: 'visits', target: 'download' }]]) {
        assert.strictEqual((await call('POST', u, b)).status, 403, `viewer ${u}`);
      }
      cookie = boss;
    });

    let secret;
    await test('http: two-step sign-in: password then code, and an admin can require it', async () => {
      assert.match((await call('POST', '/api/settings', { require2fa: true })).json.error, /your own account first/);
      const st = (await call('POST', '/api/account/totp/start')).json;
      secret = st.secret;
      assert(st.uri.startsWith('otpauth://totp/') && st.rows.length > 20);
      assert.strictEqual((await call('POST', '/api/account/totp/confirm', { code: '000000' })).status, 400);
      assert.strictEqual((await call('POST', '/api/account/totp/confirm', { code: totp.codeAt(secret, totp.stepNow()) })).json.totpOn, true);
      assert.strictEqual((await call('POST', '/api/settings', { require2fa: true })).status, 200);
      const first = await as('boss', PW);
      assert(first.json.needCode && first.json.ticket);
      assert.strictEqual((await call('GET', '/api/state')).json.user, null, 'not signed in yet');
      assert.strictEqual((await call('POST', '/api/login/code', { ticket: first.json.ticket, code: '111111' })).status, 401);
      const ok = await call('POST', '/api/login/code', { ticket: first.json.ticket, code: totp.codeAt(secret, totp.stepNow() + 1) });
      assert.strictEqual(ok.status, 200, JSON.stringify(ok.json));
      const boss = cookie;
      await as('aide1', 'Aide own pass 9');
      assert.match((await call('GET', '/api/students')).json.error, /two-step/);
      assert.strictEqual((await call('POST', '/api/account/totp/start')).status, 200, 'setting it up is allowed');
      cookie = boss;
      const aide = (await call('GET', '/api/users')).json.find((u) => u.username === 'aide1');
      assert.strictEqual((await call('POST', `/api/users/${aide.id}/totp/reset`)).status, 200);
      assert.match((await call('POST', '/api/account/totp/off', { password: PW })).json.error, /requires/);
      assert.strictEqual((await call('POST', '/api/settings', { require2fa: false })).status, 200);
      assert.strictEqual((await call('POST', '/api/account/totp/off', { password: PW })).json.totpOn, false);
    });

    await test('http: roster import preview then apply; delete an archived student for good', async () => {
      const csv = 'Student ID,First Name,Last Name,Grade\nRR1,Rita,Role,7\nRR2,Sam,Second,7\n';
      const data = Buffer.from(csv).toString('base64');
      const p = (await call('POST', '/api/import/students', { name: 'r.csv', data })).json;
      assert.strictEqual(p.create, 1);
      assert.strictEqual(p.update, 1);
      assert.strictEqual((await call('GET', '/api/students?q=Second')).json.students.length, 0, 'preview saves nothing');
      assert((await call('POST', '/api/import/students', { name: 'r.csv', data, apply: true })).json.applied);
      const sam = (await call('GET', '/api/students?q=Second')).json.students[0];
      assert(sam && sam.grade === '7');
      assert.match((await call('POST', `/api/students/${sam.id}/delete`, { confirm: 'Second' })).json.error, /archive/);
      await call('POST', `/api/students/${sam.id}/archive`, { archived: true });
      assert.match((await call('POST', `/api/students/${sam.id}/delete`, { confirm: 'Sam' })).json.error, /type Second/);
      assert.strictEqual((await call('POST', `/api/students/${sam.id}/delete`, { confirm: 'second' })).status, 200);
      assert.strictEqual((await call('GET', `/api/students/${sam.id}`)).status, 404);
      const rep = await call('POST', '/api/export', { kind: 'immunizations', target: 'download' }, { raw: true });
      assert.strictEqual(rep.buf.slice(0, 2).toString(), 'PK');
    });

    await test('http: on another Windows account the records stay locked until the recovery key is typed', async () => {
      child.kill();
      await new Promise((r) => setTimeout(r, 400));
      fs.rmSync(path.join(dataDir, 'records.key'));
      child = await startServer(dataDir, SR_PORT);
      assert.strictEqual((await call('GET', '/api/state')).json.locked, true);
      assert.strictEqual((await call('GET', '/api/students')).status, 503);
      assert.strictEqual((await call('POST', '/api/login', { username: 'boss', password: PW })).status, 503);
      assert.match((await call('POST', '/api/unlock', { key: 'AAAA-BBBB-CCCC-DDDD-EEEE-FFFF' })).json.error, /does not open/);
      assert.strictEqual((await call('POST', '/api/unlock', { key: recordsKey })).status, 200);
      const st = (await call('GET', '/api/state')).json;
      assert(!st.locked && !st.needsSetup && st.encrypted);
      assert((await as('boss', PW)).json.user);
      assert.strictEqual((await call('GET', '/api/students?q=Rita')).json.students.length, 1);
    });

    await test('http: erase everything starts over at first-time setup', async () => {
      assert.match((await call('POST', '/api/erase', { password: PW, confirm: 'erase' })).json.error, /ERASE/);
      assert.match((await call('POST', '/api/erase', { password: 'nope', confirm: 'ERASE' })).json.error, /password/);
      assert.strictEqual((await call('POST', '/api/erase', { password: PW, confirm: 'ERASE' })).status, 200);
      assert.strictEqual((await call('GET', '/api/state')).json.needsSetup, true);
      assert(!fs.existsSync(path.join(dataDir, 'records.key')));
      const left = fs.readdirSync(path.join(dataDir, 'backups'));
      for (const f of left) assert(!fs.readFileSync(path.join(dataDir, 'backups', f)).includes(Buffer.from('Rita')), 'no old backup survives');
    });
  } finally {
    child.kill();
    cookie = '';
  }
}

async function httpTests() {
  const dataDir = path.join(tmp, 'http');
  const exportDir = path.join(tmp, 'exports');
  fs.mkdirSync(exportDir);
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, NL_PORT: String(PORT), NL_DATA: dataDir, NL_NO_DIALOGS: '1', NL_NO_UPDATE_CHECK: '1', NL_KEYSTORE: 'file', NL_TAILSCALE_IPS: TS_IP, NL_TAILSCALE_DNS: TS_DNS, NL_OPENAI_URL: `http://127.0.0.1:${AI_PORT}/v1`, NL_MAIL_RELAY: '' },
    stdio: 'ignore', windowsHide: true,
  });
  const openai = await fakeOpenAI();
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
      const app = (await req('GET', '/app.js', null, { raw: true })).buf.toString();
      for (const t of ['mist', 'blush', 'eucalyptus', 'lilac', 'clay', 'seafoam', 'dusk', 'slate']) {
        assert(css.includes(`[data-theme="${t}"] {`), `style.css has material ${t}`);
        assert(app.includes(`['${t}', `) && app.includes("'material']"), `app.js lists ${t}`);
        assert.strictEqual((await req('POST', '/api/account/theme', { theme: t })).status, 200, t);
      }
      assert(css.includes('[data-style="material"] .btn'), 'material shape styles');
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

    await test('http: feedback needs text and the school email set up', async () => {
      const empty = await req('POST', '/api/feedback', { text: '   ' });
      assert.strictEqual(empty.status, 400);
      assert.match(empty.json.error, /write your feedback/);
      const noMail = await req('POST', '/api/feedback', { text: 'Works great' });
      assert.strictEqual(noMail.status, 400);
      assert.match(noMail.json.error, /email is not set up/);
      assert.strictEqual((await req('POST', '/api/feedback', { text: 'x'.repeat(5001) })).status, 400);
    });

    await test('http: dictation fills form values through ChatGPT, key never sent back', async () => {
      const fields = [{ name: 'guardian_name', label: 'Parent / guardian' }, { name: 'guardian_phone', label: 'Guardian phone', type: 'tel' },
        { name: 'med_consent', label: 'Permission', type: 'select', choices: ['', 'On file', 'Not on file'] }, { name: 'sex', label: 'Sex', type: 'select', choices: ['', 'F', 'M'] }];
      assert.strictEqual((await req('GET', '/api/state')).json.aiReady, false);
      assert.match((await req('POST', '/api/ai/fill', { notes: 'x', fields })).json.error, /not set up/);
      assert.match((await req('POST', '/api/settings', { ai: { enabled: true } })).json.error, /API key/);
      await req('POST', '/api/settings', { ai: { enabled: true, key: 'sk-test-key' } });
      const st = (await req('GET', '/api/settings')).json.settings;
      assert.strictEqual(st.ai.hasKey, true);
      assert(!JSON.stringify(st).includes('sk-test-key'));
      assert.strictEqual((await req('GET', '/api/state')).json.aiReady, true);
      assert.strictEqual((await req('POST', '/api/settings/test-ai')).status, 200);

      const typed = await req('POST', '/api/ai/fill', { notes: 'Mom is Jane Smith 555 201 3344, form on file', fields, form: 'Student info', studentId: sid });
      assert.strictEqual(typed.status, 200, JSON.stringify(typed.json));
      assert.deepStrictEqual(typed.json.values, { guardian_name: 'Jane Smith', guardian_phone: '5552013344', med_consent: 'On file' }, 'unknown choice "Q" is dropped');

      const spoken = await req('POST', '/api/ai/fill', { audio: Buffer.alloc(4000, 7).toString('base64'), mime: 'audio/webm;codecs=opus', fields, studentId: sid });
      assert.match(spoken.json.transcript, /Jane Smith/);
      assert(openai.seen.some((x) => x.url === '/v1/audio/transcriptions' && x.body.includes('gpt-4o-mini-transcribe')));
      assert(openai.seen.every((x) => x.auth === 'Bearer sk-test-key'));
      const audit = (await req('GET', `/api/students/${sid}`)).json.history.filter((a) => a.action === 'ai.fill');
      assert.strictEqual(audit.length, 2);
      assert(!audit[0].details.includes('Jane'), 'audit lists field names, not what was said');

      const before = openai.seen.length;
      const box = await req('POST', '/api/ai/fill', { audio: Buffer.alloc(4000, 7).toString('base64'), only: 'transcribe', form: 'Student info', field: 'Guardian phone', studentId: sid, fields });
      assert.match(box.json.transcript, /Jane Smith/);
      assert.deepStrictEqual(box.json.values, {});
      assert.deepStrictEqual(openai.seen.slice(before).map((x) => x.url), ['/v1/audio/transcriptions'], 'one box: no ChatGPT form fill');
      assert.match((await req('POST', '/api/ai/fill', { only: 'transcribe', notes: 'x', fields })).json.error, /nothing was recorded/);

      await req('POST', '/api/settings', { ai: { key: 'sk-wrong' } });
      assert.match((await req('POST', '/api/ai/fill', { notes: 'x', fields })).json.error, /rejected the API key/);
      await req('POST', '/api/settings', { ai: { enabled: false, clearKey: true } });
      assert.strictEqual((await req('GET', '/api/settings')).json.settings.ai.hasKey, false);
    });

    await test('http: each user picks a dictation key, browser keys refused', async () => {
      assert.strictEqual((await req('GET', '/api/state')).json.dictateKey, 'F2');
      assert.strictEqual((await req('POST', '/api/account/shortcut', { key: 'Ctrl+Shift+M' })).json.dictateKey, 'Ctrl+Shift+M');
      assert.strictEqual((await req('GET', '/api/state')).json.dictateKey, 'Ctrl+Shift+M');
      for (const bad of ['M', 'Ctrl+C', 'F5', 'Alt+F4', 'Ctrl+Shift+I', 'Ctrl+Shift+', 'Win+M', '']) {
        assert.strictEqual((await req('POST', '/api/account/shortcut', { key: bad })).status, 400, bad);
      }
      assert.strictEqual((await req('POST', '/api/account/shortcut', { key: 'F9' })).status, 200);
      assert.strictEqual((await req('POST', '/api/account/shortcut', { key: 'default' })).json.dictateKey, 'F2');
    });

    await test('http: guardian phone over 10 digits is refused', async () => {
      assert.match((await req('POST', `/api/students/${sid}`, { guardian_phone: '555201334455' })).json.error, /10 digits/);
      assert.strictEqual((await req('POST', `/api/students/${sid}`, { guardian_phone: '555-201-3344' })).json.guardian_phone, '(555) 201-3344');
    });

    await test('http: student and profile photos are JPEGs, shown only when signed in', async () => {
      const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 74, 70, 73, 70, 0, 1, 0xff, 0xd9]);
      const data = `data:image/jpeg;base64,${jpeg.toString('base64')}`;
      assert.strictEqual((await req('GET', `/api/photos/student/${sid}`)).status, 404);
      assert.match((await req('POST', `/api/students/${sid}/photo`, { data: 'data:image/png;base64,iVBORw0KGgo=' })).json.error, /JPEG/);
      assert.match((await req('POST', `/api/students/${sid}/photo`, { data: 'data:image/jpeg;base64,PHN2Zz4=' })).json.error, /not a JPEG/);
      const r = await req('POST', `/api/students/${sid}/photo`, { data });
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      assert(r.json.photoAt > 0);
      const img = await req('GET', `/api/photos/student/${sid}`, null, { raw: true });
      assert.strictEqual(img.headers['content-type'], 'image/jpeg');
      assert.strictEqual(img.headers['cache-control'], 'private, no-store');
      assert(img.buf.equals(jpeg));
      assert.strictEqual((await req('GET', `/api/students/${sid}`)).json.student.photo_at, r.json.photoAt);
      assert((await req('GET', '/api/students')).json.students.some((s) => s.id === sid && s.photo_at === r.json.photoAt));
      const me = await req('POST', '/api/account/photo', { data });
      assert.strictEqual(me.status, 200);
      const state = (await req('GET', '/api/state')).json;
      assert.strictEqual(state.user.photoAt, me.json.photoAt);
      assert.strictEqual((await req('GET', `/api/photos/user/${state.user.id}`, null, { raw: true })).status, 200);
      const saved = cookie;
      cookie = '';
      assert.strictEqual((await req('GET', `/api/photos/student/${sid}`)).status, 401, 'signed-out users get no photos');
      cookie = saved;
      assert.strictEqual((await req('POST', `/api/students/${sid}/photo/remove`)).status, 200);
      assert.strictEqual((await req('GET', `/api/photos/student/${sid}`)).status, 404);
      assert.strictEqual((await req('POST', '/api/account/photo/remove')).status, 200);
      assert.strictEqual((await req('GET', '/api/state')).json.user.photoAt, null);
      const acts = (await req('GET', '/api/audit?q=photo')).json.map((a) => a.action);
      assert(acts.includes('student.photo') && acts.includes('student.photo-removed') && acts.includes('account.photo'), acts.join());
    });

    await test('http: audit log keeps 14 days by default and the admin can change it', async () => {
      assert.strictEqual((await req('GET', '/api/settings')).json.settings.auditDays, 14);
      assert.strictEqual((await req('POST', '/api/settings', { auditDays: 7 })).status, 400);
      assert.strictEqual((await req('POST', '/api/settings', { auditDays: 90 })).status, 200);
      assert.strictEqual((await req('GET', '/api/settings')).json.settings.auditDays, 90);
      assert.strictEqual((await req('POST', '/api/settings', { auditDays: 14 })).status, 200);
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

    await test('http: remote access over Tailscale is off until an admin turns it on', async () => {
      let r = (await req('GET', '/api/remote')).json;
      assert.strictEqual(r.enabled, false);
      assert.deepStrictEqual(r.ips, [TS_IP]);
      assert.deepStrictEqual(r.listening, []);
      await assert.rejects(req('GET', '/api/ping', null, { ip: TS_IP }), 'nothing listens on the Tailscale address yet');
      assert.strictEqual((await req('POST', '/api/settings', { remoteAccess: true })).status, 200);
      r = (await req('GET', '/api/remote')).json;
      assert.deepStrictEqual(r.listening, [TS_IP]);
      assert.deepStrictEqual(r.urls, [`http://${TS_DNS}:${PORT}`, `http://${TS_IP}:${PORT}`]);
      assert.strictEqual((await req('GET', '/api/state', null, { ip: TS_IP })).json.remote, true);
      assert.strictEqual((await req('GET', '/api/state')).json.remote, false);
      assert.strictEqual((await req('GET', '/api/ping', null, { ip: TS_IP, headers: { Host: `evil.com:${PORT}` } })).status, 403);
      assert.match((await req('POST', '/api/export', { kind: 'visits', target: 'saveas' }, { ip: TS_IP })).json.error, /office PC/);
      const d = await req('POST', '/api/export', { kind: 'visits', target: 'download' }, { ip: TS_IP, raw: true });
      assert.strictEqual(d.buf.slice(0, 2).toString(), 'PK', 'download works from a phone');
      const saved = cookie;
      cookie = '';
      assert.strictEqual((await req('POST', '/api/login', { username: 'admin', password: 'New password 77' }, { ip: TS_IP })).status, 200);
      cookie = saved;
      const login = (await req('GET', '/api/audit?q=Tailscale')).json.find((a) => a.action === 'login');
      assert(login && /Tailscale 127.0.0.1/.test(login.details), 'remote sign-in is audited with the address');
      // HTTPS through Tailscale Serve: requests reach 127.0.0.1 with the tailnet name as Host.
      const served = (xff, extra = {}) => ({ headers: { Host: `${TS_DNS}:8943`, 'X-Forwarded-For': xff, ...extra } });
      assert.strictEqual((await req('GET', '/api/remote')).json.https.on, false);
      assert.match((await req('POST', '/api/remote/https', { on: true }, { ip: TS_IP })).json.error, /office PC/);
      r = (await req('POST', '/api/remote/https', { on: true })).json;
      assert.deepStrictEqual(r.https, { on: true, url: `https://${TS_DNS}:8943` });
      assert.strictEqual((await req('GET', '/api/state', null, served('100.101.2.3'))).json.remote, true, 'served requests count as a phone');
      assert.strictEqual((await req('GET', '/api/state', null, served('192.168.1.50'))).status, 403, 'only Tailscale devices');
      assert.strictEqual((await req('POST', '/api/logout', {}, served('100.101.2.3', { Origin: 'https://evil.example' }))).status, 403);
      assert.match((await req('POST', '/api/export', { kind: 'visits', target: 'saveas' }, served('100.101.2.3', { Origin: `https://${TS_DNS}:8943` }))).json.error, /office PC/);
      assert.match((await req('POST', '/api/remote/https', { on: false }, served('100.101.2.3'))).json.error, /office PC/);
      const qr = (await req('GET', `/api/remote/qr?url=${encodeURIComponent(`https://${TS_DNS}:8943`)}`)).json;
      assert(qr.rows.length >= 21 && qr.rows.every((row) => /^[01]+$/.test(row) && row.length === qr.rows.length), 'square QR');
      assert.strictEqual((await req('GET', `/api/remote/qr?url=${encodeURIComponent('https://evil.example')}`)).status, 400);
      assert.match((await req('POST', '/api/settings', { remoteAccess: false }, { ip: TS_IP })).json.error, /office PC/);
      assert.strictEqual((await req('POST', '/api/settings', { remoteAccess: false })).status, 200);
      assert.deepStrictEqual((await req('GET', '/api/remote')).json.listening, []);
      assert.strictEqual((await req('GET', '/api/remote')).json.https.on, false, 'HTTPS goes off with remote access');
      assert.strictEqual((await req('GET', '/api/state', null, served('100.101.2.3'))).status, 403, 'served requests refused while off');
      await assert.rejects(req('GET', '/api/ping', null, { ip: TS_IP }), 'listener closed when turned off');
    });

    await test('http: a phone stays signed in with a PIN; the PC never does', async () => {
      assert.match((await req('POST', '/api/device/remember', { pin: '4719' })).json.error, /only for phones/);
      await req('POST', '/api/settings', { remoteAccess: true });
      const pcCookie = cookie;
      cookie = '';
      const phone = { ip: TS_IP, headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile/15E148 Safari/604.1' } };
      assert.strictEqual((await req('POST', '/api/login', { username: 'admin', password: 'New password 77' }, phone)).status, 200);
      assert.match((await req('POST', '/api/device/remember', { pin: '1234' }, phone)).json.error, /harder to guess/);
      assert.strictEqual((await req('POST', '/api/device/remember', { pin: '4719' }, phone)).json.device.name, 'iPhone, Safari');
      assert.match(cookie, /nl_device=/);
      await req('POST', '/api/logout', {}, phone);
      assert.doesNotMatch(cookie, /nl_session=/);
      const st = (await req('GET', '/api/state', null, phone)).json;
      assert.strictEqual(st.user, null);
      assert.strictEqual(st.device.username, 'admin', 'signed out, the phone still offers the PIN');
      assert.match((await req('POST', '/api/login/pin', { pin: '0000' }, phone)).json.error, /4 tries left/);
      assert.strictEqual((await req('POST', '/api/login/pin', { pin: '4719' }, phone)).status, 200);
      assert.strictEqual((await req('GET', '/api/state', null, phone)).json.user.username, 'admin');
      const devs = (await req('GET', '/api/account/devices', null, phone)).json;
      assert.strictEqual(devs.length, 1);
      assert.strictEqual(devs[0].thisOne, true);
      const phoneCookie = cookie;
      cookie = pcCookie;
      // The office PC never gets the PIN screen, even holding the phone's cookie.
      assert.strictEqual((await req('GET', '/api/state', null, { headers: { Cookie: phoneCookie } })).json.device, null);
      assert.match((await req('POST', '/api/login/pin', { pin: '4719' }, { headers: { Cookie: phoneCookie } })).json.error, /not available/);
      const acts = (await req('GET', '/api/audit')).json;
      assert(acts.some((a) => a.action === 'login' && /PIN/.test(a.details)), 'PIN sign-in audited');
      assert(acts.some((a) => a.action === 'login.pin-failed'), 'wrong PIN audited');
      assert(acts.some((a) => a.action === 'device.remember'), 'remembering audited');
      // An admin turning PIN sign-in off forgets every phone.
      assert.strictEqual((await req('POST', '/api/settings', { pinSignIn: false })).json.pinSignIn, false);
      assert.strictEqual((await req('GET', '/api/state', null, { ...phone, headers: { ...phone.headers, Cookie: phoneCookie } })).json.device, null);
      assert.match((await req('POST', '/api/login/pin', { pin: '4719' }, { ...phone, headers: { ...phone.headers, Cookie: phoneCookie } })).json.error, /not available/);
      assert.strictEqual((await req('POST', '/api/settings', { pinSignIn: true })).json.pinSignIn, true);
      cookie = phoneCookie;
      assert.match((await req('POST', '/api/login/pin', { pin: '4719' }, phone)).json.error, /no longer remembered/);
      assert.doesNotMatch(cookie, /nl_device=/, 'the forgotten cookie is cleared');
      cookie = pcCookie;
      assert.strictEqual((await req('POST', '/api/settings', { remoteAccess: false })).status, 200);
    });

    await test('http: medication reminders, no-school days, calendar, phone sign-up', async () => {
      assert.match((await req('POST', '/api/settings', { medAlerts: { on: true, lead: 7, repeat: 15 } })).json.error, /from the list/);
      assert.strictEqual((await req('POST', '/api/settings', { medAlerts: { on: true, lead: 5, repeat: 10, windows: true, phone: false } })).status, 200);
      assert.deepStrictEqual((await req('GET', '/api/settings')).json.settings.medAlerts, { on: true, lead: 5, repeat: 10, windows: true, phone: false });
      const d = new Date();
      const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      assert.match((await req('POST', '/api/settings', { noSchool: [{ from: day, to: '2000-01-01' }] })).json.error, /in order/);
      assert.strictEqual((await req('POST', '/api/settings', { noSchool: [{ from: day, to: day, label: 'Snow day' }] })).status, 200);
      assert.strictEqual((await req('GET', '/api/today')).json.meds.closed, 'Snow day');
      const cal = (await req('GET', `/api/calendar?month=${day.slice(0, 7)}`)).json;
      assert.strictEqual(cal.days.find((x) => x.today).closed, 'Snow day');
      assert.strictEqual((await req('GET', '/api/calendar?month=nope')).status, 400);
      assert.strictEqual((await req('POST', '/api/settings', { noSchool: [] })).status, 200);
      assert.strictEqual((await req('GET', '/api/today')).json.meds.closed, null);

      assert.strictEqual((await req('POST', `/api/students/${sid}/alerts`, { on: false })).json.medAlerts, false);
      assert.strictEqual((await req('GET', `/api/students/${sid}`)).json.student.med_alerts, 'off');
      assert.strictEqual((await req('POST', `/api/students/${sid}/alerts`, { on: true })).json.medAlerts, true);
      const a = (await req('GET', '/api/alerts')).json;
      assert.strictEqual(a.on, true);
      assert(Array.isArray(a.items));
      assert.strictEqual(a.phones, 0);

      assert.match((await req('GET', '/api/push/key')).json.key, /^[A-Za-z0-9_-]{80,}$/);
      assert.strictEqual((await req('POST', '/api/push/subscribe', { endpoint: 'http://not-https.example' })).status, 400);
      const sub = { endpoint: 'https://push.example.org/send/abc123def456', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } };
      assert.strictEqual((await req('POST', '/api/push/subscribe', sub)).json.phones, 1);
      assert.strictEqual((await req('POST', '/api/push/unsubscribe', { endpoint: sub.endpoint })).json.phones, 0);
      assert.strictEqual((await req('POST', '/api/alerts/test-windows')).status, 200);
    });

    await test('http: wrong sign-ins from one address are slowed; save folder must be a local drive', async () => {
      assert.match((await req('POST', '/api/settings', { exportFolder: '\\\\attacker\\share' })).json.error, /this PC/);
      const saved = cookie;
      cookie = '';
      let last;
      for (let i = 0; i < 31; i++) last = await req('POST', '/api/login', { username: 'nobody-here', password: 'wrong password 1' }, { from: '127.0.0.3' });
      assert.strictEqual(last.status, 429);
      assert.match(last.json.error, /too many wrong tries/);
      assert.strictEqual((await req('POST', '/api/login', { username: 'nobody-here', password: 'x' })).status, 401, 'other addresses are not affected');
      cookie = saved;
    });

    await test('Windows scripts are plain ASCII (PowerShell 5.1 and wscript read them as ANSI)', async () => {
      for (const f of fs.readdirSync(path.join(ROOT, 'scripts')).filter((n) => /\.(ps1|vbs)$/.test(n))) {
        const bad = fs.readFileSync(path.join(ROOT, 'scripts', f)).findIndex((b) => b > 127);
        assert.strictEqual(bad, -1, `${f} has a non-ASCII byte at ${bad}`);
      }
    });

    await test('http: static files', async () => {
      const r = await req('GET', '/', null, { raw: true });
      assert.match(r.buf.toString(), /<title>Nurse’s Log<\/title>/);
      assert.match(r.headers['content-security-policy'], /script-src 'self'/);
      assert.strictEqual((await req('GET', '/app.js', null, { raw: true })).status, 200);
      const man = await req('GET', '/manifest.webmanifest', null, { raw: true });
      assert.match(man.headers['content-type'], /manifest\+json/);
      const icons = JSON.parse(man.buf.toString()).icons;
      for (const i of icons) assert.strictEqual((await req('GET', i.src, null, { raw: true })).headers['content-type'], 'image/png', i.src);
      assert(icons.some((i) => i.purpose === 'maskable'));
      assert.strictEqual((await req('GET', '/sw.js', null, { raw: true })).status, 200);
      assert.match(r.buf.toString(), /rel="manifest"/);
    });
  } finally {
    child.kill();
    openai.close();
  }
}

// The mail relay (relay/.../nurse-log-mail/mail.mjs) on its own, then end to end: an app server with
// NL_MAIL_RELAY -> a local server running the real worker code -> a fake Resend.
const RELAY_PORT = 8943;
const MAIL_PORT = 8944;
async function relayTests() {
  const { handle } = await import('../relay/supabase/functions/nurse-log-mail/mail.mjs');
  const sent = [];
  const fakeResend = async (url, opt) => { sent.push({ url, auth: opt.headers.Authorization, ...JSON.parse(opt.body) }); return new Response('{"id":"x"}', { status: 200 }); };
  let limitOk = true;
  const recorded = [];
  const env = { RESEND_KEY: 'test-key', FROM: "Nurse's Log <hi@c3dprints.com>", FEEDBACK_TO: 'hi@c3dprints.com', allow: async () => limitOk, record: async (m) => { recorded.push(m.kind); } };
  const call = (body, headers = { 'X-Nurse-Log': '1' }) => handle(new Request('https://relay.test/functions/v1/nurse-log-mail', { method: 'POST', headers, body: JSON.stringify(body) }), env, fakeResend);

  await test('relay: feedback only ever goes to the developer, resets carry only a code', async () => {
    let r = await call({ kind: 'feedback', text: 'Love it', name: 'Ada', email: 'ada@example.org', school: 'Test School', version: '1.0.15', to: 'victim@example.org' });
    assert.strictEqual(r.status, 200);
    let m = sent.pop();
    assert.deepStrictEqual(m.to, ['hi@c3dprints.com']);
    assert.strictEqual(m.reply_to, 'ada@example.org');
    assert.strictEqual(m.auth, 'Bearer test-key');
    assert.match(m.text, /Love it/);
    r = await call({ kind: 'reset', to: 'nurse@example.org', code: '123456', name: 'Buy cheap pills at spam.example' });
    assert.strictEqual(r.status, 200);
    m = sent.pop();
    assert.deepStrictEqual(m.to, ['nurse@example.org']);
    assert.match(m.text, /123456/);
    assert(!/spam/.test(m.text + m.subject), 'no caller text in reset mail');
    assert.strictEqual((await call({ kind: 'reset', to: 'nurse@example.org', code: 'visit spam.example' })).status, 400);
    assert.strictEqual((await call({ kind: 'reset', to: 'a@b.c, d@e.org', code: '123456' })).status, 400);
    assert.strictEqual((await call({ kind: 'anything', to: 'x@example.org', text: 'hi' })).status, 400);
    assert.strictEqual((await call({ kind: 'feedback', text: 'hi' }, {})).status, 403, 'needs the header');
    limitOk = false;
    assert.strictEqual((await call({ kind: 'feedback', text: 'hi' })).status, 429);
    limitOk = true;
    assert.strictEqual(sent.length, 0);
    assert.deepStrictEqual(recorded.splice(0), ['feedback', 'reset'], 'only sent mail is counted');
  });

  const relaySrv = http.createServer(async (q, s) => {
    const chunks = [];
    for await (const c of q) chunks.push(c);
    const r = await handle(new Request(`http://127.0.0.1:${RELAY_PORT}${q.url}`, { method: q.method, headers: q.headers, body: Buffer.concat(chunks) }), env, fakeResend);
    s.writeHead(r.status, { 'Content-Type': 'application/json' });
    s.end(await r.text());
  });
  await new Promise((r) => relaySrv.listen(RELAY_PORT, '127.0.0.1', r));
  const child = spawn(process.execPath, [path.join(ROOT, 'server.js')], {
    env: { ...process.env, NL_PORT: String(MAIL_PORT), NL_DATA: path.join(tmp, 'mail'), NL_NO_DIALOGS: '1', NL_NO_UPDATE_CHECK: '1', NL_MAIL_RELAY: `http://127.0.0.1:${RELAY_PORT}` },
    stdio: 'ignore', windowsHide: true,
  });
  const at = { port: MAIL_PORT };
  try {
    for (let i = 0; i < 100; i++) {
      try { if ((await req('GET', '/api/ping', null, at)).json?.app === 'nurse-log') break; } catch { /* starting */ }
      await new Promise((r) => setTimeout(r, 100));
    }
    await test('http: with no school email, feedback and reset codes go out through the relay', async () => {
      cookie = '';
      assert.strictEqual((await req('GET', '/api/state', null, at)).json.emailReady, true);
      assert.strictEqual((await req('POST', '/api/setup', { schoolName: 'Relay School', username: 'admin', fullName: 'Ada Admin', email: 'ada@example.org', password: PW }, at)).status, 200);
      let r = await req('POST', '/api/feedback', { text: 'The dose button is great' }, at);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
      let m = sent.pop();
      assert.deepStrictEqual(m.to, ['hi@c3dprints.com']);
      assert.match(m.subject, /Relay School/);
      assert.match(m.text, /The dose button is great[\s\S]*Ada Admin <ada@example.org>/);
      assert.strictEqual((await req('POST', '/api/feedback', { text: 'again' }, at)).status, 429, 'one note a minute');
      cookie = '';
      r = await req('POST', '/api/reset/request', { login: 'admin' }, at);
      assert.strictEqual(r.json.sent, true);
      m = sent.pop();
      assert.deepStrictEqual(m.to, ['ada@example.org']);
      const code = m.text.match(/code is: (\d{6})/)[1];
      r = await req('POST', '/api/reset/finish', { login: 'admin', code, password: 'Relay password 88' }, at);
      assert.strictEqual(r.status, 200, JSON.stringify(r.json));
    });
  } finally {
    child.kill();
    relaySrv.close();
  }
}

(async () => {
  await unit();
  await setupUpdaterTests();
  await httpTests();
  await schoolReadyTests();
  await relayTests();
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
