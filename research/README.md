# Klupa research

Two studies on the open Wyscout event data (CC BY 4.0), plus a tracking pipeline for seven DFL matches (CC BY 4.0, see the last section). Data card: `data/DATA_CARD.md`. Model card: `xg/MODEL_CARD.md`.

## Layout

- `xg/train.py` trains and evaluates the xG model, writes `src/data/models/xg.json`, `out/xg_cv.json`, `out/xg_golden.json`.
- `momentum/scale_validation.py` re-runs the momentum-window study with that model, writes `out/momentum_scale.json` and `out/wyscout_shots.json`.
- `tracking/` converts the DFL optical tracking of seven matches for the browser and measures it (last section).
- `data/raw/` (git-ignored) holds the downloaded files; `data/MANIFEST.json` records their sizes and SHA-256.

## Reproduce

```
python -m venv research/.venv
research/.venv/Scripts/python.exe -m pip install -r research/requirements.txt
research/.venv/Scripts/python.exe research/xg/train.py
research/.venv/Scripts/python.exe research/momentum/scale_validation.py
```

Run `train.py` first; the momentum script reads the exported model. Each takes well under two minutes. `wyscout_shots.json` is written compact (about 1.8 MB); the repository's prettier run reformats it (about 2.9 MB).

## xG model in one paragraph

Logistic regression on distance, goal-mouth angle, header and free kick, 45,287 non-penalty shots from 1,941 matches. Grouped-by-match 5-fold CV log loss 0.2804 against 0.3300 for the base rate; ROC AUC 0.775. Trained on men's professional football; no published study tests transfer to youth football, so treat it as a shot-quality index for youth teams, not a probability.

## Momentum windows at scale

Claim: trailing 3-minute and 10-minute windows can point at opposite teams. Method as in the seven-match study: five-second grid per half, windows (g - W, g] reset each half, W = 180, 300, 600 s, signed sum home minus away. Weights are our xG in 1/10,000 units. Assumptions: penalties weigh 7,600 units; own goals excluded; 1H and 2H only (extra time and shoot-outs not analysed); shot time is whole seconds; grid runs to the last event second of the half.

|                                                       | Seven Bundesliga matches (earlier study) | All Wyscout matches (this study) |
| ----------------------------------------------------- | ---------------------------------------- | -------------------------------- |
| matches                                               | 7                                        | 1,941                            |
| grid points                                           | not recorded here                        | 2,215,837                        |
| points where 3-min and 10-min signs are both non-zero | 4,318                                    | 1,151,537                        |
| of those, opposite                                    | 1,034 (23.9%)                            | 218,058 (18.9%)                  |

Result: **18.9%**, not 23.9%. By competition: England 17.5%, European Championship 16.8%, France 20.0%, Germany 19.5% (306 matches), Italy 18.9%, Spain 19.2%, World Cup 18.9%.

How far apart are the two numbers? Per-match percentages range from 0% to 47%, 5th to 95th percentile 5.5% to 31.9%. A match-level bootstrap gives a 95% interval of 18.6% to 19.3% for the pooled figure. In 20,000 random draws of seven matches, the pooled percentage had a 95% range of 13.0% to 24.8% and was 23.9% or higher in 4.8% of draws. So the seven-match figure is high but within what seven matches can produce; this does not say why it is high. Differences in weights (provider xG there, our model here) and in league were not separated.

Agreement and fragility (all three windows share one non-zero sign: 916,110 of 2,215,837 grid points, 41.3%). Of those agreements:

|                                                                                                                 | count   | share of agreements |
| --------------------------------------------------------------------------------------------------------------- | ------- | ------------------- |
| robust: every window's absolute sum exceeds its largest single favoured-side contribution                       | 175,374 | 19.1%               |
| can reverse: some window's absolute sum is below that contribution                                              | 255,712 | 27.9%               |
| tie only: no window is below, at least one equals it (a single shot is the whole window; removing it levels it) | 485,024 | 52.9%               |

