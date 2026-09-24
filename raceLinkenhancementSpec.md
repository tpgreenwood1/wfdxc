# Feature spec: distribution links for teacher entry forms

## Problem

Each school's submission access is currently a single opaque token per (school, race). This makes two things hard in practice:

- **Admins** have no single view of every entry link for a school across all the races in an event.
- **Distribution** to teachers means sending one link per race, per school — fiddly, and easy to lose track of which link is which.

## Goal

Introduce a second, higher-level link — one per (school, event) — that a teacher can open to reach every race form for their school at that event. Admins distribute exactly one link per school per event. The existing per-race link keeps working underneath, for one-off resends.

## Design

### New table

```sql
event_school_tokens (
  id, event_id, school_id, token (UUID), created_at
)
```

One row per (school, event). Created lazily — on first request for that school+event, not pre-generated when the event is set up.

### Hub page — `/hub/[token]`

Resolves the token to (event, school). Renders a list of every race in that event, each row showing:

- Race name (year group + gender)
- Race status: open / closed
- This school's submission status for that race — derive from whether any `results` rows exist for this (school, race); show as "not started" / "submitted"
- If open: button through to that race's entry form. If the underlying per-race `submission_tokens` row doesn't exist yet for this school+race, create it on the fly rather than requiring it to pre-exist — this is what makes the hub link stay valid even for races added to the event after the link was already sent out.
- If closed: read-only row, linking to that race's public results page instead of a form

One hub link is shared by all teachers at a school — e.g. the Reception teacher and the Year 6 teacher both use the same link and just navigate to their own race from the list. No per-teacher or per-year-group scoping needed.

### Admin page — `/admin/events/[eventId]/links`

A schools × races grid for the event:

- Each cell: that school's submission status for that race, plus a copy-link button for that specific race's token (for chasing one school on one race without resending everything)
- Each school row also has:
  - **Copy hub link** — the single link actually sent to the school for this event
  - **Regenerate** — invalidates the school's current hub token and issues a new one (for a leaked/misdirected link), without affecting any other school's link

### Distribution

Manual for v1: admin copies each school's hub link from the grid into whatever email/text/QR tool is already used to reach teachers. A CSV export (school name + hub link) for mail-merge is a reasonable next step if one-at-a-time copying becomes a bottleneck — no need to build in-app sending unless that turns out to be a real problem.

## Out of scope / explicitly not doing

- No per-teacher or per-year-group link scoping — confirmed one shared hub link per school is acceptable.
- No in-app email/SMS sending in v1 — links are copied out manually.
- No change to how the existing per-race `submission_tokens` / entry form work — this feature sits on top of it, doesn't replace it.
