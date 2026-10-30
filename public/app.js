'use strict';
// Nurse’s Log app window. Plain DOM, no framework. Every value from the server
// goes in through textContent (h() below), never innerHTML.

// ---- helpers ------------------------------------------------------------------

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'value') el.value = v;
    else if (k === 'checked') el.checked = !!v;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const k of kids.flat(Infinity)) if (k != null && k !== false) el.append(k instanceof Node ? k : String(k));
  return el;
}

const ICONS = {
  today: 'M8 2v3M16 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5Z',
  students: 'M16 20v-1.5a3.5 3.5 0 0 0-3.5-3.5h-5A3.5 3.5 0 0 0 4 18.5V20M10 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM20 20v-1.5a3.5 3.5 0 0 0-2.5-3.35M15.5 4.15a3.5 3.5 0 0 1 0 6.7',
  visits: 'M9 4.5H6.5A1.5 1.5 0 0 0 5 6v13.5A1.5 1.5 0 0 0 6.5 21h11a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5H15M9 3.5h6v3H9zM12 10v6M9 13h6',
  meds: 'M10.5 20.5 3.5 13.5a4.95 4.95 0 0 1 7-7l7 7a4.95 4.95 0 0 1-7 7ZM7 10l7 7',
  audit: 'M12 3 4.5 6v5.5c0 4.5 3.2 8.3 7.5 9.5 4.3-1.2 7.5-5 7.5-9.5V6L12 3ZM9 12l2 2 4-4',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z',
  calendar: 'M8 2v3M16 2v3M3.5 9h17M5 4.5h14a1.5 1.5 0 0 1 1.5 1.5v13A1.5 1.5 0 0 1 19 20.5H5A1.5 1.5 0 0 1 3.5 19V6A1.5 1.5 0 0 1 5 4.5ZM8 13h.01M12 13h.01M16 13h.01M8 17h.01M12 17h.01M16 17h.01',
  out: 'M15 4h3.5A1.5 1.5 0 0 1 20 5.5v13a1.5 1.5 0 0 1-1.5 1.5H15M10 16l4-4-4-4M14 12H4',
};
function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.8');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', ICONS[name]);
  svg.append(p);
  return svg;
}

const p2 = (n) => String(n).padStart(2, '0');
const dateStr = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
const today = () => dateStr(new Date());
const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return dateStr(d); };
function fmtDT(ms) {
  if (!ms) return '';
  const d = new Date(ms);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;
}
const fmtTime = (ms) => (ms ? new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : '');
function fmtHM(hm) {
  const [H, M] = hm.split(':').map(Number);
  return new Date(2000, 0, 1, H, M).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
const toLocalInput = (ms) => { const d = new Date(ms); return `${dateStr(d)}T${p2(d.getHours())}:${p2(d.getMinutes())}`; };
const fromLocalInput = (s) => (s ? new Date(s).getTime() : Date.now());
function age(dob) {
  if (!dob) return '';
  const b = new Date(dob + 'T00:00:00');
  const n = new Date();
  let a = n.getFullYear() - b.getFullYear();
  if (n < new Date(n.getFullYear(), b.getMonth(), b.getDate())) a--;
  return a >= 0 && a < 120 ? `${a} yrs` : '';
}
const fullName = (r) => `${r.last_name}, ${r.first_name}`;

function toast(msg, bad = false) {
  const t = h('div', { class: 'toast' + (bad ? ' bad' : ''), role: bad ? 'alert' : 'status' }, msg);
  document.getElementById('toasts').append(t);
  setTimeout(() => t.remove(), bad ? 7000 : 4000);
}

function debounce(fn, ms) {
  let t;
  return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

// ---- api ------------------------------------------------------------------------

let reauthing = null;

async function api(method, url, body, { raw = false, noReauth = false } = {}) {
  const res = await fetch(url, {
    method,
    headers: method === 'POST' ? { 'Content-Type': 'application/json', 'X-Nurse-Log': '1' } : {},
    body: method === 'POST' ? JSON.stringify(body || {}) : undefined,
    credentials: 'same-origin',
  });
  if (res.status === 401 && !noReauth && S.user) {
    // Signed out mid-task (idle timeout): sign back in over the page and retry, so a half-typed note is not lost.
    await reauth();
    return api(method, url, body, { raw, noReauth: true });
  }
  const type = res.headers.get('content-type') || '';
  if (raw && res.ok && !type.includes('json')) return res;
  const data = type.includes('json') ? await res.json() : {};
  if (!res.ok) {
    if (res.status === 403 && data.error === 'change your password first') { S.user.mustChange = true; render(); }
    throw new Error(data.error || `request failed (${res.status})`);
  }
  return data;
}
const get = (url) => api('GET', url);
const post = (url, body) => api('POST', url, body);

function reauth() {
  if (reauthing) return reauthing;
  reauthing = new Promise((resolve, reject) => {
    const err = errBox();
    const byPin = !!(S.device && S.device.username === S.user.username);
    const pw = byPin ? pinInput() : h('input', { type: 'password', autocomplete: 'current-password' });
    const label = h('label', {}, byPin ? 'PIN' : 'Password');
    let ticket = null; // two-step sign-in: the password was right, now the code
    const submit = async () => {
      try {
        if (byPin) await api('POST', '/api/login/pin', { pin: pw.value }, { noReauth: true });
        else if (ticket) await api('POST', '/api/login/code', { ticket, code: pw.value }, { noReauth: true });
        else {
          const r = await api('POST', '/api/login', { username: S.user.username, password: pw.value }, { noReauth: true });
          if (r.needCode) {
            ticket = r.ticket;
            label.textContent = 'Code from your authenticator app';
            pw.type = 'text';
            pw.setAttribute('inputmode', 'numeric');
            pw.setAttribute('autocomplete', 'one-time-code');
            pw.value = '';
            err.classList.add('hidden');
            pw.focus();
            return;
          }
        }
        m.close();
        reauthing = null;
        lastActive = Date.now();
        resolve();
      } catch (e) {
        showErr(err, e.message);
        pw.value = '';
        if (ticket && /password again/.test(e.message)) {
          ticket = null;
          label.textContent = 'Password';
          pw.type = 'password';
          pw.setAttribute('autocomplete', 'current-password');
        }
        // The phone was forgotten (too many wrong PINs): ask for the password instead.
        if (byPin && /password/.test(e.message)) { S.device = null; m.close(); reauthing = null; reauth().then(resolve, reject); }
      }
    };
    pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const m = modal('You were signed out', [
      h('p', { class: 'muted' }, `Nurse’s Log signs out after ${S.idleMinutes} idle minutes. ${byPin ? 'Enter your PIN' : `Sign in again as ${S.user.username}`} to continue; anything you were typing is kept.`),
      err, label, pw,
    ], [
      ['Sign out', () => { m.close(); reauthing = null; S.user = null; reject(new Error('signed out')); renderLogin(); }],
      ['Sign in', submit, 'primary'],
    ], { noDismiss: true });
  });
  return reauthing;
}

// ---- modal, menus, forms ------------------------------------------------------

function modal(title, body, actions = [], { wide = false, noDismiss = false } = {}) {
  const box = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? 'max-width:860px' : null },
    h('h2', {}, title), body,
    h('div', { class: 'actions' }, actions.map(([label, fn, cls]) => h('button', { class: 'btn ' + (cls || ''), type: 'button', onclick: fn }, label))));
  const ov = h('div', { class: 'overlay' }, box);
  const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape' && !noDismiss && ov.isConnected) close(); };
  if (!noDismiss) ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(); });
  document.addEventListener('keydown', onKey);
  document.body.append(ov);
  const first = box.querySelector('input, select, textarea');
  if (first) setTimeout(() => first.focus(), 30);
  return { close, box };
}

