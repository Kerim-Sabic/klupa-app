# Data card: pro match data (World Cup 2018 and Euro 2016)

The files in `public/data/pro/` and `research/out/pro_golden.json` are written by `research/pro/build.py` and described field by field in `CONTRACT.md`. This card says where the data comes from, what was kept and dropped, and what to be careful about.

## Source and licence

- Collection: "Soccer match event dataset", Pappalardo, Luca; Massucco, Emanuele (2019), figshare, DOI 10.6084/m9.figshare.c.4415000.v5.
- Licence: CC BY 4.0. The figshare API states it for every article used (events, matches, players, teams); read on 2026-11-11 and 2026-11-12.
- Files used: `events.zip`, `matches.zip`, `tags2name.csv`, `players.json` (figshare file 15073721), `teams.json` (figshare file 15073697). Sizes, SHA-256 and URLs are in `research/data/MANIFEST.json`; the MD5 of `players.json` and `teams.json` equals the figshare listing.
- Attribution the authors ask for (collection description): anyone using the data cites
  - Pappalardo et al. (2019), _A public data set of spatio-temporal match events in soccer competitions_, Nature Scientific Data 6:236, https://www.nature.com/articles/s41597-019-0247-7
  - Pappalardo et al. (2019), _PlayeRank: Data-driven Performance Evaluation and Player Ranking in Soccer via a Machine Learning Approach_, ACM TIST 10(5), Article 59, https://doi.org/10.1145/3343172
  - and the collection itself: Pappalardo, Luca; Massucco, Emanuele (2019). Soccer match event dataset. figshare. Collection. https://doi.org/10.6084/m9.figshare.c.4415000.v5. The event data were collected by Wyscout.
- Changes made: events reduced to the compact integer form in `CONTRACT.md`, some event types dropped (below), names decoded. The `source` block in `index.json` carries the name, licence and DOI.

## What each output contains

- `index.json` (20,381 bytes): 115 matches (64 World Cup 2018, 51 Euro 2016), sorted by date then id: id, competition, date, stage, home, away, score, extra time flag, shoot-out result, number of events.
- `<matchId>.json` (115 files, 39,705 to 65,911 bytes each, mean 48,090): header (teams, score, venue, stage, periods, shoot-out), the player list and the events as arrays of ten integers.
- `research/out/pro_golden.json` (45,313 bytes): per-match reference numbers computed from the raw events (passes, accurate passes, shots, shots on target, goals, own goals for, corners, chance quality in 1/10,000 units, event counts) and the pass networks of the two finals.
- Totals: 179,365 events in the files (of 179,899 in the raw files for these two competitions); `public/data/pro` is 5,550,737 bytes in all. 3,197 player entries (2,530 starters, 115 x 22). Event kinds: pass 100,152; duel 47,028; other on the ball 14,403; free kick not a shot 10,517; foul 3,094; shot 2,829; save attempt 981; offside 361. Shots on target 912, goals from shots 262, own goals 15, corners 1,135, accurate passes 85,011.
- Stage names: Group A to H (World Cup), Group A to F (Euro), Round of 16 (16), Quarter-finals (8), Semi-finals (4), Third place (1, World Cup only), Final (2).
- Match totals agree with the tournaments' published totals: 169 goals at the World Cup (12 of them own goals) and 108 at Euro 2016 (3 own goals in the events; the headers still add up, see below).

## What was dropped and why

- `Interruption` (1 event) and `Goalkeeper leaving line` (212 World Cup, 174 Euro): not part of the contract's kinds.
- Penalty shoot-out events (period `P`: 76 World Cup, 71 Euro, all `Free Kick`/`Penalty` and `Save attempt`): the contract keeps only the result, in `shootout`. The goals in those events equal `scoreP` in all 7 shoot-outs.
- Everything the provider records beyond the contract: full tag list (only the tags in the flag table are kept), event and sub-event names (reduced to `kind` plus flags), the eventId and event ids themselves, referees, coaches, cards and goal minutes, bench players with no event, player attributes (height, weight, birth date, foot), team details.

## How the contract was read, where the data forced a choice

