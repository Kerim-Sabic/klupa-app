# Klupa — master plan (Project OMEGA)

Sarajevo Sports Analytics Hackathon, 11–13 November 2026. Build deadline: **Thursday 12 November, 16:00**. Jury pitch: Friday 13 November, 13:30.
Written Wednesday 11 November, 17:45. This file is the single source of truth for scope and order of work.

## 1. What we are building

**Klupa** ("the bench") is a phone-first tool for a volunteer youth coach who has one evening a week and no analyst.

> A coach records a match in two taps per event, sees what the match really showed and how far to trust it, gets a training session that fits the players and pitch they actually have, and can prove every child got a fair share of minutes and practice.

One record, five answers. A coach enters two things, what happened in the match and who was at training, and that single record answers all five challenge tracks:

| Step                  | Screen                                                                                                   | Track                          | Status (Wed 19:45)                                     |
| --------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------ | ------------------------------------------------------ |
| 1. Record             | Pitch-side tagger: clock, big buttons, tap the pitch for a shot, undo, substitutions                     | Closes the grassroots data gap | Database ready; screen to build                        |
| 2. Read               | Momentum Lab: three windows, one honest conclusion per moment, evidence list                             | 4 Match Momentum               | **Working**; engine verified on 1,941 matches          |
| 3. Plan               | Session planner: focus → drills that fit attendance, space and time, with a fallback and a fair rotation | 1 Smart Coach                  | Engine + 24 bilingual drills **done**; screen to build |
| 4. Share fairly       | Opportunity ledger, second-look list, relative-age check from birth quarter only                         | 2 Hidden Talent                | Engine **done**; screen to build                       |
| 5. Look after them    | Weekly load from minutes and a 1–10 effort rating; flags jumps and missing data, never predicts injury   | 3 Training Load                | Engine **done**; screen to build                       |
| 6. Use the pitch well | Pitch-hours, players per pitch-hour, right-sizing, floodlight energy, cost and CO₂ estimates             | 5 Sustainable Clubs            | Engine **done**; screen to build                       |

We do not predict injuries, rank talent or forecast results.

### Why this beats a dashboard

Every team will show a chart. We show **when the chart is wrong**, with our own evidence:

1. **18.9%** — across 1,941 professional matches (2.2 million moments), the 3-minute and 10-minute momentum views pointed at opposite teams 218,058 of 1,151,537 times. Our seven-match pilot said 23.9%; the large study is the number we quote, and we show both.
2. **7.9%** — only 175,374 of 2,215,837 moments were agreed by all three windows and safe from a single-chance flip.
3. **0.280 vs 0.330** — our own expected-goals model (45,287 shots, held out by match) against the base rate, with calibration error 0.0055. It runs in the browser from five numbers.
4. **68.4% → 30.8%** — in the opportunity simulation, ranking children by raw success rate gave 68.4% of shortlist places to the least-observed group; shrinkage cut it to 30.8%.

Numbers 1 to 3 are not slides. The Python research and the production TypeScript engine were written independently and agree count for count; that agreement is a test that runs on every commit (`momentum.scale.test.ts`, `momentum.golden.test.ts`, `xg.test.ts`).

## 2. What judges will score, and how we win each

### Jury (people from data and sport)

| They look for                      | Our answer                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| A real problem in grassroots sport | Volunteer coach, one evening a week, no data. Children on the bench nobody tracks |
| Data turned into a decision        | Match evidence → one training focus → one session card → a fairness record        |
| Honesty about data                 | The tool says "not enough evidence" and "depends on one chance" out loud          |
| It works                           | Live demo on a phone, in Bosnian, offline-tolerant, with a recorded backup        |
| Care for minors                    | No names or birth dates needed, consent recorded, export and delete built in      |

### ProdReady (the engineering score)

The readiness scan runs 118 read-only detectors and scores five areas, 20 points each: 8 off per critical finding, 5 per high, 1 per medium. Hard caps override the number: no tests or no CI caps at C, any critical on an A-level score caps at C, a critical data finding caps at D, a committed credential caps at F. The due diligence then scores 18 dimensions from 1 to 5.

**Target: 100/100, grade A, no caps, no unverified area; due diligence 4+ in every dimension.**

| Scan area | What it checks                                                                                                          | What we ship                                                                                                                                                                                            |
| --------- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| data      | Constraints and foreign keys, tenant scoping and row-level security, status typing, deletes, retention, query shape     | Every table has `club_id`, RLS forced on, enums for every status, foreign keys with explicit delete rules, soft delete on events, retention job, explicit column lists and limits                       |
| safety    | One session truth, role gates, rate limits before side effects, audit trail, GDPR surfaces, secrets                     | One Supabase client and one auth hook, roles enforced in RLS, rate-limited edge functions, append-only audit log, consent + export + delete screens, no service key outside server code, gitleaks in CI |
| tests     | A suite, coverage gating, integration and end-to-end probes of real flows                                               | Vitest with a 90% gate (now 98%), database RLS tests with two clubs, Playwright on the four-step loop                                                                                                   |
| review    | Wiring and orphan code, hardcoded config and locale, form and state contracts, dependency hygiene, unresolved decisions | Fail-fast env validation, every string in `bs`/`en` files, zod schemas on every form and API boundary, explicit match state machine, zero audit advisories, no TODOs: decisions live in `docs/adr/`     |
| release   | CI gates, health and liveness, job reliability, deploy-time verification against the real origin                        | Required CI on every pull request, `/health` endpoint with build id, idempotent offline sync, post-deploy smoke test against the live URL                                                               |