// ---- photos ----------------------------------------------------------------------
// Round photo for a student or user, or their initials when there is none. `at` is
// the photo's last change, which also busts the browser's copy.
function avatar(kind, id, at, name, size = 40) {
  const style = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.38)}px`;
  if (at) return h('img', { class: 'avatar', src: `/api/photos/${kind}/${id}?v=${at}`, alt: '', style, draggable: 'false' });
  const initials = String(name || '').trim().split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  return h('span', { class: 'avatar empty', 'aria-hidden': 'true', style }, initials || '?');
}

// Picks a picture (camera or files on a phone) and makes a 360 px square JPEG of its
// middle, small enough to keep in the database. Resolves null when nothing was picked.
function pickPhoto() {
  return new Promise((resolve, reject) => {
    const input = h('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return resolve(null);
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement('canvas');
        c.width = c.height = 360;
        c.getContext('2d').drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, 360, 360);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('that picture could not be opened; try a JPEG or PNG')); };
      img.src = url;
    });
    document.body.append(input);
    input.click();
  });
}

function photoDialog({ title, kind, id, at, name, save, remove, done }) {
  const err = errBox();
  const shown = h('div', { class: 'photo-big' }, avatar(kind, id, at, name, 180));
  const m = modal(title, [shown, err, h('p', { class: 'muted small' }, 'Pick a picture or take one with a phone\u2019s camera. The middle of it is kept as a small square.')], [
    ...(at ? [['Remove photo', async () => {
      try { const r = await remove(); m.close(); toast('Photo removed'); done(r); } catch (e) { showErr(err, e.message); }
    }, 'danger']] : []),
    ['Cancel', () => m.close()],
    [at ? 'Choose another' : 'Choose photo', async () => {
      try {
        const data = await pickPhoto();
        if (!data) return;
        const r = await save(data);
        m.close();
        toast('Photo saved');
        done(r);
      } catch (e) { showErr(err, e.message); }
    }, 'primary'],
  ]);
}

function confirmBox(title, text, okLabel = 'OK', danger = false) {
  return new Promise((resolve) => {
    const m = modal(title, h('p', {}, text), [
      ['Cancel', () => { m.close(); resolve(false); }],
      [okLabel, () => { m.close(); resolve(true); }, danger ? 'danger' : 'primary'],
    ]);
  });
}

// One open menu at a time; any click elsewhere closes it.
let openMenu = null;
document.addEventListener('click', () => { if (openMenu) { openMenu.classList.add('hidden'); openMenu = null; } });

function dropMenu(label, items, cls = '') {
  const menu = h('div', { class: 'menu hidden', role: 'menu' });
  const btn = h('button', { class: 'btn ' + cls, type: 'button', 'aria-haspopup': 'true' }, label, ' \u25BE');
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wasOpen = openMenu === menu;
    if (openMenu) openMenu.classList.add('hidden');
    openMenu = null;
    if (wasOpen) return;
    menu.replaceChildren(...items().map(([t, sub, fn]) => h('button', { type: 'button', role: 'menuitem', onclick: () => fn() }, t, sub ? h('small', {}, sub) : null)));
    menu.classList.remove('hidden');
    openMenu = menu;
  });
  return h('div', { class: 'menu-wrap' }, btn, menu);
}

// Excel export with the three ways to save. params() gives the filters at click time.
function exportMenu(kind, params = () => ({}), label = 'Export to Excel') {
  if (!can('export')) return null;
  // On a phone (S.remote) the Save As dialog would open on the office PC, so it is left out.
  return dropMenu(label, () => [
    S.remote ? null : ['Save as\u2026', 'pick where to save it', () => doExport(kind, params(), 'saveas')],
    ['Save to folder', S.exportFolder || 'an admin sets the folder in Settings', () => doExport(kind, params(), 'folder')],
    ['Download', S.remote ? 'to this device' : 'to this PC\u2019s Downloads folder', () => doExport(kind, params(), 'download')],
  ].filter(Boolean));
}

async function doExport(kind, params, target) {
  try {
    if (target === 'download') {
      const res = await api('POST', '/api/export', { kind, target, ...params }, { raw: true });
      const name = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '')?.[1] || 'export.xlsx';
      const url = URL.createObjectURL(await res.blob());
      const a = h('a', { href: url, download: name });
      document.body.append(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast(`Downloaded ${name}`);
      return;
    }
    if (target === 'saveas') toast('Choose where to save in the Windows dialog\u2026');
    const r = await post('/api/export', { kind, target, ...params });
    toast(r.cancelled ? 'Save cancelled' : `Saved ${r.path}`);
  } catch (e) {
    toast(e.message, true);
  }
}

// US phone: digits only, at most 10, shown as (555) 123-4567 while typing.
function fmtPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d[0] === '1') d = d.slice(1);
  d = d.slice(0, 10);
  if (d.length < 4) return d;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

// ISO weekdays, Monday = 1. A medication with no days set is given Monday to Friday.
const WEEKDAYS = [[1, 'Mon'], [2, 'Tue'], [3, 'Wed'], [4, 'Thu'], [5, 'Fri'], [6, 'Sat'], [7, 'Sun']];
const medDays = (m) => { const d = String((m && m.days) || '').split(',').map(Number).filter((n) => n >= 1 && n <= 7); return d.length ? d : [1, 2, 3, 4, 5]; };
function daysLabel(days) {
  const s = days.join(',');
  if (s === '1,2,3,4,5') return '';
  if (s === '1,2,3,4,5,6,7') return 'every day';
  return WEEKDAYS.filter(([n]) => days.includes(n)).map(([, l]) => l).join(', ');
}

// fields: [name, label, type, opts]; type: text|email|password|date|number|textarea|select|check|datetime|tel|days|heading
function formGrid(fields, values = {}) {
  const form = h('form', { class: 'grid', onsubmit: (e) => e.preventDefault() });
  for (const [name, label, type = 'text', opts = {}] of fields) {
    let input;
    const v = values[name];
    if (type === 'heading') { form.append(h('h3', { class: 'wide formhead' }, label)); continue; }
    if (type === 'tel') {
      input = h('input', { type: 'tel', name, value: fmtPhone(v), inputmode: 'numeric', autocomplete: 'off', maxlength: 14, placeholder: '(555) 123-4567' });
      input.addEventListener('input', () => { input.value = fmtPhone(input.value); });
    } else if (type === 'textarea') input = h('textarea', { name, rows: opts.rows || 3 });
    else if (type === 'select') input = h('select', { name }, (opts.choices || []).map((c) => h('option', { value: c, selected: (v ?? opts.default ?? '') === c }, c || '\u2014')));
    else if (type === 'check') {
      form.append(h('div', { class: opts.wide ? 'wide' : null }, h('label', { class: 'check' }, h('input', { type: 'checkbox', name, checked: !!v }), label)));
      continue;
    } else if (type === 'days') {
      const on = medDays({ days: v });
      form.append(h('div', { class: 'wide' }, h('label', {}, label), h('div', { class: 'days', role: 'group', 'aria-label': label },
        WEEKDAYS.map(([n, l]) => h('label', { class: 'day' }, h('input', { type: 'checkbox', name: `${name}:${n}`, checked: on.includes(n) }), l)))));
      continue;
    } else if (type === 'datetime') input = h('input', { type: 'datetime-local', name, value: toLocalInput(v || Date.now()) });
    else input = h('input', { type, name, value: v ?? '', placeholder: opts.placeholder || null, autocomplete: opts.autocomplete || 'off', list: opts.list || null, min: opts.min ?? null });
    if (type === 'textarea') input.value = v ?? '';
    if (opts.required) input.required = true;
    form.append(h('div', { class: opts.wide || type === 'textarea' ? 'wide' : null }, h('label', {}, label + (opts.required ? ' *' : '')), input));
  }
  return form;
}

function readForm(form) {
  const out = {};
  for (const el of form.elements) {
    if (!el.name) continue;
    const [base, day] = el.name.split(':');
    if (day) out[base] = [out[base], el.checked ? day : ''].filter(Boolean).join(',');
    else if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'datetime-local') out[el.name] = fromLocalInput(el.value);
    else out[el.name] = el.value;
  }
  return out;
}

function table(cols, rows, { onRow, empty = 'Nothing here yet.' } = {}) {
  if (!rows.length) return h('div', { class: 'empty' }, empty);
  return h('div', { class: 'tablewrap' }, h('table', {},
    h('thead', {}, h('tr', {}, cols.map((c) => h('th', { class: c.nowrap ? 'nowrap' : null }, c.label)))),
    h('tbody', {}, rows.map((r) => h('tr', { class: onRow ? 'click' : null, onclick: onRow ? (e) => { if (!e.target.closest('button, a, input')) onRow(r); } : null },
      cols.map((c) => h('td', { class: c.nowrap ? 'nowrap' : null }, c.get(r))))))));
}

// replaceChildren for page bodies: skips the null/false left by optional parts.
function fill(el, ...kids) {
  el.replaceChildren(...kids.flat(Infinity).filter((k) => k != null && k !== false));
}

function errBox() { return h('div', { class: 'alert bad hidden', role: 'alert' }); }
function showErr(box, msg) { box.textContent = msg; box.classList.remove('hidden'); }

// ---- app state and routing ------------------------------------------------------

const S = { user: null, needsSetup: false, schoolName: '', emailReady: false, mailRelay: false, idleMinutes: 15, exportFolder: '', version: '', remote: false, aiReady: false, dictateKey: 'F2', board: null, device: null, pinSignIn: true };
const $app = document.getElementById('app');

// What the signed-in role may do (the server checks too): edit, dose, visit, export, dictate.
const can = (perm) => !!S.user && (S.user.role === 'admin' || (S.user.perms || []).includes(perm));

// [key, name, kind, swatch colors: background, panel, accent, style]
const THEMES = [
  ['system', 'Match Windows', 'light or dark', ['#f4f6f8', '#12171c', '#0f766e']],
  ['teal', 'Teal', 'light', ['#f4f6f8', '#ffffff', '#0f766e']],
  ['ocean', 'Ocean', 'light', ['#f2f6fb', '#ffffff', '#1d5fbf']],
  ['lavender', 'Lavender', 'light', ['#f6f4fb', '#ffffff', '#6d4bc4']],
  ['rose', 'Rose', 'light', ['#fbf4f6', '#ffffff', '#b8336a']],
  ['sage', 'Sage', 'light', ['#f3f7f2', '#ffffff', '#3a7535']],
  ['sunshine', 'Sunshine', 'light', ['#fbf7ef', '#fffdf9', '#a65705']],
  ['night', 'Night', 'dark', ['#12171c', '#1a2128', '#2dd4bf']],
  ['midnight', 'Midnight', 'dark', ['#0f1420', '#161d2d', '#7aa7ff']],
  ['mist', 'Mist', 'light', ['#f3f5f8', '#fbfcfd', '#52708e'], 'material'],
  ['blush', 'Blush', 'light', ['#f8f2f2', '#fffbfb', '#985f68'], 'material'],
  ['eucalyptus', 'Eucalyptus', 'light', ['#f2f5f1', '#fbfcfa', '#5e7d5b'], 'material'],
  ['lilac', 'Lilac', 'light', ['#f5f3f8', '#fcfbfe', '#7a66a0'], 'material'],
  ['clay', 'Clay', 'light', ['#f8f4ef', '#fffcf8', '#9a6d4f'], 'material'],
  ['seafoam', 'Seafoam', 'light', ['#f0f6f5', '#fafdfc', '#4f8078'], 'material'],
  ['dusk', 'Dusk', 'dark', ['#1c1b20', '#25242b', '#b8a8d9'], 'material'],
  ['slate', 'Slate', 'dark', ['#1a1e22', '#22282d', '#9cbfd6'], 'material'],
];

// Teal is the base light palette in style.css; every other theme overrides it by name.
// Material themes also set <html data-style="material"> for the rounder, softer look.
function applyTheme(theme) {
  const found = THEMES.find((x) => x[0] === theme) || THEMES[0];
  const style = found[4] || 'classic';
  document.documentElement.setAttribute('data-theme', found[0]);
  if (style === 'material') document.documentElement.setAttribute('data-style', 'material');
  else document.documentElement.removeAttribute('data-style');
  try { localStorage.setItem('nl.theme', found[0]); localStorage.setItem('nl.style', style); } catch { /* storage blocked */ }
}

// Text size for this PC (screens differ, so it is not part of the account): CSS zoom
// on <html>, kept in localStorage and put back by theme.js before the first paint.
// Phones skip it and use pinch zoom.
const ZOOMS = [0.9, 1, 1.1, 1.25, 1.4, 1.6, 1.8];
const isPhone = () => matchMedia('(max-width: 760px)').matches;
const pct = (z) => `${Math.round(z * 100)}%`;

function getZoom() {
  try { const z = Number(localStorage.getItem('nl.zoom')); return ZOOMS.includes(z) ? z : 1; } catch { return 1; }
}

function setZoom(z) {
  if (!ZOOMS.includes(z)) z = 1;
  try { localStorage.setItem('nl.zoom', String(z)); } catch { /* storage off */ }
  const on = isPhone() || z === 1 ? '' : String(z);
  document.documentElement.style.zoom = on;
  if (on) document.documentElement.style.setProperty('--zoom', on); else document.documentElement.style.removeProperty('--zoom');
  for (const el of document.querySelectorAll('.zoom-now')) el.textContent = pct(z);
  // Bigger text needs a bigger window: grow the app window to its usual size times the zoom,
  // within the screen. Never shrinks it and leaves a maximized window alone.
  const w = Math.min(screen.availWidth, Math.round(1180 * z)), ht = Math.min(screen.availHeight, Math.round(860 * z));
  if (!isPhone() && window.outerWidth < screen.availWidth - 16 && (window.outerWidth < w || window.outerHeight < ht)) {
    try {
      window.resizeTo(Math.max(w, window.outerWidth), Math.max(ht, window.outerHeight));
      const left = screen.availLeft || 0, top = screen.availTop || 0;
      window.moveTo(Math.max(left, Math.min(window.screenX, left + screen.availWidth - window.outerWidth)), Math.max(top, Math.min(window.screenY, top + screen.availHeight - window.outerHeight)));
    } catch { /* a normal browser tab cannot be resized */ }
  }
  return z;
}

function stepZoom(d) {
  const i = ZOOMS.indexOf(getZoom());
  return setZoom(ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + d))]);
}

function zoomControl() {
  return h('div', { class: 'zoom-ctl' },
    h('button', { class: 'btn', type: 'button', title: 'Smaller (Ctrl + minus)', 'aria-label': 'Smaller text', onclick: () => stepZoom(-1) }, 'A−'),
    h('b', { class: 'zoom-now', 'aria-live': 'polite' }, pct(getZoom())),
    h('button', { class: 'btn', type: 'button', title: 'Bigger (Ctrl + plus)', 'aria-label': 'Bigger text', onclick: () => stepZoom(1) }, 'A+'),
    h('button', { class: 'btn small', type: 'button', title: 'Back to 100% (Ctrl + 0)', onclick: () => setZoom(1) }, 'Reset'));
}

// Ctrl + plus / minus / 0 and Ctrl + mouse wheel change the app's own text size, so it is
// remembered and matches Settings (instead of Edge's separate page zoom).
document.addEventListener('keydown', (e) => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey || isPhone()) return;
  const d = e.key === '=' || e.key === '+' ? 1 : e.key === '-' || e.key === '_' ? -1 : e.key === '0' ? 0 : null;
  if (d == null) return;
  e.preventDefault();
  toast(`Text size ${pct(d ? stepZoom(d) : setZoom(1))}`);
});
let wheelAt = 0;
document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey || isPhone()) return;
  e.preventDefault();
  if (Date.now() - wheelAt < 200) return;
  wheelAt = Date.now();
  stepZoom(e.deltaY < 0 ? 1 : -1);
}, { passive: false });

// First open on a PC: the window starts small, so offer bigger text right away
// instead of leaving it in Settings. Done remembers the choice and never asks again.
function offerZoom() {
  if (isPhone()) return;
  try { if (localStorage.getItem('nl.zoom') != null) return; } catch { return; }
  const card = h('div', { class: 'zoom-offer', role: 'dialog', 'aria-label': 'Text size' },
    h('b', {}, 'Is the text too small?'),
    h('p', { class: 'muted small' }, 'Make everything bigger on this PC. You can change it any time in Settings > Appearance, or with Ctrl + plus and Ctrl + minus.'),
    zoomControl(),
    h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { setZoom(getZoom()); card.remove(); } }, 'Done')));
  document.body.append(card);
}

async function loadState() {
  const st = await api('GET', '/api/state', null, { noReauth: true });
  if (st.theme) applyTheme(st.theme);
  Object.assign(S, {
    user: st.user, needsSetup: st.needsSetup, schoolName: st.schoolName, emailReady: st.emailReady, mailRelay: !!st.mailRelay,
    idleMinutes: st.idleMinutes, exportFolder: st.exportFolder || '', version: st.version, remote: !!st.remote, aiReady: !!st.aiReady, dictateKey: st.dictateKey || 'F2', device: st.device || null, pinSignIn: st.pinSignIn !== false,
    locked: !!st.locked, encrypted: !!st.encrypted, require2fa: !!st.require2fa,
  });
}

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  return { name: parts[0], id: Number(parts[1]) || null, tab: parts[2] || parts[1] || null };
}
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
window.addEventListener('hashchange', () => render());

function render() {
  if (S.locked) return renderLocked();
  if (S.needsSetup) return renderSetup();
  if (!S.user) return renderLogin();
  if (S.user.mustChange) return renderMustChange();
  if (S.require2fa && !S.user.totpOn) return renderNeed2fa();
  renderShell();
}

// ---- idle sign-out ------------------------------------------------------------------

let lastActive = Date.now();
let lastPing = Date.now();
for (const ev of ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart']) {
  document.addEventListener(ev, () => { lastActive = Date.now(); }, { passive: true });
}
setInterval(async () => {
  if (!S.user || reauthing) return;
  const idle = Date.now() - lastActive;
  if (idle > S.idleMinutes * 60000) {
    await api('POST', '/api/logout', { idle: true }, { noReauth: true }).catch(() => {});
    S.user = null;
    document.querySelectorAll('.overlay').forEach((o) => o.remove());
    renderLogin(`Signed out after ${S.idleMinutes} minutes without activity.`);
  } else if (idle < 60000 && Date.now() - lastPing > 60000) {
    lastPing = Date.now(); // keep the server session alive while someone is typing
    api('GET', '/api/state', null, { noReauth: true }).then((st) => { if (!st.user && S.user) reauth().catch(() => {}); }).catch(() => {});
  }
}, 10000);

// ---- gate screens: setup, sign in, reset ---------------------------------------------

function gate(title, sub, ...body) {
  $app.replaceChildren(h('div', { class: 'gate' }, h('div', { class: 'panel' },
    h('div', { class: 'brand' }, h('img', { src: 'icon.svg', alt: '' }), h('div', {}, h('b', {}, 'Nurse’s Log'), h('span', {}, S.schoolName || 'School nurse office'))),
    h('h2', {}, title), sub ? h('p', { class: 'muted' }, sub) : null, ...body)));
  const first = $app.querySelector('input');
  if (first) first.focus();
}

const field = (label, input) => h('div', {}, h('label', {}, label), input);

function renderSetup() {
  const err = errBox();
  const f = {
    schoolName: h('input', { type: 'text', placeholder: 'e.g. Lincoln Elementary' }),
    fullName: h('input', { type: 'text', autocomplete: 'name' }),
    username: h('input', { type: 'text', autocomplete: 'username' }),
    email: h('input', { type: 'email', autocomplete: 'email' }),
    password: h('input', { type: 'password', autocomplete: 'new-password' }),
    confirm: h('input', { type: 'password', autocomplete: 'new-password' }),
  };
  const submit = async (e) => {
    e.preventDefault();
    if (f.password.value !== f.confirm.value) return showErr(err, 'the two passwords do not match');
    try {
      const r = await post('/api/setup', Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.value])));
      S.needsSetup = false;
      S.schoolName = f.schoolName.value.trim();
      S.user = r.user;
      S.encrypted = !!r.recordsKey;
      showRecovery(r.recovery, () => (r.recordsKey ? showRecordsKey(r.recordsKey, () => go('#/settings/email')) : go('#/settings/email')), true);
    } catch (ex) { showErr(err, ex.message); }
  };
  gate('First-time setup', 'Create the administrator account. Password reset codes are sent to this email address.',
    h('form', { onsubmit: submit }, err,
      field('School name', f.schoolName),
      field('Your full name', f.fullName),
      field('Username', f.username),
      field('Email (for password resets)', f.email),
      field('Password (10+ characters, letters and numbers)', f.password),
      field('Confirm password', f.confirm),
      h('button', { class: 'btn primary', type: 'submit' }, 'Create account')));
}

// The records recovery key: shown once when encryption is turned on.
function showRecordsKey(key, then) {
  const ok = h('input', { type: 'checkbox' });
  const m = modal('Save the records recovery key', [
    h('p', {}, 'Student records on this PC are now encrypted. This key opens them, and every backup, on another computer or after Windows is reinstalled. Without it, a backup cannot be opened by anyone, including us.'),
    h('div', { class: 'code' }, key),
    h('p', { class: 'muted small' }, 'Print it or write it down and keep it with the school’s important papers, away from this computer. It is shown only once; an admin can make a new one in Settings > School & security.'),
    h('label', { class: 'check' }, ok, 'I saved the records recovery key'),
  ], [['Continue', () => { if (!ok.checked) { toast('Tick the box once the key is saved', true); return; } m.close(); then(); }, 'primary']], { noDismiss: true });
}

// The records are encrypted and this Windows account has no key for them.
function renderLocked(note) {
  const err = errBox();
  const key = h('input', { type: 'text', autocomplete: 'off', placeholder: 'XXXX-XXXX-XXXX-XXXX-XXXX-XXXX', style: 'font-family:monospace' });
  gate('Unlock student records', 'The records on this PC are encrypted, and this Windows account does not have their key yet. This happens on a new PC, after Windows is reinstalled, or when a backup was copied in.',
    note ? h('div', { class: 'alert warn' }, note) : null,
    S.remote ? h('div', { class: 'alert warn' }, 'Unlock the records at the office PC.') : h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          await api('POST', '/api/unlock', { key: key.value }, { noReauth: true });
          await loadState();
          toast('Records unlocked');
          render();
        } catch (ex) { showErr(err, ex.message); }
      },
    }, err,
    field('Records recovery key (from when encryption was turned on)', key),
    h('button', { class: 'btn primary', type: 'submit' }, 'Unlock'),
    h('p', { class: 'muted small' }, 'Lost the key? The records cannot be opened without it. Uninstall and reinstall to start over with empty records.')));
}

// Second step of signing in: the 6 digit code from the authenticator app.
function renderCode(ticket, username) {
  const err = errBox();
  const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 24, class: 'pin' });
  gate('Enter your sign-in code', 'Open your authenticator app and type the 6 digit code for Nurse’s Log. Lost your phone? Type your account recovery code instead.',
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const r = await api('POST', '/api/login/code', { ticket, code: code.value }, { noReauth: true });
          S.user = r.user;
          lastActive = Date.now();
          await loadState();
          render();
          if (r.how === 'recovery') toast('Signed in with your recovery code. Make a new one in Settings > My account, and ask an admin to reset two-step sign-in if your phone is gone.');
          offerPin();
        } catch (ex) {
          code.value = '';
          if (/password again/.test(ex.message)) return renderLogin(ex.message, true);
          showErr(err, ex.message);
        }
      },
    }, err,
    field('Code', code),
    h('button', { class: 'btn primary', type: 'submit' }, 'Sign in'),
    h('button', { class: 'linkbtn', type: 'button', onclick: () => renderLogin(null, true) }, `Not ${username}? Back to sign in`)));
}

// Set up two-step sign-in: scan the QR code into an authenticator app, then type a code.
async function totpSetup(container, done) {
  const err = errBox();
  let st;
  try { st = await post('/api/account/totp/start'); } catch (e) { container.append(h('div', { class: 'alert bad' }, e.message)); return; }
  const code = h('input', { type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, class: 'pin' });
  container.append(
    h('ol', {},
      h('li', {}, 'On your phone, open an authenticator app (Microsoft Authenticator, Google Authenticator, or your phone’s password manager).'),
      h('li', {}, 'Add an account and scan this code. Or type the key below it.'),
      h('li', {}, 'Type the 6 digit code the app shows.')),
    h('div', { class: 'qr' }, qrSvg(st.rows, 180)),
    h('p', { class: 'muted small' }, 'Key: ', h('code', {}, st.secret.replace(/(.{4})/g, '$1 ').trim())),
    err, field('Code from the app', code),
    h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn primary', type: 'button', onclick: async () => {
      try { S.user = await post('/api/account/totp/confirm', { code: code.value }); toast('Two-step sign-in is on'); done(); } catch (e) { showErr(err, e.message); }
    } }, 'Turn on')));
}

// An admin requires two-step sign-in and this account has not set it up yet.
function renderNeed2fa() {
  const box = h('div', {});
  gate('Set up two-step sign-in', 'Your school requires a code from your phone when you sign in, as well as your password. It takes a minute.',
    box, h('button', { class: 'linkbtn', type: 'button', onclick: signOut }, 'Sign out'));
  totpSetup(box, () => render());
}

function showRecovery(code, then, own = false) {
  const m = modal('Save this recovery code', [
    h('p', {}, own
      ? 'If you forget your password and email is not working, this code lets you set a new one. It is shown only once.'
      : 'Give this code to the new user. With it they can reset their password if email is not working. It is shown only once.'),
    h('div', { class: 'code' }, code),
    h('p', { class: 'muted small' }, 'Write it down and keep it somewhere safe, away from this computer.'),
  ], [['I saved it', () => { m.close(); then(); }, 'primary']], { noDismiss: true });
}

const pinInput = () => h('input', { type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 8, autocomplete: 'off', class: 'pin' });

// A remembered phone opens on its PIN; "Use password instead" shows the normal sign-in.
function renderPin(note) {
  const err = errBox();
  const pin = pinInput();
  const d = S.device;
  gate(`Welcome back, ${d.fullName.split(' ')[0]}`, `Enter your PIN to open Nurse’s Log on this ${d.name.split(',')[0]}.`,
    note ? h('div', { class: 'alert warn' }, note) : null,
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const r = await api('POST', '/api/login/pin', { pin: pin.value }, { noReauth: true });
          S.user = r.user;
          lastActive = Date.now();
          await loadState();
          render();
        } catch (ex) {
          pin.value = '';
          if (/password/.test(ex.message)) { S.device = null; renderLogin(ex.message, true); return; }
          showErr(err, ex.message);
        }
      },
    }, err,
    field('PIN', pin),
    h('button', { class: 'btn primary', type: 'submit' }, 'Unlock'),
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('button', { class: 'linkbtn', type: 'button', onclick: () => renderLogin(null, true) }, 'Use password instead'),
      h('button', { class: 'linkbtn', type: 'button', onclick: async () => {
        await api('POST', '/api/device/forget', {}, { noReauth: true }).catch(() => {});
        S.device = null;
        renderLogin('This phone was forgotten. Sign in with your password.', true);
      } }, 'Forget this phone'))));
}

function renderLogin(note, usePassword = false) {
  if (S.device && !usePassword) return renderPin(note);
  const err = errBox();
  const user = h('input', { type: 'text', autocomplete: 'username' });
  const pw = h('input', { type: 'password', autocomplete: 'current-password' });
  gate('Sign in', null,
    note ? h('div', { class: 'alert warn' }, note) : null,
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        try {
          const r = await api('POST', '/api/login', { username: user.value, password: pw.value }, { noReauth: true });
          if (r.needCode) return renderCode(r.ticket, user.value);
          S.user = r.user;
          lastActive = Date.now();
          await loadState();
          render();
          offerPin();
        } catch (ex) { showErr(err, ex.message); pw.select(); }
      },
    }, err,
    field('Username or email', user),
    field('Password', pw),
    h('button', { class: 'btn primary', type: 'submit' }, 'Sign in'),
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('button', { class: 'linkbtn', type: 'button', onclick: () => renderReset(user.value) }, 'Forgot password?'),
      h('span', { class: 'muted small' }, 'v' + S.version))));
}

function renderReset(login = '', step = 1) {
  const err = errBox();
  const who = h('input', { type: 'text', value: login, autocomplete: 'username' });
  if (step === 1) {
    gate('Reset your password', S.emailReady
      ? 'Enter your username or email. A 6 digit code will be emailed to the address on your account.'
      : 'Email is not set up yet. Use the recovery code you saved when your account was made, or ask an admin to set a temporary password.',
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        if (!who.value.trim()) return showErr(err, 'enter your username or email');
        if (!S.emailReady) return renderReset(who.value, 2);
        try {
          await post('/api/reset/request', { login: who.value });
          renderReset(who.value, 2);
        } catch (ex) { showErr(err, ex.message); }
      },
    }, err,
    field('Username or email', who),
    h('button', { class: 'btn primary', type: 'submit' }, S.emailReady ? 'Email me a code' : 'Continue with recovery code'),
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('button', { class: 'linkbtn', type: 'button', onclick: () => renderLogin() }, 'Back to sign in'),
      S.emailReady ? h('button', { class: 'linkbtn', type: 'button', onclick: () => who.value.trim() ? renderReset(who.value, 2) : showErr(err, 'enter your username or email') }, 'I have a recovery code') : null)));
    return;
  }
  const code = h('input', { type: 'text', autocomplete: 'one-time-code', placeholder: S.emailReady ? '6 digit code or recovery code' : 'XXXX-XXXX-XXXX-XXXX' });
  const pw = h('input', { type: 'password', autocomplete: 'new-password' });
  const pw2 = h('input', { type: 'password', autocomplete: 'new-password' });
  gate('Set a new password', S.emailReady ? 'If the account exists, a code is on its way (check spam too). It expires in 15 minutes.' : null,
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        if (pw.value !== pw2.value) return showErr(err, 'the two passwords do not match');
        try {
          const r = await post('/api/reset/finish', { login: who.value, code: code.value, password: pw.value });
          renderLogin(r.how === 'recovery'
            ? 'Password changed. Make a new recovery code in Settings > My account if anyone else may have seen the old one.'
            : 'Password changed. Sign in with the new one.');
        } catch (ex) { showErr(err, ex.message); }
      },
    }, err,
    field('Username or email', who),
    field('Code', code),
    field('New password (10+ characters, letters and numbers)', pw),
    field('Confirm new password', pw2),
    h('button', { class: 'btn primary', type: 'submit' }, 'Change password'),
    h('button', { class: 'linkbtn', type: 'button', onclick: () => renderLogin() }, 'Back to sign in')));
  code.focus();
}

function renderMustChange() {
  const err = errBox();
  const cur = h('input', { type: 'password', autocomplete: 'current-password' });
  const pw = h('input', { type: 'password', autocomplete: 'new-password' });
  const pw2 = h('input', { type: 'password', autocomplete: 'new-password' });
  gate('Choose your own password', `Signed in as ${S.user.username}. An admin set a temporary password; replace it to continue.`,
    h('form', {
      onsubmit: async (e) => {
        e.preventDefault();
        if (pw.value !== pw2.value) return showErr(err, 'the two passwords do not match');
        try {
          S.user = await post('/api/account/password', { current: cur.value, next: pw.value });
          toast('Password changed');
          render();
        } catch (ex) { showErr(err, ex.message); }
      },
    }, err,
    field('Temporary password', cur),
    field('New password (10+ characters, letters and numbers)', pw),
    field('Confirm new password', pw2),
    h('button', { class: 'btn primary', type: 'submit' }, 'Save password'),
    h('button', { class: 'linkbtn', type: 'button', onclick: signOut }, 'Sign out')));
}

// After a password sign-in on a phone: offer to stay signed in with a PIN.
// "Not on this phone" is remembered on the phone so a shared phone is not asked again.
function offerPin(asked = false) {
  if (!S.user || !S.remote || !S.pinSignIn || S.user.mustChange) return;
  if (S.device && S.device.username === S.user.username && !asked) return;
  let never = false;
  try { never = localStorage.getItem('nl.noPin') === '1'; } catch { /* storage off */ }
  if (never && !asked) return;
  const err = errBox();
  const p1 = pinInput();
  const p2 = pinInput();
  const m = modal('Stay signed in on this phone?', [
    h('p', {}, `Next time, open Nurse’s Log with a short PIN instead of your password. It still locks after ${S.idleMinutes} idle minutes, and forgets this phone after 30 days or 5 wrong PINs.`),
    h('div', { class: 'alert warn' }, 'Only on your own phone. On a shared phone choose Not on this phone.'),
    err,
    field('Choose a PIN (4 to 8 digits)', p1),
    field('Type it again', p2),
  ], [
    ['Not on this phone', () => { try { localStorage.setItem('nl.noPin', '1'); } catch { /* storage off */ } m.close(); }],
    ['Not now', () => m.close()],
    ['Use a PIN', async () => {
      if (p1.value !== p2.value) return showErr(err, 'the two PINs do not match');
      try {
        const r = await post('/api/device/remember', { pin: p1.value });
        S.device = r.device;
        try { localStorage.removeItem('nl.noPin'); } catch { /* storage off */ }
        m.close();
        toast('This phone stays signed in. Use your PIN next time.');
        if (route().name === 'settings') render();
      } catch (e) { showErr(err, e.message); }
    }, 'primary'],
  ]);
}

async function signOut() {
  await api('POST', '/api/logout', {}, { noReauth: true }).catch(() => {});
  S.user = null;
  history.replaceState(null, '', '#/today');
  renderLogin();
}

// ---- shell -----------------------------------------------------------------------

// [route, label, icon, admin only, short label for the phone tab bar]
const NAV = [
  ['today', 'Today', 'today', false, 'Today'],
  ['students', 'Students', 'students', false, 'Students'],
  ['visits', 'Visit log', 'visits', false, 'Visits'],
  ['given', 'Medication log', 'meds', false, 'Meds'],
  ['calendar', 'Calendar', 'calendar', false, 'Calendar'],
];

function renderShell() {
  const r = route();
  const main = h('main', { class: 'main' });
  const navName = r.name === 'student' ? 'students' : r.name;
  const navBtn = ([key, label, ic, admin, short]) => h('button', {
    class: 'nav' + (navName === key ? ' on' : '') + (admin ? ' nav-admin' : ''), type: 'button', onclick: () => go('#/' + key),
  }, icon(ic), h('span', { class: 'lbl' }, label), h('span', { class: 'lbl-s', 'aria-hidden': 'true' }, short || label));
  $app.replaceChildren(h('div', { class: 'shell' },
    h('nav', { class: 'side', 'aria-label': 'Main' },
      h('div', { class: 'brand' }, h('img', { src: 'icon.svg', alt: '' }), h('div', {}, h('b', {}, 'Nurse’s Log'), h('span', {}, S.schoolName || 'School nurse office'))),
      NAV.filter((n) => !n[3] || S.user.role === 'admin').map(navBtn),
      h('div', { class: 'grow' }),
      navBtn(['settings', 'Settings', 'settings', false, 'Settings']),
      h('button', { class: 'nav nav-out', type: 'button', onclick: signOut }, icon('out'), 'Sign out'),
      h('div', { class: 'who' }, avatar('user', S.user.id, S.user.photoAt, S.user.fullName, 34),
        h('div', {}, h('b', {}, S.user.fullName), `${S.user.username} \u00B7 ${S.user.role}`))),
    main));
  offerUpdate();
  startAlerts();
  const views = { today: viewToday, students: viewStudents, student: viewStudent, visits: viewVisitLog, given: viewGivenLog, calendar: viewCalendar, audit: async () => go('#/settings/audit'), settings: viewSettings };
  (views[r.name] || viewToday)(main, r).catch((e) => {
    if (e.message !== 'signed out') fill(main, h('div', { class: 'alert bad' }, e.message));
  });
}

// ---- today -----------------------------------------------------------------------

async function viewToday(main) {
  const t = await get('/api/today');
  const due = t.meds.scheduled;
  const left = due.filter((d) => !d.record).length;
  const reload = () => viewToday(main);
  fill(main, 
    h('div', { class: 'head' }, h('h1', {}, 'Today'), h('span', { class: 'muted', title: 'Nurse’s log, stardate…' }, `${new Date().toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })} · stardate ${stardate()}`),
      h('div', { class: 'grow' }), can('visit') ? h('button', { class: 'btn primary', onclick: () => pickStudent((s) => visitForm(s, null, reload)) }, 'New visit') : null),
    h('div', { class: 'cards' },
      h('div', { class: 'card' }, h('b', {}, t.visits.length), h('span', {}, 'visits today')),
      h('div', { class: 'card' }, h('b', {}, left), h('span', {}, 'scheduled doses left')),
      h('div', { class: 'card' }, h('b', {}, t.counts.activeMeds), h('span', {}, 'active medications')),
      h('div', { class: 'card' }, h('b', {}, t.counts.students), h('span', {}, 'students'))),
    t.meds.closed ? h('div', { class: 'alert warn' }, h('b', {}, `No school today: ${t.meds.closed}. `), 'Scheduled medications and reminders are off for the day.') : null,
    t.lowStock.length ? h('div', { class: 'alert warn' }, 'Running low: ', t.lowStock.map((m, i) => [i ? ', ' : '', `${m.name} for ${m.first_name} ${m.last_name} (${m.on_hand} left)`])) : null,
    h('div', { class: 'panel' }, h('h2', {}, 'Medications due today'),
      table([
        { label: 'Time', nowrap: true, get: (r) => fmtHM(r.time) },
        { label: 'Student', get: (r) => [fullName(r), r.allergies ? h('div', {}, h('span', { class: 'pill bad' }, 'Allergy: ' + r.allergies)) : null] },
        { label: 'Medication', get: (r) => [r.name, r.dose && ` \u00B7 ${r.dose}`, r.route && ` \u00B7 ${r.route}`] },
        { label: 'Status', get: (r) => (r.record ? statusPill(r.record.status, fmtTime(r.record.given_at))
          : can('dose') ? h('button', { class: 'btn small primary', onclick: () => giveForm(r, r.time, reload) }, 'Record dose') : h('span', { class: 'muted' }, 'due')) },
      ], due, { empty: t.meds.closed ? 'No school today.' : 'No scheduled medications today.', onRow: (r) => go(`#/student/${r.student_id}/meds`) })),
    t.meds.prn.length ? h('div', { class: 'panel' }, h('h2', {}, 'As-needed (PRN) medications on file'),
      table([
        { label: 'Student', get: fullName },
        { label: 'Medication', get: (r) => [r.name, r.dose && ` \u00B7 ${r.dose}`] },
        { label: 'Instructions', get: (r) => r.instructions || '' },
        { label: '', get: (r) => (can('dose') ? h('button', { class: 'btn small', onclick: () => giveForm(r, null, reload) }, 'Give') : '') },
      ], t.meds.prn, { onRow: (r) => go(`#/student/${r.student_id}/meds`) })) : null,
    h('div', { class: 'panel' }, h('h2', {}, 'Visits today'),
      table(visitCols(true), t.visits, { empty: 'No visits yet today.', onRow: (r) => go(`#/student/${r.student_id}/visits`) })),
    phoneActions(
      can('visit') && ['+ New visit', () => pickStudent((s) => visitForm(s, null, reload))],
      can('dose') && ['\u{1F48A} Give dose', () => pickStudent((s) => giveDose(s, null, reload))]));
}

