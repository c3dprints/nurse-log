# Nurse's Log mail relay

A Cloudflare Worker (`worker.mjs`) that sends the app's email as **hi@c3dprints.com** through [Resend](https://resend.com), so no email password ever ships in the public installer. It is not part of the installer.

It only sends:

- **feedback**: always to `FEEDBACK_TO` (hi@c3dprints.com), with the sender as reply-to;
- **reset**: a fixed "your code is 123456" message to the nurse's own address, nothing else from the caller.

Both are limited to 5 a minute per IP (resets also per recipient). A school that fills in Settings > Email sends its own reset codes instead.

## One-time setup

1. **Resend**: sign up, then *Domains > Add domain* `c3dprints.com`. Resend shows a few DNS records (an MX and TXT on `send.c3dprints.com` and a DKIM TXT `resend._domainkey`). Add each one in **GoDaddy > My Products > c3dprints.com > DNS > Add New Record**, then press *Verify* in Resend. These sit beside the existing mailbox records, so mail to hi@c3dprints.com keeps arriving in GoDaddy as before.
2. **Resend API key**: *API Keys > Create*, permission **Sending access**, domain **c3dprints.com**. Copy it.
3. **Cloudflare**: sign up (free), then in this folder:

   ```
   npx wrangler login
   npx wrangler secret put RESEND_KEY      (paste the Resend key when asked)
   npx wrangler deploy
   ```

   Deploy prints the address, like `https://nurse-log-mail.<name>.workers.dev`.
4. Put that address in `RELAY_URL` in `lib/mailer.js` and release a new version.

To stop it at any time: delete the key in Resend, or `npx wrangler delete`.