The third row is not in the brief's two categories but is the largest, so it is reported rather than folded into either. Per-competition rows are in `out/momentum_scale.json`.

Checks run: the windowed counts for 52 sampled halves were compared with a plain brute-force implementation and were identical. The xG weights were trained on the same matches (four coefficients, so little leakage risk, but it is not held out).

## Files in `out/`

`xg_cv.json` (all CV metrics, feature trials, final coefficients), `xg_golden.json` (60 cases, Python probability and units), `momentum_scale.json` (totals, per-competition, spread, assumptions), `wyscout_shots.json` (every analysed shot per match and half, integer weights, for testing the TypeScript engine on the same input).

## Player tracking: seven DFL matches (`tracking/`)

Source: Bassek, Rein, Weber, Memmert (2025), "An integrated dataset of spatiotemporal and event data in elite soccer", figshare 28196177, doi:10.6084/m9.figshare.28196177.v1, CC BY 4.0 (paper: doi:10.1038/s41597-025-04505-y). The seven matches our event fixtures already use. Raw files (`data/raw/`, git-ignored): per match the 25 Hz positions XML, the match information and the raw events (the events file has the same SHA-256 as the `sourceSha256` of the fixture): 21 files, 2,627,505,889 bytes, downloaded in about 100 s. Size and MD5 of every file equal what the figshare API lists; SHA-256 is in `data/MANIFEST.json`. Facts, labels and limits are in `data/DATA_CARD.md`.

### Reproduce

```
research/.venv/Scripts/python.exe -I research/tracking/download.py
KLUPA_MATCH=J03WN1 research/.venv/Scripts/python.exe -I research/tracking/convert.py
KLUPA_MATCH=J03WN1 research/.venv/Scripts/python.exe -I research/tracking/verify_raw.py
KLUPA_MATCH=J03WN1 research/.venv/Scripts/python.exe -I research/tracking/physical.py
research/.venv/Scripts/python.exe -I research/tracking/index.py
research/.venv/Scripts/python.exe -I research/tracking/measures.py
research/.venv/Scripts/python.exe -I research/tracking/territory_vs_chances.py
research/.venv/Scripts/python.exe -I research/tracking/golden.py
```

`convert.py`, `verify_raw.py` and `physical.py` work on the match named by the environment variable `KLUPA_MATCH` (short id, default `J03WN1`); run them for each of `J03WMX J03WN1 J03WOH J03WOY J03WPY J03WQQ J03WR9`, then `index.py`. `measures.py`, `territory_vs_chances.py` and `golden.py` are for J03WN1 only. `KLUPA_RAW` names another raw folder, `KLUPA_CACHE_DIR` another place for the full-rate caches. Outputs of the first match keep their original names in `out/`; the others carry the short id (`tracking_convert_J03WOH.json`). Standard library, numpy and scipy only. The first run of `convert.py` per match parses the XML (about 15 s) and caches the full-rate arrays in `tracking_full_cache[_<id>].npz` (git-ignored; it holds person ids, which are never shipped). Re-running `convert.py` for J03WN1 after the changes below reproduces its binary byte for byte.

### What the raw file is (verified from the files)

One `FrameSet` per object per half (58 for J03WN1): 3 referees, the ball, and every player while on the pitch. Frames are 25 Hz and contiguous. X, Y are metres from the pitch centre on a 105 x 68 m pitch in all seven matches. The ball has height, possession and `BallStatus` (1 = in play). Our period time zero is the event `KickOff` instant, so shot times from the event fixture line up with positions. For J03WN1 the file starts about 2 s before kick-off, the ball is already moving at the event-clock kick-off, and the second half's tracking ends 3.8 s before the event final whistle (2,888.95 s after kick-off against the fixture's 2,892 s). The other six differ, see below.

### What is shipped (`public/data/tracking/`)