// Big buttons pinned above the tab bar on phones; hidden on the PC.
function phoneActions(...buttons) {
  buttons = buttons.filter(Boolean);
  if (!buttons.length) return null;
  return h('div', { class: 'phone-actions' }, buttons.map(([label, fn], i) => h('button', { class: 'btn' + (i === 0 ? ' primary' : ''), type: 'button', onclick: fn }, label)));
}

// Give dose for a student: one active medication opens straight away, several
// are listed as big buttons. A scheduled medication gets its nearest time today.
async function giveDose(s, meds, reload) {
  if (!meds) meds = (await get(`/api/students/${s.id}`)).medications;
  const active = meds.filter((m) => m.active);
  const open = (m) => giveForm({ ...m, first_name: s.first_name, last_name: s.last_name, allergies: s.allergies }, nearestTime(m.times), reload);
  if (!active.length) return toast(`${s.first_name} ${s.last_name} has no active medications`, true);
  if (active.length === 1) return open(active[0]);
  const m = modal(`Give which medication to ${s.first_name}?`, h('div', { class: 'pick-list' }, active.map((med) => h('button', { class: 'btn', type: 'button', onclick: () => { m.close(); open(med); } },
    h('b', {}, med.name), h('span', { class: 'muted' }, [med.dose, med.times ? med.times.split(', ').map(fmtHM).join(', ') : 'as needed'].filter(Boolean).join(' \u00B7 '))))),
  [['Cancel', () => m.close()]]);
}

// The scheduled time ("HH:MM") closest to now, or null for an as-needed medication.
function nearestTime(times) {
  if (!times) return null;
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  let best = null;
  for (const t of times.split(', ')) {
    const [H, M] = t.split(':').map(Number);
    if (!best || Math.abs(H * 60 + M - mins) < Math.abs(best[1] - mins)) best = [t, H * 60 + M];
  }
  return best && best[0];
}

// Year plus the fraction of it gone by, e.g. 2026.82. Just for fun.
function stardate() {
  const n = new Date();
  const start = new Date(n.getFullYear(), 0, 1);
  const end = new Date(n.getFullYear() + 1, 0, 1);
  return (n.getFullYear() + (n - start) / (end - start)).toFixed(2);
}

function statusPill(status, when) {
  const cls = status === 'given' ? 'ok' : status === 'refused' || status === 'missed' ? 'bad' : 'warn';
  return h('span', { class: 'pill ' + cls }, status + (when ? ' ' + when : ''));
}

// ---- calendar -----------------------------------------------------------------------

async function viewCalendar(main, r) {
  const month = /^\d{4}-\d\d$/.test(r.tab || '') ? r.tab : today().slice(0, 7);
  const cal = await get(`/api/calendar?month=${month}`);
  const [y, mo] = month.split('-').map(Number);
  const shift = (n) => { const d = new Date(y, mo - 1 + n, 1); return `${d.getFullYear()}-${p2(d.getMonth() + 1)}`; };
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7; // Monday first
  const dayBox = h('div', {});
  let picked = 0;
  const cells = cal.days.map((d, i) => {
    const line = d.closed ? h('span', { class: 'cal-closed' }, d.closed)
      : !d.due ? null
        : d.past || d.today ? h('span', { class: 'cal-count' + (d.pending && d.past ? ' bad' : d.pending ? '' : ' ok') }, d.pending ? `${d.pending} of ${d.due} not recorded` : `${d.due} recorded`)
          : h('span', { class: 'cal-count' }, `${d.due} dose${d.due === 1 ? '' : 's'}`);
    return h('button', {
      type: 'button', class: 'cal-day' + (d.today ? ' today' : '') + (d.closed ? ' closed' : '') + (d.past ? ' past' : ''),
      'aria-label': `${new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}${d.closed ? `, ${d.closed}` : d.due ? `, ${d.due} scheduled doses` : ''}`,
      onclick: () => pick(i).catch((e) => toast(e.message, true)),
    }, h('b', {}, i + 1), line);
  });
  const reloadDay = () => viewCalendar(main, { ...r, tab: month, day: picked });
  async function pick(i) {
    picked = i;
    const d = cal.days[i];
    cells.forEach((c, j) => c.classList.toggle('on', j === i));
    const due = await get(`/api/meds-due?day=${d.date}`);
    const canRecord = d.date <= today();
    fill(dayBox, h('div', { class: 'panel' }, h('h2', {}, new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })),
      due.closed ? h('div', { class: 'alert warn' }, `No school: ${due.closed}. No scheduled doses.`) : table([
        { label: 'Time', nowrap: true, get: (x) => fmtHM(x.time) },
        { label: 'Student', get: (x) => [fullName(x), x.med_alerts === 'off' ? h('span', { class: 'pill', style: 'margin-left:6px', title: 'Reminders are off for this student' }, 'no reminders') : null] },
        { label: 'Medication', get: (x) => [x.name, x.dose && ` \u00B7 ${x.dose}`] },
        { label: 'Status', get: (x) => (x.record ? statusPill(x.record.status, fmtTime(x.record.given_at))
          : canRecord && can('dose') ? h('button', { class: 'btn small primary', onclick: () => giveForm(x, x.time, reloadDay, d.date) }, 'Record dose') : h('span', { class: 'muted' }, 'scheduled')) },
      ], due.scheduled, { empty: 'No scheduled medications this day.', onRow: (x) => go(`#/student/${x.student_id}/meds`) })));
  }
  fill(main,
    h('div', { class: 'head' }, h('h1', {}, 'Calendar'),
      h('div', { class: 'row' },
        h('button', { class: 'btn', type: 'button', 'aria-label': 'Previous month', onclick: () => go(`#/calendar/${shift(-1)}`) }, '\u2039'),
        h('b', { class: 'cal-month' }, new Date(y, mo - 1, 1).toLocaleDateString([], { month: 'long', year: 'numeric' })),
        h('button', { class: 'btn', type: 'button', 'aria-label': 'Next month', onclick: () => go(`#/calendar/${shift(1)}`) }, '\u203A'),
        month !== today().slice(0, 7) ? h('button', { class: 'btn', type: 'button', onclick: () => go('#/calendar') }, 'This month') : null),
      h('div', { class: 'grow' }),
      S.user.role === 'admin' ? h('button', { class: 'btn', type: 'button', onclick: () => go('#/settings/alerts') }, 'No-school days') : null),
    h('div', { class: 'panel' }, h('div', { class: 'cal' },
      WEEKDAYS.map(([, l]) => h('div', { class: 'cal-head' }, l)),
      Array.from({ length: lead }, () => h('div', { class: 'cal-blank' })),
      cells)),
    dayBox);
  await pick(r.day != null ? r.day : Math.max(0, cal.days.findIndex((d) => d.today)));
}

// ---- medication reminders in the window ------------------------------------------------
// The server decides what is due (Settings > Medication alerts); this window asks every
// 30 seconds and shows a card with a chime for each new one. Snooze and dismiss are kept
// on this computer only. Windows notifications and phone pushes come from the server.

const ALERT_KEY = 'nl.alertsApp';
const alertsOnHere = () => { try { return localStorage.getItem(ALERT_KEY) !== 'off'; } catch { return true; } };
const ALERTS = { timer: null, hidden: {}, seen: new Set(), last: [] };
try { ALERTS.hidden = JSON.parse(localStorage.getItem('nl.alertsHidden') || '{}') || {}; } catch { /* private window */ }

function startAlerts() {
  if (ALERTS.timer) return;
  ALERTS.timer = setInterval(pollAlerts, 30000);
  pollAlerts();
}

async function pollAlerts() {
  if (!S.user || reauthing) return;
  try {
    const a = await api('GET', '/api/alerts', null, { noReauth: true });
    ALERTS.last = a.on && Array.isArray(a.items) ? a.items : [];
  } catch { return; }
  showAlerts();
}

// Snooze hides a dose until a time; Dismiss hides one reminder, and the next reminder for
// a dose still not recorded shows again.
function hideAlert(key, until) {
  ALERTS.hidden[key] = until;
  const old = Date.now() - 86400000;
  for (const [k, t] of Object.entries(ALERTS.hidden)) if (t < old) delete ALERTS.hidden[k];
  try { localStorage.setItem('nl.alertsHidden', JSON.stringify(ALERTS.hidden)); } catch { /* private window */ }
  showAlerts();
}

function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[880, 0], [660, 0.22]].forEach(([f, at]) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, ctx.currentTime + at);
      g.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + at + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + at + 0.35);
      o.connect(g).connect(ctx.destination);
      o.start(ctx.currentTime + at);
      o.stop(ctx.currentTime + at + 0.4);
    });
    setTimeout(() => ctx.close(), 1000);
  } catch { /* no sound */ }
}

function showAlerts() {
  let box = document.getElementById('med-alerts');
  if (!box) { box = h('div', { id: 'med-alerts', role: 'region', 'aria-label': 'Medication reminders', 'aria-live': 'polite' }); document.body.append(box); }
  const now = Date.now();
  const items = !S.user || !alertsOnHere() ? [] : ALERTS.last.filter((i) => !(ALERTS.hidden[i.key] > now) && !ALERTS.hidden[`${i.key}|${i.stage}`]);
  let fresh = false;
  for (const i of items) if (!ALERTS.seen.has(`${i.key}|${i.stage}`)) { ALERTS.seen.add(`${i.key}|${i.stage}`); fresh = true; }
  if (fresh) chime();
  const refresh = () => { pollAlerts(); if (['today', 'calendar', 'student'].includes(route().name)) render(); };
  const shown = items.slice(0, 3);
  fill(box, shown.map((i) => h('div', { class: 'med-alert' + (i.stage ? ' late' : '') },
    h('div', { class: 'med-alert-top' }, h('b', {}, `${i.first_name} ${i.last_name}`), h('span', { class: 'muted small' }, `${i.stage ? 'Not recorded \u00B7 ' : ''}due ${fmtHM(i.time)}`)),
    h('div', {}, [i.name, i.dose, i.route].filter(Boolean).join(' \u00B7 ')),
    i.allergies ? h('div', { class: 'pill bad', style: 'margin-top:4px' }, 'Allergy: ' + i.allergies) : null,
    h('div', { class: 'row' },
      can('dose') ? h('button', { class: 'btn small primary', type: 'button', onclick: () => giveForm({ ...i, id: i.medication_id }, i.time, refresh) }, 'Record dose') : null,
      h('button', { class: 'btn small', type: 'button', onclick: () => hideAlert(i.key, Date.now() + 10 * 60000) }, 'Snooze 10 min'),
      h('button', { class: 'btn small', type: 'button', onclick: () => hideAlert(`${i.key}|${i.stage}`, Date.now()) }, 'Dismiss')))),
  items.length > shown.length ? h('button', { class: 'med-alert more', type: 'button', onclick: () => go('#/today') }, `+${items.length - shown.length} more due \u2014 see Today`) : null);
}

// ---- students -----------------------------------------------------------------------

async function viewStudents(main) {
  const q = h('input', { type: 'search', class: 'search', placeholder: 'Search name, ID, homeroom, allergy\u2026', value: sessionStorage.getItem('nl.q') || '' });
  const grade = h('select', { style: 'width:auto' }, h('option', { value: '' }, 'All grades'));
  const arch = h('input', { type: 'checkbox' });
  const list = h('div', {});
  const params = () => ({ q: q.value, grade: grade.value, archived: arch.checked });
  const load = async () => {
    try { sessionStorage.setItem('nl.q', q.value); } catch { /* storage off */ }
    const r = await get(`/api/students?${new URLSearchParams({ q: q.value, grade: grade.value, archived: arch.checked ? '1' : '' })}`);
    if (grade.options.length === 1) for (const g of r.grades) grade.append(h('option', { value: g }, 'Grade ' + g));
    list.replaceChildren(table([
      { label: 'Name', get: (s) => h('span', { class: 'with-photo' }, avatar('student', s.id, s.photo_at, fullName(s), 30), h('b', {}, fullName(s))) },
      { label: 'ID', get: (s) => s.student_no || '' },
      { label: 'Grade', get: (s) => s.grade || '' },
      { label: 'Homeroom', get: (s) => s.homeroom || '' },
      { label: 'Allergies', get: (s) => (s.allergies ? h('span', { class: 'pill bad' }, s.allergies) : '') },
      { label: 'Active meds', get: (s) => (s.active_meds ? h('span', { class: 'pill' }, s.active_meds) : '') },
      { label: 'Last visit', nowrap: true, get: (s) => fmtDT(s.last_visit) },
    ], r.students, { empty: q.value || grade.value ? 'No students match.' : 'No students yet. Add the first one.', onRow: (s) => go(`#/student/${s.id}`) }));
  };
  q.addEventListener('input', debounce(load, 200));
  grade.addEventListener('change', load);
  arch.addEventListener('change', load);
  fill(main, 
    h('div', { class: 'head' }, h('h1', {}, 'Students'), h('div', { class: 'grow' }),
      exportMenu('students', params),
      exportMenu('immunizations', () => ({ grade: grade.value }), 'Immunization report'),
      can('edit') ? h('button', { class: 'btn', onclick: () => importDialog(load) }, 'Import roster') : null,
      can('edit') ? h('button', { class: 'btn primary', onclick: () => studentForm(null) }, 'Add student') : null),
    h('div', { class: 'panel' },
      h('div', { class: 'row', style: 'margin-bottom:12px' }, q, grade, h('label', { class: 'check' }, arch, 'Show archived')),
      list));
  await load();
  q.focus();
}

