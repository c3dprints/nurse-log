# Nurse's Log: phone and remote access

Remote access lets staff use Nurse's Log from a phone or another computer, for example on a field trip or at recess duty. It is **off by default**. Without it, Nurse's Log can only be used at the office PC.

## How it works

- Remote access uses [Tailscale](https://tailscale.com), a private network built on WireGuard encryption. The office PC and each phone join the same Tailscale network (a "tailnet").
- When an admin turns on Settings > Remote access, Nurse's Log also listens on the PC's Tailscale address. It never listens on the school's ordinary network, and it only answers addresses from the Tailscale range (100.64.0.0/10).
- Records stay on the office PC. Phones show pages from the PC; they do not keep a copy of the records.
- The admin can also turn on an HTTPS address (Tailscale Serve), which gives the phone a trusted certificate.

## Recommended setup for a district

1. **Use a district-owned Tailscale account**, signed in with the district's Google or Microsoft identity, not a staff member's personal account. The district then controls who can join and can remove a lost phone from the Tailscale admin page.
2. Allow only the office PC and approved staff phones on that tailnet.
3. Prefer district-managed phones (MDM) with a screen lock.
4. Turn on the HTTPS address in Settings > Remote access.
5. Require two-step sign-in for everyone (Settings > School & security).

## Phone sign-in

- The first sign-in on a phone uses the staff member's password (and two-step code if turned on).
- The phone can then be remembered with a 4 to 8 digit PIN. A remembered phone is forgotten after 30 days, after 5 wrong PINs, when the password changes, or when the account is disabled.
- Each staff member can see and forget their remembered phones in Settings > My account.
- The same idle sign-out applies on phones.

## What can only be done at the office PC

Unlocking encrypted records, turning on encryption, erasing everything, setting up HTTPS, and saving files with a Save As dialog.

## Logged

Every sign-in and record view from a phone is in the audit log with the phone's Tailscale address.

## Turning it off

Turn off Settings > Remote access. Nurse's Log stops listening on the Tailscale address right away. To cut off one phone, remove it from the tailnet in the Tailscale admin page, or forget it in Nurse's Log.
