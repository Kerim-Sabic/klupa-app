# Klupa

From match evidence to fair practice, for volunteer youth football coaches.

**Live:** https://klupa-pi.vercel.app · **The evidence behind it:** https://klupa-pi.vercel.app/evidence

A coach records a match in two taps per event, sees what the match showed and how far to trust it, plans a session that fits the players and pitch available, and keeps a fair record of who got minutes and practice. Bosnian and English. Works on a phone, at the touchline, with a poor signal.

One record, five answers:

| The coach does this          | Klupa answers                                                      | Challenge track   |
| ---------------------------- | ------------------------------------------------------------------ | ----------------- |
| Taps events during a match   | Who was on top, and can that be trusted?                           | Match momentum    |
| Picks a training focus       | A session that fits tonight's numbers, space and kit               | Smart coach       |
| Marks who played and trained | Who has not had a fair look yet? Is there a relative-age skew?     | Hidden talent     |
| Asks "how hard was it?"      | Whose training load jumped this week? (Never an injury prediction) | Training load     |
| Books the pitch              | How well is the pitch used, and what do the lights cost?           | Sustainable clubs |

## Against the five judging criteria

| Criterion                             | What Klupa brings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Where to see it                                                                                                                                                |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Relevance of the sports problem       | A volunteer coach of a youth team has no analyst, no tracking and no time. One record made in two taps an event answers five questions such a coach really has, one for each challenge track: who was on top, what to train, who has not had a fair look, whose load jumped, how the pitch is used.                                                                                                                                                                                                                    | The table above; "Try the demo club" on the front page opens a full season in two taps.                                                                        |
| Data quality and analytical soundness | Only open, licensed data: 1,941 professional matches of events and seven matches of tracking, both CC BY 4.0, with sources and checksums in the repository. The expected-goals model is trained on 45,287 shots and held out by match (log loss 0.280 against a 0.330 base rate). The research in Python and the engine in TypeScript were written separately and must agree count for count on every commit. A forecaster that made predictions worse was left out, and every reading says how far it can be trusted. | `/evidence` on the live site, `research/`, `src/engine/__tests__/momentum.scale.test.ts`, "Data and licences" below.                                           |
| Technical execution                   | 1,688 unit tests, browser tests on a phone and a desktop profile with accessibility checks in light and dark, 78 database checks (tenant isolation tried from the outside, all-or-nothing writes, retention), all on every change. The ProdReady scan scores 100 of 100 on release 0.4.1. Measured under load on the live site: 3,739 requests, none failed. Works offline at the touchline and sends when the signal returns.                                                                                         | [docs/READINESS.md](docs/READINESS.md), [docs/load](docs/load/README.md), [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), `/status` on the live site.            |
| Innovation and creativity             | The uncertainty is part of the product: no reading is shown without how far to trust it, because the 3-minute and the 10-minute view of the same match point at opposite teams 18.9% of the time when both have an opinion. Computer vision runs on the coach's own phone and sends nothing: a kick read as a skeleton, and players found, followed and split into teams over a match video. Any professional match can be watched "as live", and seven are replayed in 3D from tracking data.                         | `/overlay`, `/shot`, `/movement` and `/pro` on the live site, all open without an account.                                                                     |
| Feasibility, impact and inclusion     | It needs a phone and nothing else, and runs on free hosting. Bosnian and English throughout. A fairness ledger, a "second look" list of players who have not been watched enough, and a relative-age view exist so that the quiet child and the child born in December get minutes and attention. A child is a label and a shirt number: no names, birth dates or photos. Not yet tried with a real club over a season; what is unproven is listed.                                                                    | "Built to be trusted" below, [docs/PRIVACY.md](docs/PRIVACY.md), [docs/DEMO.md](docs/DEMO.md), "What is still open" in [docs/READINESS.md](docs/READINESS.md). |

## What makes it different

Every momentum chart hides a choice: how far back to look. We measured how much that choice matters.

- Across **1,941 professional matches**, the 3-minute and 10-minute views pointed at **opposite teams 18.9%** of the time when both had an opinion. Only **7.9%** of moments were agreed by every window and safe from a single-chance flip.
- Our expected-goals model (45,287 shots, held out by match) scores log loss **0.280** against a **0.330** base rate and is well calibrated. It runs in the browser from five numbers.
- A forecaster we tested made predictions worse, so it is not in the product.

The Python research and the TypeScript engine were written separately and agree count for count. That agreement is a test (`src/engine/__tests__/momentum.scale.test.ts`) that runs on every commit.