Per match `<id>.bin` and `<id>.json`, the same layout and format version 1 as the first match (the TypeScript reader is unchanged): little-endian Int16, centimetres from the centre, sentinel -32768 where an object is absent, periods back to back with no header, one frame = (roster slots + ball) x (x, y), roster ordered home first then by shirt number, 4 Hz. Resampling is linear interpolation of the 25 Hz data onto `t = k / 4` from the event kick-off; a player is absent at a sample if either neighbouring raw frame is missing; rounding to whole centimetres gives at most 0.5 cm error. 4 Hz in every match, not 5 Hz, which would be 3.4 to 3.9 MB. Only side and shirt number per slot: no names, no person ids. "home" is the event fixture's label (the lexicographically smaller club id, as in `scripts/research/dfl_to_fixture.py`), which is the DFL guest team in four of the seven matches.

| id     | date       | file "home" v "away"                      | score | slots | frames | .bin bytes | minutes covered (P1 + P2) | held first samples | jump time excluded |
| ------ | ---------- | ----------------------------------------- | ----- | ----- | ------ | ---------- | ------------------------- | ------------------ | ------------------ |
| J03WOH | 2022-08-26 | Fortuna Düsseldorf v SSV Jahn Regensburg  | 4-0   | 32    | 21,960 | 2,898,720  | 46.31 + 45.18 = 91.49     | 7, 0               | 74.7 s             |
| J03WOY | 2022-09-10 | Fortuna Düsseldorf v F.C. Hansa Rostock   | 3-1   | 32    | 22,814 | 3,011,448  | 46.08 + 48.97 = 95.05     | 3, 5               | 51.0 s             |
| J03WPY | 2022-10-15 | 1. FC Nürnberg v Fortuna Düsseldorf       | 1-0   | 31    | 23,402 | 2,995,456  | 46.10 + 51.40 = 97.50     | 5, 4               | 74.8 s             |
| J03WQQ | 2022-11-05 | FC St. Pauli v Fortuna Düsseldorf         | 0-1   | 31    | 22,779 | 2,915,712  | 46.14 + 48.77 = 94.90     | 2, 3               | 60.7 s             |
| J03WR9 | 2022-11-11 | 1. FC Kaiserslautern v Fortuna Düsseldorf | 2-1   | 31    | 23,495 | 3,007,360  | 45.58 + 52.31 = 97.89     | 2, 3               | 63.6 s             |
| J03WMX | 2023-05-27 | 1. FC Köln v FC Bayern München            | 1-2   | 32    | 23,357 | 3,083,124  | 47.14 + 50.17 = 97.31     | 2, 0               | 6.0 s              |
| J03WN1 | 2023-05-27 | Bayer 04 Leverkusen v VfL Bochum 1848     | 0-3   | 29    | 22,633 | 2,715,960  | 46.15 + 48.15 = 94.30     | 0, 0               | 90.4 s             |

Together 160,440 frames, 20,627,780 bytes of binary. `index.json` lists the seven in kick-off order with `id, date, competition, home, away, score, periods (seconds), bytes, sha256`; the score is for the sides as the file labels them and equals both the match information's `Result` and the goals counted in the raw events. `<id>.physical.json` is described below.

### What differed between matches and how it was handled

