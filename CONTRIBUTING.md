# Contributing

Klupa is small on purpose. A change is welcome when it makes a coach's evening easier or makes the code simpler, and it arrives the same way every time.

## Set up

```bash
npm ci
```

```bash
cp env.example .env.local
```

Fill in the project URL and the publishable key (never a secret key: the app refuses to start with one). Then:

```bash
npm run dev
```

`npm ci` also copies the on-device vision runtime into `public/vision/` (it is build output, not source).

## A database of your own

You do not need access to the live project to work on the schema. With Docker running:

```bash
npx supabase start
```

That starts a local Postgres with sign-in and applies every file in `supabase/migrations/` from scratch. It prints a local URL and a publishable key for `.env.local`. To throw the data away and re-apply the migrations:

```bash
npx supabase db reset
```

The three database test files run against any database inside a transaction that rolls back, so they leave nothing behind. With the local stack's connection settings in the usual `PG*` environment variables:

```bash
psql -v ON_ERROR_STOP=1 -f supabase/tests/isolation.sql
```

```bash
psql -v ON_ERROR_STOP=1 -f supabase/tests/atomic_writes.sql
```

```bash
psql -v ON_ERROR_STOP=1 -f supabase/tests/field_errors.sql
```

## Before you open a pull request

```bash
npm run verify
```

It runs the type check, lint with zero warnings, the format check, every unit test with the coverage gate (90% lines, 85% branches), a production build, and a measurement of that build against its size budget (`npm run size`: what a first visit downloads, and the largest chunk fetched on demand). CI runs the same, plus a secret scan over the full history, the migrations and database tests from scratch, and the browser tests on a phone and a desktop.

## How a change travels

1. **A branch per change**, named for what it does (`fix/…`, `feat/…`, `chore/…`). Keep it to one idea; if the description needs "and", it is two pull requests.
2. **A pull request** using the template: what changed, why, how it was checked, how to undo it. Screens need a before and after.
3. **CI green, and a review when there is someone to give it.** `.github/CODEOWNERS` names who must look. Today the project has one maintainer, so pull requests so far were merged by their author with CI as the only gate. That is a known gap, not the rule: with a second maintainer, nobody merges their own unreviewed change to `main`.
4. **Merge with a merge commit**, so the history shows which commits arrived together.
5. **The deploy follows the merge.** The smoke test then checks that the live site serves that commit, that the security headers are present and that `/api/health` reaches the database and the sign-in service.

## Changing the database

- Add a file to `supabase/migrations/`; never edit the schema in the dashboard, and never edit a migration that has been applied (comments and formatting aside).
- The database goes first, then the client. A phone may run the previous release for a while, so a migration must not break it: add, do not rename; keep an old function for one release when its replacement has a new shape (`docs/API.md`).
- Say in the pull request how to undo it. Migrations roll forward: the undo is another migration.
- Add or extend a test in `supabase/tests/` when the change is a rule (who may do what, what must hold).
- Regenerate the types with `npm run db:types`.

## Releasing

1. Move the entries under "Unreleased" in `CHANGELOG.md` to a new version heading, and set the same version in `package.json`.
2. After the merge, tag the merge commit `vX.Y.Z` and publish a release with the changelog entry as its notes.
3. If the release is bad: in the host, promote the previous deployment (`docs/RUNBOOK.md`, Rollback). A feature can also be switched off without a code change (`src/lib/flags.ts`).

## House rules

- No TypeScript file over 300 lines of code; the linter enforces it. Research scripts in Python are kept under 500 lines by hand.
- No `console`, no `any`, no skipped tests.
- Every sentence a coach reads exists in Bosnian and English.
- A player is a label and a shirt number. Do not add a field about a child without a decision record in `docs/adr/`.
- Numbers the app shows come from tested, pure functions in `src/engine/` or a feature's model file, never from a component.
