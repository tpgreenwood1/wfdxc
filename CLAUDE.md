# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Local environment

- Node and npm are **not on PATH** in this environment's shell tools (Bash/PowerShell). They're installed at `C:\Program Files\nodejs\` (node v24.11.1, npm 10.2.4). Before running `npm`/`npx`/`node` in a PowerShell command, prepend it to PATH for that session:
  ```powershell
  $env:PATH = "C:\Program Files\nodejs;" + $env:PATH
  ```
- Package manager is npm (`package-lock.json` is present, no yarn/pnpm lockfile).
- `DATABASE_URL` (a real Neon connection string) and admin basic-auth creds live in `.env`, which is gitignored — see `.env.example` for the required keys (`DATABASE_URL`, `ADMIN_USER`, `ADMIN_PASSWORD`).

## Commands

- Install deps: `npm install`
- Dev server: `npm run dev`
- Production build / start: `npm run build` / `npm run start`
- Typecheck: `npm run typecheck` (`tsc --noEmit`, no separate lint script exists)
- Tests: `npm test` (vitest run). Single file: `npx vitest run tests/scoring.test.ts`. Watch mode: `npx vitest`
- DB schema push (dev, no migration file): `npm run db:push`
- DB migration generate / apply: `npm run db:generate` / `npm run db:migrate`
- Seed runners + schools from a text file: `npm run db:seed` (reads `dbNameSeed.txt` by default; pass a different path as `npm run db:seed -- path/to/file.txt`). Format is tab- or comma-separated `Name<TAB>School` per line, header row optional, `#` comments allowed. Idempotent — matches existing schools/runners case-insensitively rather than duplicating.

## Deploy

- Target is Vercel running the Next.js app directly (per `spec.md`) — no `vercel.json` in the repo, so it relies on Vercel's zero-config Next.js detection against the connected git repo.
- Required environment variables in the Vercel project settings: `DATABASE_URL` (Neon), `ADMIN_USER`, `ADMIN_PASSWORD`.
- Neon Postgres is the only external service dependency; the `pg_trgm` extension is enabled via migration `db/migrations/0001_enable_trgm.sql` and is required for fuzzy runner-name search/merge.

## Architecture

`spec.md` is the design source of truth (data model, scoring rules, lifecycle) — read it for anything not obvious from the code. It also lists still-open decisions (points-for-place vs sum-of-positions, etc.) that aren't yet resolved in code. `raceLinkenhancementSpec.md` specs the hub-link feature described below.

