# Pro match data: the contract

Klupa's engine reads a coach's taps. This data lets the same engine read real professional matches: every match of the 2018 World Cup (64) and Euro 2016 (51) from the open Wyscout event data (Pappalardo et al., _A public data set of spatio-temporal match events in soccer competitions_, Scientific Data 2019, CC BY 4.0, doi:10.6084/m9.figshare.c.4415000).

This file is the agreement between the Python pipeline that writes the files (`research/pro/build.py`) and the TypeScript that reads them (`src/engine/pro/`). Change one side only together with the other and with this file.

## Files

```
public/data/pro/index.json          every match, small: for the list screen
public/data/pro/<matchId>.json      one match, compact: for the analysis screen
research/out/pro_golden.json        reference numbers computed in Python, for the TypeScript tests
research/pro/DATA_CARD.md           source, licence, attribution, what was dropped and why
```

`<matchId>` is the provider's match id (an integer).

## Conventions

- **Sides.** `0` is the home team and `1` the away team, exactly as the provider's match record says (`side: "home" | "away"`). This is not the "lexicographically smaller team id" convention of `research/momentum/scale_validation.py`; that study is unaffected.
- **Periods.** `1` first half, `2` second half, `3` and `4` extra time. Penalty shoot-outs are not events; a shoot-out result is recorded in the index and the match header only.
- **Time.** Whole seconds since the start of the period (floor of the provider's `eventSec`).
- **Positions.** Integers 0 to 100. `x` runs from the acting team's own goal line (0) to the goal line it attacks (100). `y` runs across the pitch from the acting team's left (0) to its right (100). This is the provider's own frame and the same frame as the app's shot locations. A missing position is `-1`.
- **Names.** Players' short names and team names as the provider publishes them, with escape sequences decoded to real characters (`"Mbappé"` must arrive as `Mbappé`).
- **Order.** Events sorted by period, then time, then the provider's event id.
- **Integers only** inside `events`, so the file is small and exact.

## `index.json`

```json
{
  "v": 1,
  "source": { "name": "…", "licence": "CC BY 4.0", "doi": "…" },
  "competitions": [
    { "id": "wc2018", "name": "World Cup 2018" },
    { "id": "euro2016", "name": "Euro 2016" }
  ],
  "matches": [
    {
      "id": 2058017,
      "competition": "wc2018",
      "date": "2018-07-15",
      "stage": "Final",
      "home": "France",
      "away": "Croatia",
      "score": [4, 2],
      "extraTime": false,
      "shootout": null,
      "events": 1612
    }
  ]
}
```

- `stage`: the provider's round name in plain English (`Group A` … `Round of 16`, `Quarter-finals`, `Semi-finals`, `Third place`, `Final`).
- `score`: goals after 90 minutes or after extra time when it was played, shoot-out excluded.
- `shootout`: `null`, or `[homePenalties, awayPenalties]`.
- Matches sorted by date, then id.

## `<matchId>.json`

```json
{
  "v": 1,
  "id": 2058017,
  "competition": "wc2018",
  "date": "2018-07-15",
  "stage": "Final",
  "venue": "…",
  "teams": [
    { "name": "France", "score": 4, "formation": "4-2-3-1" },
    { "name": "Croatia", "score": 2, "formation": "4-2-3-1" }
  ],
  "shootout": null,
  "periods": [
    { "period": 1, "seconds": 2794 },
    { "period": 2, "seconds": 2941 }
  ],
  "players": [
    { "name": "H. Lloris", "team": 0, "role": "GK", "starter": true, "from": 0, "to": 95 }
  ],
  "events": [[1, 3, 0, 4, 0, 50, 50, 31, 62, 1]]
}
```

- `teams[i].formation`: the provider's starting formation when present, otherwise `null`.
- `periods[i].seconds`: floor of the largest `eventSec` in that period.
- `players`: everyone who was in either match squad list and appears in at least one event, plus starters. `role` is one of `GK`, `DF`, `MF`, `FW`. `from` and `to` are match minutes on the pitch (0 for a starter; `to` is the provider's substitution minute or the last minute played). The index of a player in this array is the player number used in `events`.
- `events[i]` is `[period, t, team, player, kind, x, y, x2, y2, flags]`:
  - `player`: index into `players`, or `-1` when the provider names nobody.
  - `x2`, `y2`: where the action ended (a pass's destination), or `-1`.
  - `kind`:

    | kind | meaning                  | from the provider's                                                                  |
    | ---- | ------------------------ | ------------------------------------------------------------------------------------ |
    | 0    | pass                     | `Pass` (every sub-event)                                                             |
    | 1    | shot                     | `Shot`, and `Free Kick` with sub-event `Free kick shot` or `Penalty`                 |
    | 2    | duel                     | `Duel`                                                                               |
    | 3    | free kick, not a shot    | `Free Kick` with any other sub-event (corner, free kick, cross, throw-in, goal kick) |
    | 4    | interception or recovery | `Others on the ball`                                                                 |
    | 5    | foul                     | `Foul`                                                                               |
    | 6    | save attempt             | `Save attempt`                                                                       |
    | 7    | offside                  | `Offside`                                                                            |

    `Interruption` and `Goalkeeper leaving line` are dropped.

  - `flags` is a sum of:

    | bit | value | meaning          | from tag                                                       |
    | --- | ----- | ---------------- | -------------------------------------------------------------- |
    | 0   | 1     | accurate / won   | 1801 for passes and shots on target sense below; 703 for duels |
    | 1   | 2     | goal             | 101 on a shot                                                  |
    | 2   | 4     | header           | 403                                                            |
    | 3   | 8     | from a free kick | shot with sub-event `Free kick shot`                           |
    | 4   | 16    | penalty          | shot with sub-event `Penalty`                                  |
    | 5   | 32    | cross            | pass or free kick with sub-event `Cross` / `Free kick cross`   |
    | 6   | 64    | corner           | free kick with sub-event `Corner`                              |
    | 7   | 128   | key pass         | 302                                                            |
    | 8   | 256   | assist           | 301                                                            |
    | 9   | 512   | own goal         | 102 (on any event)                                             |
    | 10  | 1024  | counter attack   | 1901                                                           |
    | 11  | 2048  | throw-in         | free kick with sub-event `Throw in`                            |
    | 12  | 4096  | goal kick        | free kick with sub-event `Goal kick`                           |
    | 13  | 8192  | interception     | 1401                                                           |

    For a **shot**, bit 0 means on target: the provider's accurate tag 1801.
- An **own goal** is recorded as the provider records it: on the event of the player who scored it, with bit 9. It is never a shot and never has bit 1. The index and the header score already include it.

## `pro_golden.json`

Reference numbers for the TypeScript tests, computed by the pipeline from the raw files, not from the compact files:

```json
{
  "matches": 115,
  "events": 0,
  "perMatch": {
    "2058017": {
      "events": 1612,
      "passes": [0, 0],
      "accuratePasses": [0, 0],
      "shots": [0, 0],
      "shotsOnTarget": [0, 0],
      "goals": [0, 0],
      "ownGoalsFor": [0, 0],
      "corners": [0, 0],
      "xgUnits": [0, 0]
    }
  },
  "passNetwork": {
    "2058017": { "team": 0, "edges": [["P. Pogba", "K. Mbappé", 7]] }
  }
}
```

- `xgUnits`: per team, the sum over its shots of the Klupa model's chance quality in 1/10,000 of a goal, rounded half up per shot, exactly as `research/momentum/scale_validation.py` does it (the model in `src/data/models/xg.json`; a penalty is a fixed 7,600; own goals excluded).
- `goals`: goals scored by that team's shots (tag 101). `ownGoalsFor`: own goals by the other team that count for this team. `goals + ownGoalsFor` must equal the header score for every match; the pipeline fails loudly if not, and the data card lists any match where the provider's events cannot explain the score.
- `passNetwork`: for the 2018 final and the Euro 2016 final, home team: every ordered pair of players with at least three accurate passes from the first to the second, where "to" is the next event's player when that next event belongs to the same team and is within ten seconds. Sorted by count descending, then names.
