#!/usr/bin/env python3
"""Mark an open snack slot claimed in snacks.json and index.html.

Usage (from the repo root):
  python3 scripts/claim-snack.sh "Sat, Sept 26, 2026" "Alyssa Fogerty"
"""
import html
import json
import pathlib
import re
import sys

MONTHS = {
    "jan": 1,
    "january": 1,
    "feb": 2,
    "february": 2,
    "mar": 3,
    "march": 3,
    "apr": 4,
    "april": 4,
    "may": 5,
    "jun": 6,
    "june": 6,
    "jul": 7,
    "july": 7,
    "aug": 8,
    "august": 8,
    "sep": 9,
    "sept": 9,
    "september": 9,
    "oct": 10,
    "october": 10,
    "nov": 11,
    "november": 11,
    "dec": 12,
    "december": 12,
}


def parse_label_to_iso(label: str):
    match = re.search(r"([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})", label)
    if not match:
        return None
    month = MONTHS.get(match.group(1).lower())
    if not month:
        return None
    return f"{int(match.group(3)):04d}-{month:02d}-{int(match.group(2)):02d}"


def upsert_claims(text: str, date: str, name: str) -> tuple[str, bool]:
    js_name = name.replace("\\", "\\\\").replace('"', '\\"')
    existing = re.compile(
        r'\{ date: "' + re.escape(date) + r'", name: "[^"]*" \}'
    )
    replacement = '{ date: "' + date + '", name: "' + js_name + '" }'
    updated, count = existing.subn(replacement, text, count=1)
    if count:
        return updated, True
    marker = "const CLAIMS = ["
    idx = text.find(marker)
    if idx == -1:
        return text, False
    insert_at = idx + len(marker)
    return text[:insert_at] + "\n      " + replacement + "," + text[insert_at:], True


def update_snacks_json(root: pathlib.Path, date: str, name: str) -> None:
    path = root / "snacks.json"
    if not path.exists():
        sys.stderr.write("snacks.json is missing.\n")
        sys.exit(1)
    data = json.loads(path.read_text(encoding="utf-8"))
    iso = parse_label_to_iso(date)
    updated = False
    for game in data.get("games", []):
        if game.get("label") == date or game.get("date") == iso:
            if game.get("bye"):
                sys.stderr.write("That date is a bye week — no snack slot.\n")
                sys.exit(1)
            game["claimedBy"] = name
            updated = True
            break
    if not updated:
        sys.stderr.write(f"No game found in snacks.json for date: {date}\n")
        sys.exit(1)
    path.write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")


def replace_claim_button(text: str, date: str, name: str) -> tuple[str, int]:
    safe = html.escape(name)
    pattern = re.compile(
        r'<button type="button" class="claim-btn[^"]*"'
        r'[^>]*\bdata-date="' + re.escape(date) + r'"'
        r'[^>]*>\s*Claim snack\s*</button>',
        re.IGNORECASE,
    )
    replacement = f'<span class="font-semibold text-pitch-800">{safe}</span>'
    return pattern.subn(replacement, text, count=1)


def main() -> None:
    if len(sys.argv) != 3:
        sys.stderr.write(
            'Usage: python3 scripts/claim-snack.sh "Sat, Sept 26, 2026" "Parent Name"\n'
        )
        sys.exit(2)

    date = sys.argv[1].strip()
    name = sys.argv[2].strip()
    if not date or not name:
        sys.stderr.write("Date and parent name are required.\n")
        sys.exit(2)

    root = pathlib.Path(__file__).resolve().parent.parent
    update_snacks_json(root, date, name)

    path = root / "index.html"
    text = path.read_text(encoding="utf-8")
    updated, button_count = replace_claim_button(text, date, name)
    updated, claims_ok = upsert_claims(updated, date, name)
    if button_count != 1 and not claims_ok:
        sys.stderr.write(f"Updated snacks.json, but could not patch index.html for: {date}\n")
        sys.exit(1)
    path.write_text(updated, encoding="utf-8")
    print(f"Claimed {date} snacks for {name}")
    print("Next: git add snacks.json index.html && git commit && git push")
    print("Parent email stays in the SNACK_EMAIL_MAP repo secret, not in git.")


if __name__ == "__main__":
    main()
