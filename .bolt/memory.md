# Project memory

## Product intent & audience

- App includes an admin-protected area gated by a password.
- General users interact with a chats feature; admin access is a separate mode.

## Brand personality & voice

- Practical, utility-focused app with a clean, polished UI.
- Admin experience leans toward restrained, professional styling.

## Visual design & UX direction

- Vite + React stack.
- Existing color scheme and spacing conventions are reused across new components; match them when adding UI.
- Admin login: centered card on full-height background, vertically and horizontally centered on all screen sizes.
- Card includes a shield icon badge, centered password field with subtle letter-spacing, full-width unlock button, and a back-to-chats link.
- Admin-denied styles already exist; new admin styles inserted adjacent to them.
- Responsive behavior: rely on flex centering for the gate rather than fixed dimensions.

## Decisions, constraints & rationale

- Admin gate has no dedicated CSS initially; redesign added dedicated markup + CSS rather than reusing generic form styles.
- Build must pass after edits; run build verification before considering work done.
- Watch for literal `\n` text accidentally introduced during edits; fix source rather than leaving escaped text in files.

## Open questions & assumptions

- No explicit design system or token file referenced; assuming convention-based consistency from existing styles.
- Admin password handling and auth flow details not yet inspected.
- `.bolt/prompt` is listed as none; global instructions may be added later and should take precedence.