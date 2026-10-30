# Nurse's Log mail relay

The app's own email: a Supabase Edge Function, `nurse-log-mail`, in **MakerQ's Supabase project** (`enyimtvgqzmpaiaeiyxj`). It uses that project's existing `RESEND_API_KEY` (the one MakerQ's `billing` relay and `contact` form use), so no email password ships in the public installer. It is the same pattern as MakerQ's hosted email (`billing?action=send-email`). It is not part of the installer.

Address: `https://enyimtvgqzmpaiaeiyxj.supabase.co/functions/v1/nurse-log-mail` (`RELAY_URL` in `lib/mailer.js`).

It only sends:

- **feedback**: always to hi@c3dprints.com, with the nurse as reply-to;
- **reset**: a fixed "your code is 123456" message to the nurse's own address, nothing else from the caller.

Sends are counted in MakerQ's `relay_sends` table with `from_name = 'Nurse''s Log'`. That gives at most 60 an hour for all of Nurse's Log, 30 feedback an hour, and 5 reset codes an hour per address, and they also count toward MakerQ's own hourly ceiling. A school that fills in Settings > Email sends its own reset codes instead.

## Files

- `supabase/functions/nurse-log-mail/mail.mjs`: the rules (plain JS; `npm test` runs them).
- `supabase/functions/nurse-log-mail/index.ts`: the Supabase wrapper (Resend key, relay_sends caps).

## Deploy

From PowerShell (the `supabase` CLI in `~\.local\bin` is already signed in; `npx supabase` is broken on this PC):

```
supabase functions deploy nurse-log-mail --project-ref enyimtvgqzmpaiaeiyxj --no-verify-jwt --use-api --workdir C:\Users\chern\nurse-log\relay
```

Then `curl -X POST` it without the `X-Nurse-Log: 1` header: a 403 means it is up, a 500 means it failed to boot.

Optional secrets: `NURSE_LOG_FROM` (default `Nurse's Log <hi@c3dprints.com>`; the domain must be verified in Resend) and `NURSE_LOG_FEEDBACK_TO` (default `hi@c3dprints.com`).

To stop it: `supabase functions delete nurse-log-mail --project-ref enyimtvgqzmpaiaeiyxj`. The app then falls back to each school's own email (Settings > Email).