Limits we state on screen: every dataset is adult professional football, and no published study tests whether expected goals transfer to youth football. For youth teams the number is a chance-quality index, not a probability.

## Beyond the five answers

| What                 | What it does                                                                                                                                                                                                                                                                                                                                                                                       | The honest limit                                                                                                                                                                                                                                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Live match           | A match being recorded opens as a match centre on any signed-in member's phone: the score, who is on top as of the newest event and how far that can be trusted, the counts so far and the latest events. It follows the recording phone by itself.                                                                                                                                                | It knows the events, not the clock on the recording phone, so "now" is the newest event and the screen says so. The feed only says "something changed"; what is shown always comes from an ordinary read.                                                                                                                                                                               |
| Pro matches          | Every match of the 2018 World Cup and Euro 2016 (115) read by the same engine from open event data: the match in numbers, the chance-quality race, who was on top, the shot map, a passing network, territory and each goal's build-up replayed. Any match can be watched as live, with every section showing only what had happened by that minute.                                               | Event data has no off-ball positions. "Share of passes" is not possession time. The receiver of a pass is read from the next touch, and the turnover and box-entry rules are ours, written down in `src/features/pro/toReview.ts`.                                                                                                                                                      |
| Why the chances came | For each side, what was tagged in the 30 seconds before every shot: the ball won high, the other side losing it in its own half, a corner.                                                                                                                                                                                                                                                         | A pattern is named only with three or more chances and one lead-up behind half of them. Untagged build-up is counted as such, never guessed.                                                                                                                                                                                                                                            |
| Match replay         | Seven professional matches in 3D from open tracking data: 22 players drawn as figures that face the way they run, team shape, who controls which space, cameras from the side, from above, behind a goal and following the ball, a player's trail, speed and distance, who is sprinting right now, and a physical report per match (distance, high-speed distance, sprints, top speed per player). | It shows what the engine can read. A grassroots coach's own matches have no tracking data. The data file does not say who played at home, so the screen does not either.                                                                                                                                                                                                                |
| Shot lab             | A kick analysed on the phone from a short clip: the strike, knee and trunk angles, the standing foot, a 3D skeleton. Nothing is uploaded.                                                                                                                                                                                                                                                          | Checked on a generated kick and in tests, not yet on real match footage. Numbers that depend on estimated depth are marked.                                                                                                                                                                                                                                                             |
| Player overlay       | A coach's own match video, or the camera, with every player found, followed and marked by team over the picture: a ring at the feet in the colour of the shirts, a number, a short trail, and how many of each team are in view. It runs on the phone, and a browser test checks that nothing is sent anywhere while it does.                                                                      | Without calibrating the pitch it shows where players are in the picture, not where they are on the pitch: no distances, no speeds. Players who are small in the picture are often missed, the numbers are not shirt numbers, and kits of a similar colour are not split. Checked in tests and on one sample clip, not yet on a real match filmed from the touchline or on a real phone. |

## Built to be trusted

- **A child is a label and a shirt number.** The only age information is an optional birth quarter. No names, birth dates, photos or health records.
- **The database is the boundary.** Row-level security is forced on every table and tested by trying to break it: three test files, 78 checks, run from scratch in CI.
- **A write is whole or absent.** Planning a session, a substitution, a season import and every erasure are single database transactions; the browser issues no delete of its own.
- **It tells you when it is down, and when it is having a bad hour.** `/api/health` answers 200 only when the database and the sign-in service both answered; a scheduled monitor asks it once an hour and also raises an issue when error reports spike. The same numbers, with the page speed people actually got this week, are on the public `/status` page.
- **It tells us when it breaks.** A broken screen shows what happened instead of a blank page and files a report with ids, e-mail addresses and long numbers removed.
- **Measured under load.** Four runs against the live site and database. The latest, with nothing else using the database: 3,739 requests, none failed; 95% of reads within 146 ms and of writes within 344 ms ([docs/load](docs/load/README.md)).
- **Checked from the outside.** The ProdReady production-readiness scan scored 100 of 100, grade A, on release 0.2.0, again after 24,000 more lines and again on release 0.4.1. An 18-dimension due diligence by an independent reviewer scored 3.9 of 5 with nothing critical on the code just before the 0.3.0 redesign; the same reviewer re-scored releases 0.3.0 and 0.4.1 and no dimension moved, up or down. What it found, what was fixed and what is still open: [docs/READINESS.md](docs/READINESS.md).

## Run it

Requires Node 22.12 or newer.

```bash
npm ci
```