const STUDENT_FORM = [
  ['first_name', 'First name', 'text', { required: true }],
  ['last_name', 'Last name', 'text', { required: true }],
  ['student_no', 'Student ID'],
  ['dob', 'Date of birth', 'date'],
  ['grade', 'Grade'],
  ['homeroom', 'Homeroom / teacher'],
  ['sex', 'Sex', 'select', { choices: ['', 'F', 'M', 'X'] }],
  ['guardian_name', 'Parent / guardian'],
  ['guardian_phone', 'Guardian phone', 'tel'],
  ['guardian2_name', 'Second contact'],
  ['guardian2_phone', 'Second contact phone', 'tel'],
  ['physician', 'Physician'],
  ['physician_phone', 'Physician phone'],
  ['allergies', 'Allergies', 'textarea', { rows: 2 }],
  ['conditions', 'Health conditions (asthma, diabetes, seizures\u2026)', 'textarea', { rows: 2 }],
  ['notes', 'Notes / care plan', 'textarea'],
  ['', 'Medication info', 'heading'],
  ['med_consent', 'Permission to give medication at school', 'select', { choices: ['', 'On file', 'Not on file', 'Expired'] }],
  ['pharmacy', 'Pharmacy'],
  ['home_meds', 'Medications taken at home', 'textarea', { rows: 2 }],
  ['med_notes', 'Medication notes (reactions, how the student takes them, refills\u2026)', 'textarea', { rows: 2 }],
];

function studentForm(s, reload) {
  const form = formGrid(STUDENT_FORM, s || {});
  const err = errBox();
  const m = modal(s ? `Edit ${s.first_name} ${s.last_name}` : 'Add student', [assistBar(form, STUDENT_FORM, { form: 'Student info', studentId: s?.id }), err, form], [
    ['Cancel', () => m.close()],
    [s ? 'Save changes' : 'Add student', async () => {
      try {
        const saved = s ? await post(`/api/students/${s.id}`, readForm(form)) : await post('/api/students', readForm(form));
        m.close();
        toast(s ? 'Saved' : 'Student added');
        if (s && reload) reload(); else go(`#/student/${saved.id}`);
      } catch (e) { showErr(err, e.message); }
    }, 'primary'],
  ], { wide: true });
}

// Search-as-you-type picker, then calls then(student).
function pickStudent(then) {
  const q = h('input', { type: 'search', placeholder: 'Type a name or student ID' });
  const list = h('div', { style: 'max-height:50vh;overflow:auto;margin-top:10px' });
  const load = async () => {
    const r = await get(`/api/students?${new URLSearchParams({ q: q.value })}`);
    list.replaceChildren(table([
      { label: 'Name', get: (s) => h('span', { class: 'with-photo' }, avatar('student', s.id, s.photo_at, fullName(s), 30), h('b', {}, fullName(s))) },
      { label: 'ID', get: (s) => s.student_no || '' },
      { label: 'Grade', get: (s) => s.grade || '' },
      { label: 'Allergies', get: (s) => (s.allergies ? h('span', { class: 'pill bad' }, s.allergies) : '') },
    ], r.students.slice(0, 50), { empty: 'No students match.', onRow: (s) => { m.close(); then(s); } }));
  };
  q.addEventListener('input', debounce(load, 150));
  const m = modal('Choose a student', [q, list], [['Cancel', () => m.close()]], { wide: true });
  load();
}

// ---- student board ------------------------------------------------------------------

const DISPOSITIONS = ['', 'Returned to class', 'Rested, returned to class', 'Sent home', 'Parent picked up', 'Called 911 / EMS', 'Referred to doctor', 'Other'];
const ROUTES = ['', 'By mouth', 'Inhaled', 'Topical', 'Injection', 'Nasal', 'Eye drops', 'Ear drops', 'Other'];
const STATUSES = ['given', 'refused', 'absent', 'held', 'missed'];
const STUDENT_TABS = ['info', 'meds', 'medlog', 'visits', 'imm', 'history'];

async function viewStudent(main, r) {
  const b = await get(`/api/students/${r.id}`);
  const s = b.student;
  const tab = STUDENT_TABS.includes(r.tab) ? r.tab : 'info';
  const reload = () => viewStudent(main, { ...r, tab });
  S.board = { s, reload };
  const tabBtn = (key, label) => h('button', { class: 'tab' + (tab === key ? ' on' : ''), type: 'button', onclick: () => go(`#/student/${s.id}/${key}`) }, label);
  const body = h('div', {});
  fill(main, 
    h('div', { class: 'head' },
      !can('edit') ? avatar('student', s.id, s.photo_at, `${s.first_name} ${s.last_name}`, 64) : h('button', { class: 'photo-btn', type: 'button', title: s.photo_at ? 'Change or remove photo' : 'Add a photo', 'aria-label': `Photo of ${s.first_name} ${s.last_name}`, onclick: () => photoDialog({
        title: `Photo of ${s.first_name} ${s.last_name}`, kind: 'student', id: s.id, at: s.photo_at, name: `${s.first_name} ${s.last_name}`,
        save: (data) => post(`/api/students/${s.id}/photo`, { data }), remove: () => post(`/api/students/${s.id}/photo/remove`), done: reload,
      }) }, avatar('student', s.id, s.photo_at, `${s.first_name} ${s.last_name}`, 64)),
      h('div', {}, h('div', { class: 'namerow' }, h('h1', {}, `${s.first_name} ${s.last_name}`),
        can('edit') ? h('button', { class: 'btn small', type: 'button', title: 'Edit student info', 'aria-label': `Edit ${s.first_name} ${s.last_name}`, onclick: () => studentForm(s, reload) }, '✎ Edit') : null),
        h('div', { class: 'muted' }, [s.student_no && `ID ${s.student_no}`, s.grade && `Grade ${s.grade}`, s.homeroom, s.dob && `DOB ${s.dob} (${age(s.dob)})`].filter(Boolean).join(' \u00B7 '))),
      s.archived ? h('span', { class: 'pill warn' }, 'Archived') : null,
      h('div', { class: 'grow' }),
      can('visit') ? h('button', { class: 'btn primary', onclick: () => visitForm(s, null, () => go(`#/student/${s.id}/visits`)) }, 'New visit') : null,
      exportMenu('student', () => ({ studentId: s.id })),
      !can('edit') ? null : dropMenu('More', () => [
        ['Edit student info', null, () => studentForm(s, reload)],
        [s.archived ? 'Restore student' : 'Archive student', s.archived ? 'show in the student list again' : 'hide from lists, keep all records', async () => {
          if (!s.archived && !(await confirmBox('Archive student?', `${s.first_name} ${s.last_name} will be hidden from lists and their medications from Today. All records are kept and can be restored.`, 'Archive'))) return;
          await post(`/api/students/${s.id}/archive`, { archived: !s.archived }).then(reload, (e) => toast(e.message, true));
        }],
        s.archived && S.user.role === 'admin' ? ['Delete for good\u2026', 'erase this student and all their records', () => deleteStudent(s)] : null,
      ].filter(Boolean))),
    s.allergies ? h('div', { class: 'alert bad' }, h('b', {}, 'Allergies: '), s.allergies) : null,
    s.conditions ? h('div', { class: 'alert warn' }, h('b', {}, 'Conditions: '), s.conditions) : null,
    phoneActions(
      can('visit') && ['+ New visit', () => visitForm(s, null, () => go(`#/student/${s.id}/visits`))],
      can('dose') && ['\u{1F48A} Give dose', () => giveDose(s, b.medications, reload)]),
    h('div', { class: 'panel' },
      h('div', { class: 'tabs', role: 'tablist' }, tabBtn('info', 'Info'), tabBtn('meds', `Medications (${b.medications.filter((m) => m.active).length})`),
        tabBtn('medlog', 'Medication log'), tabBtn('visits', `Visits (${b.visits.length})`), tabBtn('imm', `Immunizations (${b.immunizations.length})`), tabBtn('history', 'History')),
      body));

  if (tab === 'info') {
    const cut = STUDENT_FORM.findIndex((f) => f[2] === 'heading');
    const kv = (fields) => fields.flatMap(([k, label]) => [h('dt', {}, label), h('dd', {}, s[k] || '\u2014')]);
    body.append(h('dl', { class: 'kv' }, kv(STUDENT_FORM.slice(0, cut)),
      h('dt', {}, 'Added'), h('dd', {}, fmtDT(s.created_at)), h('dt', {}, 'Last changed'), h('dd', {}, fmtDT(s.updated_at))),
    h('h3', { class: 'formhead' }, STUDENT_FORM[cut][1]),
    s.med_consent && s.med_consent !== 'On file' ? h('div', { class: 'alert warn' }, `Medication permission: ${s.med_consent}`) : null,
    h('dl', { class: 'kv' }, kv(STUDENT_FORM.slice(cut + 1))),
    can('edit') ? h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: () => studentForm(s, reload) }, 'Edit info')) : null);
  } else if (tab === 'meds') {
    const remind = h('input', { type: 'checkbox', checked: s.med_alerts !== 'off' });
    remind.addEventListener('change', async () => {
      try {
        await post(`/api/students/${s.id}/alerts`, { on: remind.checked });
        s.med_alerts = remind.checked ? null : 'off';
        toast(remind.checked ? `Reminders on for ${s.first_name}` : `Reminders off for ${s.first_name}`);
      } catch (e) { remind.checked = !remind.checked; toast(e.message, true); }
    });
    body.append(
      can('edit') ? h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn primary', onclick: () => medForm(s, null, reload) }, 'Add medication'),
        h('div', { class: 'grow' }),
        h('label', { class: 'check', title: 'Pop-up and phone reminders when a scheduled dose is due' }, remind, `Medication reminders for ${s.first_name}`)) : null,
      table([
        { label: 'Medication', get: (m) => [h('b', {}, m.name), m.active ? null : h('span', { class: 'pill', style: 'margin-left:6px' }, 'stopped')] },
        { label: 'Dose', get: (m) => [m.dose, m.route && ` \u00B7 ${m.route}`] },
        { label: 'When', get: (m) => [m.times ? m.times.split(', ').map(fmtHM).join(', ') : '', m.times && daysLabel(medDays(m)) ? h('div', { class: 'muted small' }, daysLabel(medDays(m))) : null, m.prn ? h('span', { class: 'pill', style: 'margin-left:6px' }, 'as needed') : null] },
        { label: 'Dates', nowrap: true, get: (m) => [m.start_date || '', m.end_date ? ` to ${m.end_date}` : ''] },
        { label: 'On hand', get: (m) => (m.on_hand == null ? '' : h('span', { class: 'pill' + (m.on_hand <= 5 ? ' warn' : '') }, m.on_hand)) },
        { label: '', nowrap: true, get: (m) => h('div', { class: 'row' },
          m.active && can('dose') ? h('button', { class: 'btn small primary', onclick: () => giveForm({ ...m, first_name: s.first_name, last_name: s.last_name, allergies: s.allergies }, null, reload) }, 'Give') : null,
          can('edit') ? h('button', { class: 'btn small', onclick: () => medForm(s, m, reload) }, 'Edit') : null) },
      ], b.medications, { empty: 'No medications on file.' }));
  } else if (tab === 'medlog') {
    body.append(table(givenCols(false, reload), b.given, { empty: 'No doses recorded yet.' }));
  } else if (tab === 'visits') {
    body.append(
      can('visit') ? h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn primary', onclick: () => visitForm(s, null, reload) }, 'New visit')) : null,
      table(visitCols(false, reload), b.visits, { empty: 'No visits yet.', onRow: can('visit') ? (v) => visitForm(s, v, reload) : null }));
  } else if (tab === 'imm') {
    immunizationTab(body, s, b.immunizations, reload);
  } else {
    body.append(h('p', { class: 'muted small' }, 'Every view, change and export of this student\u2019s record, newest first.'), auditTable(b.history, false));
  }
}

function visitCols(withStudent, reload) {
  return [
    { label: 'When', nowrap: true, get: (v) => (withStudent ? fmtTime(v.visit_at) : fmtDT(v.visit_at)) },
    withStudent && { label: 'Student', get: fullName },
    { label: 'Reason', get: (v) => h('b', {}, v.complaint || '') },
    { label: 'Temp', get: (v) => v.temp || '' },
    { label: 'Treatment', get: (v) => h('span', { class: 'pre' }, v.treatment || '') },
    { label: 'Outcome', get: (v) => [v.disposition || '', v.parent_contacted ? h('div', { class: 'small muted' }, 'parent contacted') : null] },
    { label: 'Nurse', get: (v) => v.nurse || '' },
    reload && S.user.role === 'admin' && { label: '', get: (v) => h('button', { class: 'btn small danger', onclick: async () => {
      if (!(await confirmBox('Delete visit?', `Delete the ${fmtDT(v.visit_at)} visit (${v.complaint})? The audit log keeps a copy.`, 'Delete', true))) return;
      post(`/api/visits/${v.id}/delete`).then(reload, (e) => toast(e.message, true));
    } }, 'Delete') },
  ].filter(Boolean);
}

function givenCols(withStudent, reload) {
  return [
    { label: 'When', nowrap: true, get: (g) => fmtDT(g.given_at) },
    withStudent && { label: 'Student', get: fullName },
    { label: 'Medication', get: (g) => h('b', {}, g.medication) },
    { label: 'Dose', get: (g) => g.dose || '' },
    { label: 'Scheduled', get: (g) => (g.scheduled ? fmtHM(g.scheduled) : 'as needed') },
    { label: 'Status', get: (g) => statusPill(g.status) },
    { label: 'Notes', get: (g) => h('span', { class: 'pre' }, g.notes || '') },
    { label: 'By', get: (g) => g.given_by || '' },
    reload && S.user.role === 'admin' && { label: '', get: (g) => h('button', { class: 'btn small danger', onclick: async () => {
      if (!(await confirmBox('Delete entry?', `Delete the ${g.medication} entry from ${fmtDT(g.given_at)}? The audit log keeps a copy.`, 'Delete', true))) return;
      post(`/api/given/${g.id}/delete`).then(reload, (e) => toast(e.message, true));
    } }, 'Delete') },
  ].filter(Boolean);
}

function auditTable(rows, withStudent = true) {
  return table([
    { label: 'When', nowrap: true, get: (a) => fmtDT(a.at) },
    { label: 'User', get: (a) => a.username || 'system' },
    { label: 'Action', get: (a) => h('span', { class: 'pill' }, a.action) },
    withStudent && { label: 'Student', get: (a) => (a.last_name ? h('a', { href: `#/student/${a.student_id}` }, fullName(a)) : '') },
    { label: 'Details', get: (a) => h('span', { class: 'small pre' }, prettyDetails(a.details)) },
  ].filter(Boolean), rows, { empty: 'No entries.' });
}

function prettyDetails(d) {
  if (!d) return '';
  try {
    const o = JSON.parse(d);
    if (typeof o !== 'object' || !o) return String(o);
    return Object.entries(o).map(([k, v]) => (v && typeof v === 'object' && 'from' in v
      ? `${k}: ${v.from ?? '\u2014'} \u2192 ${v.to ?? '\u2014'}`
      : `${k}: ${v && typeof v === 'object' ? JSON.stringify(v) : v}`)).join('\n');
  } catch { return d; }
}

function medForm(s, m, reload) {
  const fields = [
    ['name', 'Medication', 'text', { required: true }],
    ['dose', 'Dose (e.g. 5 mg, 2 puffs)'],
    ['route', 'Route', 'select', { choices: ROUTES }],
    ['times', 'Scheduled times (e.g. 8:00, 12:30)', 'text', { placeholder: 'empty if only as needed' }],
    ['days', 'Days it is given (no-school days are skipped)', 'days'],
    ['prn', 'Can be given as needed (PRN)', 'check'],
    ['start_date', 'Start date', 'date'],
    ['end_date', 'End date', 'date'],
    ['prescriber', 'Prescriber'],
    ['on_hand', 'Doses on hand', 'number', { min: 0 }],
    ['instructions', 'Instructions', 'textarea', { rows: 2 }],
    ['active', 'Active (uncheck when stopped)', 'check'],
  ];
  const form = formGrid(fields, m ? { ...m, times: m.times ? m.times.split(', ').map((t) => t.replace(/^0/, '')).join(', ') : '' } : { active: 1 });
  const err = errBox();
  const dlg = modal(m ? `Edit ${m.name}` : `Add medication for ${s.first_name} ${s.last_name}`, [assistBar(form, fields, { form: 'Medication', studentId: s.id }), err, form], [
    ['Cancel', () => dlg.close()],
    ['Save', async () => {
      try {
        const v = readForm(form);
        if (!v.days) return showErr(err, 'Pick at least one day the medication is given.');
        if (m) await post(`/api/meds/${m.id}`, v);
        else await post(`/api/students/${s.id}/meds`, v);
        dlg.close();
        toast('Medication saved');
        reload();
      } catch (e) { showErr(err, e.message); }
    }, 'primary'],
  ], { wide: true });
}

// m is a medication row with the student's name and allergies; time is the scheduled slot or null.
// day (YYYY-MM-DD) records a dose for another day, at its scheduled time.
function giveForm(m, time, reload, day = null) {
  const form = formGrid([
    ['status', 'Result', 'select', { choices: STATUSES, default: 'given' }],
    ['dose', 'Dose given'],
    ['given_at', 'Time', 'datetime'],
    ['notes', 'Notes', 'textarea', { rows: 2 }],
  ], { dose: m.dose || '', given_at: day && day !== today() ? new Date(`${day}T${time || '12:00'}`).getTime() : Date.now() });
  const err = errBox();
  const dlg = modal(`${m.name} for ${m.first_name} ${m.last_name}`, [
    m.allergies ? h('div', { class: 'alert bad' }, h('b', {}, 'Allergies: '), m.allergies) : null,
    h('p', { class: 'muted' }, [time ? `Scheduled ${fmtHM(time)}` : 'As needed', m.route && ` \u00B7 ${m.route}`, m.instructions && ` \u00B7 ${m.instructions}`].filter(Boolean).join('')),
    err, form,
  ], [
    ['Cancel', () => dlg.close()],
    ['Record', async () => {
      try {
        const v = readForm(form);
        await post(`/api/meds/${m.id}/give`, { ...v, scheduled: time || '' });
        dlg.close();
        toast(`Recorded: ${m.name} ${v.status}`);
        reload();
      } catch (e) { showErr(err, e.message); }
    }, 'primary'],
  ]);
}

const COMPLAINTS = ['Headache', 'Stomach ache', 'Fever', 'Injury', 'Nausea', 'Sore throat', 'Asthma', 'Nosebleed', 'Medication', 'Blood sugar check', 'Rash', 'Dizziness', 'Toothache', 'Earache'];

function visitForm(s, v, reload) {
  const fields = [
    ['visit_at', 'Time in', 'datetime'],
    ['complaint', 'Reason for visit', 'text', { required: true, list: 'complaints' }],
    ['temp', 'Temperature'],
    ['assessment', 'Assessment', 'textarea', { rows: 2 }],
    ['treatment', 'Treatment / care given', 'textarea', { rows: 2 }],
    ['disposition', 'Outcome', 'select', { choices: DISPOSITIONS }],
    ['parent_contacted', 'Parent / guardian contacted', 'check'],
    ['notes', 'Notes', 'textarea', { rows: 2 }],
  ];
  const form = formGrid(fields, v || { visit_at: Date.now() });
  form.append(h('datalist', { id: 'complaints' }, COMPLAINTS.map((c) => h('option', { value: c }))));
  const err = errBox();
  const dlg = modal(v ? `Visit on ${fmtDT(v.visit_at)}` : `New visit: ${s.first_name} ${s.last_name}`, [
    s.allergies ? h('div', { class: 'alert bad' }, h('b', {}, 'Allergies: '), s.allergies) : null,
    s.conditions ? h('div', { class: 'alert warn' }, h('b', {}, 'Conditions: '), s.conditions) : null,
    s.guardian_name || s.guardian_phone ? h('p', { class: 'muted' }, `Guardian: ${s.guardian_name || ''} ${s.guardian_phone || ''}`) : null,
    assistBar(form, fields, { form: 'Office visit', studentId: s.id }), err, form,
  ], [
    ['Cancel', () => dlg.close()],
    ['Save visit', async () => {
      try {
        if (v) await post(`/api/visits/${v.id}`, readForm(form));
        else await post(`/api/students/${s.id}/visits`, readForm(form));
        dlg.close();
        toast('Visit saved');
        reload();
      } catch (e) { showErr(err, e.message); }
    }, 'primary'],
  ], { wide: true });
}

