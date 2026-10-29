# Changelog

## 1.0.3

- Remote access with Tailscale: Settings > Remote access shows this PC's Tailscale IP and name and the links to open on a phone. Off until an admin turns it on; it then listens only on the Tailscale address (never the school network) and only answers Tailscale devices. Remote sign-ins are audited with the device address. Save as and Browse are hidden on a phone (Download works instead).
- Phone layout: bigger buttons, no zooming into fields on iPhone, two-column cards, stacked details.

## 1.0.2

- Themes: Settings > Appearance has Match Windows, six light color themes (Teal, Ocean, Lavender, Rose, Sage, Sunshine) and two dark ones (Night, Midnight). Each person picks their own and it follows their account.
- Fixed the word "null" showing on Today and student pages when there was no low-stock warning or allergy banner.

## 1.0.1

- New version numbering: 1.0.1 up to 1.0.100, then 1.1.0, and so on. `npm run bump` sets the next number; `npm run release` checks it.

## 0.1.1

- Installer: npm warnings (such as the Node version notice on Node 18) no longer stop the install on Windows PowerShell 5.1.

## 0.1.0

First version.

- Students: search by name, ID, homeroom, allergy or condition; grade filter; archive and restore.
- Student board: info, allergies and conditions banners, medications, medication log, visits, and a history of every view, change and export.
- Medications: scheduled times and as-needed (PRN), doses on hand with a low-stock warning, record given / refused / absent / held / missed.
- Today screen: doses due, PRN list, today's visits, low stock.
- Visit log, medication log and (admin) audit log with date range and search.
- Export to Excel from the student board, the student list, each log, and Settings (all records). Save as (Windows dialog), save to a set folder, or download. Every export is logged with who and when.
- Accounts: first-time setup makes the admin; admins add nurses with a temporary password they must change. Five wrong passwords lock the account for 10 minutes. Auto sign-out after idle minutes (15 by default) without losing a half-typed note.
- Password reset by an emailed 6 digit code (school SMTP account in Settings > Email) or by the recovery code shown when the account is made.
- Backups: a daily copy (last 30 kept) plus Save backup as / to folder.
- Updates: check, install, or install automatically from GitHub release tags, like Claude Sessions.
