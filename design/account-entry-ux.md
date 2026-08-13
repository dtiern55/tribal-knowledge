# Account entry UX decisions

These decisions resolve the entry-flow questions in #353 without changing authentication or authorization behavior.

## Entry destinations

- A returning member sees a neutral session-restoration state, then goes directly to My Season.
- A signed-out invitee creates an account or signs in. If email confirmation is required, the confirmation message keeps them on Sign in with a clear next step.
- An authenticated account without a league profile goes to Join. Successful joining refreshes the server profile and continues to My Season.

The current product has one private Tribal Knowledge league context, not a league switcher. Join therefore asks for the commissioner-provided code without inventing league selection.

## Profile hierarchy

- **League profile** is the essential setting: the display name other players see.
- **Account identity** shows the signed-in email and keeps email/password changes secondary and collapsed.
- Device installation is a separate convenience and only appears when actionable.

Account email and league display name must not be presented as the same identity. League membership remains server-authoritative; these screens do not weaken any route or API authorization.

## Feedback and form behavior

- Restoration, submitting, error, confirmation, saved, and unchanged states are explicit.
- Errors use an alert associated with the relevant form; confirmations use a status message.
- Email, password, name, and join-code fields declare appropriate autocomplete, capitalization, and spellcheck behavior for mobile keyboards and password managers.
