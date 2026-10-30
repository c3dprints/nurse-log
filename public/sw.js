'use strict';
// Lets a phone install Nurse’s Log as an app. Nothing is cached: student records
// stay on the office PC, so every request goes there as usual.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET' || e.request.mode !== 'navigate') return;
  e.respondWith(fetch(e.request).catch(() => new Response(
    '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><body style="font:16px system-ui;padding:24px;color:#1c2630;background:#f4f6f8">' +
    '<h2>Can\u2019t reach the office PC</h2><p>Check that Tailscale is connected on this phone and that the office PC is on, then try again.</p>',
    { headers: { 'Content-Type': 'text/html; charset=utf-8' } })));
});