- Tracking start. Only J03WN1 starts before the kick-off (by about 2 s in both halves). In the other six the first half starts 0.31 to 1.61 s after it, and four second halves start 0.51 to 1.07 s after it (J03WOH 0.55 s and J03WMX 0.03 s before). The converter first indexed before the start of the array, which wraps around to the end of the half: every player jumped between the first two samples and the independent check reported thousands of mismatches. Now samples before the first frame repeat the first frame (held, not extrapolated; counts in the table, stated in each file's `source.notice`), so sample 0 always has the players the reader needs for goalkeepers and attack direction. The 25 Hz measures start at the first frame at or after kick-off (the old code would also have wrapped there).
- Tracking end. In the other six the tracking runs 3.5 to 12.1 s past the final whistle, so periods are a few seconds longer than the fixtures' (same rule as J03WN1: all tracked frames are shipped).
- Raw tracking jumps. J03WOH, J03WOY, J03WPY, J03WQQ and J03WR9 contain 131 to 191 one-frame steps of 1,100 to 1,600 m/s at most (J03WN1 has 239 of at most 36 m/s, J03WMX 16 of at most 37 m/s): a track freezes and then snaps to the real position. The binaries keep them as observed. The converter's speed check reports `resampledSpeedsAbove12` (58 to 76 in those five, none in the other two) and `resampledSpeedsAbove12WithoutRawJump` (0 in all seven); only the second is part of `passes`, because the first counts the provider's glitches, while a fast step with no raw jump behind it would be a conversion error. The physical measures leave jump frames out (below).
- Red cards: J03WN1 (home label, about minute 7) and J03WQQ (away label, second half). The in-play object count is 22 while a side has ten men and 23 otherwise, always within 20 to 23.
- Size: J03WMX, J03WOY and J03WR9 are 3.08, 3.01 and 3.01 MB at 4 Hz, above the 3 MB aim of the first match; the format was kept.

### Checks run (`out/tracking_convert[_<id>].json`, `out/tracking_verify[_<id>].json`, `out/tracking_index.json`)

All seven pass all of these:

- Coordinates outside the pitch plus 5 m: 0 in every match. Ball in every frame.
- Moving objects (players plus ball) while the ball is in play: 22 or 23 in every match (J03WN1 22 in 10,243 frames and 23 in 685; J03WQQ 22 in 3,803 and 23 in 9,694); never outside 20 to 23.
- Median player speed 1.30 to 1.47 m/s. Maximum 4 Hz speed 9.8 and 10.0 m/s in J03WN1 and J03WMX; 179 to 256 m/s in the other five, where every resampled step above 12 m/s has a raw jump between its two samples.
- Half durations 45.58 to 52.31 minutes; attack directions flip between halves in every match, and the goalkeeper found is the same shirt in both halves of every match.
- Independent re-check (`verify_raw.py`, regular expressions on the raw text, no shared code with the converter): per match 402 frames (400 random plus first and last of each half), 17,736 to 18,492 coordinate values and 3,192 to 4,020 absent columns compared, largest difference 0 cm after rounding to whole centimetres, 0 mismatches. Two bugs in the checker itself showed up on the new matches and were fixed: the first frame of a half is the lowest frame number over all FrameSets, not that of the first FrameSet listed, and the kick-off offset is rounded to whole milliseconds as in the converter. The J03WN1 result moved from a largest difference of 1 cm to 0 cm because of the second fix.
- `index.py`: goals counted in the raw events equal the match information's `Result`, and the shots rebuilt with the file's home/away labels equal `src/data/dfl/<match>.json` (times, sides, xG), for all seven; each binary's size and SHA-256 equal its metadata.
- Provider speed field `S` divided by our 0.4 s speed: median 3.61 for J03WN1 (km/h against m/s); not repeated for the others.

### Physical measures (`<id>.physical.json`, 25 Hz)

Written by `physical.py` with `measures.player_totals`, so the definitions are those of `measures.py`: speed = displacement over a centred 0.4 s window; distance = sum of speed / 25 per frame; high-speed running = distance above 5.5 m/s; a sprint is at least 1.0 s at 7.0 m/s or more (our choice, the brief fixed none); top speed = maximum smoothed speed; minutes are clock minutes on the pitch from the event kick-off to the last tracking frame, dead-ball time included. Per player: side, shirt, short name (public match information; the only place names appear), minutes (one decimal), distance and high-speed running in km (two decimals), sprints, top speed in m/s; per side: players used, minutes, distance, high-speed running, sprints, top speed. A `definitions` object states every threshold in words and numbers, and `quality` gives the player time left out.

One addition to `measures.py`: tracking jumps. A step between consecutive frames above 12 m/s (0.48 m in one frame, faster than any footballer) is a jump; every frame whose 0.4 s window holds one counts as minutes but not in distance, high-speed running, sprints or top speed. Without it a single freeze-and-snap gave top speeds of 11 to 12 m/s (100 m/s or more for the largest jumps) in the five noisy matches; with it the fastest player of each match runs 9.2 to 10.0 m/s. Excluded time is 6 to 90 s per match, 0.005 to 0.08 % of player time (table above). The rule is the same for all seven, including J03WN1, where it removes 90 s of player time and lowers the side distances by 0.13 and 0.12 km against `out/tracking_measures.json` (home 90.98 km against 91.11, away 104.95 against 105.07; sprints and top speeds unchanged). `measures.py` itself is unchanged and still reports the unfiltered J03WN1 numbers quoted below. Jumps under 0.48 m are not detected. Rows equal the roster slots of the binary exactly (checked in `physical.py` and in `src/engine/__tests__/tracking.all.test.ts`).

Per-side totals, descriptive only (distance km / high-speed km / sprints; home then away): J03WMX 117.85 / 8.87 / 94 and 115.53 / 8.52 / 118; J03WN1 90.98 / 7.10 / 91 and 104.95 / 7.66 / 84; J03WOH 112.28 / 8.74 / 85 and 109.33 / 8.99 / 97; J03WOY 116.82 / 8.96 / 88 and 115.07 / 8.88 / 78; J03WPY 116.89 / 9.80 / 98 and 115.44 / 9.74 / 109; J03WQQ 116.23 / 9.83 / 89 and 117.15 / 8.94 / 98; J03WR9 112.42 / 7.65 / 98 and 113.27 / 7.99 / 77 (J03WN1: home with 10 men from about minute 7).

### Movement measures of J03WN1 (`out/tracking_measures.json`, 25 Hz)

Definitions are in the script header. Per player (by side and shirt): minutes, distance, high-speed running distance, 95th percentile and maximum speed, sprints. Per team per minute (ball in play, goalkeeper excluded): centroid, width, length, hull area. Per 5 s: "space control (nearest player)", the share of 32 x 21 pitch cells whose nearest player is a home player. It is a nearest-neighbour count, not a pitch control model. This file, the territory study and the golden test are for J03WN1 only.

Headline, this match only: home (13 players used, 10 men from about minute 7) covered 91.1 km in total with 7.1 km at high speed and 91 sprints; away (16 players used) 105.1 km, 7.7 km and 84. Fastest: home #19 9.70 m/s, away #23 9.83 m/s. While the ball was in play both teams averaged about 35 m wide and 32-33 m deep (home hull 779 m2, away 753 m2). Mean home space control 50.9% over 1,132 grid points (46.6% first half, 55.1% second half; 48.9% with the ball in play). The 5 s series of the shipped binary and of the 25 Hz data differ by at most 2 cells of 672 (rounding).

### TypeScript engine (`src/engine/tracking.ts`)

`decodeTracking`, `parseTrackingMeta`, `frameAt`, `teamShape`, `spaceControl`, `playerPath`. The golden test (`tracking.test.ts`) decodes the J03WN1 binary and compares 46 frames with Python: shape within 1e-6 m, cell counts and the full ownership grid exactly. `tracking.all.test.ts` checks all seven: index against binary and metadata, decoding, durations, sampled in-play frames, and the physical rows against the roster. The Python side uses numpy interpolation and scipy's Qhull hull; the TypeScript side uses its own interpolation and a monotone-chain hull.

Limits: seven matches, one tracking provider, men's professional football; goalkeepers are found as the player nearest his own goal line in the first frame of each half (wrong if the keeper has left his half or is off the pitch at that instant); positions are optical and "raw observed" (no smoothing by us before measures, apart from the jump rule above); the 4 Hz grid hides quick movements.
