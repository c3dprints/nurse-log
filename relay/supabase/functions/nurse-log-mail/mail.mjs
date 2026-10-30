// Nurse's Log mail relay rules (plain JS so the Node tests can load it; index.ts runs
// it as a Supabase Edge Function next to MakerQ's in the same project). It sends the
// app's email as hi@c3dprints.com through Resend, so no email password ever ships in
// the public installer. It sends only two fixed kinds of message, which makes it
// useless for spam:
//   feedback  always to FEEDBACK_TO (the developer), never anywhere else
//   reset     a password reset code (6 digits) and nothing else, to any address
// env.allow(mail) applies the hourly caps and env.record(mail) counts a sent message.

const MAX_BODY = 8 * 1024;
const EMAIL = /^[^\s@<>"',;]{1,64}@[A-Za-z0-9.-]{1,190}\.[A-Za-z]{2,24}$/;
const clean = (v, max) => String(v ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function feedbackMail(b, env) {
  const text = String(b.text ?? '').trim();
  if (!text) return { error: 'write your feedback first' };
  if (text.length > 5000) return { error: 'feedback is too long (5000 characters at most)' };
  const name = clean(b.name, 100), email = clean(b.email, 254), school = clean(b.school, 120), version = clean(b.version, 20);
  return {
    kind: 'feedback',
    to: env.FEEDBACK_TO,
    replyTo: EMAIL.test(email) ? email : undefined,
    subject: `Nurse's Log feedback (v${version || '?'}${school ? `, ${school}` : ''})`,
    text: [text, '', '--', `From: ${name}${email ? ` <${email}>` : ''}`, `School: ${school}`, `Version: ${version}`].join('\n'),
  };
}

function resetMail(b) {
  const to = clean(b.to, 254);
  const code = String(b.code ?? '');
  if (!EMAIL.test(to)) return { error: 'bad email address' };
  if (!/^\d{6}$/.test(code)) return { error: 'bad code' };
  return {
    kind: 'reset',
    to,
    subject: "Nurse's Log password reset code",
    text: [
      'Hello,',
      '',
      `Your Nurse's Log password reset code is: ${code}`,
      '',
      'It works once and expires in 15 minutes.',
      'If you did not ask for this, you can ignore this email; your password has not changed.',
    ].join('\n'),
  };
}

export async function handle(req, env, fetchImpl = fetch) {
  if (req.method !== 'POST') return json(404, { error: 'not found' });
  if (req.headers.get('X-Nurse-Log') !== '1') return json(403, { error: 'forbidden' });
  if (!env.RESEND_KEY || !env.FROM || !env.FEEDBACK_TO) return json(503, { error: 'the mail relay is not set up' });
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json(413, { error: 'too large' });
  let b;
  try { b = JSON.parse(raw); } catch { return json(400, { error: 'bad request' }); }
  if (!b || typeof b !== 'object') return json(400, { error: 'bad request' });

  const mail = b.kind === 'feedback' ? feedbackMail(b, env) : b.kind === 'reset' ? resetMail(b) : { error: 'unknown kind' };
  if (mail.error) return json(400, { error: mail.error });
  if (env.allow && !(await env.allow(mail))) return json(429, { error: 'too many emails; try again later' });

  const r = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.FROM, to: [mail.to], subject: mail.subject, text: mail.text, ...(mail.replyTo ? { reply_to: mail.replyTo } : {}) }),
  });
  if (!r.ok) {
    console.error(`[nurse-log-mail] resend refused: ${r.status} ${await r.text().catch(() => '')}`);
    return json(502, { error: `the mail service refused it (${r.status})` });
  }
  if (env.record) await env.record(mail);
  return json(200, { sent: true });
}