```bash
cp env.example .env.local
```

Fill in the two public Supabase values, then:

```bash
npm run dev
```

Open http://localhost:5173. The evidence page (`/evidence`) works without an account.

## Check it

| Command                                      | What it proves                                                                                                                 |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run verify`                             | Types, lint with zero warnings, formatting, every unit test with the coverage gate (90% lines, 85% branches), production build |
| `npm run test:integration`                   | The real data-access code against a real Supabase project, with a test account (19 scenarios, also run in CI)                  |
| `npm run e2e`                                | The whole coach journey in a real browser, plus accessibility checks                                                           |
| `psql … -f supabase/tests/isolation.sql`     | Two clubs cannot see or change each other's data (30 checks)                                                                   |
| `psql … -f supabase/tests/atomic_writes.sql` | Multi-row writes are all-or-nothing and obey the same tenant rules (30 checks)                                                 |
| `psql … -f supabase/tests/field_errors.sql`  | Error reports, page-speed samples, demo status and retention are enforced by the database (18 checks)                          |

CI runs these on every push, plus a secret scan and a job that rebuilds the database from its migrations. After each deploy a smoke test checks that the live site serves the commit that passed.

## How it is built

- **App:** React 19, TypeScript (strict), Vite, Tailwind. No application server.
- **Backend:** Supabase Postgres. Row-level security is enabled and forced on every table; the database also enforces the match state machine, write limits, the audit trail and retention.
- **Engine:** `src/engine/`, pure functions with exact integer arithmetic, property-tested.
- **Research:** `research/`, reproducible Python with a model card and a data card.

Start with [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). The four-minute walk-through is in [docs/DEMO.md](docs/DEMO.md), the contract between the app and the database in [docs/API.md](docs/API.md), and how to contribute in [CONTRIBUTING.md](CONTRIBUTING.md). Decisions are in [docs/adr/](docs/adr/), the threat model in [SECURITY.md](SECURITY.md), data protection in [docs/PRIVACY.md](docs/PRIVACY.md), operations in [docs/RUNBOOK.md](docs/RUNBOOK.md), and the design system in [docs/DESIGN.md](docs/DESIGN.md).

## Children's data

A player is a label and a shirt number. The only age information is an optional birth quarter. No names, birth dates, photos or health records are stored, the activity log records which fields changed and never their values, and a club can export or erase everything it holds.

## Data and attribution

- Demo matches: Bassek et al. (2025), "An integrated dataset of spatiotemporal and event data in elite soccer" (DFL), CC BY 4.0, doi:10.6084/m9.figshare.28196177.v1. Only shot time, side and provider xG are bundled.
- Model training, the large-scale study and the pro matches: Pappalardo et al. (2019), "A public data set of spatio-temporal match events in soccer competitions" (Wyscout), CC BY 4.0, doi:10.6084/m9.figshare.c.4415000. Derived shot tables are in `research/out/`; the 115 World Cup 2018 and Euro 2016 matches are in `public/data/pro/` in the compact form described in `research/pro/CONTRACT.md`, with what was dropped and why in `research/pro/DATA_CARD.md`.
- Match replays and physical reports: the same DFL dataset as the demo matches (Bassek et al., 2025, CC BY 4.0). Seven matches, resampled to four positions a second, in `public/data/tracking/`; the conversion and its checks are in `research/tracking/`.
- Facility reference values: Ember via Our World in Data (grid carbon intensity, Bosnia and Herzegovina, 2025) and BHAS (electricity prices, second half of 2025).

- Player overlay model: EfficientDet-Lite0 (Tan, Pang and Le, 2020) as published by Google MediaPipe, Apache-2.0. Served from `public/models/` exactly as downloaded; source and checksums are in `public/models/README.md`.
- Player overlay sample clip: "Group Of Elderly Men Playing A Game Of Soccer" by Pressmaster on Pexels (https://www.pexels.com/video/group-of-elderly-men-playing-a-game-of-soccer-3195366/), used under the Pexels licence, shortened to nine seconds and made smaller (`public/data/overlay/sample.mp4`). It shows adults and is the only footage of people in the repository; its source, licence and checksums are in `research/data/MANIFEST.json`.
- Front-page film: `public/media/replay.mp4` and its still `replay.jpg` are a recording of Klupa's own 3D replay, made by us from the DFL tracking data above (Bassek et al., 2025, CC BY 4.0). It is drawn figures on a drawn pitch; there is no broadcast picture in it.

The match data sets are professional matches used to build and check the engine. They are not evidence about grassroots football.
