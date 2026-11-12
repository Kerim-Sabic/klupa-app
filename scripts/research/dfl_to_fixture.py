"""Convert checksum-verified DFL IDSSE event XML into compact shot fixtures.

Source: Bassek et al., "An integrated dataset of spatiotemporal and event data
in elite soccer" (DFL), CC BY 4.0, doi:10.6084/m9.figshare.28196177.v1.

Only shot time, side and provider xG are kept. No player identities are written.
Usage: python dfl_to_fixture.py <dir with manifest.json + XML> <output dir>
Standard library only, Python 3.12.
"""
import argparse
from datetime import datetime
from hashlib import sha256
import json
from pathlib import Path
from xml.etree import ElementTree as ET

HALVES = ("firstHalf", "secondHalf")


def convert(path: Path, expected_sha256: str) -> dict:
    data = path.read_bytes()
    if sha256(data).hexdigest() != expected_sha256:
        raise ValueError(f"Checksum mismatch: {path.name}")
    events = ET.fromstring(data).findall("Event")
    match_ids = {event.attrib["MatchId"] for event in events}
    if len(match_ids) != 1:
        raise ValueError("Mixed matches in one file")
    active = [event for event in events if event.find("Delete") is None]
    starts: dict[str, datetime] = {}
    ends: dict[str, datetime] = {}
    shots: list[tuple[datetime, str, str]] = []
    sides: set[str] = set()
    for event in active:
        time = datetime.fromisoformat(event.attrib["EventTime"])
        for child in event:
            half = child.get("GameSection")
            if half in HALVES and child.tag in ("KickOff", "FinalWhistle"):
                (starts if child.tag == "KickOff" else ends)[half] = time
            if child.tag == "KickOff" and half == "firstHalf":
                sides.update((child.attrib["TeamLeft"], child.attrib["TeamRight"]))
        for node in event.iter("ShotAtGoal"):
            shots.append((time, node.attrib["Team"], node.attrib["xG"]))
    if len(sides) != 2:
        raise ValueError("Expected exactly two sides")
    # Stable, non-identifying side labels: lexicographically smaller id is "home".
    label = {team: ("home" if team == min(sides) else "away") for team in sides}
    periods = []
    for index, half in enumerate(HALVES, start=1):
        start, end = starts[half], ends[half]
        rows = sorted(
            ((t - start).total_seconds(), label[team], xg)
            for t, team, xg in shots
            if start <= t <= end
        )
        periods.append(
            {
                "period": index,
                "durationSeconds": int((end - start).total_seconds()),
                "shots": [
                    {"t": round(seconds, 3), "side": side, "xg": xg}
                    for seconds, side, xg in rows
                ],
            }
        )
    return {
        "match": next(iter(match_ids)),
        "source": "DFL IDSSE v1 event data, CC BY 4.0, doi:10.6084/m9.figshare.28196177.v1",
        "sourceSha256": expected_sha256,
        "periods": periods,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    manifest = json.loads((args.source / "manifest.json").read_text(encoding="utf-8"))
    args.output.mkdir(parents=True, exist_ok=True)
    index = []
    decimals = 0
    for row in manifest["files"]:
        fixture = convert(args.source / row["file"], row["sha256"])
        name = f"{fixture['match']}.json"
        (args.output / name).write_text(json.dumps(fixture, indent=1) + "\n", encoding="utf-8")
        shot_count = sum(len(p["shots"]) for p in fixture["periods"])
        index.append({"match": fixture["match"], "file": name, "shots": shot_count})
        for period in fixture["periods"]:
            for shot in period["shots"]:
                decimals = max(decimals, len(shot["xg"].partition(".")[2]))
    (args.output / "index.json").write_text(json.dumps(index, indent=1) + "\n", encoding="utf-8")
    print(json.dumps({"matches": index, "maxXgDecimals": decimals}, indent=1))


if __name__ == "__main__":
    main()
