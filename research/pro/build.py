"""Build the pro match data (World Cup 2018 and Euro 2016) from the open Wyscout event data.

Run from the repository root:

    research/.venv/Scripts/python.exe research/pro/build.py [RAW_DIR]

RAW_DIR defaults to research/data/raw and must hold events.zip, matches.zip, tags2name.csv,
players.json and teams.json (see research/data/MANIFEST.json). Writes, exactly as
research/pro/CONTRACT.md says:

    public/data/pro/index.json
    public/data/pro/<matchId>.json      (one per match)
    research/out/pro_golden.json

The golden numbers are computed from the raw events by a separate code path from the compact
encoding. After writing, every compact file is read back and the numbers are recomputed from the
compact events; any difference, or any failed check, ends the run with a non-zero exit code.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any

# Running with `python -I` does not put this folder on sys.path, so add it before the sibling imports
# (the same way research/tracking/*.py reach `common`).
sys.path.insert(0, str(Path(__file__).resolve().parent))

from pro_common import (
    BuildError,
    COMPETITIONS,
    EXPECTED_MATCHES,
    GOLDEN_PATH,
    KNOWN_UNEXPLAINED,
    MODEL_PATH,
    OUT_DIR,
    PASS_NETWORK_MATCHES,
    ROOT,
    SOURCE,
    decode,
    dump_compact,
    fail,
)  # noqa: E402
from pro_match import build_match  # noqa: E402
from pro_raw import load, stages_for  # noqa: E402
from pro_golden import pass_network_from_raw  # noqa: E402
from pro_verify import verify_written  # noqa: E402


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("raw", nargs="?", default=str(ROOT / "research" / "data" / "raw"),
                    help="folder with events.zip, matches.zip, tags2name.csv, players.json, teams.json")
    raw = Path(ap.parse_args().raw).resolve()
    model = json.loads(MODEL_PATH.read_text(encoding="utf-8"))
    data = load(raw)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    GOLDEN_PATH.parent.mkdir(parents=True, exist_ok=True)
    for stale in OUT_DIR.glob("*.json"):
        stale.unlink()

    index_rows: list[dict[str, Any]] = []
    golden: dict[str, Any] = {"matches": 0, "events": 0, "perMatch": {}, "passNetwork": {}}
    unexplained: list[dict[str, Any]] = []
    stage_names: Counter[str] = Counter()
    clamped_total = 0
    shootout_mismatch: list[int] = []
    inferred_all: list[tuple[int, int, int]] = []
    sizes: dict[int, int] = {}
    seen_ids: set[int] = set()
    for suffix, comp_id, _ in COMPETITIONS:
        matches, by_match = data["comps"][comp_id]
        stages = stages_for(matches)
        extra_ids = set(by_match) - {int(m["wyId"]) for m in matches}
        if extra_ids:
            fail(f"{comp_id}: events for unknown matches {sorted(extra_ids)}")
        for match in matches:
            match_id = int(match["wyId"])
            if match_id in seen_ids or match["status"] != "Played":
                fail(f"match {match_id}: duplicate or not played")
            seen_ids.add(match_id)
            if match_id not in by_match:
                fail(f"match {match_id}: no events")
            content, row, gold = build_match(comp_id, match, stages[match_id], by_match[match_id], data, model)
            text = dump_compact(content)
            (OUT_DIR / f"{match_id}.json").write_text(text, encoding="utf-8", newline="\n")
            sizes[match_id] = len(text.encode("utf-8"))
            index_rows.append(row)
            stage_names[row["stage"]] += 1
            clamped_total += gold.pop("_clampedCoordinates")
            for pid, start in gold.pop("_inferredFrom"):
                inferred_all.append((match_id, pid, start))
            p_goals = gold.pop("_shootoutGoalsInEvents", None)
            if p_goals is not None and p_goals != row["shootout"]:
                shootout_mismatch.append(match_id)
            golden["perMatch"][str(match_id)] = gold
            golden["events"] += gold["events"]
            for side in (0, 1):
                explained = gold["goals"][side] + gold["ownGoalsFor"][side]
                if explained != row["score"][side]:
                    unexplained.append({"id": match_id, "match": f"{row['home']} {row['score'][0]}-{row['score'][1]} "
                                        f"{row['away']}", "stage": row["stage"], "date": row["date"],
                                        "side": side, "header": row["score"][side], "fromEvents": explained,
                                        "goals": gold["goals"][side], "ownGoalsFor": gold["ownGoalsFor"][side]})
            if match_id in PASS_NETWORK_MATCHES:
                side_of = {}
                for tid, v in match["teamsData"].items():
                    side_of[int(tid)] = 0 if v["side"] == "home" else 1
                # names by provider id, rebuilt from the squads so the network is independent of the file
                squad_ids = [int(p["playerId"]) for v in match["teamsData"].values()
                             for p in v["formation"]["lineup"] + v["formation"]["bench"]]
                names = {pid: decode(str(data["players"][pid]["shortName"])) for pid in squad_ids}
                home_names = [names[int(p["playerId"])] for tid, v in match["teamsData"].items()
                              if v["side"] == "home" for p in v["formation"]["lineup"] + v["formation"]["bench"]]
                if len(home_names) != len(set(home_names)):
                    fail(f"match {match_id}: duplicate short names in the home squad")
                golden["passNetwork"][str(match_id)] = {
                    "team": 0, "edges": pass_network_from_raw(by_match[match_id], names, side_of, 0)}
    if len(seen_ids) != EXPECTED_MATCHES:
        fail(f"{len(seen_ids)} matches, expected {EXPECTED_MATCHES}")
    golden["matches"] = len(seen_ids)

    index_rows.sort(key=lambda r: (r["date"], r["id"]))
    index = {"v": 1, "source": SOURCE,
             "competitions": [{"id": cid, "name": name} for _, cid, name in COMPETITIONS], "matches": index_rows}
    (OUT_DIR / "index.json").write_text(dump_compact(index), encoding="utf-8", newline="\n")
    GOLDEN_PATH.write_text(json.dumps(golden, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")

    # ---- report
    total_bytes = sum(p.stat().st_size for p in OUT_DIR.glob("*.json"))
    print(f"matches: {len(seen_ids)}  events: {golden['events']}")
    print(f"public/data/pro total bytes: {total_bytes}  (index.json {(OUT_DIR / 'index.json').stat().st_size}, "
          f"match files {min(sizes.values())} to {max(sizes.values())}, mean {sum(sizes.values()) // len(sizes)})")
    print("stages:", dict(stage_names))
    print("coordinates clamped to 0..100:", clamped_total)
    print("players with events but no substitution record (from = first-event minute):", inferred_all)
    if shootout_mismatch:
        print("shoot-out goals in events differ from scoreP:", shootout_mismatch)
    problems: list[str] = []
    if unexplained:
        print("\nMATCHES WHOSE EVENTS DO NOT EXPLAIN THE HEADER SCORE:")
        for u in unexplained:
            print(" ", u)
            if u["id"] not in KNOWN_UNEXPLAINED:
                problems.append(f"match {u['id']} ({u['match']}): header {u['header']} but events give {u['fromEvents']}")
    problems += verify_written(golden, model)
    if problems:
        print("\nFAILED CHECKS:")
        for p in problems:
            print(" ", p)
        sys.exit(1)
    print("\nall checks passed: re-read", len(index_rows) + 1, "files; compact numbers equal golden numbers")


if __name__ == "__main__":
    try:
        main()
    except BuildError as err:
        print("BUILD FAILED:", err, file=sys.stderr)
        sys.exit(1)
