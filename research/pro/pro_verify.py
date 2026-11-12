"""Self-checks run after writing: re-read every file and compare it with the contract and the golden numbers."""

from __future__ import annotations

import json
from typing import Any

from pro_common import (
    EXPECTED_MATCHES,
    KNOWN_UNEXPLAINED,
    OUT_DIR,
    PASS_NETWORK_MATCHES,
    _ESCAPE_ANY,
)
from pro_golden import network_from_compact, recompute_from_compact


def strings_in(obj: Any):
    if isinstance(obj, str):
        yield obj
    elif isinstance(obj, dict):
        for v in obj.values():
            yield from strings_in(v)
    elif isinstance(obj, list):
        for v in obj:
            yield from strings_in(v)


def verify_written(golden: dict[str, Any], model: dict[str, Any]) -> list[str]:
    """Re-read every written file and check it against the contract and the golden numbers."""
    problems: list[str] = []
    index = json.loads((OUT_DIR / "index.json").read_text(encoding="utf-8"))
    if index["v"] != 1 or len(index["matches"]) != EXPECTED_MATCHES:
        problems.append(f"index has {len(index['matches'])} matches")
    keys = [(m["date"], m["id"]) for m in index["matches"]]
    if keys != sorted(keys):
        problems.append("index not sorted by date then id")
    if any(_ESCAPE_ANY.search(s) or "\\" in s for s in strings_in(index)):
        problems.append("escape sequence in index.json")
    files = sorted(p.name for p in OUT_DIR.glob("*.json") if p.name != "index.json")
    if files != sorted(f"{m['id']}.json" for m in index["matches"]):
        problems.append("match files do not equal the index")
    total_events = 0
    for row in index["matches"]:
        mid = row["id"]
        doc = json.loads((OUT_DIR / f"{mid}.json").read_text(encoding="utf-8"))
        tag = f"match {mid}"
        total_events += len(doc["events"])
        if row["events"] != len(doc["events"]):
            problems.append(f"{tag}: index event count")
        if any(_ESCAPE_ANY.search(s) or "\\" in s for s in strings_in(doc)):
            problems.append(f"{tag}: escape sequence in a name")
        n_players = len(doc["players"])
        previous = None
        for ev in doc["events"]:
            period, t, team, player, kind, x, y, x2, y2, flags = ev
            if len(ev) != 10 or not all(type(v) is int for v in ev):
                problems.append(f"{tag}: non-integer event {ev}")
                break
            if team not in (0, 1):
                problems.append(f"{tag}: team {team}")
                break
            if not (player == -1 or 0 <= player < n_players) or (player >= 0 and doc["players"][player]["team"] != team):
                problems.append(f"{tag}: player index {player}")
                break
            if not all(v == -1 or 0 <= v <= 100 for v in (x, y, x2, y2)):
                problems.append(f"{tag}: coordinate {ev}")
                break
            if period not in (1, 2, 3, 4) or t < 0 or not 0 <= kind <= 7 or flags < 0 or flags >= 1 << 14:
                problems.append(f"{tag}: bad period/time/kind/flags {ev}")
                break
            if previous is not None and (period, t) < previous:
                problems.append(f"{tag}: events not sorted at {ev}")
                break
            previous = (period, t)
        for p in doc["players"]:
            if not (0 <= p["from"] <= p["to"]) or p["role"] not in ("GK", "DF", "MF", "FW"):
                problems.append(f"{tag}: player {p}")
        want = golden["perMatch"][str(mid)]
        got = recompute_from_compact(doc, model)
        for key, value in got.items():
            if want[key] != value:
                problems.append(f"{tag}: {key} compact {value} != golden {want[key]}")
        # header score equals goals from shots plus own goals for the team
        for side in (0, 1):
            explained = want["goals"][side] + want["ownGoalsFor"][side]
            if explained != doc["teams"][side]["score"] and mid not in KNOWN_UNEXPLAINED:
                problems.append(f"{tag}: score {doc['teams'][side]['score']} but events give {explained}")
        if [t["score"] for t in doc["teams"]] != row["score"]:
            problems.append(f"{tag}: index score differs")
    for mid in PASS_NETWORK_MATCHES:
        doc = json.loads((OUT_DIR / f"{mid}.json").read_text(encoding="utf-8"))
        edges = network_from_compact(doc, 0)
        if edges != golden["passNetwork"][str(mid)]["edges"]:
            problems.append(f"match {mid}: pass network from compact differs from golden")
    if total_events != golden["events"]:
        problems.append(f"total events {total_events} != golden {golden['events']}")
    # the two finals
    final = json.loads((OUT_DIR / "2058017.json").read_text(encoding="utf-8"))
    if [(t["name"], t["score"]) for t in final["teams"]] != [("France", 4), ("Croatia", 2)] or final["stage"] != "Final":
        problems.append("2018 final header is not France 4, Croatia 2")
    euro = json.loads((OUT_DIR / "1694440.json").read_text(encoding="utf-8"))
    euro_row = next(m for m in index["matches"] if m["id"] == 1694440)
    if ([(t["name"], t["score"]) for t in euro["teams"]] != [("Portugal", 1), ("France", 0)]
            or not euro_row["extraTime"] or euro["stage"] != "Final" or euro["shootout"] is not None):
        problems.append("Euro 2016 final header is not Portugal 1, France 0 after extra time")
    return problems
