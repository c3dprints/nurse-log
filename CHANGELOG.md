# Changelog

## 1.0.13

- Text size: the first time Nurse's Log opens on a PC, a small card asks "Is the text too small?" with A- / A+ buttons to make everything bigger, and the window grows to fit. Change it any time in Settings > Appearance > Text size, or with Ctrl + plus, Ctrl + minus, Ctrl + 0 or Ctrl + mouse wheel. The size is remembered on each PC (phones keep pinch zoom).

## 1.0.12

- Windows installer: NursesLog-Setup-1.0.12.exe installs Nurse's Log for the signed-in user with no admin rights, Git or Node.js (it carries its own Node.js), and adds Desktop and Start menu shortcuts. Uninstall from Windows Settings > Apps; student records are kept.
- Installer downloads are public at github.com/c3dprints/nurse-log-releases (installers only; the source code stays private).
- Copies installed from the Setup.exe update themselves from Settings > Updates: the new installer is downloaded from that repo, checked against its SHA-256 and run silently, and the app reloads.

## 1.0.11

- Settings > About (everyone): version, a notice that this is beta software for evaluation and testing only, needing further testing, a security review and proper licensing before use with real student records, and the license.
- Proprietary license (LICENSE): all rights reserved; copying, modifying, redistributing or reverse engineering without written permission is not allowed.
- Security fixes from a review:
  - Over the HTTPS address the sign-in and phone cookies are marked Secure.
  - "Save to folder" must be a folder on the PC's own drives (no \\server\share network paths, which make Windows send its sign-in to that server) and can only be changed at the office PC.
  - After 30 wrong passwords, PINs or reset codes from one device in 15 minutes, that device has to wait, so nobody can keep locking nurses out.
  - Emailed reset codes: 10 wrong codes in an hour stops them for a while, even when new codes are requested.
  - Unexpected errors no longer show internal details (they stay in the log file).
- Dependencies: 0 known vulnerabilities (uuid pinned to a fixed version).

## 1.0.10

- The taskbar shows the Nurse's Log icon again instead of Edge's. The helper that sets it never actually ran (Windows PowerShell started detached quits at once); the app now asks for it every time the page loads, which also brings the icon back after a reload or an update, when Edge puts its own icon back.

## 1.0.9

- Phone layout: on a phone screen the sidebar becomes a bottom tab bar (Today, Students, Visits, Meds, Settings), and Today and each student's page get big New visit and Give dose buttons above it. Give dose opens the student's only medication straight away, or lists them as big buttons, with the nearest scheduled time filled in. Forms open full screen with Save always in reach. The PC layout is unchanged.
- Stay signed in on your own phone: after signing in on a phone with your password you can choose a 4 to 8 digit PIN, and next time just type the PIN. It still locks after the idle minutes. A phone is forgotten after 30 days, 5 wrong PINs, a password change, or the account being turned off. Choose "Not on this phone" on a shared phone. Manage remembered phones in Settings > My account; admins can turn PIN sign-in off in School & security (that forgets every phone). The office PC always uses the password. PIN sign-ins and wrong PINs are in the audit log.

## 1.0.8

- Edit button next to the student's name on the student page opens Edit info in one click.
- Click a box and it lights up with "dictation goes here", so it is clear where Windows key + H or ChatGPT dictation will type. With ChatGPT on, dictating with a box picked puts the words into that box at the cursor (phone boxes keep 10 digits); with no box picked, ChatGPT fills the whole form as before. The box pulses while listening.
- Dictation shortcut: each user picks their own key in Settings > My account (F2 by default). It starts and stops dictation on an open form; on a student's page with no form open it opens Edit info and starts listening. Keys the browser or Windows use (Ctrl+C, F5, Alt+F4...) cannot be picked.
- Audit log is also in Settings (admins), next to the sidebar link.
- Dictation into a single box is audited as ai.transcribe with the box's name.

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
