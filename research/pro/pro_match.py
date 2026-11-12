"""Converting one provider match (squads, minutes, events) into the compact match file, index row and golden entry."""

from __future__ import annotations

import math
from typing import Any

from pro_common import (
    PERIODS,
    PERIOD_OFFSET_SECONDS,
    ROLE_CODES,
    T_GOAL,
    decode,
    fail,
)
from pro_golden import golden_from_raw
from pro_raw import classify, flags_for, header_score, parse_date


def build_match(comp_id: str, match: dict[str, Any], stage: str, raw_events: list[dict[str, Any]],
                data: dict[str, Any], model: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    """Return (match file content, index row, golden entry)."""
    match_id = int(match["wyId"])
    td = match["teamsData"]
    if len(td) != 2:
        fail(f"match {match_id}: {len(td)} teams")
    home_id = next(int(t) for t, v in td.items() if v["side"] == "home")
    away_id = next(int(t) for t, v in td.items() if v["side"] == "away")
    team_ids = [home_id, away_id]
    side_of = {home_id: 0, away_id: 1}
    for tid in team_ids:
        if tid not in data["teams"]:
            fail(f"match {match_id}: team {tid} not in teams.json")
    team_names = [decode(str(data["teams"][t]["name"])) for t in team_ids]
    score = header_score(match, home_id, away_id)
    shootout = None
    if match["duration"] == "Penalties":
        shootout = [int(td[str(home_id)]["scoreP"]), int(td[str(away_id)]["scoreP"])]

    # ---- squads
    squads: dict[int, dict[str, Any]] = {}  # playerId -> {team, starter, order}
    sub_in: dict[int, int] = {}
    sub_out: dict[int, int] = {}
    red: dict[int, int] = {}
    for side, tid in enumerate(team_ids):
        f = td[str(tid)]["formation"]
        for order, p in enumerate(f["lineup"]):
            squads[int(p["playerId"])] = {"team": side, "starter": True, "order": order}
        for order, p in enumerate(f["bench"]):
            squads[int(p["playerId"])] = {"team": side, "starter": False, "order": order}
        for s in f["substitutions"]:
            sub_in[int(s["playerIn"])] = int(s["minute"])
            sub_out[int(s["playerOut"])] = int(s["minute"])
        for p in f["lineup"] + f["bench"]:
            minute = int(p["redCards"])
            if minute > 0:
                red[int(p["playerId"])] = minute

    # ---- periods and the match clock
    max_sec: dict[int, int] = {}
    for e in raw_events:
        code = e["matchPeriod"]
        if code in PERIODS:
            period = PERIODS[code]
            max_sec[period] = max(max_sec.get(period, 0), int(math.floor(e["eventSec"])))
        elif code != "P":
            fail(f"match {match_id}: unknown period {code!r}")
    played = sorted(max_sec)
    expected_periods = [1, 2] if match["duration"] == "Regular" else [1, 2, 3, 4]
    if played != expected_periods:
        fail(f"match {match_id}: periods {played}, duration {match['duration']}")
    last = played[-1]
    end_minute = (PERIOD_OFFSET_SECONDS[last] + max_sec[last]) // 60  # whole minutes elapsed

    # ---- events
    rows: list[tuple[int, int, int, int, int, int, int, int, int, int, int]] = []  # + provider id last
    used: set[int] = set()
    clamped = 0
    for e in raw_events:
        kind = classify(e)
        if kind is None or e["matchPeriod"] not in PERIODS:
            continue
        tid = int(e["teamId"])
        if tid not in side_of:
            fail(f"match {match_id}: event {e['id']} team {tid} not in match")
        pid = int(e["playerId"])
        if pid != 0:
            if pid not in squads:
                fail(f"match {match_id}: event {e['id']} player {pid} not in a squad list")
            if squads[pid]["team"] != side_of[tid]:
                fail(f"match {match_id}: event {e['id']} player {pid} on the other team")
            used.add(pid)
        coords: list[int] = []
        positions = e["positions"]
        if not positions:
            fail(f"match {match_id}: event {e['id']} has no position")
        for i in range(2):
            if i < len(positions):
                for axis in ("x", "y"):
                    v = int(positions[i][axis])
                    if v < 0 or v > 100:
                        clamped += 1
                        v = min(100, max(0, v))
                    coords.append(v)
            else:
                coords += [-1, -1]
        rows.append((PERIODS[e["matchPeriod"]], int(math.floor(e["eventSec"])), int(e["id"]), side_of[tid],
                     pid, kind, coords[0], coords[1], coords[2], coords[3], flags_for(e, kind)))
    rows.sort(key=lambda r: (r[0], r[1], r[2]))

    # ---- players
    starters = {p for p, v in squads.items() if v["starter"]}
    chosen = sorted(
        starters | used,
        key=lambda p: (squads[p]["team"], not squads[p]["starter"], squads[p]["order"] if squads[p]["starter"]
                       else (sub_in.get(p, 10**6), squads[p]["order"])),
    )
    index_of = {p: i for i, p in enumerate(chosen)}
    players_out = []
    inferred: list[tuple[int, int, int]] = []
    for p in chosen:
        info = data["players"][p]
        starter = squads[p]["starter"]
        if starter:
            start = 0
        elif p in sub_in:
            start = sub_in[p]
        else:
            # the match record lists no substitution for this bench player although he has events:
            # use the match minute of his first event (a provider gap, reported in the run output)
            first = min(r for r in rows if r[4] == p)
            start = int(math.floor((PERIOD_OFFSET_SECONDS[first[0]] + first[1]) / 60))
            inferred.append((match_id, p, start))
        if p in sub_out:
            end = sub_out[p]
        elif p in red:
            end = red[p]
        else:
            end = end_minute
        if end < start:
            fail(f"match {match_id}: player {p} from {start} to {end}")
        players_out.append({
            "name": decode(str(info["shortName"])), "team": squads[p]["team"],
            "role": ROLE_CODES[info["role"]["code2"]], "starter": starter, "from": start, "to": end,
        })
    names_by_id = {p: players_out[i]["name"] for p, i in index_of.items()}

    events_out = [[r[0], r[1], r[3], index_of[r[4]] if r[4] != 0 else -1, *r[5:]] for r in rows]

    formations = [None, None]  # the match record carries lineups only, no formation string
    content = {
        "v": 1, "id": match_id, "competition": comp_id, "date": parse_date(match), "stage": stage,
        "venue": decode(str(match["venue"])),
        "teams": [{"name": team_names[i], "score": score[i], "formation": formations[i]} for i in range(2)],
        "shootout": shootout,
        "periods": [{"period": p, "seconds": max_sec[p]} for p in played],
        "players": players_out,
        "events": events_out,
    }
    row = {
        "id": match_id, "competition": comp_id, "date": content["date"], "stage": stage,
        "home": team_names[0], "away": team_names[1], "score": list(score),
        "extraTime": match["duration"] != "Regular", "shootout": shootout, "events": len(events_out),
    }
    names_for_golden = {p: names_by_id[p] for p in names_by_id}
    golden = golden_from_raw(match, raw_events, names_for_golden, side_of, model)
    if golden["events"] != len(events_out):
        fail(f"match {match_id}: golden event count {golden['events']} != compact {len(events_out)}")
    golden["_clampedCoordinates"] = clamped
    # shoot-out cross-check: goals scored in period P should equal the shoot-out tally
    if shootout is not None:
        p_goals = [0, 0]
        for e in raw_events:
            if e["matchPeriod"] == "P" and e["eventName"] == "Free Kick" and e["subEventName"] == "Penalty":
                if any(int(t["id"]) == T_GOAL for t in e["tags"]):
                    p_goals[side_of[int(e["teamId"])]] += 1
        golden["_shootoutGoalsInEvents"] = p_goals
    golden["_inferredFrom"] = [(pid, start) for _, pid, start in inferred]
    return content, row, golden
