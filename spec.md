# Junior Cross Country League — Scoring App Design

## Overview

Replaces a paper + Excel workflow for a junior school cross-country league. Teachers currently write down each of their runners' finishing positions on paper and hand it to a central scorer, who transcribes everything into Excel. This app digitises entry (mobile web form per school, per race) and automates individual, team, and season scoring.

The league runs races split by **year group** (Reception–Year 6) and **gender**, across a season of multiple **events** (meet days). Each event contains multiple **races** (one per year-group/gender combination).

## Stack

- **Next.js** on **Vercel** — one app, two main surfaces:
  - `/submit/[token]` — teacher-facing entry form (mobile-first, minimal UI)
  - `/admin` — scorer-facing admin (results review, corrections, roster/merge tools), behind basic auth
  - `/results/*` and `/standings` — public read-only pages
- **Neon (Postgres)** for storage, with `pg_trgm` enabled for fuzzy name search/dedup
- Server actions / route handlers writing directly to Neon — no queue or websocket layer needed at this scale (a few hundred result rows per meet)
- Scores are **computed on read from live data only while a race is open** (for the admin correction view). On close, results are computed once and **written to a permanent snapshot** — see "Publishing & immutability" below. Public pages and season standings always read from that snapshot, never from live joins, once a race is closed.

## Data model

```sql
schools (
  id, name
)

seasons (
  id, name,
  min_races_required INT DEFAULT 4   -- editable by admin at any time; races that count
                                       -- are recomputed against the *current* value on
                                       -- every read (see Season Standings below)
)

events (
  id, season_id, name, date, location
)

races (
  id, event_id, year_group, gender,
  status ENUM('open', 'closed', 'cancelled'),
  UNIQUE (event_id, year_group, gender)
)
-- open       -> teacher form live and editable
-- closed     -> form locks; results computed and shown on public page; admin can still edit
-- cancelled  -> never had results; excluded from public page and from standings' "races
--               completed" count entirely (e.g. weather cancellations)

runners (
  id, school_id, name
  -- school_id here = the runner's *current/default* school, used to pre-populate a
  -- teacher's roster picker. NOT the source of truth for which school a runner ran
  -- for in a given race — that's always results.school_id (see Transfers below).
)

runner_aliases (
  runner_id, alias
  -- populated automatically when two runner records are merged (see Name Variants
  -- below); also improves fuzzy search matching future near-duplicate entries
)

results (
  id, race_id, runner_id, school_id,   -- school_id = which school this runner ran
                                         -- for IN THIS RACE (historical, immutable)
  position INT,
  submitted_by, created_at, updated_at,
  UNIQUE (race_id, runner_id)
  -- NOTE: position is intentionally NOT unique per race — duplicate positions
  -- across schools are expected input errors, not blocked at the DB level.
  -- They're surfaced as conflicts in the admin UI instead (see below).
)

submission_tokens (
  id, race_id, school_id, token (UUID), expires_at
  -- one token = one school's access to one race's entry form. Valid while the race
  -- is 'open'; becomes read-only once the race is 'closed'.
)

published_individual_results (
  id, race_id, event_id, season_id, year_group, gender,
  runner_id,      -- soft reference, ON DELETE SET NULL — safe to prune runners later
  runner_name,    -- frozen at publish time, independent of runner_id
  school_id,      -- soft reference, ON DELETE SET NULL
  school_name,    -- frozen at publish time
  position,
  published_at
)

published_team_results (
  id, race_id, event_id, season_id, year_group, gender,
  school_id,      -- soft reference, ON DELETE SET NULL
  school_name,    -- frozen at publish time
  scoring_count, score_sum, rank,
  published_at
)
```

These two tables are the permanent historical record, written once when a race is published (closed). Because `runner_name`/`school_name` are frozen strings rather than live joins, `results`, `runners`, and `schools` can be pruned in future seasons without touching what's already published.

## Race lifecycle

