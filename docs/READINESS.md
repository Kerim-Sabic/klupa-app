# Readiness record

Klupa was checked from the outside with the ProdReady tools: a production-readiness scan (a fixed catalogue of checks, scored out of 100) and an 18-dimension technical due diligence (each dimension scored 1 to 5 against a rubric). This page records what they found, what was done about it, and what is still open.

This repository is release 0.4.1 as a single commit. The pull requests, CI runs and tagged releases this page refers to are in the maintainer's development repository.

The latest scan below is for `91859a9`, the code of release 0.4.1. The latest due diligence that was filed is for `c152611`, the commit tagged 0.4.1: 3.9 of 5. The table below is the report before it, on `699e36e`, the commit that was live on 12 November 2026 before the interface was redesigned; what happened in between is under "Changed since that review". The report pages are unlisted, kept for seven days and opened with an access code the maintainer holds; the answers behind them are summarised here so the record outlives the links.

## Production-readiness scan

| Date             | Commit    | Score     | Grade      | Findings                                              |
| ---------------- | --------- | --------- | ---------- | ----------------------------------------------------- |
| 11 November 2026 | `4207566` | 80 / 100  | F (capped) | 1 critical, 2 high, 2 medium; 30 checks not evaluated |
| 12 November 2026 | `053f177` | 100 / 100 | A          | None. 89 of 89 evaluated checks passed                |
| 12 November 2026 | `699e36e` | 100 / 100 | A          | None. 91 of 91 evaluated checks passed                |
| 12 November 2026 | `91859a9` | 100 / 100 | A          | None. 91 of 91 evaluated checks passed                |

Second report: <https://mcp.prodready.si/r/Cq1qoOFJ1nKIjkbl>. Third report, on the commit that was live after the day's merges: <https://mcp.prodready.si/r/_3NT43WcHHRb6IVK>. Fourth report, on the code of release 0.4.1: <https://mcp.prodready.si/r/SkLcKBCmyqvudfmH>.

The second and third scans were each run on a clean checkout of `main` with tracked files only, and every check the plan issued was run. In the third, of the 118 checks in the catalogue, 19 do not apply to this stack and 8 were neither passed nor failed: 7 were not in the plan the server issued, and one (tables with no rows) was reported as an observation, because the two empty tables, error reports and data requests, are written to by the app and are empty only because nothing has gone wrong and nobody has asked.

### What re-running it on 24,000 new lines found

The third scan was not clean the first time through. Before it was submitted, the detectors turned up a Python build script of 768 lines (split into six files), two exports nothing used (removed), two report tables that relied on having no policy at all to stay closed (each now has a written policy that refuses everything), and four places where the documentation had fallen behind the code (table and check counts, the API contract, the contributor guide). Those are fixed in the commit that was scanned.

### What re-running it on release 0.4 found

The fourth scan covers everything that landed after the third: the redesign, the front page, the player overlay and the replay upgrade, about 170 files. Its detectors were first run on release 0.4.0 and one fired: an exported function that had lost its only caller. They also turned up three things that are not detectors: the README still called the sample clip "the only video in the repository" after the front-page film was added, that film had no line saying where it came from, and the page fallback did not exclude `/media/`. All four were fixed in 0.4.1 and the detectors were run again on that code before the scan was submitted. 88 detectors were re-run; 6 that read only the database or files that did not change were carried over from the third scan, and the record of each is kept with the evidence.

### What the first scan found, and what changed

| Finding                                | Severity                       | What was wrong                                                                                           | What changed                                                                 |
| -------------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| A tracked credential-shaped file       | Critical (caps the grade at F) | `.env.example` matches `.env*`                                                                           | Renamed to `env.example`                                                     |
| Hard deletes from the client           | High                           | The browser issued `DELETE` for players, clubs, stints and failed-import clean-up                        | Erasure is two named database functions; the client issues no delete         |
| Multi-table writes with no transaction | High                           | Planning a session, a substitution and the sample season were several requests with best-effort clean-up | Each is one database function and so one transaction (decision 0007)         |
| Skipped tests                          | Medium                         | The signed-in journey used `test.skip`                                                                   | It is its own test project, and CI refuses to start without its test account |
| One contributor, no merge commits      | Medium                         | Everything was pushed straight to `main`                                                                 | Changes arrive by pull request with CI; there is still one contributor       |

