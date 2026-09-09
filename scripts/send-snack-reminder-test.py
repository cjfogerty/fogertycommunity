#!/usr/bin/env python3
"""Checks for scripts/send-snack-reminder.py date and roster logic."""

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = pathlib.Path(__file__).resolve().parent.parent
SPEC = importlib.util.spec_from_file_location(
    "send_snack_reminder", ROOT / "scripts" / "send-snack-reminder.py"
)
mod = importlib.util.module_from_spec(SPEC)
assert SPEC and SPEC.loader
SPEC.loader.exec_module(mod)

CHI = ZoneInfo("America/Chicago")
SNACKS = mod.load_snacks(ROOT / "snacks.json")


def at(iso: str) -> datetime:
    return datetime.fromisoformat(iso).replace(tzinfo=CHI)


def expect(plan, action, saturday, **extra):
    assert plan["action"] == action, plan
    assert plan["saturday"] == saturday, plan
    for key, value in extra.items():
        assert plan.get(key) == value, (key, plan)


def main() -> int:
    email_map = {
        "2026-09-12": "alyssa@example.com",
        "2026-09-26": "anna@example.com",
        "Amanda Connors": "amanda@example.com",
    }
    families = ["alyssa@example.com", "anna@example.com", "parent3@example.com"]

    expect(
        mod.select_plan(SNACKS, at("2026-09-10T10:25:00"), email_map=email_map),
        "remind",
        "2026-09-12",
        claimedBy="Alyssa Fogerty",
        to="alyssa@example.com",
    )
    expect(
        mod.select_plan(SNACKS, at("2026-09-09T16:00:00"), email_map=email_map),
        "skip",
        "2026-09-12",
        reason="already claimed; reminder goes Thursday",
    )
    expect(
        mod.select_plan(SNACKS, at("2026-09-16T16:00:00"), email_map=email_map),
        "skip",
        "2026-09-19",
        reason="bye week",
    )
    expect(
        mod.select_plan(SNACKS, at("2026-09-17T10:25:00"), email_map=email_map),
        "skip",
        "2026-09-19",
        reason="bye week",
    )
    expect(
        mod.select_plan(SNACKS, at("2026-09-24T10:25:00"), email_map=email_map),
        "remind",
        "2026-09-26",
        claimedBy="Anna Lambert (Madelyn)",
        to="anna@example.com",
    )
    expect(
        mod.select_plan(SNACKS, at("2026-10-01T10:25:00"), email_map=email_map),
        "remind",
        "2026-10-03",
        claimedBy="Amanda Connors",
        to="amanda@example.com",
    )

    open_ask = mod.select_plan(
        SNACKS,
        at("2026-10-07T16:00:00"),
        email_map=email_map,
        family_emails=families,
    )
    expect(open_ask, "ask-families", "2026-10-10", reason="snack slot still open")
    assert open_ask["to"] == families, open_ask
    assert open_ask["recipientCount"] == 3, open_ask
    assert "cjfogerty@gmail.com" in open_ask["bcc"], open_ask
    assert open_ask["claimUrl"].endswith("#snack-2026-10-10"), open_ask

    expect(
        mod.select_plan(
            SNACKS,
            at("2026-10-08T10:25:00"),
            email_map=email_map,
            family_emails=families,
        ),
        "skip",
        "2026-10-10",
        reason="families already asked Wednesday",
    )
    expect(
        mod.select_plan(SNACKS, at("2026-10-07T16:00:00"), email_map=email_map),
        "alert-coach",
        "2026-10-10",
        reason="snack slot still open, no FAMILY_EMAILS list",
    )
    expect(
        mod.select_plan(SNACKS, at("2026-09-08T10:15:00"), email_map=email_map),
        "skip",
        "2026-09-12",
        reason="not a send day",
    )
    expect(
        mod.select_plan(SNACKS, at("2026-09-09T10:15:00"), force=True, email_map=email_map),
        "remind",
        "2026-09-12",
        to="alyssa@example.com",
    )
    missing = mod.select_plan(SNACKS, at("2026-09-10T10:25:00"), email_map={})
    expect(missing, "alert-coach", "2026-09-12")
    assert "no email" in missing["reason"]

    parsed = mod.load_family_emails(
        '["a@example.com", "b@example.com", "a@example.com"]'
    )
    assert parsed == ["a@example.com", "b@example.com"], parsed

    subject, text, html = mod.compose_parent_email(SNACKS, SNACKS["games"][0])
    assert "Sept 12" in subject
    assert "Need Coach 1" in text
    assert "Alyssa" in text
    assert "4–5 players" in text
    assert "4–5 players" in html
    assert "Snack reminder" in html

    oct10 = next(g for g in SNACKS["games"] if g["date"] == "2026-10-10")
    subject, text, html = mod.compose_open_slot_email(SNACKS, oct10)
    assert "still open" in subject.lower()
    assert "Cooksey" in text
    assert "would anyone be willing" in text.lower()
    assert "4–5 players" in text
    assert "4–5 players" in html
    assert "#snack-2026-10-10" in text
    assert "Claim this weekend" in html
    assert "cjfogerty.github.io/fogertycommunity" in html
    assert "passphrase" not in text.lower()
    assert "passphrase" not in html.lower()

    homepage = (ROOT / "index.html").read_text(encoding="utf-8")
    assert "passphrase" not in homepage.lower()
    assert "AES-GCM" not in homepage
    assert "team-page.enc" not in homepage
    assert "Claim snack" in homepage
    assert "Anna Lambert" in homepage

    redacted = mod.redact_plan(open_ask)
    assert "example.com" not in json.dumps(redacted)
    assert redacted["to"] == "3 recipients"

    print("ok")
    print(json.dumps({"tests": 16, "status": "passed"}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