The 18 due-diligence dimensions add: architecture and decision records, observability and a runbook, load-test evidence (k6 results committed), accessibility and internationalisation, release management (tags, changelog, rollback), compliance signals, cost notes, a technical-debt register and supply-chain hygiene.

**The working rule:** scan early, scan often. The report names gaps but never fixes, so the first scan runs as soon as the database and sign-in exist, and again after every milestone. A finding is fixed in the same session it appears.

## 3. Architecture

- **Web app:** Vite, React 19, TypeScript (strict), Tailwind. Same stack Lovable generates, so teammates can open it there. Installable, works with a weak signal.
- **Engine:** `src/engine/`, pure TypeScript, no dependencies, integer arithmetic, property-tested. Shared by every screen.
- **Backend:** Supabase. Postgres with row-level security as the security boundary, email one-time-code sign-in, SQL functions for writes that need validation, edge functions for health, export and anything privileged.
- **Hosting:** Vercel, static, with strict security headers (CSP, HSTS, no-sniff, frame denial).
- **Languages:** Bosnian first, English second. No hardcoded text.
- **Data model (all rows carry `club_id`):** clubs, club_members (role), teams (age group), players (label + number only), matches, match_periods, match_events (kind, side, weight, clock, soft delete, client id for idempotent sync), stints (who was on the pitch), drills, sessions, session_drills, attendance, observations (attempts, successes), consents, data_requests, audit_log (append-only).

Children's data: the app never needs a real name or a birth date. A player is a label and a shirt number. The demo runs on a synthetic under-13 squad.

## 4. Scope

**Must have (demo-ready by Thursday 12:00)**

1. Sign-in, club, team, roster.
2. Database with RLS, audit log and two-club isolation tests.
3. Match tagger with clock, undo and substitutions.
4. Momentum Lab on tagged matches (done for demo data).
5. Session planner and a printable session card.
6. Opportunity ledger.
7. Bosnian and English, keyboard and screen-reader basics.
8. CI green, live URL, ProdReady scan at A.

**Should have (by Thursday 14:00)**

9. Offline queue for the tagger.
10. Data export and delete, consent record, privacy page.
11. Playwright end-to-end on the full loop, k6 load results, Lighthouse budgets.
12. Health endpoint and post-deploy smoke test.
13. Due diligence run and fixes.

**Only if everything above is green**

14. One-paragraph session summary written by Claude from the structured evidence, server-side, with every sentence linked to events.
15. PDF export, read-only parent link.

**Cut order if time runs short:** 15, 14, 9, then breadth of 11 (keep one happy-path test). Never cut 2, 7 or 8.

## 5. Research: what is done and what is next

| Item                            | Status         | Result                                                                                                                                                                               |
| ------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scale the momentum study        | **Done**       | Wyscout open data (Pappalardo et al. 2019, CC BY 4.0): 1,941 matches. Opposed windows 18.9%; by competition 16.8%–20.0%                                                              |
| Expected-goals model            | **Done**       | Logistic regression on distance, angle, header, free kick. Grouped 5-fold by match and leave-one-competition-out both give log loss 0.280. Model card in `research/xg/MODEL_CARD.md` |
| Momentum forecaster             | **Rejected**   | Our leave-one-match-out test showed the xG leader made next-shot prediction worse (1.0954 → 1.1235). Not shipped                                                                     |
| Validate weekly load arithmetic | Next           | SoccerMon subjective data (Midoglu et al. 2024, CC BY 4.0, 0.7 MB): recompute weekly load and compare with the published columns                                                     |
| Relative-age check              | Next           | Exact multinomial test on birth quarters with a Bayesian share estimate; stores the quarter only. At 14–20 players the test has low power and the screen says so                     |
| Coach test at the venue         | Thursday 10:00 | Three coaches, five minutes each, same task with a plain event list and with Klupa. Record time, whether the chosen evidence was valid, one quote                                    |

Honest limits we state on screen and in the pitch: every dataset is adult professional football; no published study tests whether xG transfers to youth football, so for youth teams it is a chance-quality index, not a probability; StatsBomb open data was not used because its terms forbid redistribution.

Facility estimates use cited factors the club can overwrite: grid intensity 570.64 g CO₂/kWh for Bosnia and Herzegovina (Ember via Our World in Data, 2025) and 0.3020 KM/kWh for small non-household users (BHAS, second half of 2025).

## 6. Timeline

Main branch is always green and always deployable. Stopping at any point leaves something we can present.