`open → closed` (or `→ cancelled` if the race never happened).

- **open**: teacher's tokenised form is live and freely editable — they can resubmit/correct their own entries any time before closing.
- **closed**: form locks ("results submitted, contact the scorer for changes"); race appears on the public results page. The scorer/admin can still edit results after this point to fix a late-spotted error — this is a normal edit, not a special workflow. The public page just re-renders from current data, so a post-publish correction is transparent.
- **cancelled**: e.g. weather. No results ever entered. Excluded from the public page. Excluded from every runner's "races completed" count for season-standings qualification purposes.

There is **no third "reopen" state modeled** — if a closed race needs to accept new teacher submissions again, that's just flipping status back to `open` (a normal admin action, not a distinct lifecycle state).

### Publishing & immutability

Closing a race triggers a **publish** step, not just a status flip: individual and team scoring is computed once from the live `results` table and written into `published_individual_results` / `published_team_results`. From that point on:

- The public page and season standings read **only** from the published tables — never from live `results`/`runners`/`schools` — so they're unaffected by later transfers, merges, or pruning, and there's no live-join bug risk on historical data.
- Published rows are permanent. The source tables can be safely pruned in later seasons without losing anything already published.
- The source `results` row for a closed race can, in theory, still be edited by the admin afterward for record-keeping accuracy — but this does **not** automatically regenerate the published snapshot. An explicit **republish** admin action re-runs the computation and overwrites that race's published rows. Nothing recalculates on every read anymore.

## Entry flow (teachers)

No login system. Each school gets a unique tokenised link per race (`/submit/[token]`), distributed by text/email/QR code ahead of the meet.

The form:

