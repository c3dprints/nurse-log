'use strict';
// Students, medications, doses given and office visits. Every change goes to
// the audit log with who did it, when, and what changed. Health records are
// archived rather than deleted; only an admin can delete a single log entry.

const { localDate } = require('./db');

const STUDENT_FIELDS = ['student_no', 'first_name', 'last_name', 'dob', 'grade', 'homeroom', 'sex',
  'guardian_name', 'guardian_phone', 'guardian2_name', 'guardian2_phone', 'physician', 'physician_phone',
  'allergies', 'conditions', 'notes', 'home_meds', 'med_consent', 'pharmacy', 'med_notes'];
const PHONE_FIELDS = { guardian_phone: 'Guardian phone', guardian2_phone: 'Second contact phone' };
const MED_CONSENT = ['On file', 'Not on file', 'Expired'];
const MED_FIELDS = ['name', 'dose', 'route', 'times', 'days', 'prn', 'start_date', 'end_date', 'prescriber', 'instructions', 'on_hand', 'active'];
// Days a scheduled medication is due, as ISO weekdays (1 = Monday ... 7 = Sunday).
// Empty means school days, Monday to Friday.
const SCHOOL_DAYS = [1, 2, 3, 4, 5];
const VISIT_FIELDS = ['visit_at', 'complaint', 'assessment', 'treatment', 'disposition', 'temp', 'parent_contacted', 'notes'];
const GIVEN_STATUS = ['given', 'refused', 'absent', 'missed', 'held'];

const fail = (code, msg) => Object.assign(new Error(msg), { code });

function clean(input, fields) {
  const out = {};
  for (const f of fields) {
    if (!(f in input)) continue;
    let v = input[f];
    if (f === 'prn' || f === 'active' || f === 'parent_contacted') v = v ? 1 : 0;
    else if (f === 'on_hand') v = v === '' || v == null ? null : Math.max(0, Math.trunc(Number(v)) || 0);
    else if (f === 'visit_at') v = Number(v) || Date.now();
    else if (f in PHONE_FIELDS) v = phone(v, PHONE_FIELDS[f]);
    else v = v == null ? null : String(v).trim().slice(0, 4000) || null;
    if (f === 'med_consent' && v && !MED_CONSENT.includes(v)) throw fail(400, 'medication permission must be On file, Not on file or Expired');
    out[f] = v;
  }
  return out;
}

