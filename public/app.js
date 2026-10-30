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
    const pw = h('input', { type: 'password', autocomplete: 'current-password' });
    const submit = async () => {
      try {
        await api('POST', '/api/login', { username: S.user.username, password: pw.value }, { noReauth: true });
        m.close();
        reauthing = null;
        lastActive = Date.now();
        resolve();
      } catch (e) {
        showErr(err, e.message);
      }
    };
    pw.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    const m = modal('You were signed out', [
      h('p', { class: 'muted' }, `Nurse’s Log signs out after ${S.idleMinutes} idle minutes. Sign in again as ${S.user.username} to continue; anything you were typing is kept.`),
      err, h('label', {}, 'Password'), pw,
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
function exportMenu(kind, params = () => ({})) {
  // On a phone (S.remote) the Save As dialog would open on the office PC, so it is left out.
  return dropMenu('Export to Excel', () => [
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

// fields: [name, label, type, opts]; type: text|email|password|date|number|textarea|select|check|datetime|tel|heading
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
    if (el.type === 'checkbox') out[el.name] = el.checked;
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

const S = { user: null, needsSetup: false, schoolName: '', emailReady: false, idleMinutes: 15, exportFolder: '', version: '', remote: false, aiReady: false };
const $app = document.getElementById('app');

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

async function loadState() {
  const st = await api('GET', '/api/state', null, { noReauth: true });
  if (st.theme) applyTheme(st.theme);
  Object.assign(S, {
    user: st.user, needsSetup: st.needsSetup, schoolName: st.schoolName, emailReady: st.emailReady,
    idleMinutes: st.idleMinutes, exportFolder: st.exportFolder || '', version: st.version, remote: !!st.remote, aiReady: !!st.aiReady,
  });
}

function route() {
  const parts = (location.hash.replace(/^#\/?/, '') || 'today').split('/');
  return { name: parts[0], id: Number(parts[1]) || null, tab: parts[2] || parts[1] || null };
}
const go = (hash) => { if (location.hash === hash) render(); else location.hash = hash; };
window.addEventListener('hashchange', () => render());

function render() {
  if (S.needsSetup) return renderSetup();
  if (!S.user) return renderLogin();
  if (S.user.mustChange) return renderMustChange();
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
      showRecovery(r.recovery, () => go('#/settings/email'), true);
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

function showRecovery(code, then, own = false) {
  const m = modal('Save this recovery code', [
    h('p', {}, own
      ? 'If you forget your password and email is not working, this code lets you set a new one. It is shown only once.'
      : 'Give this code to the new user. With it they can reset their password if email is not working. It is shown only once.'),
    h('div', { class: 'code' }, code),
    h('p', { class: 'muted small' }, 'Write it down and keep it somewhere safe, away from this computer.'),
  ], [['I saved it', () => { m.close(); then(); }, 'primary']], { noDismiss: true });
}

function renderLogin(note) {
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
          S.user = r.user;
          lastActive = Date.now();
          await loadState();
          render();
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

async function signOut() {
  await api('POST', '/api/logout', {}, { noReauth: true }).catch(() => {});
  S.user = null;
  history.replaceState(null, '', '#/today');
  renderLogin();
}

// ---- shell -----------------------------------------------------------------------

const NAV = [
  ['today', 'Today', 'today'],
  ['students', 'Students', 'students'],
  ['visits', 'Visit log', 'visits'],
  ['given', 'Medication log', 'meds'],
  ['audit', 'Audit log', 'audit', true],
];

function renderShell() {
  const r = route();
  const main = h('main', { class: 'main' });
  const navName = r.name === 'student' ? 'students' : r.name;
  const navBtn = ([key, label, ic]) => h('button', { class: 'nav' + (navName === key ? ' on' : ''), type: 'button', onclick: () => go('#/' + key) }, icon(ic), label);
  $app.replaceChildren(h('div', { class: 'shell' },
    h('nav', { class: 'side', 'aria-label': 'Main' },
      h('div', { class: 'brand' }, h('img', { src: 'icon.svg', alt: '' }), h('div', {}, h('b', {}, 'Nurse’s Log'), h('span', {}, S.schoolName || 'School nurse office'))),
      NAV.filter((n) => !n[3] || S.user.role === 'admin').map(navBtn),
      h('div', { class: 'grow' }),
      navBtn(['settings', 'Settings', 'settings']),
      h('button', { class: 'nav', type: 'button', onclick: signOut }, icon('out'), 'Sign out'),
      h('div', { class: 'who' }, h('b', {}, S.user.fullName), `${S.user.username} \u00B7 ${S.user.role}`)),
    main));
  const views = { today: viewToday, students: viewStudents, student: viewStudent, visits: viewVisitLog, given: viewGivenLog, audit: viewAudit, settings: viewSettings };
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
      h('div', { class: 'grow' }), h('button', { class: 'btn primary', onclick: () => pickStudent((s) => visitForm(s, null, reload)) }, 'New visit')),
    h('div', { class: 'cards' },
      h('div', { class: 'card' }, h('b', {}, t.visits.length), h('span', {}, 'visits today')),
      h('div', { class: 'card' }, h('b', {}, left), h('span', {}, 'scheduled doses left')),
      h('div', { class: 'card' }, h('b', {}, t.counts.activeMeds), h('span', {}, 'active medications')),
      h('div', { class: 'card' }, h('b', {}, t.counts.students), h('span', {}, 'students'))),
    t.lowStock.length ? h('div', { class: 'alert warn' }, 'Running low: ', t.lowStock.map((m, i) => [i ? ', ' : '', `${m.name} for ${m.first_name} ${m.last_name} (${m.on_hand} left)`])) : null,
    h('div', { class: 'panel' }, h('h2', {}, 'Medications due today'),
      table([
        { label: 'Time', nowrap: true, get: (r) => fmtHM(r.time) },
        { label: 'Student', get: (r) => [fullName(r), r.allergies ? h('div', {}, h('span', { class: 'pill bad' }, 'Allergy: ' + r.allergies)) : null] },
        { label: 'Medication', get: (r) => [r.name, r.dose && ` \u00B7 ${r.dose}`, r.route && ` \u00B7 ${r.route}`] },
        { label: 'Status', get: (r) => (r.record ? statusPill(r.record.status, fmtTime(r.record.given_at))
          : h('button', { class: 'btn small primary', onclick: () => giveForm(r, r.time, reload) }, 'Record dose')) },
      ], due, { empty: 'No scheduled medications today.', onRow: (r) => go(`#/student/${r.student_id}/meds`) })),
    t.meds.prn.length ? h('div', { class: 'panel' }, h('h2', {}, 'As-needed (PRN) medications on file'),
      table([
        { label: 'Student', get: fullName },
        { label: 'Medication', get: (r) => [r.name, r.dose && ` \u00B7 ${r.dose}`] },
        { label: 'Instructions', get: (r) => r.instructions || '' },
        { label: '', get: (r) => h('button', { class: 'btn small', onclick: () => giveForm(r, null, reload) }, 'Give') },
      ], t.meds.prn, { onRow: (r) => go(`#/student/${r.student_id}/meds`) })) : null,
    h('div', { class: 'panel' }, h('h2', {}, 'Visits today'),
      table(visitCols(true), t.visits, { empty: 'No visits yet today.', onRow: (r) => go(`#/student/${r.student_id}/visits`) })));
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
      { label: 'Name', get: (s) => h('b', {}, fullName(s)) },
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
      h('button', { class: 'btn primary', onclick: () => studentForm(null) }, 'Add student')),
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
      { label: 'Name', get: (s) => h('b', {}, fullName(s)) },
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
const STUDENT_TABS = ['info', 'meds', 'medlog', 'visits', 'history'];

async function viewStudent(main, r) {
  const b = await get(`/api/students/${r.id}`);
  const s = b.student;
  const tab = STUDENT_TABS.includes(r.tab) ? r.tab : 'info';
  const reload = () => viewStudent(main, { ...r, tab });
  const tabBtn = (key, label) => h('button', { class: 'tab' + (tab === key ? ' on' : ''), type: 'button', onclick: () => go(`#/student/${s.id}/${key}`) }, label);
  const body = h('div', {});
  fill(main, 
    h('div', { class: 'head' },
      h('div', {}, h('h1', {}, `${s.first_name} ${s.last_name}`),
        h('div', { class: 'muted' }, [s.student_no && `ID ${s.student_no}`, s.grade && `Grade ${s.grade}`, s.homeroom, s.dob && `DOB ${s.dob} (${age(s.dob)})`].filter(Boolean).join(' \u00B7 '))),
      s.archived ? h('span', { class: 'pill warn' }, 'Archived') : null,
      h('div', { class: 'grow' }),
      h('button', { class: 'btn primary', onclick: () => visitForm(s, null, () => go(`#/student/${s.id}/visits`)) }, 'New visit'),
      exportMenu('student', () => ({ studentId: s.id })),
      dropMenu('More', () => [
        ['Edit student info', null, () => studentForm(s, reload)],
        [s.archived ? 'Restore student' : 'Archive student', s.archived ? 'show in the student list again' : 'hide from lists, keep all records', async () => {
          if (!s.archived && !(await confirmBox('Archive student?', `${s.first_name} ${s.last_name} will be hidden from lists and their medications from Today. All records are kept and can be restored.`, 'Archive'))) return;
          await post(`/api/students/${s.id}/archive`, { archived: !s.archived }).then(reload, (e) => toast(e.message, true));
        }],
      ])),
    s.allergies ? h('div', { class: 'alert bad' }, h('b', {}, 'Allergies: '), s.allergies) : null,
    s.conditions ? h('div', { class: 'alert warn' }, h('b', {}, 'Conditions: '), s.conditions) : null,
    h('div', { class: 'panel' },
      h('div', { class: 'tabs', role: 'tablist' }, tabBtn('info', 'Info'), tabBtn('meds', `Medications (${b.medications.filter((m) => m.active).length})`),
        tabBtn('medlog', 'Medication log'), tabBtn('visits', `Visits (${b.visits.length})`), tabBtn('history', 'History')),
      body));

  if (tab === 'info') {
    const cut = STUDENT_FORM.findIndex((f) => f[2] === 'heading');
    const kv = (fields) => fields.flatMap(([k, label]) => [h('dt', {}, label), h('dd', {}, s[k] || '\u2014')]);
    body.append(h('dl', { class: 'kv' }, kv(STUDENT_FORM.slice(0, cut)),
      h('dt', {}, 'Added'), h('dd', {}, fmtDT(s.created_at)), h('dt', {}, 'Last changed'), h('dd', {}, fmtDT(s.updated_at))),
    h('h3', { class: 'formhead' }, STUDENT_FORM[cut][1]),
    s.med_consent && s.med_consent !== 'On file' ? h('div', { class: 'alert warn' }, `Medication permission: ${s.med_consent}`) : null,
    h('dl', { class: 'kv' }, kv(STUDENT_FORM.slice(cut + 1))),
    h('div', { class: 'row', style: 'margin-top:14px' }, h('button', { class: 'btn', onclick: () => studentForm(s, reload) }, 'Edit info')));
  } else if (tab === 'meds') {
    body.append(
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn primary', onclick: () => medForm(s, null, reload) }, 'Add medication')),
      table([
        { label: 'Medication', get: (m) => [h('b', {}, m.name), m.active ? null : h('span', { class: 'pill', style: 'margin-left:6px' }, 'stopped')] },
        { label: 'Dose', get: (m) => [m.dose, m.route && ` \u00B7 ${m.route}`] },
        { label: 'When', get: (m) => [m.times ? m.times.split(', ').map(fmtHM).join(', ') : '', m.prn ? h('span', { class: 'pill', style: 'margin-left:6px' }, 'as needed') : null] },
        { label: 'Dates', nowrap: true, get: (m) => [m.start_date || '', m.end_date ? ` to ${m.end_date}` : ''] },
        { label: 'On hand', get: (m) => (m.on_hand == null ? '' : h('span', { class: 'pill' + (m.on_hand <= 5 ? ' warn' : '') }, m.on_hand)) },
        { label: '', nowrap: true, get: (m) => h('div', { class: 'row' },
          m.active ? h('button', { class: 'btn small primary', onclick: () => giveForm({ ...m, first_name: s.first_name, last_name: s.last_name, allergies: s.allergies }, null, reload) }, 'Give') : null,
          h('button', { class: 'btn small', onclick: () => medForm(s, m, reload) }, 'Edit')) },
      ], b.medications, { empty: 'No medications on file.' }));
  } else if (tab === 'medlog') {
    body.append(table(givenCols(false, reload), b.given, { empty: 'No doses recorded yet.' }));
  } else if (tab === 'visits') {
    body.append(
      h('div', { class: 'row', style: 'margin-bottom:10px' }, h('button', { class: 'btn primary', onclick: () => visitForm(s, null, reload) }, 'New visit')),
      table(visitCols(false, reload), b.visits, { empty: 'No visits yet.', onRow: (v) => visitForm(s, v, reload) }));
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
        if (m) await post(`/api/meds/${m.id}`, readForm(form));
        else await post(`/api/students/${s.id}/meds`, readForm(form));
        dlg.close();
        toast('Medication saved');
        reload();
      } catch (e) { showErr(err, e.message); }
    }, 'primary'],
  ], { wide: true });
}

// m is a medication row with the student's name and allergies; time is the scheduled slot or null.
function giveForm(m, time, reload) {
  const form = formGrid([
    ['status', 'Result', 'select', { choices: STATUSES, default: 'given' }],
    ['dose', 'Dose given'],
    ['given_at', 'Time', 'datetime'],
    ['notes', 'Notes', 'textarea', { rows: 2 }],
  ], { dose: m.dose || '', given_at: Date.now() });
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

// The Dictate bar above a form: record or type notes, ChatGPT fills the boxes.
// fields is the same list given to formGrid; values land in the form for the
// nurse to check, nothing is saved here.
function assistBar(form, fields, { form: formName, studentId } = {}) {
  if (!S.aiReady) {
    return h('p', { class: 'muted small assist-tip' }, S.remote
      ? 'Tip: use the microphone key on your keyboard to dictate into any box.'
      : 'Tip: press the Windows key + H to dictate into any box.',
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
  const mic = h('button', { class: 'btn small primary', type: 'button', onclick: () => (rec ? rec.stop() : start()) }, '\u{1F3A4} Dictate');
  const busy = (on) => { mic.disabled = on; for (const b of typed.querySelectorAll('button')) b.disabled = on; };

  async function start() {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); } catch {
      status.textContent = 'The microphone is blocked or missing. Allow it for this app, or type your notes instead.';
      return;
    }
    const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const chunks = [];
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
      send({ audio, mime: type, notes: notes.value });
    };
    rec.start(1000);
    const began = Date.now();
    mic.textContent = '\u25A0 Stop';
    mic.classList.add('danger');
    status.textContent = 'Listening\u2026 speak naturally, then press Stop.';
    timer = setInterval(() => {
      const sec = Math.round((Date.now() - began) / 1000);
      status.textContent = `Listening\u2026 ${Math.floor(sec / 60)}:${p2(sec % 60)}`;
      if (sec >= MAX_RECORD_SECONDS && rec) rec.stop();
    }, 500);
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

  return h('div', { class: 'assist' },
    h('div', { class: 'row' }, canRecord ? mic : null,
      h('button', { class: 'btn small', type: 'button', onclick: () => typed.classList.toggle('hidden') }, 'Type notes'),
      status, h('div', { class: 'grow' }),
      h('a', { class: 'small', href: '#/settings/help', target: '_blank', title: 'Opens the help in a new window so this form stays open' }, 'How to use')),
    typed, heard);
}

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
  const tabs = [['account', 'My account'], ['appearance', 'Appearance'], ['remote', 'Remote access'], ...(admin ? [['users', 'Users'], ['school', 'School & security'], ['email', 'Email'], ['ai', 'Dictation & ChatGPT'], ['saving', 'Saving & backup'], ['updates', 'Updates']] : []), ['help', 'Help']];
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
  await ({ account: setAccount, appearance: setAppearance, remote: setRemote, users: setUsers, school: setSchool, email: setEmail, ai: setAi, saving: setSaving, updates: setUpdates, help: setHelp })[tab](body, data, reload);
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
    section('Recovery code', h('p', { class: 'muted' }, 'Makes a new recovery code for resetting your password without email. The old code stops working. Enter your password to confirm.'),
      err3, h('div', { class: 'row' }, rpw, h('button', { class: 'btn', onclick: async () => {
        try { const r = await post('/api/account/recovery', { password: rpw.value }); rpw.value = ''; showRecovery(r.recovery, () => {}, true); } catch (e) { showErr(err3, e.message); }
      } }, 'Make new code'))));
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
        h('li', {}, 'On the phone, scan the QR code with the camera (or type the address) and sign in with your Nurse’s Log username and password.'),
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
      { label: 'Status', get: (u) => (u.active ? (u.mustChange ? h('span', { class: 'pill warn' }, 'temp password') : 'active') : h('span', { class: 'pill bad' }, 'disabled')) },
      { label: 'Last sign-in', nowrap: true, get: (u) => fmtDT(u.lastLogin) || 'never' },
    ], users, { onRow: (u) => userForm(u, reload) }),
    h('p', { class: 'muted small' }, 'Admins manage users, settings, backups and the audit log; nurses do everything else. Accounts are disabled, never deleted, so the logs keep their names.'));
}

