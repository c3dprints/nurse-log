# Changelog

## 1.0.7

Easier phone setup.

- HTTPS for phones: Settings > Remote access > Set up HTTPS (admin, on the office PC) turns on Tailscale Serve, which gives this PC an https://<name>.<tailnet>.ts.net:8943 address with a real certificate, visible only on your Tailscale. Port 443 is left free for other apps. If HTTPS certificates are off for the Tailscale account, the page links to where to switch them on. HTTPS goes off again when remote access is turned off.
- Requests through that address are treated as phone requests (Tailscale devices only, same sign-in and auto sign-out, no Save as), and remote sign-ins over it are audited as "(https)". It needs no Windows Firewall rule.
- Install as an app: a web app manifest, phone icons and a small service worker (nothing is cached; records stay on the PC). From the HTTPS address, Android Chrome offers Install app and iPhone Safari Add to Home Screen; it opens full screen with its own icon.
- Dictation works on a phone over the HTTPS address, since phones allow the microphone there.
- QR codes in Settings > Remote access: scan with the phone's camera instead of typing the address.

## 1.0.6

- Settings > Help (for every user): how to use dictation with ChatGPT, with step-by-step use, example phrases for student, medication and visit forms, tips, one-time admin setup, privacy, phone use, and fixes for common messages. The Dictate bar has a "How to use" link, and Settings > Dictation & ChatGPT points to it.

## 1.0.5

- Material themes: a new section in Settings > Appearance with soft, faded palettes (Mist, Blush, Eucalyptus, Lilac, Clay, Seafoam, plus dark Dusk and Slate). They also switch to a material look: rounder cards with gentle shadows, pill-shaped tonal buttons, filled text boxes, rounded navigation and dialogs. The original themes are unchanged.
- Phone number boxes now match the other text boxes in every theme.

## 1.0.4

- Guardian and second contact phone numbers are capped at 10 digits and shown as (555) 123-4567 while you type. A leading 1 is dropped; anything else that is not 10 digits is refused.
- Student record: new Medication info section with permission to give medication at school (On file / Not on file / Expired, with a warning on the board when it is not on file), pharmacy, medications taken at home, and medication notes. Included in Excel exports.
- Dictation with ChatGPT: an admin adds an OpenAI API key in Settings > Dictation & ChatGPT. Student, medication and visit forms then get Dictate and Type notes buttons; ChatGPT fills in the matching boxes (highlighted) for the nurse to check before saving. Each use is in the audit log. Off until set up, with a privacy notice; the key never leaves this PC's server. Without it, forms show the Windows key + H dictation tip.

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
