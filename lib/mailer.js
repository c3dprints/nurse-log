'use strict';
// Sends password reset codes through the school's SMTP account (Settings > Email).
// Gmail and Microsoft 365 both work with an app password. Without one, mail goes
// through the c3dprints relay (relay/supabase/functions/nurse-log-mail, in MakerQ's
// Supabase project, sending with its Resend key; From is set there, now noreply@makerq.io),
// which sends
// and only feedback or a reset code, so no email password ships in the installer.

const nodemailer = require('nodemailer');

// The relay's address (relay/README.md). NL_MAIL_RELAY overrides it ('' turns it off).
const RELAY_URL = 'https://enyimtvgqzmpaiaeiyxj.supabase.co/functions/v1/nurse-log-mail';
const relayUrl = () => (process.env.NL_MAIL_RELAY !== undefined ? process.env.NL_MAIL_RELAY : RELAY_URL);
const relayReady = () => /^https:\/\/|^http:\/\/127\.0\.0\.1:/.test(relayUrl());

// kind 'feedback' { text, name, email, school, version } or 'reset' { to, code }.
async function relay(payload) {
  if (!relayReady()) throw new Error('the Nurse’s Log mail service is not available');
  let r;
  try {
    r = await fetch(relayUrl(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Nurse-Log': '1' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(20000),
    });
  } catch (e) {
    throw new Error(`could not reach the Nurse’s Log mail service (${e.message})`);
  }
  let j = {};
  try { j = await r.json(); } catch { /* not JSON */ }
  if (!r.ok) throw new Error(j.error || `the mail service answered ${r.status}`);
  return j;
}

function configured(smtp) {
  return !!(smtp && smtp.host && smtp.port && smtp.from);
}

function transport(smtp) {
  const port = Number(smtp.port);
  return nodemailer.createTransport({
    host: smtp.host,
    port,
    secure: port === 465,
    requireTLS: port !== 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.pass || '' } : undefined,
    connectionTimeout: 15000,
    greetingTimeout: 15000,
    socketTimeout: 20000,
    disableFileAccess: true,
    disableUrlAccess: true,
  });
}

async function send(smtp, { to, subject, text, replyTo }) {
  if (!configured(smtp)) throw new Error('email is not set up yet (Settings > Email)');
  await transport(smtp).sendMail({ from: smtp.from, to, subject, text, replyTo: replyTo || undefined });
}

function resetText(user, code, appName) {
  return [
    `Hello ${user.full_name},`,
    '',
    `Your ${appName} password reset code is: ${code}`,
    '',
    'It works once and expires in 15 minutes.',
    'If you did not ask for this, you can ignore this email; your password has not changed.',
  ].join('\n');
}

module.exports = { configured, send, resetText, relay, relayReady };