| When                   | Work                                                                                                            | Done means                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Wed 17:45              | Foundation: repo, engine, golden tests, Momentum Lab, CI file, this plan                                        | **Done.** 53 tests, 98% coverage, build passes              |
| Wed 18:00–18:30        | Kerim: answer open questions, approve GitHub + Supabase + Vercel, sign in to ProdReady                          | Repo pushed, CI green on GitHub, ProdReady connected        |
| Wed 18:30–21:30        | Database, RLS, audit log, isolation tests, sign-in, app shell and routing. **First ProdReady scan**             | Two test clubs cannot read each other; scan findings listed |
| Wed 21:30–00:30        | Tagger, stints and minutes, Momentum Lab on tagged data, planner engine, bilingual drill library                | A full match can be recorded and read on a phone            |
| Overnight (unattended) | Planner UI, ledger UI, session card, end-to-end tests, docs. Second scan                                        | Four-step loop works end to end                             |
| Thu 08:00–10:00        | Fix scan findings, deploy, seed the demo club, R1 on the PC                                                     | Live URL, scan at A                                         |
| Thu 10:00–12:00        | At venue: R2 coach test, should-have items                                                                      | Three test results recorded                                 |
| Thu 12:00–14:00        | Load test, Lighthouse, due diligence, fixes                                                                     | Every area evidenced                                        |
| Thu 14:00–15:00        | **Feature freeze.** Final scan and due diligence on the frozen commit, tag `v1.0.0`, record a backup demo video | Reports saved (they expire after 7 days)                    |
| Thu 15:00–16:00        | Pitch rehearsal three times, buffer                                                                             | 3-minute and 90-second versions timed                       |

## 7. How to run the build (Claude Code)

Open a new session with `C:\Users\kerim\klupa` as the folder. `.mcp.json` already points at ProdReady: approve it when asked and sign in with the emailed code. Then work one milestone per session, in this order, and say "use prodready to check whether this app is production ready" at the end of each.

| Model                        | Use it for                                                                                           | Why                                                                                          |
| ---------------------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| **Fable 5.2** (main session) | Database schema, RLS, auth, the engine, ProdReady triage, final review                               | A single critical finding costs 8 points and can cap the grade. This is where they come from |
| **Opus 5.5**                 | Feature screens and their tests; take over the main session if Fable usage runs out                  | About half the API price of Fable, fast mode available                                       |
| **Sonnet 5.5**               | Subagents on bounded jobs: component tests, end-to-end specs, drill library text, docs, translations | Fast and cheap when the task is fully specified                                              |
| **Haiku 5.5**                | Mechanical checks only; and the optional in-app summary (`claude-haiku-5-5`)                         | Not for writing application code                                                             |

Run **one session at a time**. Parallel sessions burned through the usage limit on earlier projects. If a limit hits mid-milestone, switch that session's model to Opus 5.5 and continue; do not start over.

## 8. Pitch (3 minutes)

1. **0:00 The coach.** "Amir coaches under-13s on Tuesday evenings. Fourteen kids, half a pitch, no analyst. Three of those kids played eleven minutes last month and nobody noticed."
2. **0:25 Record.** Tag ten seconds of a match live on a phone. Two taps per event.
3. **0:50 Read.** Open the match. "Every broadcast shows a momentum chart. We tested the idea on seven professional matches: one time in four, changing the window from three minutes to ten flips which team is on top." Drag the slider onto a red moment, show the evidence, show the chance that carries the result.
4. **1:30 Plan.** Pick the focus the evidence supports. Set twelve players, half a pitch, sixty minutes. Drop to nine players: the plan changes and says why.
5. **2:00 Share fairly.** Open the ledger. "Two from two is not a 100% player. It is a child we have barely watched." Show the second-look list.
6. **2:30 Proof.** ProdReady grade, test count, the three numbers, what coaches said in R2. "Works in Bosnian, on a phone, with no names stored."
7. **2:50 Ask.** One club, one season, one pilot.

## 9. Risks

| Risk                                      | Mitigation                                                                 |
| ----------------------------------------- | -------------------------------------------------------------------------- |
| Usage limit hits overnight                | One session at a time; must-haves first; Opus 5.5 as fallback              |
| ProdReady detectors we did not anticipate | First scan tonight, not tomorrow afternoon                                 |
| Live demo fails                           | Installed app with seeded data, recorded backup video, screenshots         |
| Scope creep                               | The cut order in section 4 is decided now, not at 14:00                    |
| Real children's data                      | Synthetic squad only; nothing personal is ever entered                     |
| Track rules differ from our assumption    | Ask at 10:00; the product stands alone as Smart Coach or as Match Momentum |

## 10. Open questions for Kerim

1. Which tracks did the organisers confirm, and may one project combine them?
2. Did you receive a starter data pack? What is in it?
3. How does ProdReady count in judging: the 0–100 scan, the 18-dimension review, or both? Is a live URL required? Is Lovable required or optional?
4. Who is on the team, and is there a coach we can test with on Thursday morning?
5. Is the name "Klupa" right, or do you want another?
