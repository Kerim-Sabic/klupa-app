"""Build public/data/tracking/index.json: one entry per converted match, in kick-off order.

Everything but the club names, date, competition and score comes from the shipped files
(`<short id>.bin` and `.json`). Club names, date, competition and the final score come from
the match information; the score is cross-checked against the goals counted in the raw
events (every ShotAtGoal with a SuccessfulShot, by the shooting club). "home" and "away"
are the event fixture's labels, exactly as in the binary: the lexicographically smaller
club id is "home", which is not necessarily the DFL home team, and the score is given for
the sides as the file labels them. Each match's shots, rebuilt from the raw events with
these labels, are also compared with src/data/dfl/<match>.json, so a wrong label would
show up here. Writes research/out/tracking_index.json with those checks.
Run: research/.venv/Scripts/python.exe -I research/tracking/index.py
"""

from __future__ import annotations

import hashlib
import json
import sys
from datetime import datetime
from pathlib import Path
from xml.etree import ElementTree as ET

sys.path.insert(0, str(Path(__file__).resolve().parent))

import common
import geometry

MATCHES = ("J03WMX", "J03WN1", "J03WOH", "J03WOY", "J03WPY", "J03WQQ", "J03WR9")


def raw_file(prefix: str, short: str) -> Path:
    found = sorted(common.RAW.glob(f"{prefix}_DFL-COM-*_DFL-MAT-{short}.xml"))
    if len(found) != 1:
        raise SystemExit(f"expected one {prefix} file for {short}, found {len(found)}")
    return found[0]


def events_summary(path: Path, label: dict[str, str]) -> dict:
    """Goals and shots per label, with shot times relative to each half's kick-off."""
    events = ET.parse(path).getroot().findall("Event")
    active = [e for e in events if e.find("Delete") is None]
    starts: dict[str, datetime] = {}
    ends: dict[str, datetime] = {}
    shots: list[tuple[datetime, str, str, bool]] = []
    for event in active:
        time = datetime.fromisoformat(event.attrib["EventTime"])
        for child in event:
            half = child.get("GameSection")
            if half in common.HALVES and child.tag in ("KickOff", "FinalWhistle"):
                (starts if child.tag == "KickOff" else ends)[half] = time
        for node in event.iter("ShotAtGoal"):
            shots.append((time, label[node.attrib["Team"]], node.attrib["xG"], node.find("SuccessfulShot") is not None))
    goals = {"home": 0, "away": 0}
    for _t, side, _xg, scored in shots:
        goals[side] += int(scored)
    periods = []
    for half in common.HALVES:
        rows = sorted(
            (round((t - starts[half]).total_seconds(), 3), side, xg)
            for t, side, xg, _scored in shots
            if starts[half] <= t <= ends[half]
        )
        periods.append(rows)
    return {"goals": goals, "shots": periods, "shotsTotal": len(shots)}


def describe(short: str) -> tuple[dict, dict]:
    match = f"DFL-MAT-{short}"
    info = common.read_match_info(raw_file("DFL_02_01_matchinformation", short))
    label = common.side_labels(raw_file("DFL_03_02_events_raw", short))
    general = info["general"]
    names = {label[club]: team["name"] for club, team in info["teams"].items()}
    dfl_home, dfl_guest = (int(n) for n in general["Result"].split(":"))
    by_label = {label[general["HomeTeamId"]]: dfl_home, label[general["GuestTeamId"]]: dfl_guest}
    summary = events_summary(raw_file("DFL_03_02_events_raw", short), label)
    fixture = json.loads((common.REPO / "src" / "data" / "dfl" / f"{match}.json").read_text(encoding="utf-8"))
    fixture_shots = [[(s["t"], s["side"], s["xg"]) for s in p["shots"]] for p in fixture["periods"]]
    kickoff = datetime.fromisoformat(general["KickoffTime"])
    binary = (geometry.TRACKING_DIR / f"{short}.bin").read_bytes()
    meta = json.loads((geometry.TRACKING_DIR / f"{short}.json").read_text(encoding="utf-8"))
    checks = {
        "match": match,
        "resultInMatchInformation": general["Result"],
        "dflHomeClub": info["teams"][general["HomeTeamId"]]["name"],
        "fileHomeClub": names["home"],
        "fileHomeIsDflHome": label[general["HomeTeamId"]] == "home",
        "goalsCountedInEvents": summary["goals"],
        "scoreByFileLabel": by_label,
        "goalsMatchResult": summary["goals"] == by_label,
        "shotsRebuilt": summary["shotsTotal"],
        "shotsEqualFixture": [list(map(list, p)) for p in summary["shots"]] == [list(map(list, p)) for p in fixture_shots],
        "binaryMatchesMetadata": hashlib.sha256(binary).hexdigest() == meta["sha256"] and len(binary) == meta["bytes"],
    }
    entry = {
        "id": short,
        "date": kickoff.date().isoformat(),
        "competition": f"{general['CompetitionName']} {general['Season']}",
        "home": names["home"],
        "away": names["away"],
        "score": [by_label["home"], by_label["away"]],
        "periods": [p["durationSeconds"] for p in meta["periods"]],
        "bytes": len(binary),
        "sha256": hashlib.sha256(binary).hexdigest(),
    }
    return {"kickoff": general["KickoffTime"], **entry}, checks


def main() -> None:
    rows = []
    reports = []
    for short in MATCHES:
        entry, checks = describe(short)
        rows.append(entry)
        reports.append(checks)
        if not (checks["goalsMatchResult"] and checks["shotsEqualFixture"] and checks["binaryMatchesMetadata"]):
            raise SystemExit(f"check failed for {short}: {json.dumps(checks)}")
    rows.sort(key=lambda r: (datetime.fromisoformat(r["kickoff"]), r["id"]))
    index = [{k: v for k, v in row.items() if k != "kickoff"} for row in rows]
    path = geometry.TRACKING_DIR / "index.json"
    path.write_text(json.dumps(index, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    common.OUT.mkdir(exist_ok=True)
    (common.OUT / "tracking_index.json").write_text(
        json.dumps(reports, indent=1, ensure_ascii=False) + "\n", encoding="utf-8"
    )
    print(json.dumps(index, indent=1, ensure_ascii=False))


if __name__ == "__main__":
    main()
