'use strict';
// Student roster import: a CSV or Excel export from the school's student
// information system (PowerSchool, Infinite Campus, Skyward, a spreadsheet...).
// Column names are matched loosely ("Student Number", "Last Name", "Birthdate",
// "Grade Level", "Homeroom Teacher"...), values are tidied (dates to YYYY-MM-DD,
// sex to F/M/X), and Records.importStudents applies them.

const ExcelJS = require('exceljs');

const MAX_ROWS = 5000;

// field -> header names that mean it, compared without case, spaces or punctuation.
const HEADERS = {
  student_no: ['studentid', 'studentnumber', 'studentno', 'id', 'idnumber', 'stateid', 'localid', 'sisid', 'pupilnumber', 'studentidnumber'],
  first_name: ['firstname', 'first', 'givenname', 'studentfirstname', 'legalfirstname', 'preferredfirstname'],
  last_name: ['lastname', 'last', 'surname', 'familyname', 'studentlastname', 'legallastname'],
  dob: ['dob', 'dateofbirth', 'birthdate', 'birthday'],
  grade: ['grade', 'gradelevel', 'gr', 'currentgrade'],
  homeroom: ['homeroom', 'homeroomteacher', 'teacher', 'hr', 'advisory', 'room', 'homeroomnumber'],
  sex: ['sex', 'gender'],
  guardian_name: ['guardian', 'guardianname', 'parent', 'parentname', 'parentguardian', 'contact1name', 'primarycontact', 'mother', 'parent1'],
  guardian_phone: ['guardianphone', 'parentphone', 'phone', 'homephone', 'contact1phone', 'primaryphone', 'primarycontactphone', 'parent1phone'],
  guardian2_name: ['guardian2', 'guardian2name', 'secondcontact', 'contact2name', 'secondarycontact', 'father', 'parent2'],
  guardian2_phone: ['guardian2phone', 'secondcontactphone', 'contact2phone', 'secondaryphone', 'secondarycontactphone', 'parent2phone'],
  physician: ['physician', 'doctor', 'pediatrician', 'primarycarephysician'],
  physician_phone: ['physicianphone', 'doctorphone'],
  allergies: ['allergies', 'allergy'],
  conditions: ['conditions', 'healthconditions', 'medicalconditions', 'medicalalerts', 'healthalerts'],
};

const squash = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');
const bad = (msg) => Object.assign(new Error(msg), { code: 400 });

// header row -> { field: column index }, plus the headers nothing matched.
function mapHeaders(headers) {
  const map = {};
  const unused = [];
  headers.forEach((raw, i) => {
    const k = squash(raw);
    const field = Object.keys(HEADERS).find((f) => !(f in map) && HEADERS[f].includes(k));
    if (field) map[field] = i;
    else if (String(raw ?? '').trim()) unused.push(String(raw).trim());
  });
  return { map, unused };
}

// CSV (or tab separated when the first line has tabs and no commas): quoted
// fields, doubled quotes, commas and line breaks inside quotes.
function parseCsv(text) {
  text = String(text).replace(/^﻿/, '');
  const first = text.split(/\r?\n/, 1)[0];
  const sep = first.includes('\t') && !first.includes(',') ? '\t' : ',';
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false; else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === sep) { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((v) => String(v).trim()));
}

async function parseXlsx(buf) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (r) => {
    const out = [];
    r.eachCell({ includeEmpty: true }, (cell, col) => {
      let v = cell.value;
      if (v && typeof v === 'object' && !(v instanceof Date)) v = v.text ?? v.result ?? (v.richText ? v.richText.map((t) => t.text).join('') : '');
      out[col - 1] = v;
    });
    rows.push(out);
  });
  return rows;
}

const p2 = (n) => String(n).padStart(2, '0');

// 2015-09-30, 9/30/2015, 09-30-15, an Excel date or day number -> 2015-09-30, else null.
function normDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date && !Number.isNaN(v.getTime())) return `${v.getUTCFullYear()}-${p2(v.getUTCMonth() + 1)}-${p2(v.getUTCDate())}`;
  if (typeof v === 'number' && v > 1000 && v < 80000) return normDate(new Date(Date.UTC(1899, 11, 30) + v * 86400000));
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return `${m[1]}-${p2(m[2])}-${p2(m[3])}`;
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(s);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12 && Number(m[2]) >= 1 && Number(m[2]) <= 31) {
    let y = Number(m[3]);
    if (y < 100) y += y > new Date().getFullYear() % 100 ? 1900 : 2000;
    return `${y}-${p2(m[1])}-${p2(m[2])}`;
  }
  return null;
}

function normSex(v) {
  const s = squash(v);
  if (!s) return null;
  if (['f', 'female', 'girl'].includes(s)) return 'F';
  if (['m', 'male', 'boy'].includes(s)) return 'M';
  return 'X';
}

// The file -> { rows: [{ line, values: { field: value }, problems }], columns, unused }.
async function read(buf, filename) {
  if (/\.xls$/i.test(filename || '')) throw bad('old .xls files cannot be read; save it as .xlsx or .csv first');
  const isXlsx = /\.xlsx$/i.test(filename || '') || (buf[0] === 0x50 && buf[1] === 0x4b);
  let table;
  try {
    table = isXlsx ? await parseXlsx(buf) : parseCsv(buf.toString('utf8'));
  } catch {
    throw bad('that file could not be read; use a .csv or .xlsx file');
  }
  // Exports often start with a title line; the header is the first row naming a last name.
  const at = Math.max(0, table.findIndex((r) => r.some((v) => HEADERS.last_name.includes(squash(v)))));
  if (table.length - at < 2) throw bad('the file has no student rows under a header row');
  const { map, unused } = mapHeaders(table[at]);
  if (!('first_name' in map) || !('last_name' in map)) throw bad('the file needs First name and Last name columns in its header row');
  if (table.length - at - 1 > MAX_ROWS) throw bad(`the file has more than ${MAX_ROWS} students; split it`);
  const rows = table.slice(at + 1).map((r, i) => {
    const values = {};
    const problems = [];
    for (const [f, col] of Object.entries(map)) {
      const raw = r[col];
      let v;
      if (f === 'dob') {
        v = normDate(raw);
        if (!v && raw != null && String(raw).trim()) problems.push(`date of birth "${raw}" was not understood, left out`);
      } else if (f === 'sex') v = normSex(raw);
      else v = raw == null ? null : String(raw instanceof Date ? normDate(raw) : raw).trim() || null;
      values[f] = v;
    }
    return { line: at + i + 2, values, problems };
  });
  return { rows, columns: Object.keys(map), unused };
}

module.exports = { read, parseCsv, mapHeaders, normDate, normSex, HEADERS, MAX_ROWS };