The checks that could not be evaluated the first time were then run properly, and four of them turned out to be real: unused exports, five screens the browser tests never opened, a health route that probed nothing, and a generated file of 856 lines. All four are fixed.

## Technical due diligence

An independent reviewer (a separate model session with read-only access and the rubric, told to be strict) scored the code four times: before the work, after it, on the merged release, and again on `699e36e` after 24,000 more lines had gone in. Its answers were submitted unchanged; the one score it could not give, performance under load, comes from a load test run for that commit.

Overall: **3.9 of 5 ("strong")**, all 18 dimensions scored, 67 findings: none critical, 3 high, 17 medium, 47 low. Report: <https://mcp.prodready.si/r/b9pr88t4DKUN7G2g>. The release before it scored 3.8: <https://mcp.prodready.si/r/OWRqYo_X505Gb9ER>.

| Dimension                     | First pass | Release 0.2.0 | `699e36e` |
| ----------------------------- | ---------- | ------------- | --------- |
| Architecture                  | 4          | 4             | 4         |
| Code quality                  | 4          | 4             | 4         |
| Security posture              | 4          | 4             | 4         |
| Data architecture             | 4          | 4             | 4         |
| Infrastructure and DevOps     | 3          | 3             | 3         |
| API design                    | 3          | 4             | 4         |
| Frontend architecture         | 4          | 4             | 4         |
| Dependencies and supply chain | 4          | 4             | 4         |
| Scalability and performance   | 4          | 4             | 4         |
| Performance under load        | not scored | 4             | 4         |
| Technical debt                | 4          | 4             | 4         |
| Observability                 | 2          | 3             | 4         |
| Testing maturity              | 4          | 4             | 4         |
| Documentation                 | 4          | 4             | 4         |
| Accessibility and languages   | 4          | 4             | 4         |
| Release and change management | 2          | 3             | 3         |
| Compliance signals            | 4          | 4             | 4         |
| Cost efficiency               | 4          | 4             | 4         |

Observability moved because error reports now come from every page, each page load files three page-speed numbers, the health endpoint carries counts and percentiles, the monitor raises an issue on a bad hour, and `/status` shows the same numbers. Nothing fell. The reviewer called release and change management a weak 3.

## What is still open

These are the reviewer's findings on `699e36e`, in its order of weight. None of them is hidden anywhere else in the documentation.

**High**

- **No staging environment.** The integration tests, the browser tests and the load test all run against the production project with one shared test account.
- **No backup has ever run, and no restore has been rehearsed.** The backup and migration workflows exist but do nothing until a connection string is added to the repository secrets, and they end green when they do nothing.
- **No change has had a second pair of eyes.** There is one maintainer; every pull request was merged by its author, one of them 22,000 lines, and the repository's plan has no branch protection, so CI cannot block a merge.

**Medium**

- The alert on a bad hour fires at 30 error reports while signed-out pages may file 60 an hour, so it can be tripped or drowned on purpose.
- An error report has no stack and no source maps are built, so an error in the field can be counted but often not located.
- The browser tests in CI file page-speed samples into the production numbers.
- There is no tracing and no request-level metric for the app's database calls.
- The 30-minute monitor uses about 1,440 of the 2,000 free runner minutes a month.
- The professional-match screens import internals of two other features.
- 113 functions are longer than 50 lines; the match tagger is the longest.
- The fairness and load views pull a team's whole history into the browser and add it up there, which grows every season.
- Every route shares one page title, and a route change is not announced to a screen reader.
- What is live is ahead of the last tagged release, and the last three migrations were applied by hand.
- A coach cannot delete their own account. The season import records guardian consent as given for every imported player.
- The integration and browser tests share one production account.

**Low, and worth knowing**

- Demo sign-in has no CAPTCHA. Demo clubs and week-old demo accounts are purged, which limits the damage but does not stop scripted sign-ups.
- An owner can add any account to their club without that person accepting.
- Shot lab's measurements are checked on a generated kick and in tests, not on real match footage.
- The player overlay is checked in tests, with a test camera and on one sample clip, not on a real match filmed from the touchline or on a real phone. It adds a 7.3 MB model and a 0.6 MB video to the deploy; both are fetched only on that page.
- The interface was redesigned after this review; the review did not see it.

