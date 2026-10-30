# Nurse's Log: privacy and security overview

For district technology, privacy and records staff reviewing Nurse's Log. It describes what the software does as of version 1.0.19. Questions: hi@c3dprints.com.

## Where student data lives

- Nurse's Log runs on the school nurse's Windows PC. Student records are kept in one file on that PC (`%APPDATA%\NurseLog\nurse-log.sqlite`) with daily backups beside it (the last 30 days).
- There is no Nurse's Log cloud service. c3dprints never receives, stores or can see student records.
- The app listens only on the PC itself (127.0.0.1). It is not reachable from the school network. Phone access is optional and off by default; see [remote-access.md](remote-access.md).

## Encryption

- **At rest.** The records file and every backup are encrypted with AES-256-GCM. New installs are encrypted from the start; older installs turn it on in Settings > School & security.
- The encryption key is protected by Windows (DPAPI) for the Windows account that runs Nurse's Log, so the records open without a prompt on that account only. A copy of the file on another computer or account is unreadable.
- When encryption is turned on, the admin is shown a **records recovery key** once. It opens the records and any backup on another PC (for example after a PC replacement). Keep it with the school's important papers. Without it, a backup cannot be opened by anyone, including c3dprints.
- **In transit.** Phones reach the PC only over the school's own Tailscale network (WireGuard encryption).
- Excel exports are ordinary .xlsx files and are **not** encrypted. Every export is recorded in the audit log and each workbook is marked confidential. Save exports only to protected locations.

## Who can see and change what

| Role | Can do |
|---|---|
| admin | Everything, plus users, settings, backups, permanent deletes and the audit log |
| nurse | All record keeping: students, medications, doses, visits, immunizations, roster imports and exports |
| aide | Record doses and office visits, use dictation; cannot change student info or medications, or export |
| viewer | Read only (for example a principal or counselor); cannot change or export anything |

Roles are enforced by the server on every request, not only hidden on screen.

## Sign-in

- Passwords need at least 10 characters with letters and numbers, and are stored only as scrypt hashes.
- Five wrong passwords lock the account for 10 minutes, and repeated wrong sign-ins from one address are slowed down.
- **Two-step sign-in** with any authenticator app (Microsoft Authenticator, Google Authenticator and similar). Each user can turn it on; an admin can require it for everyone.
- Automatic sign-out after a set number of idle minutes (15 by default).
- Password reset by an emailed 6 digit code, or by a one-time recovery code given when the account is made.
- Accounts are disabled, never deleted, so the logs keep their names.
- Not available yet: Google or Microsoft single sign-on.

## Audit log

Every sign-in, record view, change, export, dictation use, deletion and setting change is logged with the user and time. Admins choose how long it is kept (14, 30, 90 or 365 days, or forever) in Settings. **Choose a period that matches your district's records policy.** The 14 day default suits small offices that do not need more; most districts will want 365 days or forever.

## Retention and deletion

- Students who leave are archived (hidden, records kept).
- An admin can delete an archived student for good, or set Nurse's Log to delete archived students automatically after 1, 2, 3, 5 or 7 years. Deleting removes the student's medications, doses, visits, immunizations and photo. The audit log keeps who did it and when, without health details.
- Deleted data stays inside the encrypted daily backups until they age out (30 days).
- **End of contract:** Settings > Saving & backup > Erase everything deletes every record, backup, account, setting and the encryption key on the PC, and returns the app to first-time setup. Export all records first if the district needs a copy.

## Outside services

Nurse's Log works with none of these. Each one is optional.

| Service | What is sent | When |
|---|---|---|
| OpenAI (dictation) | The dictated audio and the open form's contents | Only if an admin adds the **district's own** OpenAI API key. The district's agreement with OpenAI covers it; c3dprints never sees it. |
| c3dprints mail service | A staff member's email address and a reset code; feedback text a user chooses to send | Password reset emails and Settings > Feedback, unless the school sets up its own email account (then mail goes through the school's server). No student data. |
| Tailscale | Encrypted network traffic between the PC and phones | Only if an admin turns on remote access, using the school's own Tailscale account. |
| GitHub | A check for the newest version and the installer download | Update checks. No school or student data. |

## Updates

- Updates are signed. Each installer is signed with a c3dprints release key that never leaves the release PC, and the app refuses to install an update whose signature does not match, even if the download site were compromised.
- Updates never touch the records file. They can be automatic or approved by an admin.
- The Windows installer is not yet code-signed with a Microsoft-trusted certificate, so Windows SmartScreen may warn on first install.

## Reporting a problem

Email hi@c3dprints.com with "Security" in the subject.
