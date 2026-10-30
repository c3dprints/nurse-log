# Nurse's Log: dictation setup

Dictation lets staff speak a visit, dose, medication or immunization and have the form filled in for them to check and save. It is **off by default** and Nurse's Log works fully without it.

## What it uses

Dictation uses the OpenAI API with the **district's own** API key. c3dprints does not provide a key, does not resell OpenAI, and never receives the audio or text.

- Speech to text: `gpt-4o-mini-transcribe`
- Filling in the form: `gpt-4o-mini`

## What is sent to OpenAI

- The recorded audio (or typed notes) for that one dictation.
- The open form's name, its field labels and choices, the values already filled in on it, and today's date.
- Nothing else from the student record is sent.

The filled-in form is shown to the staff member, who checks it and presses Save. Nothing is saved without a person saving it. Each use is recorded in the audit log.

## Before turning it on

1. Create an OpenAI API account owned by the district (platform.openai.com), not a staff member's personal ChatGPT account.
2. Review OpenAI's business terms and data processing addendum with the district's privacy office, including how long OpenAI keeps API data and whether the district needs zero data retention.
3. Set a monthly spending limit in the OpenAI account.
4. Create an API key for Nurse's Log only.

## Turning it on

1. Sign in to Nurse's Log as an admin.
2. Open Settings > Dictation & ChatGPT.
3. Paste the API key and test it. Nurse's Log checks the key and that both models are available to it.
4. Turn the assistant on.

The key is saved inside the encrypted records file. Admins can turn dictation off or remove the key at any time. Admins, nurses and aides can use it; viewers cannot.
