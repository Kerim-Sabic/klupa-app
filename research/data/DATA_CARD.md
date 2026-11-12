# Data card: Wyscout open event data

## Source

- Collection: "Soccer match event dataset", Pappalardo, Luca; Massucco, Emanuele (2019), figshare, DOI 10.6084/m9.figshare.c.4415000.v5 (collection 4415000). Companion paper: Pappalardo et al., Scientific Data, 2019.
- Licence: CC BY 4.0, read from the figshare API for both articles on 2026-11-11.
- Files used (byte sizes and SHA-256 are in `MANIFEST.json`; sizes match the figshare API listing):
  - `events.zip` (figshare file 14464685): one JSON array per competition.
  - `matches.zip` (figshare file 14464622): match metadata, used for the two team ids of each match.
  - `tags2name.csv` (figshare file 21385239): tag id to label.
- Downloaded files live in `data/raw/`, which is git-ignored. Re-download from the URLs in `MANIFEST.json`.

## Content

- Seven competitions: England, France, Germany, Italy, Spain (league seasons), European Championship, World Cup. Competition names come from the file names; seasons are not read from the data by our code.
- 1,941 matches and 3,251,294 events (counted by our scripts from the files).
- Positions are percentages of pitch length and width (0-100). Each shot has two positions: the first is where the shot was taken, the second is the target. We use only the first.

## Facts verified from the files (not assumed)