- Scoped to that school + that race
- Runner picker defaults to that school's roster, but supports fuzzy search **across all runners in the league**, not just this school's — needed to handle mid-season transfers (a teacher entering a kid who just joined their school but hasn't been re-homed in the roster yet)
- Supports quick-adding a brand new runner not in the system at all
- Each row: runner + finishing position (plain integer, no validation against other schools' entries — duplicates are allowed at entry time and resolved centrally)
- Freely re-editable while the race is `open`; locks to read-only once `closed`

## Admin (scorer) views

**Race results / correction view**: for any race, a single merged table of all submitted results sorted by position, with:

- Duplicate positions highlighted (e.g. red) — two schools claimed the same place
- Gaps in the sequence highlighted (e.g. amber) — optional, informational only
- Inline click-to-edit on any position or runner
- This IS the correction tool — no separate "review conflicts" workflow, just the same table with problems visually flagged. Nothing here is ever blocking; it's purely to help the scorer spot and fix mistakes quickly before/after closing the race.

**Roster / merge tool** (name variants, e.g. "Tom" vs "Thomas"):

- A view listing runners at the same school with similar names (via `pg_trgm` similarity against the roster) as merge candidates — surfaced proactively so duplicates get caught before standings are published, not after
- Merge action: pick two runner records that are the same kid, choose the canonical one, merge — reassigns every `results` row from the duplicate's `runner_id` to the canonical `runner_id`, records the duplicate's name into `runner_aliases` (for audit trail + future search matching), then deletes the duplicate runner record
- Simple rename (no merge) also supported directly on a runner record, for a typo that was never entered as two separate rows

**Race status controls**: open/close/cancel a race; edit `season.min_races_required`.

## Scoring logic

All computed on read from `results`, joined against `races`/`schools`/`runners` as needed.

### Individual (per race)

Sort that race's `results` by `position` ascending. That's the full result.

### Team (per race, per school — scoring is per-race, never aggregated across year groups/genders)

```
for each school's results within this race:
    scorers = results sorted by position ascending, take first 4
    scoringCount = min(4, count of that school's finishers in this race)
    scoreSum = sum(positions of scorers)

rank teams by:
    1. scoringCount DESC   (a team of 4 always beats a team of 3, regardless of scoreSum —
                            this is a two-key sort, not a special case)
    2. scoreSum ASC        (lower wins; only a tiebreaker within equal scoringCount)
```

Minimum finishers to field a scoring team: **1**. A school with even a single finisher still gets a team score/rank (`scoringCount = 1`) — they'll almost always be outranked by schools with more finishers, which is the intended effect: count every school that shows up rather than exclude the small ones, and let the `scoringCount`-first sort do the incentivising. No configurable floor needed.

### Season standings (individual only — there is no season-long team standing)

```
for each runner, within their (year_group, gender):
    racesCompleted = count of that runner's rows in published_individual_results, this season
    if racesCompleted >= season.min_races_required:
        include in standings
        total = sum of points/positions across those published rows (see below)
    else:
        excluded — optionally shown in a separate "not yet qualified" list
```

Note this reads from `published_individual_results`, not live `results` — so it's automatically immune to future pruning of the live tables, and unaffected by any post-close edits that haven't been explicitly republished.

- `min_races_required` is a plain editable number on `seasons`, defaulting to 4, lowered by the admin as needed (e.g. after weather cancellations). **Changes apply retroactively** — the whole standings table recomputes against whatever the current value is on every view, since nothing is pre-aggregated. This means a runner who was "not qualified" last week can appear this week purely because the threshold changed, with no new race run — confirmed as intended behaviour.
- **Open decision:** points system per race — not yet decided between:
  - _Sum of raw positions_ (lower total wins) — simplest, but unfair across races with different field sizes
  - _Points-for-place_: `points = fieldSize − position + 1` (higher total wins) — standard for most school XC leagues, rewards a good finish in a bigger field more than the same finish in a small one

  Recommend points-for-place unless the league has historical precedent doing it the other way. **Needs a decision before season-standings code is written**, as it changes both the storage-free formula and the "higher/lower is better" sort direction.

- **Open decision:** does a runner's `(year_group, gender)` category ever need to be locked at the point they're entered into a race, vs read live off a mutable roster field? Only matters if categories can change mid-season (e.g. school-year rollover). If runners only ever move up a year group between seasons, not within one, this is a non-issue and category can be read live.
- **Open decision:** does the season standings table exist per (year_group, gender), or is there also a cross-category component? Assume per (year_group, gender) only, matching how races are structured, unless told otherwise.

## Transfers between schools

Handled by the schema as-is, no special-casing needed:

- `results.school_id` captures which school a runner ran for **in that specific race**, independent of the runner's current default school on their `runners` record.
- A transfer mid-season means a runner's results simply have different `school_id` values across races — earlier team scores are never retroactively altered, since they're computed per-race from that race's own `school_id`.
- Public results pages must always join on `results.school_id` (the historical value), **never** on the runner's current/default school — otherwise a transfer would silently rewrite which school old results are credited to. This is an easy bug to introduce by joining the wrong column; flagging explicitly for the build.
- Individual season standings don't reference school at all, so transfers don't affect them either way.

## Public pages

- `/results/[eventId]` — list of races in that event; only races with status `closed` are shown
- `/results/[raceId]` — individual + team results for that race (same computation as admin, minus edit controls)
- `/standings` — season-long individual standings, per (year_group, gender), respecting `min_races_required` as above

## Summary of open decisions (need answers before/during build)

1. Points-for-place vs sum-of-positions for season standings (recommend points-for-place).
2. Whether year-group/gender category needs to be locked per-race or can be read live off the roster.
3. Confirm season standings are per (year_group, gender) only, not also aggregated across categories.
4. Republish behaviour: should editing a closed race's source result ever auto-regenerate the published snapshot, or always require an explicit "republish" action (current assumption)? Should the admin UI warn when live `results` for a closed race have diverged from what's currently published?
5. Pruning specifics: how long should `results`/`runners`/`schools` data stay live before pruning, and is pruning a manual admin action or something scheduled?