function userForm(u, reload) {
  const err = errBox();
  const fields = u
    ? [['fullName', 'Full name'], ['email', 'Email', 'email'], ['role', 'Role', 'select', { choices: ['nurse', 'admin'] }], ['active', 'Account active', 'check']]
    : [['fullName', 'Full name', 'text', { required: true }], ['username', 'Username', 'text', { required: true }], ['email', 'Email', 'email', { required: true }],
      ['role', 'Role', 'select', { choices: ['nurse', 'admin'] }], ['password', 'Temporary password (they change it at first sign-in)', 'text', { required: true, wide: true }]];
  const form = formGrid(fields, u || { role: 'nurse' });
  const tmp = h('input', { type: 'text', placeholder: 'new temporary password', style: 'max-width:260px' });
  const dlg = modal(u ? `Edit ${u.fullName}` : 'Add user', [err, form,
    u ? section('Set a temporary password', h('p', { class: 'muted small' }, 'For when they are locked out and email is not working. They must change it when they sign in.'),
      h('div', { class: 'row' }, tmp, h('button', { class: 'btn', onclick: async () => {
        try { await post(`/api/users/${u.id}/password`, { password: tmp.value }); tmp.value = ''; toast(`Temporary password set for ${u.username}`); } catch (e) { showErr(err, e.message); }
      } }, 'Set'))) : null,
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
  const form = formGrid([['schoolName', 'School name'], ['idleMinutes', 'Sign out after this many idle minutes', 'number', { min: 1 }]], d.settings);
  body.append(section('School & security', err, form,
    h('div', { class: 'row', style: 'margin-top:10px' }, h('button', { class: 'btn primary', onclick: async () => {
      try {
        const s = await post('/api/settings', readForm(form));
        S.schoolName = s.schoolName;
        S.idleMinutes = s.idleMinutes;
        toast('Saved');
        renderShell();
      } catch (e) { showErr(err, e.message); }
    } }, 'Save')),
    h('p', { class: 'muted small' }, `Student records are stored on this PC in ${d.settings.dataDir}. Turn on BitLocker for this drive so the records are encrypted if the PC is lost or stolen.`)));
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
  body.append(section('Email for password resets',
    h('p', { class: 'muted' }, 'Reset codes are sent from this account. For Gmail or Microsoft 365, make an app password for the account and use port 587.'),
    S.emailReady ? null : h('div', { class: 'alert warn' }, 'Email is not set up yet, so "Forgot password?" only works with recovery codes.'),
    err, form,
    h('div', { class: 'row', style: 'margin-top:10px' },
      h('button', { class: 'btn primary', onclick: async () => {
        try {
          const s = await post('/api/settings', { smtp: readForm(form) });
          S.emailReady = !!(s.smtp.host && s.smtp.from);
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

// Settings > Help: plain-language guide, open to every user.
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
        ['Press ', h('b', {}, '\u{1F3A4} Dictate'), ' at the top of the form. The first time, Windows or Chrome asks to use the microphone; choose ', h('b', {}, 'Allow'), '.'],
        'Talk naturally, as if telling a colleague. A timer shows it is listening (up to 3 minutes).',
        ['Press ', h('b', {}, '\u25A0 Stop'), '. After a few seconds the boxes fill in and are outlined.'],
        ['Check every outlined box. Open ', h('b', {}, 'What was heard'), ' to see the words it picked up.'],
        ['Fix anything that is wrong, then press ', h('b', {}, 'Save'), '.']),
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
      h('div', { class: 'row' },
        S.remote ? null : h('button', { class: 'btn', onclick: () => backup('saveas') }, 'Save backup as\u2026'),
        h('button', { class: 'btn', onclick: () => backup('folder') }, 'Save backup to folder'))));
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
})();

// On the phone's HTTPS address this is what lets the browser offer "Install app".
// Plain http cannot run it; there "Add to Home Screen" still makes a shortcut.
if (location.protocol === 'https:' && 'serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
