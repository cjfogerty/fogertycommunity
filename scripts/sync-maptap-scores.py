#!/usr/bin/env python3
"""Pull shared MapTap scores into boyzmaptap/scores.json.

Reads the web app URL from boyzmaptap/backend.json. An empty url exits 0 so the
site works before the sheet is connected. Otherwise GET ?action=list (no PIN),
and upsert those rows into scores.json logs only. Player season totals are left
alone. Invalid rows are skipped. A seed log that the sheet does not have is kept.
Same player and date replaces that day's score. Achievements and the existing id
stay when the score is unchanged.

Exit 1 if a configured URL does not answer. The website does not depend on this.
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCORES_PATH = ROOT / "boyzmaptap" / "scores.json"
BACKEND_PATH = ROOT / "boyzmaptap" / "backend.json"
PLAYERS = {"peter", "andy", "sam", "ben", "micah", "casey"}
WEIGHTS = (1, 1, 2, 3, 3)


def weighted(rounds: list[int]) -> int:
    return sum(score * weight for score, weight in zip(rounds, WEIGHTS))


def valid_log(raw: object) -> dict | None:
    if not isinstance(raw, dict):
        return None
    player_id = raw.get("playerId")
    date = raw.get("date")
    if player_id not in PLAYERS or not isinstance(date, str) or len(date) != 10:
        return None
    try:
        year, month, day = (int(part) for part in date.split("-"))
    except ValueError:
        return None
    if year < 2024 or not 1 <= month <= 12 or not 1 <= day <= 31:
        return None
    rounds = raw.get("rounds")
    if not isinstance(rounds, list) or len(rounds) != 5:
        return None
    clean_rounds: list[int] = []
    for score in rounds:
        if isinstance(score, bool) or not isinstance(score, (int, float)):
            return None
        if int(score) != score or not 0 <= int(score) <= 100:
            return None
        clean_rounds.append(int(score))
    try:
        total = int(raw.get("score"))
    except (TypeError, ValueError):
        return None
    if total != weighted(clean_rounds):
        return None
    puzzle = raw.get("puzzle")
    if puzzle is None or puzzle == "":
        puzzle_out = None
    else:
        try:
            puzzle_out = int(puzzle)
        except (TypeError, ValueError):
            return None
        if puzzle_out < 1:
            return None
    return {
        "playerId": player_id,
        "date": date,
        "puzzle": puzzle_out,
        "score": total,
        "rounds": clean_rounds,
    }


def upsert(scores: dict, incoming: list[dict]) -> bool:
    logs = scores.setdefault("logs", [])
    changed = False
    for row in incoming:
        clean = valid_log(row)
        if not clean:
            continue
        idx = next(
            (
                i
                for i, old in enumerate(logs)
                if old.get("playerId") == clean["playerId"] and old.get("date") == clean["date"]
            ),
            None,
        )
        entry = {
            "id": f"{clean['playerId']}-{clean['date']}",
            "playerId": clean["playerId"],
            "date": clean["date"],
            "puzzle": clean["puzzle"],
            "score": clean["score"],
            "rounds": clean["rounds"],
        }
        if 925 <= entry["score"] <= 949:
            entry["achievements"] = ["Human GPS"]
        if idx is None:
            logs.append(entry)
            changed = True
            continue
        old = logs[idx]
        if entry["puzzle"] is None and old.get("puzzle") is not None:
            entry["puzzle"] = old["puzzle"]
        entry["id"] = old.get("id") or entry["id"]
        if old.get("score") == entry["score"] and old.get("achievements"):
            entry["achievements"] = old["achievements"]
        same = (
            old.get("score") == entry["score"]
            and old.get("rounds") == entry["rounds"]
            and old.get("puzzle") == entry["puzzle"]
            and old.get("achievements") == entry.get("achievements")
            and old.get("id") == entry["id"]
        )
        if same:
            continue
        logs[idx] = entry
        changed = True
    return changed


def load_backend_url() -> str:
    try:
        payload = json.loads(BACKEND_PATH.read_text())
    except (OSError, json.JSONDecodeError):
        return ""
    url = payload.get("url") if isinstance(payload, dict) else ""
    return url.strip() if isinstance(url, str) else ""


def fetch_logs(url: str) -> list:
    joiner = "&" if "?" in url else "?"
    target = f"{url}{joiner}action=list"
    request = urllib.request.Request(target, headers={"Cache-Control": "no-cache"})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.loads(response.read().decode())
    if not isinstance(payload, dict) or payload.get("ok") is not True or not isinstance(payload.get("logs"), list):
        raise RuntimeError("Shared board returned an unexpected list.")
    return payload["logs"]


def sync() -> int:
    url = load_backend_url()
    if not url:
        print("backend.json url is empty. Shared scores stay out of the repo until it is set.")
        return 0
    if not url.startswith("http://") and not url.startswith("https://"):
        print("backend.json url must start with http:// or https://.", file=sys.stderr)
        return 1
    try:
        remote = fetch_logs(url)
    except (OSError, urllib.error.URLError, json.JSONDecodeError, RuntimeError) as exc:
        print(f"Could not read the shared board: {exc}", file=sys.stderr)
        return 1
    scores = json.loads(SCORES_PATH.read_text())
    players_before = json.dumps(scores.get("players"))
    if not upsert(scores, remote):
        print("No new shared scores.")
        return 0
    if json.dumps(scores.get("players")) != players_before:
        print("Refusing to rewrite player season totals.", file=sys.stderr)
        return 1
    SCORES_PATH.write_text(json.dumps(scores, indent=2) + "\n")
    print("Updated boyzmaptap/scores.json logs from the shared board.")
    return 0


def self_test() -> int:
    assert weighted([80, 80, 80, 80, 80]) == 800
    assert weighted([76, 94, 77, 73, 57]) == 714
    assert weighted([97, 92, 95, 98, 82]) == 919
    assert valid_log({"playerId": "peter", "date": "2026-10-03", "puzzle": 834, "score": 800, "rounds": [80, 80, 80, 80, 80]})
    assert valid_log({"playerId": "peter", "date": "2026-10-03", "score": 801, "rounds": [80, 80, 80, 80, 80]}) is None
    assert valid_log({"playerId": "nope", "date": "2026-10-03", "score": 800, "rounds": [80, 80, 80, 80, 80]}) is None
    assert valid_log({"playerId": "peter", "date": "2026-10-03", "score": 400, "rounds": [101, 0, 0, 0, 0]}) is None
    scores = {
        "players": [{"id": "casey", "total": 941}],
        "logs": [
            {
                "id": "casey-833",
                "playerId": "casey",
                "date": "2026-10-02",
                "puzzle": 833,
                "score": 941,
                "achievements": ["Human GPS", "Overachiever", "And 3 more"],
            }
        ],
    }
    assert upsert(scores, [{"playerId": "ghost", "date": "2026-10-03", "score": 800, "rounds": [80, 80, 80, 80, 80]}]) is False
    assert upsert(
        scores,
        [{"playerId": "micah", "date": "2026-10-03", "puzzle": 834, "score": 900, "rounds": [90, 90, 90, 90, 90]}],
    )
    assert scores["players"][0]["total"] == 941
    assert scores["logs"][-1]["playerId"] == "micah"
    assert upsert(
        scores,
        [{"playerId": "micah", "date": "2026-10-03", "puzzle": 834, "score": 910, "rounds": [100, 90, 90, 90, 90]}],
    )
    micah = scores["logs"][-1]
    assert micah["score"] == 910 and micah["rounds"] == [100, 90, 90, 90, 90]
    assert weighted([94, 95, 94, 94, 94]) == 941
    assert upsert(
        scores,
        [{"playerId": "casey", "date": "2026-10-02", "puzzle": 833, "score": 941, "rounds": [94, 95, 94, 94, 94]}],
    )
    casey = next(row for row in scores["logs"] if row["playerId"] == "casey")
    assert casey["id"] == "casey-833"
    assert casey["achievements"] == ["Human GPS", "Overachiever", "And 3 more"]
    assert casey["rounds"] == [94, 95, 94, 94, 94]
    print("sync self-test ok")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args()
    if args.self_test:
        return self_test()
    return sync()


if __name__ == "__main__":
    sys.exit(main())
