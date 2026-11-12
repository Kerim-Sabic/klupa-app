"""Reading the raw Wyscout files and turning provider records into contract concepts: stages, kinds, flags, scores."""

from __future__ import annotations

import csv
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path
from typing import Any

from pro_common import (
    COMPETITIONS,
    DROPPED_EVENTS,
    F_ACCURATE,
    F_ASSIST,
    F_CORNER,
    F_COUNTER,
    F_CROSS,
    F_FREE_KICK,
    F_GOAL,
    F_GOAL_KICK,
    F_HEADER,
    F_INTERCEPTION,
    F_KEY_PASS,
    F_OWN_GOAL,
    F_PENALTY,
    F_THROW_IN,
    KIND_DUEL,
    KIND_FOUL,
    KIND_FREE_KICK,
    KIND_OFFSIDE,
    KIND_OTHER,
    KIND_PASS,
    KIND_SAVE,
    KIND_SHOT,
    T_ACCURATE,
    T_ASSIST,
    T_COUNTER,
    T_DUEL_WON,
    T_GOAL,
    T_HEAD,
    T_INTERCEPTION,
    T_KEY_PASS,
    T_OWN_GOAL,
    fail,
)


def verify_tags(raw: Path) -> None:
    """Fail if the tag table does not say what this script assumes."""
    with open(raw / "tags2name.csv", encoding="utf-8", newline="") as fh:
        labels = {int(r["Tag"]): r["Label"] for r in csv.DictReader(fh)}
    expected = {101: "Goal", 102: "own_goal", 403: "head/body", 301: "assist", 302: "keyPass",
                1801: "accurate", 703: "won", 1901: "counter_attack", 1401: "interception"}
    for tag, label in expected.items():
        if labels.get(tag) != label:
            fail(f"tag {tag} is {labels.get(tag)!r} in tags2name.csv, expected {label!r}")


def load(raw: Path) -> dict[str, Any]:
    verify_tags(raw)
    players = {int(p["wyId"]): p for p in json.loads((raw / "players.json").read_text(encoding="utf-8"))}
    teams = {int(t["wyId"]): t for t in json.loads((raw / "teams.json").read_text(encoding="utf-8"))}
    data: dict[str, Any] = {"players": players, "teams": teams, "comps": {}}
    with zipfile.ZipFile(raw / "matches.zip") as zm, zipfile.ZipFile(raw / "events.zip") as ze:
        for suffix, comp_id, _ in COMPETITIONS:
            matches = json.loads(zm.read(f"matches_{suffix}.json"))
            events = json.loads(ze.read(f"events_{suffix}.json"))
            by_match: dict[int, list[dict[str, Any]]] = defaultdict(list)
            for e in events:
                by_match[int(e["matchId"])].append(e)
            data["comps"][comp_id] = (matches, by_match)
    return data


def parse_date(match: dict[str, Any]) -> str:
    """Local calendar date of the kick-off, from the provider's `date` text (checked against UTC)."""
    import datetime

    m = re.match(r"([A-Za-z]+) (\d+), (\d{4}) at ", match["date"])
    if not m:
        fail(f"unreadable date {match['date']!r}")
    d = datetime.datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%B %d %Y").date()
    return d.isoformat()


def stages_for(matches: list[dict[str, Any]]) -> dict[int, str]:
    """Plain-English round name per match id."""
    out: dict[int, str] = {}
    rounds: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for m in matches:
        rounds[int(m["roundId"])].append(m)
    knockout: list[tuple[str, int]] = []
    for round_id, ms in rounds.items():
        if all(int(m["gameweek"]) > 0 for m in ms):
            for m in ms:
                name = m["groupName"]
                if not re.fullmatch(r"Group [A-H]", name):
                    fail(f"group-stage match {m['wyId']} has groupName {name!r}")
                out[int(m["wyId"])] = name
        elif all(int(m["gameweek"]) == 0 for m in ms):
            knockout.append((min(m["dateutc"] for m in ms), round_id))
        else:
            fail(f"round {round_id} mixes group and knockout matches")
    knockout.sort()
    names = {8: "Round of 16", 4: "Quarter-finals", 2: "Semi-finals"}
    for i, (_, round_id) in enumerate(knockout):
        count = len(rounds[round_id])
        if count in names:
            name = names[count]
        elif count == 1:
            name = "Final" if i == len(knockout) - 1 else "Third place"
        else:
            fail(f"round {round_id} has {count} matches")
        for m in rounds[round_id]:
            out[int(m["wyId"])] = name
    return out


