'use strict';
// Medication reminders. Every 30 seconds the server looks at today's scheduled doses
// (Records.medsDue: each medication's weekdays, no-school days) and raises an alert
// for each one not yet recorded: `lead` minutes before its time, then again every
// `repeat` minutes (up to 3 times) while it is still not recorded, for two hours.
// New alerts go out through `notify` (Windows notification, phone push); the app
// window asks for the open ones itself. Students with reminders turned off never alert.

const { localDate } = require('./db');

const DEFAULTS = { on: true, lead: 0, repeat: 15, windows: true, phone: true };
const LEADS = [0, 5, 10, 15, 30];
const REPEATS = [0, 10, 15, 30];
const MAX_REPEATS = 3;
const STALE_MIN = 120;

const settingsOf = (db) => ({ ...DEFAULTS, ...(db.setting('medAlerts', {}) || {}) });
const minutesOf = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };

// "Sam R." keeps full names off lock screens and notification history.
const shortName = (r) => `${r.first_name} ${String(r.last_name || '').slice(0, 1)}.`.trim();

function fmtTime(t) {
  const [h, m] = t.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// One notification for everything that came due in the same check.
function message(items) {
  if (items.length === 1) {
    const i = items[0];
    return {
      title: `${shortName(i)}: ${i.name}${i.dose ? ` ${i.dose}` : ''}`,
      body: `${i.stage ? 'Still not recorded. ' : ''}Due at ${fmtTime(i.time)}`,
    };
  }
  return {
    title: `${items.length} medications due`,
    body: items.slice(0, 4).map((i) => `${fmtTime(i.time)} ${shortName(i)}: ${i.name}`).join('\n') + (items.length > 4 ? `\n+${items.length - 4} more` : ''),
  };
}

class Alerts {
  constructor(db, records, notify) {
    this.db = db;
    this.records = records;
    this.notify = notify;
    this.sent = new Map();
    this.day = null;
  }

  settings() {
    return settingsOf(this.db);
  }

  // Doses whose alert time has come and which are still not recorded. stage 0 is the
  // first alert, 1 to 3 the reminders after it.
  open(now = Date.now()) {
    const s = this.settings();
    if (!s.on) return [];
    const d = new Date(now);
    const mins = d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
    const due = this.records.medsDue(localDate(now));
    const out = [];
    for (const r of due.scheduled) {
      if (r.record || r.med_alerts === 'off') continue;
      const at = minutesOf(r.time);
      if (mins < at - s.lead || mins > at + STALE_MIN) continue;
      const stage = s.repeat && mins >= at ? Math.min(MAX_REPEATS, Math.floor((mins - at) / s.repeat)) : 0;
      out.push({
        key: `${r.id}|${due.date}|${r.time}`, stage, date: due.date, time: r.time,
        medication_id: r.id, student_id: r.student_id, first_name: r.first_name, last_name: r.last_name,
        name: r.name, dose: r.dose, route: r.route, allergies: r.allergies,
      });
    }
    return out;
  }

  // Sends what is new since the last check: a dose reaching its alert time, or a
  // reminder for one still not recorded.
  async tick(now = Date.now()) {
    const day = localDate(now);
    if (day !== this.day) { this.sent.clear(); this.day = day; }
    const fresh = this.open(now).filter((i) => (this.sent.has(i.key) ? this.sent.get(i.key) : -1) < i.stage);
    for (const i of fresh) this.sent.set(i.key, i.stage);
    if (fresh.length) await this.notify(fresh, message(fresh), this.settings());
    return fresh;
  }
}

module.exports = { Alerts, DEFAULTS, LEADS, REPEATS, message, shortName };