- **Next.js App Router**, surfaces: `/school/[slug]` (the teacher home page — Races / Runners / Results tabs plus `/school/[slug]/race/[raceId]` entry, unlocked by a school access code), `/submit/[token]` (older tokenised per-race entry form, still works), `/hub/[token]` (older per-event link — now just a route handler that unlocks the school page and redirects to it), `/admin/*` (scorer admin), and public read-only `/results`, `/results/[id]` + `/standings`.
- **School home page access** (`lib/schoolAccess.ts`, `lib/schools.ts`): each school has a stable `slug` and a 6-char `access_code`. Unlocking (typing the code, opening `/school/[slug]/join?code=…` — the "teacher link" copied from `/admin` — or opening a valid hub link) sets an httpOnly cookie `xc_school_<schoolId>` holding the code; it's compared to the DB on every request, so regenerating the code in admin logs out every device. Every school page calls `loadSchoolForPage` and renders `CodeGate` without access; every school server action calls `requireSchoolAccess`. Always create schools via `createSchool()` so they get a slug + code. `xc_last_school` is a non-secret convenience cookie for the "My school" shortcut only.
- Teacher result saving goes through `saveSchoolResult` (one row) / `deleteResultForSchool` in `lib/results.ts` for both entry paths; the delete is scoped to (result, race, school) so a teacher can't delete another school's result. `app/components/SubmitForm.tsx` takes its save-row/remove/rename/search-other-schools actions as bound props and **autosaves each row** (on Enter, blur, or a 700 ms pause) through a per-row promise chain — so a quick-added runner is created once and a removal waits for an in-flight save. There is no Save button.
- The entry form's runner picker filters the school's own roster **client-side** (`lib/rosterFilter.ts`, pure, tested). League-wide fuzzy search only runs when the teacher taps "Search other schools" (`searchOtherSchools` in `lib/runners.ts`, for transfers). The admin's search endpoint lives at `/admin/api/runners/search` so the basic-auth middleware covers it — don't put runner search back under a public `/api` path.
- Teacher-facing server actions (school page and `/submit/[token]`) return `ActionResult` (`lib/actionResult.ts`: `{ error }` instead of throwing), same reason as the admin ones.
- **Admin surfaces** (`app/admin/layout.tsx` tab bar): **Today** (`/admin` — current event's progress, places to check, schools to chase), **Events** (`/admin/events`, and `/admin/events/[id]` race-day board with Races / Schools-chase views and bulk "finalise ready races"), `/admin/races/[id]` (correction page), **Schools** (links, codes, Share), **Runners** (`/admin/runners` search + possible transfers, `/admin/runners/[id]` history / ran-for school / merge), **Setup** (seasons, new event with race picker). `/admin/roster` just redirects to Runners. Event-level data for the board/dashboard comes from `getEventBoard` (`lib/eventBoard.ts`) so "ready" means the same thing everywhere.
- **Race issues & readiness**: `lib/raceIssues.ts` (pure) flags duplicate and missing places; the admin can accept them via `race_position_acks` ('tie' = both runners keep the place, the league rule; 'gap' = no league runner there). `lib/raceSchoolStatus.ts` holds per-(race, school) confirmations in `race_school_status` ('done' / 'no_runners', set by the teacher's "No runners" / "We're done" buttons or the admin), which is how the chase list tells "not entered yet" from "had no runners". A race is ready to finalise when it has results, no unaccepted issues, and no school that's neither entered nor confirmed.
- **Moving runners** on the admin race table (drag the ⠿ handle, or tap it then tap a target; `@dnd-kit/core`) goes through `lib/positionOps.ts` (pure, tested): a change is a list of `set`/`shift` steps that the client applies optimistically and `applyPositionSteps` (`lib/races.ts`) re-applies server-side in one locked transaction via `movePositionsAction`. Shifts carry accepted ties/gaps with them and refuse to land on an occupied place; every change has an inverse, which is how the Undo bar works. Route any new position-editing feature through these steps rather than one-off `position` updates.
- **Help guides**: all how-to text lives in `lib/help.ts` (pure data, tested by `tests/help.test.ts`); `HelpButton` (`app/components/`) opens a page's guide(s) in a `<dialog>`, `/help` lists them all, and `SchoolHelp` picks the school tab's guide from the path. When you rename a button a guide mentions, update the guide too.
- Client components must import race labels/sorting from `lib/raceLabels.ts` (pure), not `lib/races.ts`, which pulls in the DB client.
- Admin server actions called from client components return `{ error }` rather than throwing — Next hides thrown messages in production.
- `/admin/*` is gated by HTTP Basic Auth in `middleware.ts` (matcher `/admin/:path*`) against `ADMIN_USER`/`ADMIN_PASSWORD` — not a real session/auth system.
- DB access is via Drizzle ORM (`db/schema.ts`, `db/client.ts`) against Neon, using the **Pool-based neon-serverless driver over WebSockets** rather than neon-http — required because `publishRace`/`mergeRunners` need real interactive transactions (a SELECT gating a later INSERT/DELETE in one atomic unit), which the HTTP driver can't do. Don't swap this for neon-http without checking those call sites.
- Business logic lives in `lib/*.ts`, not inline in route handlers/actions: `runners.ts` (fuzzy search, quick-add, rename, merge — all pg_trgm-backed), `races.ts`, `results.ts`, `events.ts`, `tokens.ts`, `hubTokens.ts`, `scoring.ts`, `standings.ts`, `standings-query.ts`, `publish.ts`, `public-results.ts`.
- **Two token systems, one layered on the other**: `submission_tokens` is one row per (race, school) — the original per-race entry-form link. `event_school_tokens` (`lib/hubTokens.ts`) is one row per (event, school) — a single link a school reuses across every race in that event, resolved by `/hub/[token]`. Hub tokens are created lazily via get-or-create, not pre-generated at event setup, and the hub page itself lazily creates any missing per-race `submission_tokens` row so the link stays valid even for races added to the event after it was sent out. Regenerating a school's hub token (admin links grid, `app/admin/events/[eventId]/links/`) only invalidates that school's link, not its per-race tokens.
- **Two different "school" fields on a runner — do not conflate them**: `runners.school_id` is just the runner's current/default school, used to pre-populate a teacher's roster picker. `results.school_id` is which school the runner actually ran for *in that specific race*, and is the only correct field to join on for historical/public data. Always join on `results.school_id`, never on the runner's current school, or a mid-season transfer will silently rewrite which school old results are credited to.
- **Publish/snapshot model**: closing a race (`races.status`: `open → closed`) runs an explicit publish step (`lib/publish.ts`) that computes individual + team scoring once from live `results` and writes permanent rows into `published_individual_results` / `published_team_results`. Once a race is closed, public pages and season standings read **only** from those published tables, never from live joins. Admin edits to a closed race **do** republish it immediately (`republishIfClosed`), and renaming/merging a runner republishes their closed races (`republishClosedRacesForRunner`) so frozen names stay correct. `mergeRunners` also repoints `published_individual_results.runner_id` (otherwise the ON DELETE SET NULL would drop the duplicate's races from standings) and refuses when both runners have a result in the same race.

## Testing

- vitest, `node` environment, `@` path alias resolves to the project root (see `vitest.config.ts`).
- `tests/scoring.test.ts` and `tests/standings.test.ts` cover `lib/scoring.ts` and `lib/standings.ts`; `tests/raceIssues.test.ts` covers duplicate/missing-place detection and race/school readiness (`lib/raceIssues.ts`, the pure parts of `lib/raceSchoolStatus.ts`).