**Changed since that review, and not yet seen by a reviewer**

- The browser tests in CI no longer file page-speed samples or error reports: both are switched off for that build.
- The monitor runs once an hour, about 720 runner minutes a month. The bad-hour alert still fires at 30, below the signed-out allowance of 60; the runbook now says why and what it costs.
- Every page has its own title, and moving to another page now puts focus on its heading and announces it to a screen reader.
- A backup or migration run without its secret still ends green, and now says "skipped: secret not set" in its summary. No backup has run yet.
- The container images the workflows pull are pinned by digest, the load test's two helper libraries are kept in the repository, and Dependabot watches the Python requirements.
- The architecture notes now list where features import each other, the professional-match screens among them. The imports themselves are unchanged.
- The reviewer scored release 0.3.0 (`9c09cf0`) again with the same rubric. No dimension moved: sixteen at 4, infrastructure and release management at 3. That pass was not submitted, so the report above is still the last one filed. Its unmet points for the front end (bundles not measured), for accessibility (route changes not announced) and for architecture (the engine imported a feature) were fixed afterwards and have not been scored.
- What a first visit downloads is measured in CI and held to a budget: 400 kB gzip for the first load, 320 kB for any one chunk fetched later.
- The engine imports from no feature: the converter from a professional match to a coach's taps moved out of it.
- The vision library behind Shot lab and the player overlay reports usage counters to Google and has no switch for it. Until release 0.4.0 only the site's security policy stopped that request; now the page refuses it itself, and a browser test leaves the page and fails if anything went to another address.
- The reviewer scored release 0.4.1 (`91859a9`) the same way, reading the 112 files that changed since 0.3.0. Again no dimension moved: sixteen at 4, infrastructure and release management at 3. It confirmed as fixed the three points above (the build is measured against a budget, a page change is announced, the engine imports no feature) and counted 103 findings: 3 high, 14 medium, 86 low. The three high ones are the three at the top of this page. The count grows with each pass because each adds small ones; nothing was removed to make it smaller. That pass was not submitted either.
- That pass found one fault of our own making: the page-change announcement also took keyboard focus from controls inside a page that change the address, the replay's match picker and the fairness tabs. It is fixed in the commit tagged 0.4.1 (focus now stays on a control that is still on the page) and has a test; the fix has not been scored.
- The reviewer then read the tagged commit (`c152611`) once more, dropped the three findings the last commit had fixed, and those answers were filed unchanged: **3.9 of 5 ("strong")**, all 18 dimensions scored, 102 findings: none critical, 3 high, 13 medium, 86 low. No dimension moved. Report: <https://mcp.prodready.si/r/fFUxPB1pAUAtfmtd>.
- What holds each dimension where it is, in the reviewer's words: a 5 for the front end needs one type scale (361 font sizes are written as literals beside 86 uses of the scale) and validated forms; for accessibility, every state checked by machine in both themes and focus placed when the overlay's panel swaps; for architecture, an import rule that CI enforces. The two 3s need what one maintainer cannot give alone: a second database to test against, a backup that has been restored once, and a second person reading each change.
- Releases 0.3.0, 0.4.0 and 0.4.1 were each tagged on the commit that went live. The last three migrations were still applied by hand.
- Two additions: the match replay draws players as figures, follows the ball and marks sprints, and a player overlay at `/overlay` finds and follows players in a coach's own video on the device. The overlay imports three small pieces from the shot lab; the architecture notes say so.

## Load test

Four runs on 12 November, all against the live site and database: [docs/load](load/README.md). On `699e36e`, with nothing else using the database: 3,739 requests, none failed; 95% of reads within 146 ms and of writes within 344 ms.

## How to repeat this

1. Make a clean checkout of the commit to be scanned, with nothing untracked.
2. Ask the ProdReady server for its plan, run every command in it from the checkout root, and record what each returned: counts and paths, never file contents.
3. For every check that needs a judgement, read the files it matched and say whether the gap is real. Report a check as failing only when it is.
4. Submit the evidence; keep the evidence file next to the report.
