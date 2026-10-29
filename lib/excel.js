'use strict';
// Excel workbooks for the export buttons. Each one starts with a line naming
// who exported it and when, and is marked confidential.

const ExcelJS = require('exceljs');
const { localDate } = require('./db');

const p2 = (n) => String(n).padStart(2, '0');
function stamp(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${localDate(ms)} ${p2(d.getHours())}:${p2(d.getMinutes())}`;
}
const name = (r) => `${r.last_name}, ${r.first_name}`;

const COLS = {
  students: [
    ['Student ID', (r) => r.student_no], ['Last name', (r) => r.last_name], ['First name', (r) => r.first_name],
    ['Date of birth', (r) => r.dob], ['Grade', (r) => r.grade], ['Homeroom', (r) => r.homeroom], ['Sex', (r) => r.sex],
    ['Guardian', (r) => r.guardian_name], ['Guardian phone', (r) => r.guardian_phone],
    ['Guardian 2', (r) => r.guardian2_name], ['Guardian 2 phone', (r) => r.guardian2_phone],
    ['Physician', (r) => r.physician], ['Physician phone', (r) => r.physician_phone],
    ['Allergies', (r) => r.allergies], ['Conditions', (r) => r.conditions], ['Notes', (r) => r.notes],
    ['Archived', (r) => (r.archived ? 'yes' : '')],
  ],
  medications: [
    ['Student', (r) => (r.last_name ? name(r) : '')], ['Medication', (r) => r.name], ['Dose', (r) => r.dose], ['Route', (r) => r.route],
    ['Times', (r) => r.times], ['As needed', (r) => (r.prn ? 'yes' : '')], ['Start', (r) => r.start_date], ['End', (r) => r.end_date],
    ['Prescriber', (r) => r.prescriber], ['Instructions', (r) => r.instructions], ['On hand', (r) => r.on_hand],
    ['Active', (r) => (r.active ? 'yes' : 'no')],
  ],
  given: [
    ['Date/time', (r) => stamp(r.given_at)], ['Student', name], ['Student ID', (r) => r.student_no], ['Medication', (r) => r.medication],
    ['Dose', (r) => r.dose], ['Scheduled', (r) => r.scheduled], ['Status', (r) => r.status], ['Notes', (r) => r.notes], ['By', (r) => r.given_by],
  ],
  visits: [
    ['Date/time', (r) => stamp(r.visit_at)], ['Student', name], ['Student ID', (r) => r.student_no], ['Grade', (r) => r.grade],
    ['Reason', (r) => r.complaint], ['Temp', (r) => r.temp], ['Assessment', (r) => r.assessment], ['Treatment', (r) => r.treatment],
    ['Outcome', (r) => r.disposition], ['Parent contacted', (r) => (r.parent_contacted ? 'yes' : '')], ['Notes', (r) => r.notes], ['Nurse', (r) => r.nurse],
  ],
  audit: [
    ['Date/time', (r) => stamp(r.at)], ['User', (r) => r.username], ['Action', (r) => r.action],
    ['Student', (r) => (r.last_name ? name(r) : '')], ['Record', (r) => (r.entity ? `${r.entity} #${r.entity_id}` : '')], ['Details', (r) => r.details],
  ],
};

function banner(ws, meta) {
  ws.addRow([`CONFIDENTIAL student health record. Exported by ${meta.by} on ${stamp(meta.at)}.`]).font = { italic: true, color: { argb: 'FF8A1C1C' } };
}

function addSheet(wb, title, cols, rows, meta) {
  const ws = wb.addWorksheet(title);
  banner(ws, meta);
  const head = ws.addRow(cols.map((c) => c[0]));
  head.font = { bold: true };
  head.eachCell((c) => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6EEF5' } }; });
  for (const r of rows) ws.addRow(cols.map((c) => { const v = c[1](r); return v == null ? '' : v; }));
  cols.forEach((c, i) => {
    let w = c[0].length;
    for (const r of rows) w = Math.max(w, Math.min(60, String(c[1](r) ?? '').length));
    ws.getColumn(i + 1).width = w + 2;
  });
  ws.views = [{ state: 'frozen', ySplit: 2 }];
  ws.autoFilter = { from: { row: 2, column: 1 }, to: { row: 2, column: cols.length } };
}

function addInfoSheet(wb, s, meta) {
  const ws = wb.addWorksheet('Student');
  banner(ws, meta);
  for (const [label, get] of COLS.students) ws.addRow([label, get(s) ?? '']).getCell(1).font = { bold: true };
  ws.getColumn(1).width = 20;
  ws.getColumn(2).width = 60;
  ws.getColumn(2).alignment = { wrapText: true, vertical: 'top' };
}

async function build(kind, data, meta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.by;
  wb.created = new Date(meta.at);
  if (kind === 'student') {
    addInfoSheet(wb, data.student, meta);
    addSheet(wb, 'Medications', COLS.medications, data.medications, meta);
    addSheet(wb, 'Medication log', COLS.given, data.given, meta);
    addSheet(wb, 'Visits', COLS.visits, data.visits, meta);
  } else if (kind === 'all') {
    addSheet(wb, 'Students', COLS.students, data.students, meta);
    addSheet(wb, 'Medications', COLS.medications, data.medications, meta);
    addSheet(wb, 'Medication log', COLS.given, data.given, meta);
    addSheet(wb, 'Visits', COLS.visits, data.visits, meta);
  } else if (kind === 'students') {
    addSheet(wb, 'Students', COLS.students, data, meta);
  } else if (kind === 'visits') {
    addSheet(wb, 'Visits', COLS.visits, data, meta);
  } else if (kind === 'given') {
    addSheet(wb, 'Medication log', COLS.given, data, meta);
  } else if (kind === 'audit') {
    addSheet(wb, 'Audit log', COLS.audit, data, meta);
  } else {
    throw new Error('unknown export');
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

module.exports = { build, stamp };