// ---- immunizations ------------------------------------------------------------------

const IMM_STATUS = ['', 'Complete', 'In progress', 'Incomplete', 'Medical exemption', 'Religious or personal exemption', 'Not reviewed'];
const VACCINES = ['DTaP / Tdap', 'Polio (IPV)', 'MMR', 'Hepatitis B', 'Varicella (chickenpox)', 'Meningococcal (MenACWY)', 'Hepatitis A', 'Hib', 'Pneumococcal', 'HPV', 'Influenza', 'COVID-19'];

function immunizationTab(body, s, list, reload) {
  const st = s.imm_status || 'Not reviewed';
  const tone = st === 'Complete' ? ' ok' : ['In progress', 'Incomplete'].includes(st) ? ' warn' : '';
  body.append(
    h('div', { class: 'row', style: 'margin-bottom:10px' },
      h('span', {}, 'Status: '), h('span', { class: 'pill' + tone }, st),
      s.imm_notes ? h('span', { class: 'muted small' }, s.imm_notes) : null,
      h('div', { class: 'grow' }),
      can('edit') ? h('button', { class: 'btn', onclick: () => immStatusForm(s, reload) }, 'Change status') : null,
      can('edit') ? h('button', { class: 'btn primary', onclick: () => immForm(s, null, reload) }, 'Add dose') : null),
    table([
      { label: 'Vaccine', get: (i) => h('b', {}, i.vaccine) },
      { label: 'Dose', get: (i) => i.dose_no || '' },
      { label: 'Date given', nowrap: true, get: (i) => i.given_on || '' },
      { label: 'Source', get: (i) => i.source || '' },
      { label: 'Notes', get: (i) => h('span', { class: 'pre' }, i.notes || '') },
      { label: 'Entered by', get: (i) => i.entered_by || '' },
    ], list, { empty: 'No immunizations recorded yet.', onRow: can('edit') ? (i) => immForm(s, i, reload) : null }),
    h('p', { class: 'muted small' }, 'Requirements differ by state and grade; the Immunization report on the Students page lists every student’s doses for your state report.'));
}

function immStatusForm(s, reload) {
  const fields = [['imm_status', 'Immunization status', 'select', { choices: IMM_STATUS }], ['imm_notes', 'Notes (what is missing, exemption details, due dates)', 'textarea', { rows: 3 }]];
  const form = formGrid(fields, s);
  const err = errBox();
  const dlg = modal(`Immunization status: ${s.first_name} ${s.last_name}`, [assistBar(form, fields, { form: 'Immunization status', studentId: s.id }), err, form], [
    ['Cancel', () => dlg.close()],
    ['Save', async () => {
      try { await post(`/api/students/${s.id}`, readForm(form)); dlg.close(); toast('Saved'); reload(); } catch (e) { showErr(err, e.message); }
    }, 'primary'],
  ], { wide: true });
}

function immForm(s, i, reload) {
  const fields = [
    ['vaccine', 'Vaccine', 'text', { required: true, list: 'vaccines' }],
    ['dose_no', 'Dose number (1, 2, booster…)'],
    ['given_on', 'Date given', 'date'],
    ['source', 'Source (shot record, state registry, doctor…)'],
    ['notes', 'Notes', 'textarea', { rows: 2 }],
  ];
  const form = formGrid(fields, i || {});
  form.append(h('datalist', { id: 'vaccines' }, VACCINES.map((v) => h('option', { value: v }))));
  const err = errBox();
  const dlg = modal(i ? `${i.vaccine} for ${s.first_name} ${s.last_name}` : `Add immunization for ${s.first_name} ${s.last_name}`, [assistBar(form, fields, { form: 'Immunization', studentId: s.id }), err, form], [
    ...(i ? [['Delete', async () => {
      if (!(await confirmBox('Delete this dose?', `Delete ${i.vaccine}${i.given_on ? ` from ${i.given_on}` : ''}? The audit log keeps a copy.`, 'Delete', true))) return;
      try { await post(`/api/immunizations/${i.id}/delete`); dlg.close(); toast('Deleted'); reload(); } catch (e) { showErr(err, e.message); }
    }, 'danger']] : []),
    ['Cancel', () => dlg.close()],
    ['Save', async () => {
      try {
        if (i) await post(`/api/immunizations/${i.id}`, readForm(form));
        else await post(`/api/students/${s.id}/immunizations`, readForm(form));
        dlg.close();
        toast('Immunization saved');
        reload();
      } catch (e) { showErr(err, e.message); }
    }, 'primary'],
  ], { wide: true });
}

// ---- roster import and deleting for good ------------------------------------------------

function readFileB64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] || '');
    r.onerror = () => reject(new Error('that file could not be read'));
    r.readAsDataURL(file);
  });
}

// Students > Import roster: pick a CSV or Excel export, see what would change, then import.
function importDialog(done) {
  const err = errBox();
  const file = h('input', { type: 'file', accept: '.csv,.xlsx,.txt' });
  const full = h('input', { type: 'checkbox' });
  const result = h('div', {});
  let ready = null;
  const summary = (r) => [
    h('div', { class: 'cards' },
      h('div', { class: 'card' }, h('b', {}, r.create), h('span', {}, 'new students')),
      h('div', { class: 'card' }, h('b', {}, r.update), h('span', {}, 'updated')),
      h('div', { class: 'card' }, h('b', {}, r.same), h('span', {}, 'no change')),
      full.checked ? h('div', { class: 'card' }, h('b', {}, r.archive), h('span', {}, 'archived (not in file)')) : null),
    h('p', { class: 'muted small' }, `Columns used: ${r.columns.join(', ')}.`, r.unused.length ? ` Not used: ${r.unused.join(', ')}.` : ''),
    r.restore ? h('p', {}, `${r.restore} archived student${r.restore === 1 ? '' : 's'} in the file will be restored.`) : null,
    r.archive ? h('details', {}, h('summary', {}, `Students to archive (${r.archive})`), h('p', { class: 'small' }, r.archiveNames.join('; '), r.archive > r.archiveNames.length ? ' …' : '')) : null,
    r.errors.length ? h('div', { class: 'alert bad' }, h('b', {}, `${r.errors.length} row${r.errors.length === 1 ? '' : 's'} skipped: `), r.errors.slice(0, 10).map((e) => `line ${e.line}: ${e.msg}`).join('; ')) : null,
    r.notes.length ? h('div', { class: 'alert warn' }, r.notes.slice(0, 10).map((e) => `line ${e.line}: ${e.msg}`).join('; '), r.notes.length > 10 ? ' …' : '') : null,
    r.sample.length ? table([
      { label: 'Line', get: (x) => x.line },
      { label: 'Student', get: (x) => h('b', {}, x.name) },
      { label: 'Change', get: (x) => (x.action === 'create' ? 'new' : [x.restore ? 'restore, ' : '', x.changes.join(', ')]) },
    ], r.sample) : null,
  ];
  let importBtn;
  const run = async (apply) => {
    err.classList.add('hidden');
    const f = file.files && file.files[0];
    if (!f) return showErr(err, 'pick a file first');
    try {
      const r = await post('/api/import/students', { name: f.name, data: await readFileB64(f), fullRoster: full.checked, apply });
      if (apply) {
        dlg.close();
        toast(`Imported: ${r.create} added, ${r.update} updated${r.archive ? `, ${r.archive} archived` : ''}`);
        done();
        return;
      }
      ready = r;
      result.replaceChildren(...summary(r).filter(Boolean));
      importBtn.disabled = !(r.create || r.update || r.archive);
    } catch (e) { showErr(err, e.message); }
  };
  file.addEventListener('change', () => { ready = null; result.replaceChildren(); importBtn.disabled = true; run(false); });
  full.addEventListener('change', () => { if (file.files && file.files[0]) run(false); });
  const dlg = modal('Import a student roster', [
    h('p', { class: 'muted' }, 'Export the student list from your student information system (PowerSchool, Infinite Campus, Skyward…) or a spreadsheet as CSV or Excel. A header row names the columns: First name and Last name are needed; Student ID, birth date, grade, homeroom, sex, guardian and phone, allergies and conditions are used when present.'),
    h('p', { class: 'muted small' }, 'Students are matched by student ID, or by name and birth date. Only filled-in cells change a record; a blank cell never clears anything. Nothing is saved until you press Import.'),
    err, field('File', file),
    h('label', { class: 'check' }, full, 'This is the whole school: archive students with an ID who are not in the file (new school year)'),
    result,
  ], [['Cancel', () => dlg.close()], ['Import', () => ready && run(true), 'primary']], { wide: true });
  importBtn = [...dlg.box.querySelectorAll('.actions .btn')].pop();
  importBtn.disabled = true;
}

// An archived student, gone for good: the admin types the last name to confirm.
function deleteStudent(s) {
  const err = errBox();
  const confirmName = h('input', { type: 'text', autocomplete: 'off' });
  const dlg = modal(`Delete ${s.first_name} ${s.last_name} for good?`, [
    h('div', { class: 'alert bad' }, 'This erases the student and every medication, dose, visit, immunization and photo for them. It cannot be undone. The audit log keeps who did what and when, without the health details.'),
    h('p', { class: 'muted small' }, 'Copies stay in the daily backups until they age out (30 days). Export the student first if your district needs a copy.'),
    err, field(`Type ${s.last_name} to confirm`, confirmName),
  ], [
    ['Cancel', () => dlg.close()],
    ['Delete for good', async () => {
      try { await post(`/api/students/${s.id}/delete`, { confirm: confirmName.value }); dlg.close(); toast('Student deleted'); go('#/students'); } catch (e) { showErr(err, e.message); }
    }, 'danger'],
  ]);
}

// ---- logs -------------------------------------------------------------------------

async function logView(main, { title, kind, url, cols, onRow, days = 7 }) {
  const from = h('input', { type: 'date', value: daysAgo(days), style: 'width:auto' });
  const to = h('input', { type: 'date', value: today(), style: 'width:auto' });
  const q = h('input', { type: 'search', class: 'search', placeholder: 'Search\u2026' });
  const params = () => ({ from: from.value, to: to.value, q: q.value });
  const list = h('div', {});
  const count = h('span', { class: 'muted' });
  const load = async () => {
    const rows = await get(`${url}?${new URLSearchParams(params())}`);
    count.textContent = `${rows.length} entr${rows.length === 1 ? 'y' : 'ies'}${rows.length >= 2000 ? ' (showing the newest 2000; export for all)' : ''}`;
    list.replaceChildren(typeof cols === 'function' ? cols(rows) : table(cols, rows, { empty: 'Nothing in this date range.', onRow }));
  };
  from.addEventListener('change', load);
  to.addEventListener('change', load);
  q.addEventListener('input', debounce(load, 250));
  fill(main, 
    h('div', { class: 'head' }, h('h1', {}, title), count, h('div', { class: 'grow' }), exportMenu(kind, params)),
    h('div', { class: 'panel' },
      h('div', { class: 'row', style: 'margin-bottom:12px' }, h('span', { class: 'muted' }, 'From'), from, h('span', { class: 'muted' }, 'to'), to, q),
      list));
  await load();
}

const viewVisitLog = (main) => logView(main, {
  title: 'Visit log', kind: 'visits', url: '/api/visits',
  cols: [{ label: 'When', nowrap: true, get: (v) => fmtDT(v.visit_at) }, ...visitCols(true).slice(1)],
  onRow: (v) => go(`#/student/${v.student_id}/visits`),
});
const viewGivenLog = (main) => logView(main, { title: 'Medication log', kind: 'given', url: '/api/given', cols: givenCols(true), onRow: (g) => go(`#/student/${g.student_id}/medlog`) });
const viewAudit = (main) => logView(main, { title: 'Audit log', kind: 'audit', url: '/api/audit', cols: (rows) => auditTable(rows), days: 1 });

// ---- dictation ---------------------------------------------------------------------

const MAX_RECORD_SECONDS = 180;

// The Dictate bar above a form. Click a box first and dictation types into that
// box; with no box picked, ChatGPT reads the notes and fills the whole form.
// fields is the same list given to formGrid; nothing is saved here.
const TYPABLE = 'input[type=text], input[type=tel], input[type=number], input[type=search], textarea';

function assistBar(form, fields, { form: formName, studentId } = {}) {
  if (!S.aiReady) {
    return h('p', { class: 'muted small assist-tip' }, S.remote
      ? 'Tip: tap a box, then use the microphone key on your keyboard to dictate into it.'
      : 'Tip: click a box (it lights up), then press the Windows key + H to dictate into it.',
    S.user.role === 'admin' && !S.remote ? [' ', h('a', { href: '#/settings/ai' }, 'Set up ChatGPT to fill in the form for you.')] : null);
  }
  const list = fields.filter(([name, , type]) => name && type !== 'datetime' && type !== 'heading' && type !== 'password')
    .map(([name, label, type = 'text', opts = {}]) => ({ name, label, type, choices: opts.choices || [] }));
  const canRecord = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.MediaRecorder);
  const status = h('span', { class: 'muted small', role: 'status' });
  const heard = h('details', { class: 'assist-heard hidden' }, h('summary', {}, 'What was heard'), h('p', {}));
  const notes = h('textarea', { rows: 3, placeholder: 'Type or paste notes, e.g. "Mom is Jane Smith, 555 201 3344. Takes Zyrtec 10 mg at home. Permission form is on file."' });
  const typed = h('div', { class: 'hidden', style: 'margin-top:8px' }, notes,
    h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'btn small primary', type: 'button', onclick: () => send({ notes: notes.value }) }, 'Fill in the form')));
  let rec = null;
  let timer = null;
  let target = null; // the box picked by clicking it, or null for the whole form
  let recTarget = null;
  const where = h('span', { class: 'assist-where' });
  const mic = h('button', { class: 'btn small primary', type: 'button', onclick: () => toggle() }, '\u{1F3A4} Dictate');
  const busy = (on) => { mic.disabled = on; for (const b of typed.querySelectorAll('button')) b.disabled = on; };
  const fieldOf = (el) => list.find((f) => f.name === el.name);
  const boxOf = (el) => el && el.closest('.grid > div');

  function pick(el) {
    if (target === el) return;
    if (target) boxOf(target)?.classList.remove('dict-target');
    target = el;
    if (el) boxOf(el)?.classList.add('dict-target');
    showWhere();
  }
  function showWhere() {
    const f = target && fieldOf(target);
    where.replaceChildren(...(f
      ? ['Dictating into ', h('b', {}, f.label), ' \u00B7 ', h('button', { class: 'linkbtn', type: 'button', onclick: () => pick(null) }, 'fill the whole form instead')]
      : ['Click a box to dictate into it, or dictate now to fill the whole form.']));
  }
  form.addEventListener('focusin', (e) => { if (e.target.matches(TYPABLE) && fieldOf(e.target)) pick(e.target); });
  showWhere();

  function toggle() {
    if (!canRecord) { status.textContent = 'This device cannot record here; use Type notes.'; return; }
    if (mic.disabled) return;
    if (rec) rec.stop(); else start();
  }

  async function start() {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
      status.textContent = 'The microphone is blocked or missing. Allow it for this app, or type your notes instead.';
      return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const chunks = [];
    recTarget = target;
    if (recTarget) boxOf(recTarget)?.classList.add('dictating');
    rec = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      const type = rec.mimeType || mime || 'audio/webm';
      rec = null;
      mic.textContent = '\u{1F3A4} Dictate';
      mic.classList.remove('danger');
      const blob = new Blob(chunks, { type });
      const audio = await new Promise((resolve) => { const r = new FileReader(); r.onload = () => resolve(String(r.result).split(',')[1] || ''); r.readAsDataURL(blob); });
      if (recTarget) intoBox(recTarget, { audio, mime: type });
      else send({ audio, mime: type, notes: notes.value });
    };
    rec.start(1000);
    const began = Date.now();
    mic.textContent = '\u25A0 Stop';
    mic.classList.add('danger');
    status.textContent = `Listening\u2026 press Stop (or ${S.dictateKey}) when done.`;
    timer = setInterval(() => {
      const sec = Math.round((Date.now() - began) / 1000);
      status.textContent = `Listening\u2026 ${Math.floor(sec / 60)}:${p2(sec % 60)}`;
      if (sec >= MAX_RECORD_SECONDS && rec) rec.stop();
    }, 500);
  }

  // Dictation into the picked box: the words go in where the cursor was.
  async function intoBox(el, payload) {
    const f = fieldOf(el);
    busy(true);
    status.textContent = 'Turning speech into text\u2026';
    try {
      const r = await post('/api/ai/fill', { ...payload, only: 'transcribe', form: formName, field: f.label, studentId, fields: list });
      if (!r.transcript) { status.textContent = 'Nothing was heard; try again a little closer to the microphone.'; return; }
      insertText(el, r.transcript, f.type);
      boxOf(el)?.classList.add('ai-filled');
      status.textContent = `Added to ${f.label}. Check it before saving.`;
      el.focus();
    } catch (e) {
      status.textContent = e.message;
    } finally {
      boxOf(el)?.classList.remove('dictating');
      busy(false);
    }
  }

  async function send(payload) {
    if (!payload.audio && !String(payload.notes || '').trim()) { status.textContent = 'Type some notes first.'; return; }
    busy(true);
    status.textContent = payload.audio ? 'Turning speech into text and filling in\u2026' : 'Filling in\u2026';
    try {
      const r = await post('/api/ai/fill', { ...payload, fields: list, current: readForm(form), form: formName, studentId });
      const n = applyValues(form, list, r.values);
      if (r.transcript) { heard.querySelector('p').textContent = r.transcript; heard.classList.remove('hidden'); }
      status.textContent = n ? `Filled in ${n} box${n === 1 ? '' : 'es'} (highlighted). Check them before saving.` : 'Nothing in the notes matched this form.';
      if (n && !payload.audio) notes.value = '';
    } catch (e) {
      status.textContent = e.message;
    } finally { busy(false); }
  }

  const bar = h('div', { class: 'assist' },
    h('div', { class: 'row' }, canRecord ? mic : null,
      h('button', { class: 'btn small', type: 'button', onclick: () => typed.classList.toggle('hidden') }, 'Type notes'),
      status, h('div', { class: 'grow' }),
      h('a', { class: 'small', href: '#/settings/help', target: '_blank', title: 'Opens the help in a new window so this form stays open' }, 'How to use')),
    canRecord ? h('div', { class: 'small muted', style: 'margin-top:6px' }, where) : null,
    typed, heard);
  bar.nlToggle = toggle; // for the dictation shortcut key
  return bar;
}

// Puts dictated words into one box at the cursor. Phone boxes keep only digits.
function insertText(el, text, type) {
  let t = String(text).trim();
  if (el.tagName !== 'TEXTAREA') t = t.replace(/[.\u3002]+$/, '');
  if (type === 'tel') { el.value = fmtPhone(el.value + t); return; }
  if (type === 'number') { const n = (t.match(/-?\d+(?:\.\d+)?/) || [])[0]; if (n) el.value = n; return; }
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  const before = el.value.slice(0, start);
  el.setRangeText((before && !/\s$/.test(before) ? ' ' : '') + t, start, end, 'end');
}

// ---- dictation shortcut ------------------------------------------------------------

// "Ctrl+Shift+M" from a key press, or null for keys that cannot be a shortcut.
function comboOf(e) {
  const c = e.code || '';
  const k = /^Key[A-Z]$/.test(c) ? c.slice(3) : /^Digit\d$/.test(c) ? c.slice(5) : c === 'Space' ? 'Space' : /^F\d{1,2}$/.test(c) ? c : null;
  if (!k) return null;
  return [e.ctrlKey && 'Ctrl', e.altKey && 'Alt', e.shiftKey && 'Shift', k].filter(Boolean).join('+');
}

const NO_AI_HINT = 'Dictation with ChatGPT is not set up. Click a box and press the Windows key + H instead.';

