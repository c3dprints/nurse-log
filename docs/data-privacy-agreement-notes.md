# Nurse's Log: notes for a district data privacy agreement

Many districts use the Student Data Privacy Consortium (SDPC) National Data Privacy Agreement or a state version of it. These notes are the starting answers for the agreement's exhibits. They are not legal advice; the signed agreement is the binding document.

## Exhibit A: description of services

Nurse's Log is health office record keeping software installed on a school's Windows PC: student health info, medications and doses, office visits, immunizations, reports and Excel exports. Optional phone access over the school's own Tailscale network. Optional dictation through the district's own OpenAI account.

## Exhibit B: data collected

Student: name, student ID, date of birth, grade, homeroom, sex, photo (optional), guardian and physician names and phone numbers, allergies, health conditions, medications and doses given, office visits, immunizations, and notes staff type.

Staff: name, email, role, sign-in times, audit log.

**Where it is stored:** only on the school's PC, encrypted. c3dprints does not host, receive or have access to student data.

## Subprocessors

| Subprocessor | Purpose | Student data? |
|---|---|---|
| OpenAI | Optional dictation, on the district's own account and contract | Dictated audio and form contents, only if the district turns it on |
| Supabase and Resend (through c3dprints) | Password reset emails and in-app feedback, unless the school uses its own email server | No. Staff email address, reset code, feedback text |
| Tailscale | Optional phone access, on the district's own account | Encrypted traffic only |
| GitHub | Software update downloads | No |

Staff should not put student details in feedback messages.

## Security

See [privacy-and-security.md](privacy-and-security.md).

## Data return and deletion

- **Return:** Export to Excel > All records gives the district a full copy at any time.
- **Deletion:** Settings > Saving & backup > Erase everything permanently deletes all records, backups and keys from the PC. c3dprints holds no copy to delete.
- **Retention:** archived students can be deleted automatically after a set number of years.

## Breach notification

Because c3dprints never holds student data, a breach would most likely involve the school's PC or accounts. c3dprints will help the district investigate and will tell the district promptly about any security flaw found in the software.

## Advertising and sale

Nurse's Log contains no advertising and no tracking. c3dprints does not sell, rent or mine student data, and never receives it.