def classify(e: dict[str, Any]) -> int | None:
    name, sub = e["eventName"], e["subEventName"]
    if name == "Pass":
        return KIND_PASS
    if name == "Shot":
        return KIND_SHOT
    if name == "Free Kick":
        return KIND_SHOT if sub in ("Free kick shot", "Penalty") else KIND_FREE_KICK
    if name == "Duel":
        return KIND_DUEL
    if name == "Others on the ball":
        return KIND_OTHER
    if name == "Foul":
        return KIND_FOUL
    if name == "Save attempt":
        return KIND_SAVE
    if name == "Offside":
        return KIND_OFFSIDE
    if name in DROPPED_EVENTS:
        return None
    fail(f"unknown event name {name!r}")
    return None


def flags_for(e: dict[str, Any], kind: int) -> int:
    tags = {int(t["id"]) for t in e["tags"]}
    sub = e["subEventName"]
    f = 0
    if kind in (KIND_PASS, KIND_SHOT) and T_ACCURATE in tags:
        f |= F_ACCURATE
    if kind == KIND_DUEL and T_DUEL_WON in tags:
        f |= F_ACCURATE
    if kind == KIND_SHOT and T_GOAL in tags:
        f |= F_GOAL
    if T_HEAD in tags:
        f |= F_HEADER
    if kind == KIND_SHOT and sub == "Free kick shot":
        f |= F_FREE_KICK
    if kind == KIND_SHOT and sub == "Penalty":
        f |= F_PENALTY
    if (kind == KIND_PASS and sub == "Cross") or (kind == KIND_FREE_KICK and sub == "Free kick cross"):
        f |= F_CROSS
    if kind == KIND_FREE_KICK and sub == "Corner":
        f |= F_CORNER
    if T_KEY_PASS in tags:
        f |= F_KEY_PASS
    if T_ASSIST in tags:
        f |= F_ASSIST
    if T_OWN_GOAL in tags:
        f |= F_OWN_GOAL
    if T_COUNTER in tags:
        f |= F_COUNTER
    if kind == KIND_FREE_KICK and sub == "Throw in":
        f |= F_THROW_IN
    if kind == KIND_FREE_KICK and sub == "Goal kick":
        f |= F_GOAL_KICK
    if T_INTERCEPTION in tags:
        f |= F_INTERCEPTION
    if f & F_OWN_GOAL and kind == KIND_SHOT:
        fail(f"own-goal tag on a shot, event {e['id']}")
    return f


def header_score(match: dict[str, Any], home_id: int, away_id: int) -> tuple[int, int]:
    """Goals after 90 minutes, or after extra time when it was played; shoot-out excluded.

    In the match record `score` is the 90-minute score and `scoreET` the running score after
    extra time (not the goals scored in it); `scoreP` is the shoot-out tally.
    """
    td = match["teamsData"]
    h, a = td[str(home_id)], td[str(away_id)]
    if match["duration"] == "Regular":
        if h["scoreET"] != 0 or a["scoreET"] != 0:
            fail(f"match {match['wyId']}: regular time but scoreET set")
        return int(h["score"]), int(a["score"])
    if match["duration"] not in ("ExtraTime", "Penalties"):
        fail(f"match {match['wyId']}: duration {match['duration']!r}")
    if h["scoreET"] < h["score"] or a["scoreET"] < a["score"]:
        fail(f"match {match['wyId']}: scoreET below score")
    return int(h["scoreET"]), int(a["scoreET"])
