# UX foundation

This document defines the shared interaction and layout conventions for the
app-wide UX pass tracked by #358. It complements the product rules in
`../fantasy-survivor-design.md`; it does not change gameplay.

## Baseline audit

The #352 audit found four shared problems in the shipped shell: keyboard users
had no skip link or consistent focus indicator; the closed menu kept focusable
controls off-screen; primary mobile navigation did not account for device safe
areas; and route titles, context, errors, and empty states were implemented
independently. The first foundation pass addresses those concerns without
pulling page-specific redesign decisions forward.

The remaining routed surfaces have these primary jobs and owners:

| Surface | Primary job | UX workstream |
| --- | --- | --- |
| My Season | Make or review the current episode decisions and result | #327 |
| Standings | Understand the league race | #354 |
| Team | Explain how a player earned their position | #354 |
| Cast | Browse the season's castaways and status | #355 |
| Contestant | Understand one castaway's season and scoring | #355 |
| Login / Join | Enter the correct account and league state | #353 |
| Profile | Manage account identity and preferences | #353 |
| Rules | Understand the current season's game | #356 |
| Admin | Complete the next safe commissioner operation | #357 |

Cross-surface findings are handled here. Information hierarchy, state
inventories, and responsive composition specific to a surface stay with its
workstream so the foundation does not become a generic redesign of everything.

## Product hierarchy

Every routed surface should state one primary job before implementation. The
page composition should lead with that job, then supporting context, then
history or reference material. A state change may change the composition; it
should not be represented only by a badge or a disabled copy of an editable
screen.

Do not make every concept a card. Use spacing, headings, dividers, and columns
first. Reserve a bordered or filled container for a meaningful grouping,
decision, notice, or result.

## App shell

- The header carries identity, desktop primary navigation, and the menu.
- The mobile tab bar carries the same primary destinations and accounts for
  device safe areas. Secondary destinations live in the menu.
- Primary destinations use a minimum 44px interaction target.
- A skip link precedes navigation, and the main region is programmatically
  focusable.
- The menu is a modal drawer while open: background content does not receive
  focus or scroll, Escape closes it, Tab stays inside it, and focus returns to
  the trigger.

## Page composition

- App shell content uses a shared `max-w-6xl` container with responsive side
  padding. Pages can introduce a narrower inner measure when their content
  benefits from it.
- Use `PageHeader` for ordinary page title, context, description, and actions.
  Bespoke stateful surfaces such as My Season may own a more expressive header
  when the state itself is the page's primary information.
- Keep one `h1` per route. Subsequent headings should follow a meaningful
  hierarchy rather than styling a generic label as a heading.
- Mobile is a complete vertical reading and action order. Desktop may recompose
  that order into columns when the relationship is clear; it should not merely
  widen the mobile stack.

## Feedback and state

- Use `PageLoader` for route-level asynchronous loading. Its delay prevents a
  flash during fast loads.
- Use `Notice` for route-level errors, empty states, and durable informational
  feedback. Error notices use `role="alert"`; other notices use `role="status"`.
- Form errors belong beside the affected control when possible. A page notice
  can summarize a failed request but should not replace useful field feedback.
- Saving, saved, dirty, locked, pending, and completed must be distinguishable
  in copy as well as color.
- Empty and unavailable states should explain the next useful action when one
  exists.

## Accessibility baseline

- All interactive elements need a visible `:focus-visible` treatment.
- Icon-only buttons require an accessible name.
- Touch targets should be at least 44 by 44 CSS pixels for primary controls.
- Color is never the only carrier of status.
- Respect reduced-motion preferences for nonessential animation.
- Verify keyboard order, semantic headings, accessible names, contrast, and
  overflow at 320px during each surface pass.

## Representative verification

For shared-shell or responsive changes, verify at minimum:

- 320 x 568 (small phone)
- 768 x 1024 (tablet)
- 1280 x 800 (desktop)

Automated tests should cover semantics and state transitions that are stable in
the DOM. Visual composition and overflow still require a rendered browser pass.
