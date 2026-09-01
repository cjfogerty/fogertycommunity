#!/usr/bin/env python3
"""Mark an open snack slot claimed in index.html.

Usage (from the repo root):
  python3 scripts/claim-snack.sh "Sat, Sept 26, 2026" "Alyssa Fogerty"
"""
import html
import pathlib
import re
import sys


def main():
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
    path = root / "index.html"
    text = path.read_text(encoding="utf-8")
    safe = html.escape(name)

    pattern = re.compile(
        r'<button type="button" class="claim-btn[^"]*"'
        r'[^>]*\bdata-date="' + re.escape(date) + r'"'
        r'[^>]*>\s*Claim snack\s*</button>',
        re.IGNORECASE,
    )
    replacement = f'<span class="font-semibold text-pitch-800">{safe}</span>'
    updated, count = pattern.subn(replacement, text, count=1)
    if count != 1:
        sys.stderr.write(f"No open claim button found for date: {date}\n")
        sys.exit(1)

    path.write_text(updated, encoding="utf-8")
    print(f"Claimed {date} snacks for {name} in index.html")
    print("Next: git add index.html && git commit && git push")


if __name__ == "__main__":
    main()
