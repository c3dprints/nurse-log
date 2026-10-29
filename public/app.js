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
  return dropMenu('Export to Excel', () => [
    ['Save as\u2026', 'pick where to save it', () => doExport(kind, params(), 'saveas')],
    ['Save to folder', S.exportFolder || 'an admin sets the folder in Settings', () => doExport(kind, params(), 'folder')],
    ['Download', 'to this PC\u2019s Downloads folder', () => doExport(kind, params(), 'download')],
  ]);
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

// fields: [name, label, type, opts]; type: text|email|password|date|number|textarea|select|check|datetime
function formGrid(fields, values = {}) {
  const form = h('form', { class: 'grid', onsubmit: (e) => e.preventDefault() });
  for (const [name, label, type = 'text', opts = {}] of fields) {
    let input;
    const v = values[name];
    if (type === 'textarea') input = h('textarea', { name, rows: opts.rows || 3 });
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

function errBox() { return h('div', { class: 'alert bad hidden', role: 'alert' }); }
function showErr(box, msg) { box.textContent = msg; box.classList.remove('hidden'); }

// ---- app state and routing ------------------------------------------------------

const S = { user: null, needsSetup: false, schoolName: '', emailReady: false, idleMinutes: 15, exportFolder: '', version: '' };
const $app = document.getElementById('app');

async function loadState() {
  const st = await api('GET', '/api/state', null, { noReauth: true });
  Object.assign(S, {
    user: st.user, needsSetup: st.needsSetup, schoolName: st.schoolName, emailReady: st.emailReady,
    idleMinutes: st.idleMinutes, exportFolder: st.exportFolder || '', version: st.version,
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
    if (e.message !== 'signed out') main.replaceChildren(h('div', { class: 'alert bad' }, e.message));
  });
}

// ---- today -----------------------------------------------------------------------

async function viewToday(main) {
  const t = await get('/api/today');
  const due = t.meds.scheduled;
  const left = due.filter((d) => !d.record).length;
  const reload = () => viewToday(main);
  main.replaceChildren(
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
  main.replaceChildren(
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
  ['guardian_phone', 'Guardian phone'],
  ['guardian2_name', 'Second contact'],
  ['guardian2_phone', 'Second contact phone'],
  ['physician', 'Physician'],
  ['physician_phone', 'Physician phone'],
  ['allergies', 'Allergies', 'textarea', { rows: 2 }],
  ['conditions', 'Health conditions (asthma, diabetes, seizures\u2026)', 'textarea', { rows: 2 }],
  ['notes', 'Notes / care plan', 'textarea'],
];

function studentForm(s, reload) {
  const form = formGrid(STUDENT_FORM, s || {});
  const err = errBox();
  const m = modal(s ? `Edit ${s.first_name} ${s.last_name}` : 'Add student', [err, form], [
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
  main.replaceChildren(
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
    body.append(h('dl', { class: 'kv' }, STUDENT_FORM.flatMap(([k, label]) => [h('dt', {}, label), h('dd', {}, s[k] || '\u2014')]),
      h('dt', {}, 'Added'), h('dd', {}, fmtDT(s.created_at)), h('dt', {}, 'Last changed'), h('dd', {}, fmtDT(s.updated_at))),
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
  const form = formGrid([
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
  ], m ? { ...m, times: m.times ? m.times.split(', ').map((t) => t.replace(/^0/, '')).join(', ') : '' } : { active: 1 });
  const err = errBox();
  const dlg = modal(m ? `Edit ${m.name}` : `Add medication for ${s.first_name} ${s.last_name}`, [err, form], [
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
  const form = formGrid([
    ['visit_at', 'Time in', 'datetime'],
    ['complaint', 'Reason for visit', 'text', { required: true, list: 'complaints' }],
    ['temp', 'Temperature'],
    ['assessment', 'Assessment', 'textarea', { rows: 2 }],
    ['treatment', 'Treatment / care given', 'textarea', { rows: 2 }],
    ['disposition', 'Outcome', 'select', { choices: DISPOSITIONS }],
    ['parent_contacted', 'Parent / guardian contacted', 'check'],
    ['notes', 'Notes', 'textarea', { rows: 2 }],
  ], v || { visit_at: Date.now() });
  form.append(h('datalist', { id: 'complaints' }, COMPLAINTS.map((c) => h('option', { value: c }))));
  const err = errBox();
  const dlg = modal(v ? `Visit on ${fmtDT(v.visit_at)}` : `New visit: ${s.first_name} ${s.last_name}`, [
    s.allergies ? h('div', { class: 'alert bad' }, h('b', {}, 'Allergies: '), s.allergies) : null,
    s.conditions ? h('div', { class: 'alert warn' }, h('b', {}, 'Conditions: '), s.conditions) : null,
    s.guardian_name || s.guardian_phone ? h('p', { class: 'muted' }, `Guardian: ${s.guardian_name || ''} ${s.guardian_phone || ''}`) : null,
    err, form,
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
  main.replaceChildren(
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

// ---- settings ----------------------------------------------------------------------

async function viewSettings(main, r) {
  const admin = S.user.role === 'admin';
  const tabs = [['account', 'My account'], ...(admin ? [['users', 'Users'], ['school', 'School & security'], ['email', 'Email'], ['saving', 'Saving & backup'], ['updates', 'Updates']] : [])];
  const tab = tabs.some((t) => t[0] === r.tab) ? r.tab : 'account';
  const data = admin ? await get('/api/settings') : null;
  if (data) S.exportFolder = data.settings.exportFolder;
  const body = h('div', {});
  main.replaceChildren(
    h('div', { class: 'head' }, h('h1', {}, 'Settings'), h('span', { class: 'muted' }, `Nurse’s Log v${S.version}`)),
    h('div', { class: 'panel' },
      h('div', { class: 'tabs' }, tabs.map(([k, l]) => h('button', { class: 'tab' + (k === tab ? ' on' : ''), type: 'button', onclick: () => go(`#/settings/${k}`) }, l))),
      body));
  const reload = () => viewSettings(main, r);
  await ({ account: setAccount, users: setUsers, school: setSchool, email: setEmail, saving: setSaving, updates: setUpdates })[tab](body, data, reload);
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

function setSaving(body, d, reload) {
  const err = errBox();
  const folder = h('input', { type: 'text', value: d.settings.exportFolder, placeholder: 'e.g. \\\\server\\nurse\\exports or C:\\Users\\nurse\\Documents' });
  body.append(
    section('"Save to folder" location', h('p', { class: 'muted' }, 'Exports and backups saved with "Save to folder" go here without asking. A shared network folder works.'),
      err, h('div', { class: 'row' }, h('div', { style: 'flex:1;min-width:240px' }, folder),
        h('button', { class: 'btn', onclick: async () => {
          try { const r = await post('/api/settings/pick-folder'); if (r.folder) folder.value = r.folder; } catch (e) { showErr(err, e.message); }
        } }, 'Browse\u2026'),
        h('button', { class: 'btn primary', onclick: async () => {
          try { await post('/api/settings', { exportFolder: folder.value }); toast('Saved'); reload(); } catch (e) { showErr(err, e.message); }
        } }, 'Save'))),
    section('Export all records', h('p', { class: 'muted' }, 'One Excel workbook with every student, medication, dose and visit.'), exportMenu('all')),
    section('Backup', h('p', { class: 'muted' }, `A copy is kept automatically each day (last 30 days) in ${d.settings.dataDir}\\backups. Keep one somewhere else too, such as the school network or a USB drive.`),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => backup('saveas') }, 'Save backup as\u2026'),
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
