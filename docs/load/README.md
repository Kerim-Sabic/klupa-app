# Load test results

The script is `scripts/load/k6.js`; the workflow that runs it is `.github/workflows/load.yml`. It runs against the live site and the live database with a throwaway test account, creates its own club and deletes it afterwards through the app's own erasure function.

## 12 November 2026

Run: [Actions run 43112509618](https://github.com/Kerim-Sabic/klupa/actions/runs/43112509618), commit `0b17938`. File: [`2026-11-12-summary.json`](2026-11-12-summary.json), the numbers below, taken from the summary k6 wrote in that run. The raw summary is not kept in the repository: k6 includes the data its set-up step returned, and that holds the test account's session token.

| Scenario | What it models                                                              | Load                       | p95    | Budget   | Result |
| -------- | --------------------------------------------------------------------------- | -------------------------- | ------ | -------- | ------ |
| site     | People opening the app                                                      | 20 opens a second for 30 s | 45 ms  | 500 ms   | Passed |
| read     | Coaches re-reading a match review                                           | 10 at once for 30 s        | 253 ms | 800 ms   | Passed |
| write    | Events being recorded                                                       | 5 a second for 30 s        | 231 ms | 1,000 ms | Passed |
| health   | The health endpoint, which itself asks the database and the sign-in service | 2 a second for 20 s        | 287 ms | 1,500 ms | Passed |

Across the run: 2,908 requests, none failed; 2,900 checks, all passed; no iteration was dropped; at most 30 virtual users.

Every fifth write was sent twice, as a phone does after a dropped connection. The teardown reads the match back and fails the run if any retried event was stored twice. None was.

## 12 November 2026, on the release commit

Run: [Actions run 43121661888](https://github.com/Kerim-Sabic/klupa/actions/runs/43121661888), commit `053f177` (release 0.2.0). Files: [`2026-11-12-run2-summary.json`](2026-11-12-run2-summary.json) and k6's own summary, unedited, [`2026-11-12-run2-k6.json`](2026-11-12-run2-k6.json). The script no longer writes its set-up data into the summary, so the raw file holds no session token and can be kept.

| Scenario | Load                       | p95    | Failed | Budget   | Result |
| -------- | -------------------------- | ------ | ------ | -------- | ------ |
| site     | 20 opens a second for 30 s | 62 ms  | 0%     | 500 ms   | Passed |
| read     | 10 at once for 30 s        | 184 ms | 0%     | 800 ms   | Passed |
| write    | 5 a second for 30 s        | 194 ms | 0%     | 1,000 ms | Passed |
| health   | 2 a second for 20 s        | 344 ms | 0%     | 1,500 ms | Passed |

Across the run: 3,228 requests, none failed; 3,220 checks, all passed; no iteration was dropped; at most 30 virtual users. This run has a failure threshold for each scenario, not only for the run as a whole.

The health figure is the slowest because each call asks two services before it answers. This run was before the change that lets the edge keep a healthy answer for fifteen seconds.

## 12 November 2026, after the day's merges

Two runs on commit `699e36e`, the commit that is live after the professional matches, the live match centre, the replays and the page-speed reporting went in.

The first, [Actions run 43157192915](https://github.com/Kerim-Sabic/klupa/actions/runs/43157192915), overlapped with a screen-recording session that was creating demo clubs and sample seasons on the same database. Its numbers are kept in [`2026-11-12-run3-summary.json`](2026-11-12-run3-summary.json) because it happened, not because it is the cleaner measurement.

The second, [Actions run 43157553644](https://github.com/Kerim-Sabic/klupa/actions/runs/43157553644), ran with nothing else using the database. Files: [`2026-11-12-run4-summary.json`](2026-11-12-run4-summary.json) and k6's own summary, reformatted only, [`2026-11-12-run4-k6.json`](2026-11-12-run4-k6.json).

| Scenario | Load                       | p95, overlapping run | p95, quiet run | Failed | Budget   | Result |
| -------- | -------------------------- | -------------------- | -------------- | ------ | -------- | ------ |
| site     | 20 opens a second for 30 s | 26 ms                | 41 ms          | 0%     | 500 ms   | Passed |
| read     | 10 at once for 30 s        | 304 ms               | 146 ms         | 0%     | 800 ms   | Passed |
| write    | 5 a second for 30 s        | 319 ms               | 344 ms         | 0%     | 1,000 ms | Passed |
| health   | 2 a second for 20 s        | 175 ms               | 228 ms         | 0%     | 1,500 ms | Passed |

Quiet run: 3,739 requests, none failed; 3,731 checks, all passed; no iteration was dropped; at most 30 virtual users. Overlapping run: 3,646 requests, none failed; 3,638 checks, all passed.

What changed since the release run. The health endpoint's typical answer is now much faster (the average fell from 246 ms to 43 ms) because the edge keeps a healthy answer for fifteen seconds; the slowest calls are the ones that still ask the database and the sign-in service. Writes have a slower tail than on the release commit: half of them still answer in about 130 ms, but about one in ten took over 300 ms in both of today's runs, where the release run's 95th percentile was 194 ms. Nothing in the write path changed between the two commits, and this record does not show why; the likeliest cause is the shared free-tier database, and that is a guess.

## What this does and does not show

- It shows the budgets hold at many times the load one club produces. One coach taps an event every few seconds; the write scenario sends five a second.
- It ran against production, on the free tiers of the host and the database, from a GitHub-hosted runner in another region. Latency from a phone in Sarajevo will differ.
- It does not show a ceiling. The scenarios are sized to the product, not ramped until something breaks.
- The database refuses more than 600 events a minute from one account by design, so the write scenario stays under that.

## A first run that failed, and why

The first run of the day ([43111371770](https://github.com/Kerim-Sabic/klupa/actions/runs/43111371770)) failed its site scenario: 86% of requests were refused. The script then looped twenty virtual users with no pause, which came to about 1,300 requests a second from one address, and the host's attack protection throttled it. The database scenarios in that same run passed (reads p95 330 ms, writes p95 359 ms). The script was changed to pace arrivals at twenty opens a second, which is still far beyond a club's size. The throttling is the host protecting the origin, and it is worth knowing it is there.