- Shot events: `eventName = "Shot"` (eventId 10, subEventId 100) 43,078; `"Free Kick"` / `"Free kick shot"` (eventId 3, subEventId 33) 2,209; `"Free Kick"` / `"Penalty"` (subEventId 35) 658, of which 76 are in period `P` (penalty shoot-outs).
- Tags (from `tags2name.csv`, asserted at the start of `train.py`): 101 Goal, 102 own_goal, 401 Left, 402 Right, 403 head/body.
- Every shot carries exactly one of 401, 402, 403. No shot carries tag 102 (own goals sit on touches, clearances and passes by the defending side).
- Tag 101 also appears on `Save attempt` events (the goalkeeper's failed save). Counting 101 over all events would double count goals, so goals are read from shot events only.
- Attack direction: 97.4% of non-penalty shots start at x >= 70 and the mean x is 84.3, so the attacked goal is at x = 100 for every shot, as the geometry assumes.
- Periods present: `1H`, `2H`, `E1`, `E2`, `P`. Training uses 1H, 2H, E1 and E2 shots; the momentum study uses 1H and 2H only.
- No duplicate event ids among shots.

## Known limits

- Men's professional football only. Event coordinates are coarse (integer percentages, about 1 m).
- Wyscout shot tags carry no information on defenders, goalkeeper position or pressure, so the model sees only geometry, body part and free kick.

# Data card: DFL optical tracking (seven matches)

## Source

- Bassek, Manuel; Rein, Robert; Weber, Hendrik; Memmert, Daniel (2025). "An integrated dataset of spatiotemporal and event data in elite soccer". figshare article 28196177, doi:10.6084/m9.figshare.28196177.v1 (paper: doi:10.1038/s41597-025-04505-y). Licence CC BY 4.0, read from the figshare API on 2026-11-11 (the article lists 21 files, three for each of the seven matches). Attribution is also written into every `public/data/tracking/<id>.json` and `.physical.json`.
- Seven matches, the same seven that `src/data/dfl/*.json` knows by their shots: `DFL-MAT-J03WN1` (downloaded 2026-11-11) and `J03WMX`, `J03WOH`, `J03WOY`, `J03WPY`, `J03WQQ`, `J03WR9` (2026-11-12). Per match three files: positions (`DFL_04_03_positions_raw_observed_...`, 349 to 419 MB), match information (about 12 KB) and raw events (0.6 to 0.8 MB). 21 files, 2,627,505,889 bytes in all (positions 2,622,603,272). Size and MD5 of every file equal the figshare listing; names, bytes, SHA-256 and the figshare file ids are in `MANIFEST.json`. The raw events file of each match has the same SHA-256 as the `sourceSha256` of its fixture.
- The competition id inside the file names differs: `DFL-COM-000001` (Bundesliga) for J03WN1 and J03WMX, `DFL-COM-000002` (2. Bundesliga) for the other five.
- Re-download with `research/tracking/download.py` (one match at a time, retried and resumed on failure). `data/raw/` is git-ignored.

| id     | date       | competition             | file "home" v "away"                      | score (file labels) | red card                      |
| ------ | ---------- | ----------------------- | ----------------------------------------- | ------------------- | ----------------------------- |
| J03WOH | 2022-08-26 | 2. Bundesliga 2022/2023 | Fortuna Düsseldorf v SSV Jahn Regensburg  | 4-0                 | none                          |
| J03WOY | 2022-09-10 | 2. Bundesliga 2022/2023 | Fortuna Düsseldorf v F.C. Hansa Rostock   | 3-1                 | none                          |
| J03WPY | 2022-10-15 | 2. Bundesliga 2022/2023 | 1. FC Nürnberg v Fortuna Düsseldorf       | 1-0                 | none                          |
| J03WQQ | 2022-11-05 | 2. Bundesliga 2022/2023 | FC St. Pauli v Fortuna Düsseldorf         | 0-1                 | FC St. Pauli (away), 2nd half |
| J03WR9 | 2022-11-11 | 2. Bundesliga 2022/2023 | 1. FC Kaiserslautern v Fortuna Düsseldorf | 2-1                 | none                          |
| J03WMX | 2023-05-27 | Bundesliga 2022/2023    | 1. FC Köln v FC Bayern München            | 1-2                 | none                          |
| J03WN1 | 2023-05-27 | Bundesliga 2022/2023    | Bayer 04 Leverkusen v VfL Bochum 1848     | 0-3                 | Leverkusen (home), 1st half   |

"home" is the event fixture's label, not the DFL home team: the lexicographically smaller club id (the convention of `scripts/research/dfl_to_fixture.py`). It is the DFL home team in J03WOH, J03WOY and J03WMX and the DFL guest team in the other four. The score is for the sides as the file labels them; the goals counted in the raw events equal the `Result` of the match information in all seven, and the shots rebuilt from the raw events with these labels equal the fixtures' shots (times, sides and xG) in all seven (`out/tracking_index.json`).

## Content and facts verified from the files

- 25 Hz optical tracking of every player and the ball, both halves; metres from the pitch centre on a 105 x 68 m pitch (the same in all seven, as the match information says); the ball has height, possession and an in-play flag. Referees are tracked too and are not used. 160,440 frames at 4 Hz in the shipped binaries.
- Frames are contiguous in every FrameSet and every player has a single on-pitch run per half. Timestamps follow 25 Hz.
- Start: in J03WN1 tracking starts 2.25 s (first half) and 1.93 s (second half) before the event-clock kick-off. In the other six it starts after the first half's kick-off by 0.31 to 1.61 s. The second half starts after the kick-off by 0.51 to 1.07 s in J03WOY, J03WPY, J03WQQ and J03WR9, and before it by 0.55 s (J03WOH) and 0.03 s (J03WMX). Period time zero is the event kick-off in all seven, so in the ten periods that start late the first 2 to 7 samples repeat the first tracked frame (a hold, not an extrapolation); the metadata file says so in `source.notice`.
- End: tracking runs 3.5 to 12.1 s past the event final whistle in the other six; J03WN1's second half ends 3.8 s before it (its first half runs 0.36 s past). The shipped periods and the physical measures run to the last tracking frame.
- Raw glitches: 1,087 of 21,873,866 one-frame player steps exceed 12 m/s. J03WMX 16 (largest 37 m/s) and J03WN1 239 (largest 36 m/s) look like noise. The other five have 131 to 191 each with steps of 1,100 to 1,600 m/s: a lost track freezes at its last position and then snaps to the real one, a jump of tens of metres in one frame (checked on J03WOH: the frozen player has zero speed for seconds, then moves smoothly after the jump). These are kept in the shipped binaries as observed (58 to 76 resampled 4 Hz steps per match exceed 12 m/s, every one of them next to a raw jump) and are left out of the physical measures (see the README).
- Red cards: J03WN1 (home label, about minute 7) and J03WQQ (away label, second half: 22 objects in 3,803 in-play frames, about 16 minutes of in-play time). In the other five, 23 objects (22 players and the ball) in every in-play frame.

## What is and is not shipped

- Shipped (`public/data/tracking/`): per match `<id>.bin` and `<id>.json` (positions at 4 Hz in whole centimetres for the roster slots and the ball; per roster slot only side and shirt number, nothing else: no names, no person ids, no height, no referees, no raw 25 Hz data), `<id>.physical.json` (25 Hz measures per player and side, with names), and one `index.json`. The seven binaries are 20,627,780 bytes in all, each 2.7 to 3.1 MB.
- Names appear only in the `.physical.json` files: the short names of professional players from the public match information (a player's full name is not used).
- Not shipped: the raw XML files, the match information, the full-rate caches.

## Known limits

- Seven matches, one provider; men's professional football, two competitions. Results from them describe those matches only.
- Interpolated, rounded and thinned to 4 Hz for size: do not use the shipped files for speed or acceleration work; `research/tracking/measures.py` and `physical.py` use the full-rate data.
- Goalkeepers are inferred from position at the first frame of each half, not read from the data.
- Tracking jumps shorter than 0.48 m in a frame are not detected, and the held first samples of late-starting tracking are up to 1.6 s old (the players stand near their kick-off positions).
- Three binaries are slightly over the 3 MB aim at 4 Hz (J03WMX 3.08 MB, J03WOY and J03WR9 3.01 MB): the format was kept rather than thinning further.