// The user's key starts or stops dictation on the open form. On a student's page
// with no form open it opens Edit info and starts listening.
document.addEventListener('keydown', (e) => {
  if (!S.user || !S.dictateKey || e.repeat || (e.target.closest && e.target.closest('.key-capture'))) return;
  if (comboOf(e) !== S.dictateKey) return;
  e.preventDefault();
  const bar = [...document.querySelectorAll('.overlay .assist')].pop();
  if (bar && bar.nlToggle) return bar.nlToggle();
  if (document.querySelector('.overlay .assist-tip')) return toast(NO_AI_HINT);
  if (document.querySelector('.overlay')) return;
  if (S.board && route().name === 'student') {
    studentForm(S.board.s, S.board.reload);
    const opened = [...document.querySelectorAll('.overlay .assist')].pop();
    if (opened && opened.nlToggle) opened.nlToggle(); else toast(NO_AI_HINT);
    return;
  }
  toast(`Open a student or a form first, then press ${S.dictateKey} to dictate.`);
});

// Puts suggested values into the form and highlights them. A note added to a
// box that already has text is appended, so nothing typed earlier is lost.
function applyValues(form, list, values) {
  let n = 0;
  for (const f of list) {
    if (!(f.name in values)) continue;
    const el = form.elements[f.name];
    if (!el) continue;
    let v = values[f.name];
    if (f.type === 'check') { if (el.checked === !!v) continue; el.checked = !!v; } else {
      if (f.type === 'tel') v = fmtPhone(v);
      if (f.type === 'select' && ![...el.options].some((o) => o.value === v)) continue;
      if (f.type === 'number' && !Number.isFinite(Number(v))) continue;
      const old = el.value.trim();
      if (f.type === 'textarea' && old && !v.includes(old)) v = `${old}\n${v}`;
      if (el.value === v) continue;
      el.value = v;
    }
    const box = el.closest('div');
    if (box) box.classList.add('ai-filled');
    n++;
  }
  return n;
}

// ---- settings ----------------------------------------------------------------------

async function viewSettings(main, r) {
  const admin = S.user.role === 'admin';
  const tabs = [['account', 'My account'], ['appearance', 'Appearance'], ['alerts', 'Medication alerts'], ['remote', 'Remote access'], ...(admin ? [['users', 'Users'], ['school', 'School & security'], ['email', 'Email'], ['ai', 'Dictation & ChatGPT'], ['saving', 'Saving & backup'], ['updates', 'Updates'], ['audit', 'Audit log']] : []), ['help', 'Help'], ['feedback', 'Feedback'], ['about', 'About']];
  const tab = tabs.some((t) => t[0] === r.tab) ? r.tab : 'account';
  const data = admin ? await get('/api/settings') : null;
  if (data) S.exportFolder = data.settings.exportFolder;
  const body = h('div', {});
  fill(main, 
    h('div', { class: 'head' }, h('h1', {}, 'Settings'), h('span', { class: 'muted' }, `Nurse’s Log v${S.version}`)),
    h('div', { class: 'panel' },
      h('div', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: 'tab' + (k === tab ? ' on' : ''), type: 'button', onclick: () => go(`#/settings/${k}`) }, l))),
      body));
  const reload = () => viewSettings(main, r);
  await ({ account: setAccount, appearance: setAppearance, alerts: setAlerts, remote: setRemote, users: setUsers, school: setSchool, email: setEmail, ai: setAi, saving: setSaving, updates: setUpdates, audit: setAudit, help: setHelp, feedback: setFeedback, about: setAbout })[tab](body, data, reload);
}

function section(title, ...kids) {
  return h('div', { style: 'max-width:680px;margin-bottom:26px' }, h('h3', {}, title), ...kids);
}

function setAccount(body) {
  const err1 = errBox();
  const info = formGrid([['fullName', 'Full name'], ['email', 'Email (password reset codes go here)', 'email']], S.user);
  const err2 = errBox();
  const pw = formGrid([
    ['current', 'Current password', 'password', { autocomplete: 'current-password' }],
    ['next', 'New password', 'password', { autocomplete: 'new-password' }],
    ['next2', 'Confirm new password', 'password', { autocomplete: 'new-password' }],
  ]);
  const err3 = errBox();
  const rpw = h('input', { type: 'password', autocomplete: 'current-password', style: 'max-width:260px', placeholder: 'your password' });
  body.append(
    section('Your photo',
      h('div', { class: 'row' }, avatar('user', S.user.id, S.user.photoAt, S.user.fullName, 72),
        h('button', { class: 'btn', type: 'button', onclick: () => photoDialog({
          title: 'Your photo', kind: 'user', id: S.user.id, at: S.user.photoAt, name: S.user.fullName,
          save: (data) => post('/api/account/photo', { data }), remove: () => post('/api/account/photo/remove'),
          done: (r) => { S.user.photoAt = r.photoAt; renderShell(); },
        }) }, S.user.photoAt ? 'Change or remove photo' : 'Add a photo')),
      h('p', { class: 'muted small' }, 'Shows next to your name in the menu.')),
    section('Your details', err1, info, h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => {
      try { S.user = await post('/api/account', readForm(info)); toast('Saved'); renderShell(); } catch (e) { showErr(err1, e.message); }
    } }, 'Save details'))),
    section('Change password', err2, pw, h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => {
      const v = readForm(pw);
      if (v.next !== v.next2) return showErr(err2, 'the two new passwords do not match');
      try {
        S.user = await post('/api/account/password', v);
        toast('Password changed. Other sign-ins were ended.');
        pw.reset();
        err2.classList.add('hidden');
      } catch (e) { showErr(err2, e.message); }
    } }, 'Change password'))),
    twoStepSection(),
    devicesSection(),
    shortcutSection(),
    h('div', { class: 'phone-only', style: 'margin-bottom:22px' }, h('button', { class: 'btn', type: 'button', onclick: signOut }, 'Sign out')),
    section('Recovery code', h('p', { class: 'muted' }, 'Makes a new recovery code for resetting your password without email. The old code stops working. Enter your password to confirm.'),
      err3, h('div', { class: 'row' }, rpw, h('button', { class: 'btn', onclick: async () => {
        try { const r = await post('/api/account/recovery', { password: rpw.value }); rpw.value = ''; showRecovery(r.recovery, () => {}, true); } catch (e) { showErr(err3, e.message); }
      } }, 'Make new code'))));
}

// Settings > My account: a code from an authenticator app as well as the password.
function twoStepSection() {
  const box = h('div', {});
  const err = errBox();
  const pw = h('input', { type: 'password', autocomplete: 'current-password', style: 'max-width:260px', placeholder: 'your password' });
  const draw = () => {
    box.replaceChildren();
    if (S.user.totpOn) {
      box.append(h('div', { class: 'alert ok' }, 'Two-step sign-in is on. Signing in asks for a code from your authenticator app after the password.'),
        S.require2fa ? h('p', { class: 'muted small' }, 'Your school requires it, so it cannot be turned off.') : [err, h('div', { class: 'row' }, pw, h('button', { class: 'btn', onclick: async () => {
          try { S.user = await post('/api/account/totp/off', { password: pw.value }); toast('Two-step sign-in is off'); draw(); } catch (e) { showErr(err, e.message); }
        } }, 'Turn off'))]);
    } else {
      box.append(h('p', { class: 'muted' }, 'Ask for a 6 digit code from your phone when you sign in, so a stolen password alone cannot open student records. Phones you keep signed in with a PIN do not ask again.'),
        h('button', { class: 'btn primary', onclick: (e) => { e.currentTarget.remove(); totpSetup(box, draw); } }, 'Set up two-step sign-in'));
    }
  };
  draw();
  return section('Two-step sign-in', box);
}

// Settings > My account: phones that open with a PIN instead of the password.
function devicesSection() {
  const list = h('div', {});
  const load = async () => {
    const rows = await get('/api/account/devices');
    list.replaceChildren(table([
      { label: 'Phone', get: (d) => [h('b', {}, d.name), d.thisOne ? h('span', { class: 'pill ok', style: 'margin-left:6px' }, 'this one') : null] },
      { label: 'Last used', nowrap: true, get: (d) => fmtDT(d.last_used) },
      { label: 'Forgotten on', nowrap: true, get: (d) => new Date(d.expires).toLocaleDateString() },
      { label: '', get: (d) => h('button', { class: 'btn small', type: 'button', onclick: async () => {
        try { await post(`/api/account/devices/${d.id}/remove`); } catch (e) { return toast(e.message, true); }
        if (d.thisOne) S.device = null;
        toast('That phone will need your password next time');
        load();
      } }, 'Forget') },
    ], rows, { empty: 'No phones are remembered.' }));
  };
  load().catch((e) => list.replaceChildren(h('div', { class: 'alert bad' }, e.message)));
  return section('Phones that stay signed in',
    h('p', { class: 'muted' }, 'These phones open with your PIN instead of your password. Forget one you lost or no longer use. Changing your password forgets them all.'),
    S.pinSignIn ? null : h('p', { class: 'muted small' }, 'An admin has turned PIN sign-in off.'),
    list,
    S.remote && S.pinSignIn ? h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn', type: 'button', onclick: () => offerPin(true) },
      S.device ? 'Change this phone\u2019s PIN' : 'Stay signed in on this phone')) : null);
}

// Settings > My account: the key that starts and stops dictation.
function shortcutSection() {
  const err = errBox();
  const shown = h('kbd', { class: 'kbd' }, S.dictateKey);
  const cap = h('input', { type: 'text', class: 'key-capture', readonly: true, placeholder: 'Click here, then press the keys', style: 'max-width:260px' });
  let picked = null;
  cap.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') return;
    e.preventDefault();
    const k = comboOf(e);
    if (k) { picked = k; cap.value = k; err.classList.add('hidden'); }
  });
  const save = async (key) => {
    try {
      const r = await post('/api/account/shortcut', { key });
      S.dictateKey = r.dictateKey;
      shown.textContent = r.dictateKey;
      cap.value = '';
      picked = null;
      err.classList.add('hidden');
      toast(`Dictation key: ${r.dictateKey}`);
    } catch (e) { showErr(err, e.message); }
  };
  return section('Dictation shortcut',
    h('p', { class: 'muted' }, 'Press ', shown, ' to start dictating on an open form, and again to stop. If you clicked a box first, the words go into that box; otherwise ChatGPT fills the whole form. On a student\u2019s page it opens Edit info and starts listening.'),
    S.aiReady ? null : h('p', { class: 'muted small' }, 'Dictation with ChatGPT is not turned on yet, so the key does nothing until an admin sets it up.'),
    err,
    h('div', { class: 'row' }, cap,
      h('button', { class: 'btn primary', type: 'button', onclick: () => (picked ? save(picked) : showErr(err, 'click the box and press the keys you want first')) }, 'Use this key'),
      h('button', { class: 'btn', type: 'button', onclick: () => save('default') }, 'Back to F2')),
    h('p', { class: 'muted small' }, 'Good choices: an F key like F2, F4, F8 or F9, or Ctrl+Shift with a letter (like Ctrl+Shift+M). Keys the browser uses, like Ctrl+C or F5, cannot be picked.'));
}

const FIREWALL_CMD = 'New-NetFirewallRule -DisplayName "Nurse\'s Log over Tailscale" -Direction Inbound -Protocol TCP -LocalPort 8940 -RemoteAddress 100.64.0.0/10 -Action Allow';

function copyable(text) {
  const box = h('input', { type: 'text', value: text, readonly: true, style: 'font-family:Consolas,monospace' });
  return h('div', { class: 'row', style: 'flex-wrap:nowrap' }, box, h('button', { class: 'btn', type: 'button', onclick: async () => {
    box.select();
    try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { document.execCommand('copy'); toast('Copied'); }
  } }, 'Copy'));
}

