# Nurse's Log

A Windows app for the school nurse's office: student health info, medications and doses given, office visits, search, Excel export, and an audit trail of who did what and when.

It runs on the nurse's PC. A small local server (127.0.0.1:8940, never reachable from the network) serves the app window. Student records live in `%APPDATA%\NurseLog\nurse-log.sqlite`, outside the app folder, so updates and this repo never contain student data.

## Install on a school PC

Needs [Git](https://git-scm.com) and [Node.js 20 LTS](https://nodejs.org). Then in PowerShell:

```powershell
irm https://raw.githubusercontent.com/c3dprints/nurse-log/main/scripts/install.ps1 | iex
```

(The repo is private, so for now run `scripts\install.ps1` from a clone instead.) It installs to `%LOCALAPPDATA%\NursesLog\app`, checks out the newest release and puts a **Nurse's Log** shortcut on the Desktop. The first launch asks for the school name and the admin account.

After setup, an admin should:

1. **Settings > Email**: enter the school's SMTP account (Gmail or Microsoft 365 with an app password, port 587) and press *Send me a test email*. Until this is done, "Forgot password?" works only with recovery codes.
2. **Settings > Saving & backup**: pick the "Save to folder" location (a network share works) and save a first backup.
3. **Settings > Users**: add the other nurses. They pick their own password at first sign-in.
4. Turn on **BitLocker** for the PC's drive so records are encrypted if the PC is lost.

## Develop

```
npm install
npm start          # http://127.0.0.1:8940, data in %APPDATA%\NurseLog
npm test           # runs on port 8941 against a temp folder
npm run release    # bump package.json + CHANGELOG.md first; pushes main and the vX.Y.Z tag
```

Set `NL_DATA` to use another data folder and `NL_PORT` for another port.

## Updates

Installed copies are git clones sitting on a release tag. Settings > Updates checks GitHub for a newer `vX.Y.Z` tag, checks it out, runs `npm ci` if the packages changed, and restarts. A copy on a branch (a dev checkout) is never moved by the updater.

## Layout

| Path | What |
|---|---|
| `server.js` | HTTP server and API routes |
| `lib/db.js` | SQLite file (sql.js), atomic saves, daily backups, audit helper |
| `lib/auth.js` | accounts, scrypt hashes, sessions, lockout, reset and recovery codes |
| `lib/records.js` | students, medications, doses, visits, search, logs |
| `lib/excel.js` | Excel workbooks |
| `lib/dialogs.js` | Windows Save As and folder picker |
| `lib/mailer.js` | reset code emails |
| `lib/updater.js` | release tag updates |
| `public/` | the app window (plain JS) |
| `launch.js`, `scripts/` | launcher, installer, taskbar icon, release |
