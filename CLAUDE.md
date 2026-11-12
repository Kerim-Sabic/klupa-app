# Klupa — project instructions

Klupa is a phone-first tool for volunteer youth football coaches: record a match, read the evidence honestly, plan a session that fits, and share minutes and practice fairly. Built for the Sarajevo Sports Analytics Hackathon; feature freeze is Thursday 12 November 2026, 14:00.

Read `docs/PLAN.md` before any work. It holds scope, order of work, the cut list and the ProdReady targets.

## Commands

- `npm run dev` — dev server on http://localhost:5173
- `npm run verify` — typecheck, lint, format check, tests with coverage gate, build. Must pass before every commit.
- `npm run test:watch` — tests while developing

## Rules that protect the score

The app is judged by ProdReady (118 detectors, hard grade caps) and by a jury. These rules exist because one critical finding costs 8 points and can cap the grade.

- **Database:** every table has `club_id`, a foreign key to its parent, and row-level security enabled and forced. Status columns are enums. Schema changes are migrations in `supabase/migrations/`, never dashboard edits. Every new table ships with a two-club isolation test.
- **Secrets:** the service-role key never appears in `src/` or in any `VITE_` variable. Nothing secret is committed. Required environment variables are validated at start-up and the app refuses to run without them; no development fallbacks.
- **Text:** every user-facing string lives in `src/i18n/locales/bs.json` and `en.json`. The parity test fails if a key is missing in either.
- **Tests:** new code ships with tests. The coverage gate (90% lines, 85% branches) is never lowered. The golden tests in `src/engine/__tests__/momentum.golden.test.ts` pin the research numbers; if one fails, the code is wrong, not the test.
- **Honesty:** the engine never looks ahead of the moment being read, never invents events, and never hides the `insufficient`, `window-sensitive` or `event-sensitive` states. No screen ranks children by ability or predicts injury.
- **Children's data:** players are a label and a shirt number. No real names, birth dates or photos, in code, fixtures or demo data.
- **Code shape:** files stay under 300 lines. No `TODO` or `FIXME`: record the decision in `docs/adr/` instead. No `console` calls. No `any`.
- **Dependencies:** `npm audit` must report zero advisories. Never use `--legacy-peer-deps` or `--force`.

## Workflow

- One milestone per session, in the order of `docs/PLAN.md` section 6.
- Work on a branch, open a pull request, merge only when CI is green. Conventional commit messages.
- At the end of each milestone run the ProdReady scan and fix every finding before starting the next milestone. Save each report summary under `docs/prodready/`.
- Report what was actually run and seen. A check that was not run is "not verified", never "passing".