// US numbers only: exactly 10 digits, stored as (555) 123-4567. A leading 1 is dropped.
function phone(v, label) {
  let d = String(v ?? '').replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  if (d.length !== 10) throw fail(400, `${label} must be 10 digits`);
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function diff(before, after) {
  const d = {};
  for (const k of Object.keys(after)) if ((before[k] ?? null) !== (after[k] ?? null)) d[k] = { from: before[k] ?? null, to: after[k] ?? null };
  return d;
}

// "1,3,5" -> [1, 3, 5]; anything else is dropped.
function parseDays(s) {
  return [...new Set(String(s || '').split(/[,\s]+/).map(Number).filter((n) => Number.isInteger(n) && n >= 1 && n <= 7))].sort();
}
const medDays = (m) => (parseDays(m.days).length ? parseDays(m.days) : SCHOOL_DAYS);
const weekday = (date) => new Date(`${date}T12:00:00`).getDay() || 7;

// No-school days and breaks (Settings > Medication alerts): [{ from, to, label }] with
// YYYY-MM-DD dates. Returns the label for a closed day, or null.
function closedOn(closures, date) {
  const c = (closures || []).find((x) => x.from <= date && date <= (x.to || x.from));
  return c ? (c.label || 'No school') : null;
}

// "8:00, 12:30" -> ["08:00", "12:30"]
function parseTimes(s) {
  return String(s || '').split(/[,;\s]+/).map((t) => {
    const m = /^(\d{1,2}):?(\d{2})$/.exec(t.trim());
    if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
    return `${m[1].padStart(2, '0')}:${m[2]}`;
  }).filter(Boolean).sort();
}

function dayRange(day) {
  const d = day ? new Date(`${day}T00:00:00`) : new Date();
  d.setHours(0, 0, 0, 0);
  const start = d.getTime();
  d.setDate(d.getDate() + 1);
  return [start, d.getTime()];
}

const like = (q) => `%${String(q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;

class Records {
  constructor(db) {
    this.db = db;
  }

  // ---- students ---------------------------------------------------------------

  student(id) {
    const s = this.db.get('SELECT * FROM students WHERE id = ?', [id]);
    if (!s) throw fail(404, 'student not found');
    return s;
  }

  searchStudents({ q = '', grade = '', archived = false, limit = 200 } = {}) {
    const where = ['archived = ?'];
    const params = [archived ? 1 : 0];
    for (const word of String(q).trim().split(/\s+/).filter(Boolean)) {
      where.push("(first_name LIKE ? ESCAPE '\\' OR last_name LIKE ? ESCAPE '\\' OR student_no LIKE ? ESCAPE '\\' OR homeroom LIKE ? ESCAPE '\\' OR allergies LIKE ? ESCAPE '\\' OR conditions LIKE ? ESCAPE '\\')");
      const p = like(word);
      params.push(p, p, p, p, p, p);
    }
    if (grade) { where.push('grade = ?'); params.push(String(grade)); }
    params.push(Math.min(Number(limit) || 200, 2000));
    return this.db.all(`
      SELECT s.*,
        (SELECT COUNT(*) FROM medications m WHERE m.student_id = s.id AND m.active = 1) AS active_meds,
        (SELECT MAX(visit_at) FROM visits v WHERE v.student_id = s.id) AS last_visit
      FROM students s WHERE ${where.join(' AND ')}
      ORDER BY last_name COLLATE NOCASE, first_name COLLATE NOCASE LIMIT ?`, params);
  }

  grades() {
    return this.db.all("SELECT DISTINCT grade FROM students WHERE grade IS NOT NULL AND grade <> '' AND archived = 0 ORDER BY grade").map((r) => r.grade);
  }

  createStudent(user, input) {
    const v = clean(input, STUDENT_FIELDS);
    if (!v.first_name || !v.last_name) throw fail(400, 'first and last name are required');
    if (v.student_no && this.db.get('SELECT id FROM students WHERE student_no = ? AND archived = 0', [v.student_no])) throw fail(400, 'a student with that ID already exists');
    const now = Date.now();
    const cols = Object.keys(v);
    const { id } = this.db.tx(() => {
      const r = this.db.run(`INSERT INTO students(${cols.join(',')}, created_at, updated_at) VALUES(${cols.map(() => '?').join(',')}, ?, ?)`, [...cols.map((c) => v[c]), now, now]);
      this.db.audit(user, 'student.create', { entity: 'student', entityId: r.id, studentId: r.id, details: `${v.last_name}, ${v.first_name}` });
      return r;
    });
    return this.student(id);
  }

  updateStudent(user, id, input) {
    const before = this.student(id);
    const v = clean(input, STUDENT_FIELDS);
    if ('first_name' in v && !v.first_name) throw fail(400, 'first name is required');
    if ('last_name' in v && !v.last_name) throw fail(400, 'last name is required');
    const changes = diff(before, v);
    if (!Object.keys(changes).length) return before;
    const cols = Object.keys(changes);
    this.db.tx(() => {
      this.db.run(`UPDATE students SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...cols.map((c) => v[c]), Date.now(), id]);
      this.db.audit(user, 'student.update', { entity: 'student', entityId: id, studentId: id, details: changes });
    });
    return this.student(id);
  }

  setArchived(user, id, archived) {
    this.student(id);
    this.db.tx(() => {
      this.db.run('UPDATE students SET archived = ?, updated_at = ? WHERE id = ?', [archived ? 1 : 0, Date.now(), id]);
      this.db.audit(user, archived ? 'student.archive' : 'student.restore', { entity: 'student', entityId: id, studentId: id });
    });
    return this.student(id);
  }

  // The full board for one student. Opening a record is logged too.
  board(user, id) {
    const student = this.student(id);
    this.db.audit(user, 'student.view', { entity: 'student', entityId: id, studentId: id });
    return {
      student,
      medications: this.db.all('SELECT * FROM medications WHERE student_id = ? ORDER BY active DESC, name COLLATE NOCASE', [id]),
      given: this.givenLog({ studentId: id, limit: 500 }),
      visits: this.visitLog({ studentId: id, limit: 500 }),
      history: this.db.all('SELECT * FROM audit WHERE student_id = ? ORDER BY id DESC LIMIT 300', [id]),
    };
  }

  // ---- medications --------------------------------------------------------------

  medication(id) {
    const m = this.db.get('SELECT * FROM medications WHERE id = ?', [id]);
    if (!m) throw fail(404, 'medication not found');
    return m;
  }

  createMedication(user, studentId, input) {
    this.student(studentId);
    const v = clean(input, MED_FIELDS);
    if (!v.name) throw fail(400, 'medication name is required');
    if ('times' in v) v.times = parseTimes(v.times).join(', ') || null;
    if ('days' in v) v.days = parseDays(v.days).join(',') || null;
    if (!('active' in v)) v.active = 1;
    const now = Date.now();
    const cols = Object.keys(v);
    const { id } = this.db.tx(() => {
      const r = this.db.run(`INSERT INTO medications(student_id, ${cols.join(',')}, created_at, updated_at) VALUES(?, ${cols.map(() => '?').join(',')}, ?, ?)`, [studentId, ...cols.map((c) => v[c]), now, now]);
      this.db.audit(user, 'medication.create', { entity: 'medication', entityId: r.id, studentId, details: v });
      return r;
    });
    return this.medication(id);
  }

  updateMedication(user, id, input) {
    const before = this.medication(id);
    const v = clean(input, MED_FIELDS);
    if ('name' in v && !v.name) throw fail(400, 'medication name is required');
    if ('times' in v) v.times = parseTimes(v.times).join(', ') || null;
    if ('days' in v) v.days = parseDays(v.days).join(',') || null;
    const changes = diff(before, v);
    if (!Object.keys(changes).length) return before;
    const cols = Object.keys(changes);
    this.db.tx(() => {
      this.db.run(`UPDATE medications SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...cols.map((c) => v[c]), Date.now(), id]);
      this.db.audit(user, 'medication.update', { entity: 'medication', entityId: id, studentId: before.student_id, details: changes });
    });
    return this.medication(id);
  }

  // Records a dose (or refused/absent/...). A given dose takes one off the count on hand.
  recordGiven(user, medicationId, input) {
    const m = this.medication(medicationId);
    const status = GIVEN_STATUS.includes(input.status) ? input.status : 'given';
    const givenAt = Number(input.given_at) || Date.now();
    const scheduled = parseTimes(input.scheduled)[0] || null;
    const dose = String(input.dose || m.dose || '').trim().slice(0, 200) || null;
    const notes = String(input.notes || '').trim().slice(0, 4000) || null;
    const { id } = this.db.tx(() => {
      const r = this.db.run('INSERT INTO med_given(medication_id, student_id, given_at, scheduled, dose, status, notes, user_id) VALUES(?,?,?,?,?,?,?,?)',
        [m.id, m.student_id, givenAt, scheduled, dose, status, notes, user.id]);
      if (status === 'given' && m.on_hand != null) this.db.run('UPDATE medications SET on_hand = MAX(on_hand - 1, 0), updated_at = ? WHERE id = ?', [Date.now(), m.id]);
      this.db.audit(user, `med.${status}`, { entity: 'med_given', entityId: r.id, studentId: m.student_id, details: { medication: m.name, dose, scheduled, notes } });
      return r;
    });
    return this.db.get('SELECT * FROM med_given WHERE id = ?', [id]);
  }

  deleteGiven(user, id) {
    const g = this.db.get('SELECT * FROM med_given WHERE id = ?', [id]);
    if (!g) throw fail(404, 'entry not found');
    this.db.tx(() => {
      this.db.run('DELETE FROM med_given WHERE id = ?', [id]);
      if (g.status === 'given') this.db.run('UPDATE medications SET on_hand = on_hand + 1 WHERE id = ? AND on_hand IS NOT NULL', [g.medication_id]);
      this.db.audit(user, 'med.delete', { entity: 'med_given', entityId: id, studentId: g.student_id, details: g });
    });
  }

  givenLog({ studentId = null, from = null, to = null, q = '', limit = 1000 } = {}) {
    const where = ['1 = 1'];
    const params = [];
    if (studentId) { where.push('g.student_id = ?'); params.push(studentId); }
    if (from) { where.push('g.given_at >= ?'); params.push(Number(from)); }
    if (to) { where.push('g.given_at < ?'); params.push(Number(to)); }
    if (q) {
      where.push("(m.name LIKE ? ESCAPE '\\' OR s.first_name LIKE ? ESCAPE '\\' OR s.last_name LIKE ? ESCAPE '\\' OR g.notes LIKE ? ESCAPE '\\')");
      const p = like(q);
      params.push(p, p, p, p);
    }
    params.push(Math.min(Number(limit) || 1000, 10000));
    return this.db.all(`
      SELECT g.*, m.name AS medication, s.first_name, s.last_name, s.student_no, u.full_name AS given_by
      FROM med_given g
      JOIN medications m ON m.id = g.medication_id
      JOIN students s ON s.id = g.student_id
      LEFT JOIN users u ON u.id = g.user_id
      WHERE ${where.join(' AND ')} ORDER BY g.given_at DESC LIMIT ?`, params);
  }

  // Scheduled doses for a day with what has been recorded against each time.
  // Scheduled doses for one day: each active medication's times on its weekdays,
  // nothing on a no-school day. PRN medications are listed apart.
  // Doses due on a day. A medication only counts from the day it was added, so the
  // calendar does not show days before it as missed.
  medsDue(day) {
    const date = day || localDate(Date.now());
    const [start, end] = dayRange(date);
    const closed = closedOn(this.db.setting('noSchool', []), date);
    const meds = this.db.all(`
      SELECT m.*, s.first_name, s.last_name, s.grade, s.homeroom, s.allergies, s.med_alerts
      FROM medications m JOIN students s ON s.id = m.student_id
      WHERE m.active = 1 AND s.archived = 0 AND m.created_at < ?
        AND (m.start_date IS NULL OR m.start_date <= ?) AND (m.end_date IS NULL OR m.end_date >= ?)`, [end, date, date]);
    const given = this.db.all('SELECT * FROM med_given WHERE given_at >= ? AND given_at < ?', [start, end]);
    const rows = [];
    for (const m of meds) {
      if (closed || !medDays(m).includes(weekday(date))) continue;
      for (const t of parseTimes(m.times)) {
        const rec = given.find((g) => g.medication_id === m.id && g.scheduled === t);
        rows.push({ ...m, time: t, record: rec || null });
      }
    }
    rows.sort((a, b) => a.time.localeCompare(b.time) || a.last_name.localeCompare(b.last_name));
    const prn = meds.filter((m) => m.prn);
    return { date, closed, scheduled: rows, prn };
  }

  // One month (YYYY-MM) for the calendar page: per day, how many doses were due and
  // how they went. Days still to come count as pending.
  calendar(month) {
    if (!/^\d{4}-\d\d$/.test(month || '')) throw fail(400, 'month must look like 2026-10');
    const [y, mo] = month.split('-').map(Number);
    const today = localDate(Date.now());
    const days = [];
    for (let d = 1; d <= new Date(y, mo, 0).getDate(); d++) {
      const date = `${month}-${String(d).padStart(2, '0')}`;
      const due = this.medsDue(date);
      const count = { due: due.scheduled.length, given: 0, other: 0, pending: 0 };
      for (const r of due.scheduled) {
        if (r.record) count[r.record.status === 'given' ? 'given' : 'other']++;
        else count.pending++;
      }
      days.push({ date, closed: due.closed, past: date < today, today: date === today, ...count });
    }
    return { month, days };
  }

  setStudentAlerts(user, id, on) {
    this.student(id);
    this.db.run('UPDATE students SET med_alerts = ? WHERE id = ?', [on ? null : 'off', id]);
    this.db.audit(user, 'student.med-alerts', { entity: 'student', entityId: id, studentId: id, details: on ? 'on' : 'off' });
    return { medAlerts: !!on };
  }

  // ---- visits ---------------------------------------------------------------------

  visit(id) {
    const v = this.db.get('SELECT * FROM visits WHERE id = ?', [id]);
    if (!v) throw fail(404, 'visit not found');
    return v;
  }

  createVisit(user, studentId, input) {
    this.student(studentId);
    const v = clean(input, VISIT_FIELDS);
    if (!v.visit_at) v.visit_at = Date.now();
    if (!v.complaint) throw fail(400, 'enter the reason for the visit');
    const cols = Object.keys(v);
    const { id } = this.db.tx(() => {
      const r = this.db.run(`INSERT INTO visits(student_id, ${cols.join(',')}, user_id, updated_at) VALUES(?, ${cols.map(() => '?').join(',')}, ?, ?)`, [studentId, ...cols.map((c) => v[c]), user.id, Date.now()]);
      this.db.audit(user, 'visit.create', { entity: 'visit', entityId: r.id, studentId, details: { complaint: v.complaint, disposition: v.disposition || null } });
      return r;
    });
    return this.visit(id);
  }

  updateVisit(user, id, input) {
    const before = this.visit(id);
    const v = clean(input, VISIT_FIELDS);
    if ('complaint' in v && !v.complaint) throw fail(400, 'enter the reason for the visit');
    const changes = diff(before, v);
    if (!Object.keys(changes).length) return before;
    const cols = Object.keys(changes);
    this.db.tx(() => {
      this.db.run(`UPDATE visits SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, [...cols.map((c) => v[c]), Date.now(), id]);
      this.db.audit(user, 'visit.update', { entity: 'visit', entityId: id, studentId: before.student_id, details: changes });
    });
    return this.visit(id);
  }

  deleteVisit(user, id) {
    const v = this.visit(id);
    this.db.tx(() => {
      this.db.run('DELETE FROM visits WHERE id = ?', [id]);
      this.db.audit(user, 'visit.delete', { entity: 'visit', entityId: id, studentId: v.student_id, details: v });
    });
  }

  visitLog({ studentId = null, from = null, to = null, q = '', userId = null, limit = 1000 } = {}) {
    const where = ['1 = 1'];
    const params = [];
    if (studentId) { where.push('v.student_id = ?'); params.push(studentId); }
    if (userId) { where.push('v.user_id = ?'); params.push(userId); }
    if (from) { where.push('v.visit_at >= ?'); params.push(Number(from)); }
    if (to) { where.push('v.visit_at < ?'); params.push(Number(to)); }
    for (const word of String(q).trim().split(/\s+/).filter(Boolean)) {
      where.push("(v.complaint LIKE ? ESCAPE '\\' OR v.assessment LIKE ? ESCAPE '\\' OR v.treatment LIKE ? ESCAPE '\\' OR v.notes LIKE ? ESCAPE '\\' OR v.disposition LIKE ? ESCAPE '\\' OR s.first_name LIKE ? ESCAPE '\\' OR s.last_name LIKE ? ESCAPE '\\' OR s.student_no LIKE ? ESCAPE '\\')");
      const p = like(word);
      params.push(p, p, p, p, p, p, p, p);
    }
    params.push(Math.min(Number(limit) || 1000, 10000));
    return this.db.all(`
      SELECT v.*, s.first_name, s.last_name, s.student_no, s.grade, u.full_name AS nurse
      FROM visits v
      JOIN students s ON s.id = v.student_id
      LEFT JOIN users u ON u.id = v.user_id
      WHERE ${where.join(' AND ')} ORDER BY v.visit_at DESC LIMIT ?`, params);
  }

  auditLog({ from = null, to = null, q = '', limit = 2000 } = {}) {
    const where = ['1 = 1'];
    const params = [];
    if (from) { where.push('a.at >= ?'); params.push(Number(from)); }
    if (to) { where.push('a.at < ?'); params.push(Number(to)); }
    if (q) {
      where.push("(a.action LIKE ? ESCAPE '\\' OR a.username LIKE ? ESCAPE '\\' OR a.details LIKE ? ESCAPE '\\' OR s.last_name LIKE ? ESCAPE '\\' OR s.first_name LIKE ? ESCAPE '\\')");
      const p = like(q);
      params.push(p, p, p, p, p);
    }
    params.push(Math.min(Number(limit) || 2000, 20000));
    return this.db.all(`
      SELECT a.*, s.first_name, s.last_name FROM audit a LEFT JOIN students s ON s.id = a.student_id
      WHERE ${where.join(' AND ')} ORDER BY a.id DESC LIMIT ?`, params);
  }

  today() {
    const [start, end] = dayRange();
    return {
      visits: this.visitLog({ from: start, to: end, limit: 200 }),
      meds: this.medsDue(),
      lowStock: this.db.all(`
        SELECT m.id, m.name, m.on_hand, m.student_id, s.first_name, s.last_name FROM medications m
        JOIN students s ON s.id = m.student_id
        WHERE m.active = 1 AND s.archived = 0 AND m.on_hand IS NOT NULL AND m.on_hand <= 5 ORDER BY m.on_hand`),
      counts: {
        students: this.db.get('SELECT COUNT(*) AS n FROM students WHERE archived = 0').n,
        activeMeds: this.db.get('SELECT COUNT(*) AS n FROM medications m JOIN students s ON s.id = m.student_id WHERE m.active = 1 AND s.archived = 0').n,
      },
    };
  }
}

module.exports = { Records, parseTimes, parseDays, closedOn, dayRange, phone, MED_CONSENT, STUDENT_FIELDS, MED_FIELDS, VISIT_FIELDS, GIVEN_STATUS };
