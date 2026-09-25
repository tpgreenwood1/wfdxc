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

- **Next.js App Router**, four surfaces: `/submit/[token]` (tokenised per-race teacher entry form, no login), `/hub/[token]` (tokenised per-school-per-event landing page linking to that school's races, no login), `/admin/*` (scorer admin), and public read-only `/results`, `/results/[id]` + `/standings`.
- `/admin/*` is gated by HTTP Basic Auth in `middleware.ts` (matcher `/admin/:path*`) against `ADMIN_USER`/`ADMIN_PASSWORD` — not a real session/auth system.
- DB access is via Drizzle ORM (`db/schema.ts`, `db/client.ts`) against Neon, using the **Pool-based neon-serverless driver over WebSockets** rather than neon-http — required because `publishRace`/`mergeRunners` need real interactive transactions (a SELECT gating a later INSERT/DELETE in one atomic unit), which the HTTP driver can't do. Don't swap this for neon-http without checking those call sites.
- Business logic lives in `lib/*.ts`, not inline in route handlers/actions: `runners.ts` (fuzzy search, quick-add, rename, merge — all pg_trgm-backed), `races.ts`, `results.ts`, `events.ts`, `tokens.ts`, `hubTokens.ts`, `scoring.ts`, `standings.ts`, `standings-query.ts`, `publish.ts`, `public-results.ts`.
- **Two token systems, one layered on the other**: `submission_tokens` is one row per (race, school) — the original per-race entry-form link. `event_school_tokens` (`lib/hubTokens.ts`) is one row per (event, school) — a single link a school reuses across every race in that event, resolved by `/hub/[token]`. Hub tokens are created lazily via get-or-create, not pre-generated at event setup, and the hub page itself lazily creates any missing per-race `submission_tokens` row so the link stays valid even for races added to the event after it was sent out. Regenerating a school's hub token (admin links grid, `app/admin/events/[eventId]/links/`) only invalidates that school's link, not its per-race tokens.
- **Two different "school" fields on a runner — do not conflate them**: `runners.school_id` is just the runner's current/default school, used to pre-populate a teacher's roster picker. `results.school_id` is which school the runner actually ran for *in that specific race*, and is the only correct field to join on for historical/public data. Always join on `results.school_id`, never on the runner's current school, or a mid-season transfer will silently rewrite which school old results are credited to.
- **Publish/snapshot model**: closing a race (`races.status`: `open → closed`) runs an explicit publish step (`lib/publish.ts`) that computes individual + team scoring once from live `results` and writes permanent rows into `published_individual_results` / `published_team_results`. Once a race is closed, public pages and season standings read **only** from those published tables, never from live joins. Editing a closed race's results afterward does **not** auto-regenerate the snapshot — republishing is a separate explicit admin action.

## Testing

- vitest, `node` environment, `@` path alias resolves to the project root (see `vitest.config.ts`).
- `tests/scoring.test.ts` and `tests/standings.test.ts` cover `lib/scoring.ts` and `lib/standings.ts`.
