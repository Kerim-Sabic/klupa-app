"""Shared constants, paths, error type and text decoding for the pro match pipeline (see build.py)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
OUT_DIR = ROOT / "public" / "data" / "pro"
GOLDEN_PATH = ROOT / "research" / "out" / "pro_golden.json"
MODEL_PATH = ROOT / "src" / "data" / "models" / "xg.json"

COMPETITIONS = [
    # (file suffix in the zips, id in our files, display name)
    ("World_Cup", "wc2018", "World Cup 2018"),
    ("European_Championship", "euro2016", "Euro 2016"),
]
SOURCE = {
    "name": "Wyscout open soccer match event dataset (Pappalardo et al., Scientific Data, 2019)",
    "licence": "CC BY 4.0",
    "doi": "10.6084/m9.figshare.c.4415000",
}
EXPECTED_MATCHES = 115

# provider period code -> our period number. "P" (penalty shoot-out) is dropped.
PERIODS = {"1H": 1, "2H": 2, "E1": 3, "E2": 4}
# nominal start of each period on the match clock, in seconds (45, 45, 15, 15 minutes)
PERIOD_OFFSET_SECONDS = {1: 0, 2: 2700, 3: 5400, 4: 6300}
DROPPED_EVENTS = {"Interruption", "Goalkeeper leaving line"}
ROLE_CODES = {"GK": "GK", "DF": "DF", "MD": "MF", "FW": "FW"}
PENALTY_UNITS = 7600

# tags
T_GOAL, T_OWN_GOAL, T_HEAD, T_ASSIST, T_KEY_PASS = 101, 102, 403, 301, 302
T_ACCURATE, T_DUEL_WON, T_COUNTER, T_INTERCEPTION = 1801, 703, 1901, 1401

# flag bits
F_ACCURATE, F_GOAL, F_HEADER, F_FREE_KICK, F_PENALTY, F_CROSS = 1, 2, 4, 8, 16, 32
F_CORNER, F_KEY_PASS, F_ASSIST, F_OWN_GOAL, F_COUNTER, F_THROW_IN = 64, 128, 256, 512, 1024, 2048
F_GOAL_KICK, F_INTERCEPTION = 4096, 8192

KIND_PASS, KIND_SHOT, KIND_DUEL, KIND_FREE_KICK, KIND_OTHER, KIND_FOUL, KIND_SAVE, KIND_OFFSIDE = range(8)

# Matches whose provider events cannot explain the header score: {match id: reason}.
# Anything not listed here fails the build. Filled in from a run; see DATA_CARD.md.
KNOWN_UNEXPLAINED: dict[int, str] = {}

PASS_NETWORK_MATCHES = (2058017, 1694440)  # 2018 final, Euro 2016 final (home team)
PASS_NETWORK_MIN = 3
PASS_NETWORK_WINDOW_SECONDS = 10

_ESCAPE = re.compile(r"\\u([0-9a-fA-F]{4})")
_ESCAPE_ANY = re.compile(r"\\u[0-9a-fA-F]{4}")


class BuildError(Exception):
    pass


def fail(message: str) -> None:
    raise BuildError(message)


# ----------------------------------------------------------------------------- text


def decode(text: str) -> str:
    """Decode the provider's literal backslash-u sequences (they arrive double escaped).

    A soft hyphen (U+00AD, an invisible character the provider embeds in some names) is removed.
    """
    s = _ESCAPE.sub(lambda m: chr(int(m.group(1), 16)), text)
    try:
        s = s.encode("utf-16", "surrogatepass").decode("utf-16")  # join surrogate pairs
    except UnicodeError:
        fail(f"cannot decode {text!r}")
    s = s.replace("­", "").strip()
    if _ESCAPE_ANY.search(s) or "\\" in s:
        fail(f"escape sequence left in {s!r}")
    return s


def dump_compact(obj: Any) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":")) + "\n"