- Score. In the match record `score` is the 90-minute score and `scoreET` the running score after extra time (not the goals scored in it). The header score is `score` for a regular match and `scoreET` when extra time was played. `extraTime` is true when the provider's duration is `ExtraTime` or `Penalties`; both have `E1`/`E2` events in every case (5 + 5 matches).
- Every match: goals from shots (tag 101 on a shot) plus the other team's own goals (tag 102) equals the header score for both teams. **No match needed an exception**: the provider's events explain all 115 scores, so no match is listed as unexplained. `build.py` keeps a `KNOWN_UNEXPLAINED` list for this and fails on any match not in it; it is empty.
- `formation` is `null` in every file. The match record carries lineups, bench and substitutions but no formation string (the contract says "when present").
- `role`: the provider writes `MD` for midfielders; it is mapped to `MF`.
- Names: the provider's `shortName` and team `name` arrive with literal backslash-u sequences (double escaped, 722 player names). They are decoded; a soft hyphen (U+00AD) embedded in a few names is removed. Nothing else is changed ("as the provider publishes them": initials, `Korea Republic`, `Iran`, and so on).
- Player minutes: `from` and `to` are whole minutes elapsed on the match clock. A substituted player's `to` (and the substitute's `from`) is the provider's substitution minute; a player sent off has `to` equal to the red card minute; everyone else has `to` equal to the match end, which is the floor of (nominal period start + the largest event second of the last period) / 60 (the 2018 final ends at minute 95). Players are ordered home team first, starters in lineup order, then substitutes by minute.
- Match 2057988 (Korea Republic v Germany): bench player 107623 has events from about minute 78 but the provider lists no substitution for him (or for the player he replaced). His `from` is 78 from his first event; the player who left is not known, so that player's `to` is the match end.
- Coordinates: two events in match 2057974 (event ids 259750995 and 259750997, both passes) have a `y` of 101 in the provider's data; they are clamped to 100. Nothing else was out of range. A second position that the provider omits (4 World Cup passes and fouls, 28 Euro fouls) is -1.
- Flags: bit 0 (accurate / won) is set only for passes, shots (on target) and duels (won), as the contract's table says; free kicks that are not shots (corners, crosses, throw-ins) do not carry it even where the provider tagged them accurate. Bits 2 (header), 7, 8, 9, 10 and 13 are set from their tags on any kind of event. The goal bit is set only on shots; tag 101 on a `Save attempt` is the keeper's failed save and is not a goal event.
- Periods: `periods[i].seconds` is the floor of the largest `eventSec` over all the provider's events in that period, including dropped types.
- Own goals: tag 102 appears on events of the defending player (12 `Others on the ball` at the World Cup; 2 `Others on the ball` and 1 `Pass` at Euro 2016), never on a shot. The goal counts for the other team in `ownGoalsFor`.
- Chance quality (`xgUnits`): the Klupa model in `src/data/models/xg.json` on the first position of every shot in periods 1 to 4, header from tag 403, free kick from the sub-event `Free kick shot`, round half up per shot, a penalty fixed at 7,600. Extra-time shots are included (the momentum study used only the two halves).
- Pass network (2018 final and Euro 2016 final, home team): the "next event" is the next event in the file's order, in the same period; the receiver is its player if its team is the same, it names a player different from the passer, and its whole-second time is at most ten seconds later. Only accurate passes (kind 0 with bit 0) count; pairs need at least three. Sorted by count descending, then passer name, then receiver name, compared as Unicode code points.

## Known limits

- Positions are where events happened, not where every player stood; there is no tracking in this data. Passes carry a destination, most other events do not.
- Coordinates are integer percentages of pitch length and width (about 1 m); `x` runs from the acting team's own goal line to the one it attacks.
- Provider tagging is human-assisted and uneven: pass accuracy, key passes, assists and duel outcomes are the provider's judgement; keepers' long kicks and clearances are `Pass` or `Others on the ball` according to the tagger.
- Substitution minutes are the provider's and can disagree with the event clock by a minute (and one substitution is missing, above). Players' `to` for a red card is the provider's card minute.
- Names are short names as published: initials and first letters only, no player ids are shipped. Two squad members of one team sharing a short name would be indistinguishable in the pass network; the build fails if that happens in the two networks.
- Men's senior international tournaments only, 2016 and 2018. The data say nothing about youth football.
- `prettier` was not run over `research/out/pro_golden.json` or this card (there is no `node_modules` in the working checkout); `public/data/pro` is in `.prettierignore` because its compact JSON must not be reformatted.

## Reproduce

```
research/.venv/Scripts/python.exe research/pro/build.py            # raw files in research/data/raw
research/.venv/Scripts/python.exe research/pro/build.py <raw dir>  # or name the folder
```

Run from the repository root. It prints the totals, lists any match whose events do not explain its score, writes the files, reads every file back and compares the numbers recomputed from the compact events with the golden numbers; any failure exits non-zero.

`build.py` is the entry point; it imports its sibling modules `pro_common.py` (constants, paths, text decoding), `pro_raw.py` (reading the raw files, stages, kinds, flags, scores), `pro_match.py` (one match: squads, minutes, events), `pro_golden.py` (golden numbers and their recomputation) and `pro_verify.py` (the read-back checks).