// A QR code drawn as SVG from the server's rows of 0/1.
function qrSvg(rows, px = 180) {
  const NS = 'http://www.w3.org/2000/svg';
  const n = rows.length + 8; // 4-module quiet zone each side
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${n}`);
  svg.setAttribute('width', px);
  svg.setAttribute('height', px);
  svg.setAttribute('shape-rendering', 'crispEdges');
  svg.setAttribute('role', 'img');
  const bg = document.createElementNS(NS, 'rect');
  bg.setAttribute('width', n);
  bg.setAttribute('height', n);
  bg.setAttribute('fill', '#fff');
  let d = '';
  rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] === '1') d += `M${x + 4} ${y + 4}h1v1h-1z`; });
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', d);
  path.setAttribute('fill', '#000');
  svg.append(bg, path);
  return svg;
}

async function qrBox(url) {
  const box = h('div', { class: 'qr' });
  try {
    const q = await get(`/api/remote/qr?${new URLSearchParams({ url })}`);
    const svg = qrSvg(q.rows);
    svg.setAttribute('aria-label', `QR code for ${url}`);
    box.append(svg, h('div', { class: 'muted small' }, 'Scan with the phone\u2019s camera'));
  } catch { box.remove(); }
  return box;
}

async function setRemote(body, _d, reload) {
  const r = await get('/api/remote');
  const admin = S.user.role === 'admin';
  const connected = r.ips.length > 0;
  const on = r.enabled && r.listening.length > 0;
  const status = !r.installed ? h('div', { class: 'alert warn' }, 'Tailscale is not installed on this PC. Install it from tailscale.com and sign in.')
    : !connected ? h('div', { class: 'alert warn' }, `Tailscale is not connected on this PC (${r.state}). Open Tailscale and sign in.`)
      : r.error ? h('div', { class: 'alert bad' }, r.error)
        : on ? h('div', { class: 'alert ok' }, 'Remote access is on. Devices signed in to your Tailscale can open Nurse’s Log.')
          : h('div', { class: 'alert warn' }, 'Remote access is off. Only this PC can open Nurse’s Log.');

  const toggle = h('input', { type: 'checkbox', checked: r.enabled });
  toggle.addEventListener('change', async () => {
    try {
      await post('/api/settings', { remoteAccess: toggle.checked });
      toast(toggle.checked ? 'Remote access on' : 'Remote access off');
      reload();
    } catch (e) { toggle.checked = !toggle.checked; toast(e.message, true); }
  });

  fill(body,
    section('Remote access with Tailscale', status,
      h('dl', { class: 'kv' },
        h('dt', {}, 'Tailscale IP'), h('dd', {}, connected ? h('b', {}, r.ips.join(', ')) : '—'),
        h('dt', {}, 'Tailscale name'), h('dd', {}, r.dnsName || '—'),
        h('dt', {}, 'Port'), h('dd', {}, String(r.port)),
        h('dt', {}, 'This device'), h('dd', {}, S.remote ? 'connected remotely over Tailscale' : 'the office PC')),
      admin ? h('label', { class: 'check', style: 'margin-top:16px' }, toggle, 'Let phones and other devices on my Tailscale open Nurse’s Log')
        : h('p', { class: 'muted small' }, 'An admin turns remote access on or off.'),
      h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn', onclick: reload }, 'Refresh'))),
    on ? await httpsSection(r, admin, reload) : null,
    on ? section(r.https.on ? 'Plain address (works without installing)' : 'Open on your phone',
      h('p', { class: 'muted' }, r.https.on
        ? 'These also work, but phones will not install the app or allow dictation from them.'
        : 'Scan the code with the phone\u2019s camera, or type one of these into the phone\u2019s browser.'),
      h('div', { class: 'qr-row' },
        !r.https.on && !S.remote && r.urls[0] ? await qrBox(r.urls[0]) : null,
        h('div', { style: 'display:grid;gap:8px;flex:1;min-width:240px;align-content:start' }, r.urls.map(copyable)))) : null,
    section('Set up a phone',
      h('ol', { style: 'margin:0;padding-left:20px;line-height:1.8' },
        h('li', {}, 'Install Tailscale on this PC and on the phone, and sign both in to the same Tailscale account.'),
        h('li', {}, 'Turn on remote access above, then press Set up HTTPS (admin, once).'),
        h('li', {}, 'On the phone, scan the QR code with the camera (or type the address) and sign in with your Nurse’s Log username and password. On your own phone, choose a PIN when asked so next time you just type the PIN.'),
        h('li', {}, 'Install it: Android Chrome \u22EE menu > Install app (or Add to Home screen); iPhone Safari Share > Add to Home Screen. It then opens full screen from its own icon.')),
      h('p', { class: 'muted small' }, 'The connection is encrypted by Tailscale and only devices on your Tailscale can reach it; the school Wi-Fi cannot. The same password, lockout and auto sign-out apply, and every remote sign-in is in the audit log with the device’s address. "Save as" is not available from a phone; use Download.')),
    admin && on ? section('If the phone cannot connect',
      h('p', { class: 'muted' }, 'The HTTPS address goes through Tailscale itself and needs nothing else. For the plain address, Windows Firewall may block it. Allow it once by running this in PowerShell as administrator (it only lets Tailscale devices in, on this one port):'),
      copyable(FIREWALL_CMD)) : null,
  );
}

// The HTTPS address: what phones need to install the app and use the microphone.
async function httpsSection(r, admin, reload) {
  const err = errBox();
  const flip = (on) => async (e) => {
    e.target.disabled = true;
    if (on) toast('Setting up HTTPS\u2026 this can take half a minute');
    try {
      const info = await post('/api/remote/https', { on });
      if (on && !info.https.on) {
        showErr(err, '');
        err.replaceChildren('HTTPS certificates are off for your Tailscale account. Open ', h('a', { href: info.https.enableUrl, target: '_blank', rel: 'noopener' }, info.https.enableUrl),
          ', sign in, and under HTTPS Certificates click Enable HTTPS. Then press Set up HTTPS again.');
        e.target.disabled = false;
        return;
      }
      toast(on ? 'HTTPS is ready' : 'HTTPS turned off');
      reload();
    } catch (x) { showErr(err, x.message); e.target.disabled = false; }
  };
  if (r.https.on) {
    return section('Install on a phone (HTTPS)',
      h('p', { class: 'muted' }, 'Use this address on phones. It has a real certificate from Tailscale, so the phone can install Nurse\u2019s Log as an app and use the microphone for dictation. Only devices on your Tailscale can open it.'),
      h('div', { class: 'qr-row' },
        S.remote ? null : await qrBox(r.https.url),
        h('div', { style: 'flex:1;min-width:240px' }, copyable(r.https.url),
          h('ol', { class: 'muted', style: 'padding-left:20px;line-height:1.7' },
            h('li', {}, 'Scan the code with the phone\u2019s camera and open the link.'),
            h('li', {}, 'Sign in.'),
            h('li', {}, 'Android (Chrome): tap \u22EE then Install app. iPhone (Safari): tap Share then Add to Home Screen.')),
          admin && !S.remote ? h('button', { class: 'btn small', onclick: flip(false) }, 'Turn off HTTPS') : null)),
      err);
  }
  return section('Install on a phone (HTTPS)',
    h('p', { class: 'muted' }, 'Phones only install apps and allow the microphone on secure (https) addresses. Tailscale can give this PC one, visible only on your Tailscale.'),
    admin && !S.remote
      ? h('div', { class: 'row' }, h('button', { class: 'btn primary', onclick: flip(true) }, 'Set up HTTPS'))
      : h('p', { class: 'muted small' }, 'An admin sets this up once, on the office PC.'),
    h('p', { class: 'muted small' }, 'Tailscale notes that turning on HTTPS certificates puts this PC\u2019s Tailscale name in public certificate logs. Nothing on it becomes reachable from the internet.'),
    err);
}

function setAppearance(body) {
  const current = document.documentElement.getAttribute('data-theme') || 'system';
  const cards = THEMES.map(([key, name, kind, [bg, panel, accent], style]) => h('button', {
    class: 'theme-card' + (style === 'material' ? ' material' : '') + (key === current ? ' on' : ''), type: 'button', 'aria-pressed': String(key === current), 'data-key': key,
    onclick: async () => {
      applyTheme(key);
      for (const c of cards) { const on = c.dataset.key === key; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); }
      try { await post('/api/account/theme', { theme: key }); toast(`Theme: ${name}`); } catch (e) { toast(e.message, true); }
    },
  },
  h('div', { class: 'sw', style: `background:${bg}` }, h('i', { style: `background:${accent}` }), h('i', { style: `background:${panel};border:1px solid rgba(127,127,127,.25)` })),
  h('div', { class: 'name' }, name, h('small', {}, kind))));
  const group = (style) => cards.filter((c, i) => (THEMES[i][4] || 'classic') === style);
  body.append(
    section('Text size',
      isPhone()
        ? h('p', { class: 'muted' }, 'On a phone, pinch with two fingers to zoom in.')
        : [h('p', { class: 'muted' }, 'Make everything in Nurse’s Log bigger or smaller on this PC. Shortcuts: Ctrl + plus, Ctrl + minus, Ctrl + 0, or hold Ctrl and turn the mouse wheel.'), zoomControl()]),
    section('Theme',
      h('p', { class: 'muted' }, 'Pick the colors for your account. Your choice follows you to any PC you sign in on.'),
      h('div', { class: 'themes' }, group('classic'))),
    section('Material themes',
      h('p', { class: 'muted' }, 'Soft, faded colors with a material look: rounder cards with gentle shadows, pill buttons and filled text boxes.'),
      h('div', { class: 'themes' }, group('material'))));
}

async function setUsers(body, _d, reload) {
  const users = await get('/api/users');
  body.append(
    h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn primary', onclick: () => userForm(null, reload) }, 'Add user')),
    table([
      { label: 'Name', get: (u) => h('b', {}, u.fullName) },
      { label: 'Username', get: (u) => u.username },
      { label: 'Email', get: (u) => u.email },
      { label: 'Role', get: (u) => h('span', { class: 'pill' + (u.role === 'admin' ? ' ok' : '') }, u.role) },
      { label: 'Two-step', get: (u) => (u.totpOn ? h('span', { class: 'pill ok' }, 'on') : 'off') },
      { label: 'Status', get: (u) => (u.active ? (u.mustChange ? h('span', { class: 'pill warn' }, 'temp password') : 'active') : h('span', { class: 'pill bad' }, 'disabled')) },
      { label: 'Last sign-in', nowrap: true, get: (u) => fmtDT(u.lastLogin) || 'never' },
    ], users, { onRow: (u) => userForm(u, reload) }),
    h('dl', { class: 'kv small' }, ROLE_HELP.flatMap(([r, t]) => [h('dt', {}, r), h('dd', {}, t)])),
    h('p', { class: 'muted small' }, 'Accounts are disabled, never deleted, so the logs keep their names.'));
}

const ROLE_HELP = [
  ['admin', 'Everything, plus users, settings, backups, deleting and the audit log.'],
  ['nurse', 'All record keeping: students, medications, doses, visits, immunizations, imports and exports.'],
  ['aide', 'A health aide: records doses and office visits and can dictate; cannot change student info or medications, or export.'],
  ['viewer', 'Read only, for a principal or counselor: sees records, changes nothing, cannot export.'],
];
const ROLE_CHOICES = ['nurse', 'aide', 'viewer', 'admin'];

function userForm(u, reload) {
  const err = errBox();
  const fields = u
    ? [['fullName', 'Full name'], ['email', 'Email', 'email'], ['role', 'Role', 'select', { choices: ROLE_CHOICES }], ['active', 'Account active', 'check']]
    : [['fullName', 'Full name', 'text', { required: true }], ['username', 'Username', 'text', { required: true }], ['email', 'Email', 'email', { required: true }],
      ['role', 'Role', 'select', { choices: ROLE_CHOICES }], ['password', 'Temporary password (they change it at first sign-in)', 'text', { required: true, wide: true }]];
  const form = formGrid(fields, u || { role: 'nurse' });
  const tmp = h('input', { type: 'text', placeholder: 'new temporary password', style: 'max-width:260px' });
  const dlg = modal(u ? `Edit ${u.fullName}` : 'Add user', [err, form,
    u ? section('Set a temporary password', h('p', { class: 'muted small' }, 'For when they are locked out and email is not working. They must change it when they sign in.'),
      h('div', { class: 'row' }, tmp, h('button', { class: 'btn', onclick: async () => {
        try { await post(`/api/users/${u.id}/password`, { password: tmp.value }); tmp.value = ''; toast(`Temporary password set for ${u.username}`); } catch (e) { showErr(err, e.message); }
      } }, 'Set'))) : null,
    u && u.totpOn ? section('Two-step sign-in', h('p', { class: 'muted small' }, 'Lost their phone? Reset it so they sign in with the password alone and set it up again.'),
      h('button', { class: 'btn', onclick: async () => {
        if (!(await confirmBox('Reset two-step sign-in?', `${u.fullName} will be signed out and can sign in with just the password until they set it up again.`, 'Reset'))) return;
        try { await post(`/api/users/${u.id}/totp/reset`); toast(`Two-step sign-in reset for ${u.username}`); dlg.close(); reload(); } catch (e) { showErr(err, e.message); }
      } }, 'Reset two-step sign-in')) : null,
  ], [
    ['Cancel', () => dlg.close()],
    ['Save', async () => {
      try {
        if (u) {
          await post(`/api/users/${u.id}`, readForm(form));
          dlg.close();
        } else {
          const r = await post('/api/users', readForm(form));
          dlg.close();
          showRecovery(r.recovery, () => {});
        }
        toast('User saved');
        reload();
      } catch (e) { showErr(err, e.message); }
    }, 'primary'],
  ], { wide: true });
}

function setSchool(body, d, reload) {
  const err = errBox();
  const form = formGrid([['schoolName', 'School name'], ['idleMinutes', 'Sign out after this many idle minutes', 'number', { min: 1 }],
    ['pinSignIn', 'Let people keep their own phone signed in and unlock it with a PIN (the office PC always uses the password; turning this off forgets every phone)', 'check', { wide: true }]], d.settings);
  body.append(section('School & security', err, form,
    h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => {
      try {
        const s = await post('/api/settings', readForm(form));
        S.schoolName = s.schoolName;
        S.idleMinutes = s.idleMinutes;
        S.pinSignIn = s.pinSignIn;
        toast('Saved');
        renderShell();
      } catch (e) { showErr(err, e.message); }
    } }, 'Save')),
    h('p', { class: 'muted small' }, `Student records are stored on this PC in ${d.settings.dataDir}.`)),
  requireTwoStep(d), encryptionSection(d, reload));
}

function requireTwoStep(d) {
  const err = errBox();
  const box = h('input', { type: 'checkbox', checked: d.settings.require2fa });
  box.addEventListener('change', async () => {
    try {
      await post('/api/settings', { require2fa: box.checked });
      S.require2fa = box.checked;
      toast(box.checked ? 'Two-step sign-in is required for everyone' : 'Two-step sign-in is optional');
    } catch (e) { box.checked = !box.checked; showErr(err, e.message); }
  });
  return section('Two-step sign-in', err,
    h('label', { class: 'check' }, box, 'Require everyone to use a code from their phone as well as the password'),
    h('p', { class: 'muted small' }, 'Turn it on for your own account first (My account). People who have not set it up are asked to the next time they open the app. If someone loses their phone, reset it for them in Users.'));
}

function encryptionSection(d, reload) {
  const err = errBox();
  const pw = h('input', { type: 'password', autocomplete: 'current-password', style: 'max-width:260px', placeholder: 'your password' });
  const on = d.settings.encrypted;
  return section('Encryption',
    on ? h('div', { class: 'alert ok' }, 'Student records and the daily backups on this PC are encrypted. They open only for this Windows account, or anywhere with the records recovery key.')
      : h('div', { class: 'alert warn' }, 'Student records on this PC are not encrypted yet. Anyone who copies the records file can read it.'),
    h('p', { class: 'muted small' }, on
      ? 'Lost the records recovery key? Make a new one. Backups made before then still open with the old key.'
      : 'Encrypting takes a moment and shows a records recovery key once. Keep it safe: it is the only way to open a backup on another computer.'),
    S.remote ? h('p', { class: 'muted small' }, 'Do this at the office PC.') : [err, h('div', { class: 'row' }, pw, h('button', { class: on ? 'btn' : 'btn primary', onclick: async () => {
      try {
        const r = await post('/api/records/encrypt', { password: pw.value });
        pw.value = '';
        S.encrypted = true;
        showRecordsKey(r.key, reload);
      } catch (e) { showErr(err, e.message); }
    } }, on ? 'Make a new recovery key' : 'Encrypt records'))],
    h('p', { class: 'muted small' }, 'BitLocker on the PC’s drive adds a second layer for everything else on it.'));
}

function setEmail(body, d, reload) {
  const err = errBox();
  const sm = d.settings.smtp;
  const form = formGrid([
    ['host', 'SMTP server', 'text', { placeholder: 'smtp.gmail.com or smtp.office365.com' }],
    ['port', 'Port', 'number'],
    ['user', 'Sign-in (usually the email address)'],
    ['pass', sm.hasPass ? 'Password (saved; type to replace)' : 'Password / app password', 'password', { autocomplete: 'new-password' }],
    ['from', 'Send from, e.g. Nurse Office <nurse@school.org>', 'text', { wide: true }],
  ], { ...sm, pass: '' });
  const own = !!(sm.host && sm.from);
  body.append(section('Email for password resets',
    S.mailRelay
      ? h('p', { class: 'muted' }, own
        ? 'Reset codes are sent from the school account below. Clear the server and Send from boxes to go back to the built-in Nurse’s Log email.'
        : 'Nothing to set up: reset codes and feedback are sent by Nurse’s Log’s own email service. Fill this in only to send reset codes from the school’s own address instead. For Gmail or Microsoft 365, make an app password for the account and use port 587.')
      : h('p', { class: 'muted' }, 'Reset codes are sent from this account. For Gmail or Microsoft 365, make an app password for the account and use port 587.'),
    S.emailReady ? null : h('div', { class: 'alert warn' }, 'Email is not set up yet, so "Forgot password?" only works with recovery codes.'),
    err, form,
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'btn primary', onclick: async () => {
        try {
          const s = await post('/api/settings', { smtp: readForm(form) });
          S.emailReady = !!(s.smtp.host && s.smtp.from) || S.mailRelay;
          toast('Email settings saved');
          reload();
        } catch (e) { showErr(err, e.message); }
      } }, 'Save'),
      h('button', { class: 'btn', onclick: async () => {
        try { toast('Sending\u2026'); const r = await post('/api/settings/test-email'); toast(`Test email sent to ${r.sentTo}`); } catch (e) { showErr(err, e.message); }
      } }, 'Send me a test email'))));
}

function setAi(body, d, reload) {
  const err = errBox();
  const a = d.settings.ai;
  const form = formGrid([
    ['enabled', 'Turn on the dictation assistant for everyone', 'check', { wide: true }],
    ['key', a.hasKey ? 'OpenAI API key (saved; paste a new one to replace)' : 'OpenAI API key (starts with sk-)', 'password', { autocomplete: 'new-password', wide: true }],
    ['model', 'Model that fills in the form'],
    ['transcribeModel', 'Model that turns speech into text'],
  ], { ...a, key: '' });
  body.append(
    section('Dictation & ChatGPT',
      h('p', { class: 'muted' }, 'With this on, student, medication and visit forms get a Dictate button. Speak (or type) your notes, and ChatGPT fills in the matching boxes. Nothing is saved until you check the form and press Save, and every use is in the audit log.'),
      h('div', { class: 'alert warn' }, h('b', {}, 'Student health information leaves this PC. '),
        'What you say and the form\u2019s contents are sent to OpenAI to be read. Check your district\u2019s privacy rules (FERPA, and HIPAA if it applies) and use an OpenAI account your district approves. OpenAI does not train on API data by default.'),
      a.enabled ? h('div', { class: 'alert ok' }, 'The assistant is on.') : null,
      err, form,
      h('div', { class: 'row', style: 'margin-top:10px' },
        h('button', { class: 'btn primary', onclick: async () => {
          try {
            const s = await post('/api/settings', { ai: readForm(form) });
            S.aiReady = s.ai.enabled && s.ai.hasKey;
            toast('Saved');
            reload();
          } catch (e) { showErr(err, e.message); }
        } }, 'Save'),
        h('button', { class: 'btn', onclick: async () => {
          try { toast('Checking\u2026'); await post('/api/settings/test-ai'); toast('The key works and both models are available'); } catch (e) { showErr(err, e.message); }
        } }, 'Test the key'),
        a.hasKey ? h('button', { class: 'btn', onclick: async () => {
          if (!(await confirmBox('Remove the API key?', 'The assistant will turn off until a new key is added.', 'Remove', true))) return;
          try { await post('/api/settings', { ai: { enabled: false, clearKey: true } }); S.aiReady = false; toast('Key removed'); reload(); } catch (e) { showErr(err, e.message); }
        } }, 'Remove key') : null)),
    section('Getting a key',
      h('ol', {},
        h('li', {}, 'Sign in at platform.openai.com. This is an API account; a ChatGPT Plus subscription is separate and does not include API use.'),
        h('li', {}, 'Add a payment method or credits under Billing. Filling in a form costs a fraction of a cent.'),
        h('li', {}, 'Open API keys, create a key, paste it above, then press Test the key.')),
      h('p', { class: 'muted small' }, 'The key is stored on this PC only and is never sent to the app window or to phones.')),
    section('Show your team how to use it',
      h('p', { class: 'muted' }, 'Everyone can read step-by-step instructions, tips and fixes in ', h('a', { href: '#/settings/help' }, 'Settings > Help'), '.')),
    section('Without ChatGPT',
      h('p', { class: 'muted' }, 'Windows has free dictation built in: click in any box and press the Windows key + H. On a phone, use the microphone key on the keyboard.')));
}

// Settings > Audit log: the same log as in the sidebar, inside Settings for admins.
async function setAudit(body, d) {
  const box = h('div', { class: 'settings-log' });
  const keep = h('select', { 'aria-label': 'Keep the audit log for' },
    [[14, '14 days'], [30, '30 days'], [90, '90 days'], [365, '1 year'], [0, 'Forever']].map(([n, label]) => h('option', { value: n }, label)));
  keep.value = String(d.settings.auditDays ?? 14);
  keep.addEventListener('change', async () => {
    const n = Number(keep.value);
    if (n && !(await confirmBox('Keep less audit history?', `Entries older than ${keep.selectedOptions[0].textContent.toLowerCase()} are deleted now and every day from here on, including each student\u2019s History tab. Daily backups still hold older copies for 30 days.`, 'Keep ' + keep.selectedOptions[0].textContent))) { keep.value = String(d.settings.auditDays ?? 14); return; }
    try { await post('/api/settings', { auditDays: n }); d.settings.auditDays = n; toast('Saved'); box.replaceChildren(); await viewAudit(box); } catch (e) { toast(e.message, true); }
  });
  body.append(h('p', { class: 'muted' }, 'Every sign-in, view, change, export, dictation and setting change, with who and when. Export it to Excel from here too.'),
    h('div', { class: 'row', style: 'margin-bottom:12px' }, h('label', { class: 'check' }, 'Keep entries for ', keep)),
    h('p', { class: 'muted small' }, 'Older entries are deleted automatically, including each student\u2019s History tab. Check what your district requires before choosing a short period.'),
    box);
  await viewAudit(box);
}

// Settings > Help: plain-language guide, open to every user.
// Settings > About: version, the beta notice and the license, for everyone.
// Settings > Medication alerts: this device for everyone; school-wide timing and
// no-school days for admins.
async function setAlerts(body, d, reload) {
  const a = await get('/api/alerts');
  const here = h('input', { type: 'checkbox', checked: alertsOnHere() });
  here.addEventListener('change', () => {
    try { localStorage.setItem(ALERT_KEY, here.checked ? 'on' : 'off'); } catch { /* private window */ }
    showAlerts();
    toast(here.checked ? 'Reminders will show in this window' : 'Reminders hidden in this window');
  });
  fill(body,
    a.on ? null : h('div', { class: 'alert warn' }, 'Medication reminders are turned off for the whole school.', S.user.role === 'admin' ? ' Turn them on below.' : ' An admin can turn them on.'),
    section('This window',
      h('label', { class: 'check' }, here, 'Show reminder cards with a chime in this window when a scheduled dose is due'),
      h('p', { class: 'muted small' }, 'Only on this computer or phone. Each card has Record dose, Snooze 10 min and Dismiss. To stop reminders for one student, untick the box on their Medications tab.')),
    await phoneSection(a.phones));
  if (S.user.role !== 'admin') return;

  const m = d.settings.medAlerts;
  const on = h('input', { type: 'checkbox', checked: m.on });
  const lead = h('select', { 'aria-label': 'First reminder' }, [[0, 'At the scheduled time'], [5, '5 minutes before'], [10, '10 minutes before'], [15, '15 minutes before'], [30, '30 minutes before']].map(([n, l]) => h('option', { value: n }, l)));
  const repeat = h('select', { 'aria-label': 'Remind again' }, [[0, 'Don\u2019t remind again'], [10, 'Every 10 minutes'], [15, 'Every 15 minutes'], [30, 'Every 30 minutes']].map(([n, l]) => h('option', { value: n }, l)));
  lead.value = String(m.lead);
  repeat.value = String(m.repeat);
  const win = h('input', { type: 'checkbox', checked: m.windows });
  const phone = h('input', { type: 'checkbox', checked: m.phone });
  const save = async () => {
    try {
      await post('/api/settings', { medAlerts: { on: on.checked, lead: Number(lead.value), repeat: Number(repeat.value), windows: win.checked, phone: phone.checked } });
      toast('Saved');
      pollAlerts();
    } catch (e) { toast(e.message, true); }
  };
  for (const el of [on, lead, repeat, win, phone]) el.addEventListener('change', save);
  body.append(section('Reminders for the whole school',
    h('label', { class: 'check' }, on, 'Remind staff when a scheduled dose is due'),
    h('div', { class: 'grid', style: 'margin-top:10px' },
      h('div', {}, h('label', {}, 'First reminder'), lead),
      h('div', {}, h('label', {}, 'If the dose is still not recorded'), repeat)),
    h('p', { class: 'muted small' }, 'Reminders stop once the dose is recorded (given, refused, absent, held or missed), after 3 repeats, or two hours after the dose time.'),
    h('label', { class: 'check' }, win, 'Windows notification on this office PC'),
    h('label', { class: 'check' }, phone, 'Phone notifications for staff who turned them on'),
    S.remote ? null : h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn', type: 'button', onclick: () => post('/api/alerts/test-windows').then(() => toast('Test sent. It shows at the bottom right of the screen.'), (e) => toast(e.message, true)) }, 'Send a test Windows notification'))));

  const list = h('div', { class: 'noschool' });
  const rows = (d.settings.noSchool || []).map((c) => ({ ...c }));
  const draw = () => fill(list,
    rows.map((c, i) => h('div', { class: 'noschool-row' },
      h('input', { type: 'date', value: c.from, 'aria-label': 'First day', onchange: (e) => { c.from = e.target.value; if (!c.to || c.to < c.from) { c.to = c.from; draw(); } } }),
      h('span', { class: 'muted' }, 'to'),
      h('input', { type: 'date', value: c.to, 'aria-label': 'Last day', onchange: (e) => { c.to = e.target.value; } }),
      h('input', { type: 'text', value: c.label, maxlength: 60, placeholder: 'e.g. Winter break', 'aria-label': 'Name', onchange: (e) => { c.label = e.target.value; } }),
      h('button', { class: 'btn small', type: 'button', 'aria-label': 'Remove', onclick: () => { rows.splice(i, 1); draw(); } }, 'Remove'))),
    rows.length ? null : h('p', { class: 'muted' }, 'No days added yet.'));
  draw();
  body.append(section('No-school days',
    h('p', { class: 'muted small' }, 'Holidays, breaks, snow days and teacher work days. Scheduled medications and reminders skip them, and the Calendar shows them.'),
    list,
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'btn', type: 'button', onclick: () => { rows.push({ from: today(), to: today(), label: '' }); draw(); list.lastElementChild.querySelector('input').focus(); } }, '+ Add day or break'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        try { await post('/api/settings', { noSchool: rows.filter((c) => c.from) }); toast('No-school days saved'); reload(); } catch (e) { toast(e.message, true); }
      } }, 'Save no-school days'))));
}

const b64url = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));

// Phone notifications need the app opened on its https address (Settings > Remote access);
// on iPhone it also has to be added to the home screen first.
async function phoneSection(phones) {
  const ok = location.protocol === 'https:' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const count = h('p', { class: 'muted small' }, phones ? `You get notifications on ${phones} phone${phones === 1 ? '' : 's'}.` : 'You have no phone set up for notifications yet.');
  if (!ok) {
    return section('Phone notifications', count,
      h('p', { class: 'muted' }, /iPhone|iPad/.test(navigator.userAgent) && location.protocol === 'https:'
        ? 'On iPhone, add Nurse\u2019s Log to your home screen first (Share > Add to Home Screen), open it from there, and come back to this page.'
        : 'Open Nurse\u2019s Log on your phone with its https address (Settings > Remote access on the office PC), sign in, and turn notifications on from this page there.'));
  }
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  const box = h('div', {});
  const draw = () => fill(box,
    h('p', {}, sub ? 'This phone gets medication reminders.' : Notification.permission === 'denied' ? 'Notifications are blocked for this app. Allow them in the phone\u2019s settings, then come back.' : 'This phone does not get reminders yet.'),
    h('div', { class: 'row' },
      sub ? h('button', { class: 'btn', type: 'button', onclick: async () => {
        try { await post('/api/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe(); sub = null; toast('Notifications off on this phone'); draw(); } catch (e) { toast(e.message, true); }
      } }, 'Turn off on this phone')
        : h('button', { class: 'btn primary', type: 'button', disabled: Notification.permission === 'denied', onclick: async () => {
          try {
            if ((await Notification.requestPermission()) !== 'granted') { draw(); return toast('Notifications were not allowed', true); }
            const { key } = await get('/api/push/key');
            sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64url(key) });
            await post('/api/push/subscribe', sub.toJSON());
            toast('Notifications on for this phone');
            draw();
          } catch (e) { toast(e.message, true); }
        } }, 'Turn on for this phone'),
      sub ? h('button', { class: 'btn', type: 'button', onclick: () => post('/api/push/test').then(() => toast('Test sent'), (e) => toast(e.message, true)) }, 'Send a test') : null));
  draw();
  return section('Phone notifications', box, count,
    h('p', { class: 'muted small' }, 'Lock screens show only the first name and last initial. Turn reminders off for one student on their Medications tab.'));
}

function setFeedback(body) {
  const box = h('textarea', { rows: 6, maxlength: 5000, 'aria-label': 'Feedback', placeholder: 'What works, what doesn’t, what you’d like to see…' });
  const btn = h('button', {
    class: 'btn primary', type: 'button',
    onclick: async () => {
      if (!box.value.trim()) return toast('Write your feedback first.', true);
      btn.disabled = true;
      try { await post('/api/feedback', { text: box.value }); box.value = ''; toast('Thanks! Your feedback was sent.'); } catch (e) { toast(e.message, true); } finally { btn.disabled = false; }
    },
  }, 'Submit');
  body.append(section('Feedback',
    h('p', { class: 'muted' }, 'Sent to the developer at hi@c3dprints.com. Please leave out student names and health details.'),
    box,
    h('div', { class: 'row', style: 'margin-top:10px' }, btn)));
}

function setAbout(body) {
  body.append(
    section('Nurse\u2019s Log',
      h('p', {}, h('b', {}, `Version ${S.version} `), h('span', { class: 'pill warn' }, 'Beta')),
      h('p', { class: 'muted' }, 'Health records for the school nurse\u2019s office: students, medications and doses, office visits and an audit log.')),
    section('Beta software',
      h('div', { class: 'alert warn' },
        h('p', { style: 'margin-top:0' }, h('b', {}, 'This is a beta (pre-release) version, provided for evaluation and testing only.')),
        h('p', {}, 'It has not been independently tested, audited or certified, and it is not licensed for production use. Further testing, a security review and proper licensing are required before it is used to keep real student health records.'),
        h('p', {}, 'Check with your district before use about FERPA, HIPAA and its rules for student health data, and keep any paper or official records your district or state requires.'),
        h('p', { style: 'margin-bottom:0' }, 'The software is provided \u201Cas is\u201D, without warranty of any kind. The copyright holder is not liable for any loss of data, errors, or decisions made using it.'))),
    section('License',
      h('p', {}, '\u00A9 2026 c3dprints. All rights reserved. Proprietary and confidential.'),
      h('p', { class: 'muted' }, 'No license is granted except in writing. Copying, distributing, modifying, or reverse engineering this software or its source code without written permission is not allowed.'),
      h('p', { class: 'muted small' }, 'Uses open-source components under their own licenses: exceljs, sql.js, nodemailer and qrcode-generator.')),
  );
}

function setHelp(body) {
  const steps = (...items) => h('ol', { class: 'help-steps' }, items.map((i) => h('li', {}, i)));
  const say = (form, text) => h('div', { class: 'help-say' }, h('b', {}, form), h('p', {}, `\u201C${text}\u201D`));
  const faq = (q, ...a) => h('details', { class: 'help-faq' }, h('summary', {}, q), h('div', {}, ...a));
  body.append(
    h('div', { class: 'alert ' + (S.aiReady ? 'ok' : 'warn') }, S.aiReady
      ? 'Dictation with ChatGPT is turned on. Look for the Dictate button at the top of student, medication and visit forms.'
      : 'Dictation with ChatGPT is not turned on yet. An admin sets it up once, in Settings > Dictation & ChatGPT (steps below).'),

    section('What it does',
      h('p', {}, 'Instead of typing into each box, you say (or type) your notes in your own words. ChatGPT reads them and fills in the matching boxes on the form you have open, for example the guardian\u2019s name and phone, a medication\u2019s dose and times, or a visit\u2019s reason and treatment.'),
      h('p', {}, h('b', {}, 'It never saves anything by itself. '), 'The boxes it filled are outlined so you can check them, fix anything, and then press Save as usual.')),

    section('Using it, step by step',
      steps(
        ['Open a form: ', h('b', {}, 'Add student'), ' or ', h('b', {}, 'Edit info'), ' on a student, ', h('b', {}, 'Add medication'), ', or ', h('b', {}, 'New visit'), '.'],
        ['To fill one box, click it first: it lights up with \u201C\u{1F3A4} dictation goes here\u201D and your words go into that box. To fill the whole form, don\u2019t pick a box (or press \u201Cfill the whole form instead\u201D).'],
        ['Press ', h('b', {}, '\u{1F3A4} Dictate'), ' or your shortcut key (', h('kbd', { class: 'kbd' }, S.dictateKey), ', change it in Settings > My account). The first time, Windows or Chrome asks to use the microphone; choose ', h('b', {}, 'Allow'), '.'],
        'Talk naturally, as if telling a colleague. A timer shows it is listening (up to 3 minutes).',
        ['Press ', h('b', {}, '\u25A0 Stop'), ' (or the shortcut key again). After a few seconds the words appear and the filled boxes are outlined.'],
        ['Check every outlined box. Open ', h('b', {}, 'What was heard'), ' to see the words it picked up.'],
        ['Fix anything that is wrong, then press ', h('b', {}, 'Save'), '.']),
      h('p', { class: 'muted' }, 'Shortcut: on a student\u2019s page, press ', h('kbd', { class: 'kbd' }, S.dictateKey), ' with no form open and Edit info opens already listening.'),
      h('p', { class: 'muted' }, 'Prefer typing or pasting? Press ', h('b', {}, 'Type notes'), ', type or paste (for example from a doctor\u2019s note), then press ', h('b', {}, 'Fill in the form'), '.')),

    section('What to say',
      h('p', { class: 'muted' }, 'Naming the box helps. These are examples; any wording works.'),
      say('Student info', 'Guardian is Maria Lopez, phone 555 201 3344. Second contact is dad, Luis Lopez, 555 201 9988. Allergic to peanuts and penicillin. Has asthma. Medication permission form is on file. Takes Zyrtec 10 milligrams at home every morning. Pharmacy is the Walgreens on Main Street.'),
      say('Medication', 'Albuterol inhaler, two puffs, inhaled, as needed for wheezing. Prescribed by Doctor Patel. Started September 3rd. We have one inhaler on hand.'),
      say('Office visit', 'Came in with a headache, temperature 98.6. Rested for 15 minutes and had water. Felt better and went back to class. Called mom.')),

    section('Tips for good results',
      h('ul', {},
        h('li', {}, 'Spell unusual names: \u201CKaitlyn, K A I T L Y N\u201D.'),
        h('li', {}, 'Say phone numbers digit by digit. Phone boxes only take 10 digits.'),
        h('li', {}, 'Say full dates (\u201CSeptember 3rd, 2026\u201D) or \u201Ctoday\u201D.'),
        h('li', {}, 'Say doses and times exactly; ChatGPT keeps numbers as you say them.'),
        h('li', {}, 'One student per recording. You can press Dictate again to add more; notes already in a box are kept and the new part is added under them.'),
        h('li', {}, 'Use a quiet spot or a headset microphone if the office is noisy.'),
        h('li', {}, 'The visit time and anything you do not mention are left alone.'))),

    section('Setting it up (admin, once)',
      steps(
        ['Go to ', h('b', {}, 'platform.openai.com'), ' and sign in or create an account. This is OpenAI\u2019s API account; a ChatGPT Plus subscription does not include it.'],
        ['Under ', h('b', {}, 'Billing'), ', add a payment method or a few dollars of credit. Filling in a form usually costs well under a cent.'],
        ['Under ', h('b', {}, 'API keys'), ', create a new secret key and copy it (it starts with sk-).'],
        ['In Nurse\u2019s Log, open ', S.user.role === 'admin' ? h('a', { href: '#/settings/ai' }, 'Settings > Dictation & ChatGPT') : h('b', {}, 'Settings > Dictation & ChatGPT'), ', paste the key, tick ', h('b', {}, 'Turn on the dictation assistant'), ', and press Save.'],
        ['Press ', h('b', {}, 'Test the key'), '. When it says the key works, every user sees the Dictate button.']),
      h('p', { class: 'muted small' }, 'The model boxes can stay as they are. Only change them if OpenAI retires a model or your district asks for a specific one.')),

    section('Privacy',
      h('ul', {},
        h('li', {}, 'Your recording, the notes, and what is already typed in that form are sent to OpenAI to be read. Nothing else from Nurse\u2019s Log is sent.'),
        h('li', {}, 'OpenAI does not use API data to train its models by default.'),
        h('li', {}, 'Each use is written to the audit log with who, when, which form and which boxes were filled (not what was said).'),
        h('li', {}, 'Check with your district before turning it on, as student health records fall under FERPA.'))),

    section('On a phone',
      h('p', {}, 'Dictate works on a phone when Nurse\u2019s Log is opened from its HTTPS address (Settings > Remote access > Install on a phone). On the plain http address phones block the microphone, so the Dictate button is hidden; use ', h('b', {}, 'Type notes'), ' and tap the microphone key on the phone\u2019s keyboard to speak, then press ', h('b', {}, 'Fill in the form'), '.')),

    section('If something goes wrong',
      faq('There is no Dictate button',
        h('p', {}, 'The assistant is not turned on, or you are on a phone (see above). Ask an admin to check Settings > Dictation & ChatGPT.')),
      faq('\u201CThe microphone is blocked or missing\u201D',
        h('p', {}, 'Make sure a microphone is plugged in. Then click the small icon at the left of the app\u2019s title bar, set Microphone to Allow, and reopen the form. In Windows Settings > Privacy & security > Microphone, desktop apps must be allowed to use it.')),
      faq('\u201COpenAI rejected the API key\u201D',
        h('p', {}, 'The key was deleted or typed wrong. An admin makes a new key at platform.openai.com and pastes it in Settings > Dictation & ChatGPT.')),
      faq('\u201CYou exceeded your current quota\u201D or a billing message',
        h('p', {}, 'The OpenAI account is out of credit. Add credit under Billing at platform.openai.com.')),
      faq('\u201CNothing in the notes matched this form\u201D',
        h('p', {}, 'Say the name of the box, such as \u201Cguardian phone\u201D or \u201Creason for visit\u201D, and try again. Open What was heard to see if the microphone picked you up.')),
      faq('A box was filled in wrong',
        h('p', {}, 'Just fix it before saving; nothing is saved until you press Save. If it keeps happening with a word, spell it out when you dictate.')),
      faq('Without ChatGPT at all',
        h('p', {}, 'Windows has free dictation: click in any box and press the Windows key + H. It types what you say into that one box.'))),
  );
}

function setSaving(body, d, reload) {
  const err = errBox();
  const folder = h('input', { type: 'text', value: d.settings.exportFolder, placeholder: 'e.g. \\\\server\\nurse\\exports or C:\\Users\\nurse\\Documents' });
  body.append(
    section('"Save to folder" location', h('p', { class: 'muted' }, 'Exports and backups saved with "Save to folder" go here without asking. A shared network folder works.'),
      err, h('div', { class: 'row' }, h('div', { style: 'flex:1;min-width:240px' }, folder),
        S.remote ? null : h('button', { class: 'btn', onclick: async () => {
          try { const r = await post('/api/settings/pick-folder'); if (r.folder) folder.value = r.folder; } catch (e) { showErr(err, e.message); }
        } }, 'Browse\u2026'),
        h('button', { class: 'btn primary', onclick: async () => {
          try { await post('/api/settings', { exportFolder: folder.value }); toast('Saved'); reload(); } catch (e) { showErr(err, e.message); }
        } }, 'Save'))),
    section('Export all records', h('p', { class: 'muted' }, 'One Excel workbook with every student, medication, dose and visit.'), exportMenu('all')),
    section('Backup', h('p', { class: 'muted' }, `A copy is kept automatically each day (last 30 days) in ${d.settings.dataDir}\\backups. Keep one somewhere else too, such as the school network or a USB drive.`),
      d.settings.encrypted ? h('p', { class: 'muted small' }, 'Backups are encrypted. On another computer they open with the records recovery key.') : null,
      h('div', { class: 'row' },
        S.remote ? null : h('button', { class: 'btn', onclick: () => backup('saveas') }, 'Save backup as\u2026'),
        h('button', { class: 'btn', onclick: () => backup('folder') }, 'Save backup to folder'))),
    retentionSection(d), S.remote ? null : eraseSection());
}

// Archived students are deleted for good after the chosen number of years.
function retentionSection(d) {
  const keep = h('select', { 'aria-label': 'Delete archived students after', style: 'width:auto' },
    [[0, 'Never (delete by hand)'], [1, '1 year'], [2, '2 years'], [3, '3 years'], [5, '5 years'], [7, '7 years']].map(([n, l]) => h('option', { value: n }, l)));
  keep.value = String(d.settings.purgeYears || 0);
  keep.addEventListener('change', async () => {
    const n = Number(keep.value);
    if (n && !(await confirmBox('Delete archived students automatically?', `Students archived more than ${keep.selectedOptions[0].textContent} ago are deleted for good within the hour, with all their medications, doses, visits and immunizations, and from then on every day. Check your district\u2019s records retention schedule first.`, 'Turn on', true))) { keep.value = String(d.settings.purgeYears || 0); return; }
    try { await post('/api/settings', { purgeYears: n }); d.settings.purgeYears = n; toast('Saved'); } catch (e) { toast(e.message, true); }
  });
  return section('Keeping records of students who left',
    h('p', { class: 'muted' }, 'Archive a student when they leave. Archived students are kept until you delete them (More > Delete for good on their page), or automatically after:'),
    h('div', { class: 'row' }, keep),
    h('p', { class: 'muted small' }, 'Your district or state sets how long school health records must be kept; ask your records officer. The audit log keeps who deleted what and when.'));
}

// End of a contract or handing the PC on: erase everything and start again.
function eraseSection() {
  const err = errBox();
  const pw = h('input', { type: 'password', autocomplete: 'current-password', placeholder: 'your password' });
  const word = h('input', { type: 'text', autocomplete: 'off', placeholder: 'ERASE' });
  return section('Erase everything',
    h('p', { class: 'muted' }, 'Deletes every student record, backup on this PC, user account and setting, and starts again at first-time setup. Use it when the school stops using Nurse\u2019s Log or the PC is handed on. Export all records first if the school needs a copy; copies saved elsewhere are not touched.'),
    err, h('div', { class: 'grid' }, field('Your password', pw), field('Type ERASE', word)),
    h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn danger', onclick: async () => {
      if (!(await confirmBox('Erase everything?', 'All records on this PC are deleted for good. This cannot be undone.', 'Erase everything', true))) return;
      try {
        await post('/api/erase', { password: pw.value, confirm: word.value });
        S.user = null;
        await loadState();
        history.replaceState(null, '', '#/today');
        render();
        toast('Everything was erased');
      } catch (e) { showErr(err, e.message); }
    } }, 'Erase everything')));
}

async function backup(target) {
  try {
    if (target === 'saveas') toast('Choose where to save in the Windows dialog\u2026');
    const r = await post('/api/backup', { target });
    toast(r.cancelled ? 'Backup cancelled' : `Backup saved to ${r.path}`);
  } catch (e) { toast(e.message, true); }
}

function setUpdates(body, d, reload) {
  const u = d.update;
  const status = u.error ? h('div', { class: 'alert warn' }, u.error)
    : u.available ? h('div', { class: 'alert ok' }, `Version ${u.latest.replace(/^v/, '')} is available.`)
      : u.checkedAt ? h('div', { class: 'alert ok' }, 'Nurse’s Log is up to date.') : null;
  const auto = h('input', { type: 'checkbox', checked: d.settings.autoUpdate });
  auto.addEventListener('change', () => post('/api/settings', { autoUpdate: auto.checked }).then(() => toast('Saved'), (e) => toast(e.message, true)));
  body.append(section('Updates',
    h('p', {}, `Installed version: ${S.version}`, u.checkedAt ? h('span', { class: 'muted' }, ` \u00B7 last checked ${fmtDT(u.checkedAt)}`) : null),
    status,
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async (e) => {
        e.currentTarget.disabled = true;
        try { await post('/api/update/check'); } catch (ex) { toast(ex.message, true); }
        reload();
      } }, 'Check now'),
      u.available ? h('button', { class: 'btn primary', onclick: async () => {
        if (!(await confirmBox('Install update?', `Nurse’s Log will update to ${u.latest} and restart. Student records are not touched. Everyone signed in will need to sign in again.`, 'Install'))) return;
        try { await post('/api/update/install'); toast('Installing\u2026 the app will reload.'); waitForRestart(); } catch (e) { toast(e.message, true); }
      } }, `Install ${u.latest}`) : null),
    h('label', { class: 'check', style: 'margin-top:14px' }, auto, 'Install updates automatically'),
    h('p', { class: 'muted small' }, 'Updates come from the Nurse’s Log GitHub releases. Student records live outside the app folder and an update never changes them.')));
}

// Opening the app (or signing in) checks for a newer version once; admins, who can
// install it, get Update now or Later. Later waits until the app is opened again.
let updateAsked = false;
async function offerUpdate() {
  if (updateAsked || !S.user || S.user.role !== 'admin') return;
  updateAsked = true;
  let u;
  try { u = await post('/api/update/check', { cached: true }); } catch { return; }
  if (!u || !u.available) return;
  try { if (sessionStorage.getItem('nl.updateLater') === u.latest) return; } catch { /* storage off */ }
  const m = modal('Update available', [
    h('p', {}, `Nurse’s Log ${u.latest.replace(/^v/, '')} is ready to install. You have ${S.version}.`),
    h('p', { class: 'muted' }, 'It takes about a minute, then the app reloads. Student records are not touched. Everyone signed in will need to sign in again.'),
  ], [
    ['Later', () => { try { sessionStorage.setItem('nl.updateLater', u.latest); } catch { /* storage off */ } m.close(); }],
    ['Update now', async () => {
      m.close();
      try { await post('/api/update/install'); toast('Installing… the app will reload.'); waitForRestart(); } catch (e) { toast(e.message, true); }
    }, 'primary'],
  ]);
}

async function waitForRestart() {
  const was = S.version;
  for (let i = 0; i < 180; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    try {
      const st = await fetch('/api/ping').then((r) => r.json());
      if (st.version !== was) return location.reload();
    } catch { /* restarting */ }
  }
  toast('The update is taking a while. Close and reopen Nurse’s Log.', true);
}

// ---- start --------------------------------------------------------------------------

(async () => {
  try {
    await loadState();
  } catch (e) {
    $app.replaceChildren(h('div', { class: 'gate' }, h('div', { class: 'panel' }, h('h2', {}, 'Nurse’s Log is not running'), h('p', {}, e.message))));
    return;
  }
  render();
  offerZoom();
})();

// On the phone's HTTPS address this is what lets the browser offer "Install app".
// Plain http cannot run it; there "Add to Home Screen" still makes a shortcut.
if (location.protocol === 'https:' && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

// Keeps the app's own taskbar button and icon on the office PC after a reload (Edge resets them).
if (location.protocol === 'http:') setTimeout(() => api('POST', '/api/window-icon', {}, { noReauth: true }).catch(() => {}), 1500);
