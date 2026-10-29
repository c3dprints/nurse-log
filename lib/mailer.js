'use strict';
// Sends password reset codes through the school's SMTP account (Settings > Email).
// Gmail and Microsoft 365 both work with an app password.

const nodemailer = require('nodemailer');

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

async function send(smtp, { to, subject, text }) {
  if (!configured(smtp)) throw new Error('email is not set up yet (Settings > Email)');
  await transport(smtp).sendMail({ from: smtp.from, to, subject, text });
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

module.exports = { configured, send, resetText };
