# Nurse's Log: accessibility statement

c3dprints aims for Nurse's Log to meet WCAG 2.1 Level AA.

## Status

Nurse's Log **has not had a formal third-party accessibility audit**, and a VPAT (Accessibility Conformance Report) has not been completed yet. This statement describes the design choices made so far, not a certified result.

## What has been done

- Pages are built from standard HTML controls (buttons, links, form fields, tables) with labels, so screen readers and keyboards work with them.
- Icon-only buttons have text labels for screen readers.
- Dialogs open with focus inside them and close with Escape.
- Light and dark themes follow the computer's setting.
- Text can be enlarged with the browser's zoom, and the layout adapts to phone screens.
- Dictation lets staff fill in forms by speaking (needs the district's own OpenAI key).

## Known gaps

- Not yet tested end to end with JAWS, NVDA or VoiceOver.
- Color contrast has not been measured on every screen.
- Calendar views may not have a full text equivalent.

## Feedback

Report an accessibility problem from Settings > Feedback or by email to hi@c3dprints.com.
