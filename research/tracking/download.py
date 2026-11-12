"""Download the DFL tracking files of the seven IDSSE matches from figshare.

Source: Bassek et al. 2025, CC BY 4.0, figshare article 28196177,
doi:10.6084/m9.figshare.28196177.v1. File list, sizes and MD5 come from the
figshare API; this script verifies size and MD5 against it, records SHA-256 and
merges the result into research/data/MANIFEST.json. Standard library only.
Matches are fetched one at a time; a failed or short download is retried (resuming
the partial file when the server allows it) before the script gives up.
Run: research/.venv/Scripts/python.exe -I research/tracking/download.py [short id ...]
The raw folder is research/data/raw unless KLUPA_RAW names another one.
"""
import hashlib
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

ARTICLE = 28196177
MATCHES = ("J03WMX", "J03WN1", "J03WOH", "J03WOY", "J03WPY", "J03WQQ", "J03WR9")
WANTED = (
    "DFL_02_01_matchinformation_",
    "DFL_03_02_events_raw_",
    "DFL_04_03_positions_raw_observed_",
)
ATTEMPTS = 6
ROOT = Path(__file__).resolve().parents[1]
RAW = Path(os.environ.get("KLUPA_RAW", ROOT / "data" / "raw"))
MANIFEST = ROOT / "data" / "MANIFEST.json"


def pull(file: dict, target: Path) -> None:
    """Download into target + '.part', resuming after an interruption, then rename."""
    part = target.with_name(target.name + ".part")
    for attempt in range(1, ATTEMPTS + 1):
        have = part.stat().st_size if part.exists() else 0
        try:
            request = urllib.request.Request(file["download_url"])
            if have:
                request.add_header("Range", f"bytes={have}-")
            with urllib.request.urlopen(request, timeout=60) as response:
                resumed = have > 0 and response.status == 206
                with part.open("ab" if resumed else "wb") as out:
                    while chunk := response.read(1 << 20):
                        out.write(chunk)
            if part.stat().st_size == file["size"]:
                part.replace(target)
                return
            print(f"  short file ({part.stat().st_size} of {file['size']}), retry {attempt}", flush=True)
        except OSError as error:  # URLError, HTTPError, timeouts and resets are all OSError
            print(f"  {type(error).__name__}: {error}, retry {attempt}", flush=True)
        if part.exists() and part.stat().st_size > file["size"]:
            part.unlink()
        time.sleep(min(60, 5 * attempt))
    raise SystemExit(f"Download failed after {ATTEMPTS} attempts: {file['name']}")


def fetch(file: dict) -> dict:
    target = RAW / file["name"]
    if not target.exists() or target.stat().st_size != file["size"]:
        pull(file, target)
    sha = hashlib.sha256()
    md5 = hashlib.md5()
    size = 0
    with target.open("rb") as handle:
        while chunk := handle.read(1 << 20):
            sha.update(chunk)
            md5.update(chunk)
            size += len(chunk)
    return {
        "bytes": size,
        "sha256": sha.hexdigest(),
        "md5": md5.hexdigest(),
        "figshareMd5": file["computed_md5"],
        "figshareBytes": file["size"],
        "md5Match": md5.hexdigest() == file["computed_md5"],
        "sizeMatch": size == file["size"],
    }


def main() -> None:
    matches = tuple(sys.argv[1:]) or MATCHES
    RAW.mkdir(parents=True, exist_ok=True)
    url = f"https://api.figshare.com/v2/articles/{ARTICLE}"
    article = json.load(urllib.request.urlopen(url, timeout=60))
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    sources = manifest.setdefault("_sources", {})
    meta = manifest.setdefault("_dfl_tracking", {})
    meta.update({
        "title": article["title"],
        "doi": article["doi"],
        "licence": f"{article['license']['name']} ({article['license']['url']}), read from the figshare API",
        "figshareArticle": ARTICLE,
        "matches": [f"DFL-MAT-{m}" for m in MATCHES],
    })
    meta.pop("match", None)
    ids = meta.setdefault("figshareFileIds", {})
    started = time.time()
    for short in matches:
        files = [
            f for f in article["files"]
            if f["name"].endswith(f"DFL-MAT-{short}.xml") and f["name"].startswith(WANTED)
        ]
        if len(files) != len(WANTED):
            raise SystemExit(f"Expected {len(WANTED)} files for {short}, found {len(files)}")
        for file in sorted(files, key=lambda f: f["name"]):
            result = fetch(file)
            print(file["name"], json.dumps(result), f"{time.time() - started:.0f}s", flush=True)
            if not (result["md5Match"] and result["sizeMatch"]):
                raise SystemExit(f"Checksum or size mismatch for {file['name']}")
            manifest[file["name"]] = {
                "bytes": result["bytes"],
                "sha256": result["sha256"],
                "figshareMd5Verified": result["figshareMd5"],
            }
            sources[file["name"]] = file["download_url"]
            ids[file["name"]] = file["id"]
        MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
    print(f"done in {time.time() - started:.0f}s")


if __name__ == "__main__":
    main()
