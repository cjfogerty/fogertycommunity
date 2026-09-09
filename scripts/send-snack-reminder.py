#!/usr/bin/env python3
"""Send Thursday 10:25am snack-duty emails for Fogerty U5 Saturday games.

Looks up this week's Saturday game in snacks.json.

- If a parent claimed the slot, email that parent.
- If the slot is still open, email every family on the list and ask them
  to claim it, with a link to that weekend on the team page.

Parent addresses come from SNACK_EMAIL_MAP (claimer) and FAMILY_EMAILS
(full team list) so emails never sit in the public repo.

Usage (from the repo root):
  python3 scripts/send-snack-reminder.py --dry-run
  python3 scripts/send-snack-reminder.py --now 2026-10-08T10:25:00 --force --dry-run
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import smtplib
import ssl
import sys
from datetime import datetime, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Any
from zoneinfo import ZoneInfo

CHI = ZoneInfo("America/Chicago")
ROOT = pathlib.Path(__file__).resolve().parent.parent
DEFAULT_SNACKS = ROOT / "snacks.json"
DEFAULT_CLAIM_URL = "https://cjfogerty.github.io/fogertycommunity/"


def chicago_now(now: datetime | None = None) -> datetime:
    if now is None:
        return datetime.now(CHI)
    if now.tzinfo is None:
        return now.replace(tzinfo=CHI)
    return now.astimezone(CHI)


def this_saturday(now: datetime) -> str:
    now = chicago_now(now)
    days_ahead = (5 - now.weekday()) % 7
    return (now.date() + timedelta(days=days_ahead)).isoformat()


def load_snacks(path: pathlib.Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def load_email_map(raw: str | None) -> dict[str, str]:
    if not raw or not raw.strip():
        return {}
    data = json.loads(raw)
    if not isinstance(data, dict):
        raise ValueError("SNACK_EMAIL_MAP must be a JSON object")
    out: dict[str, str] = {}
    for key, value in data.items():
        if value:
            out[str(key).strip()] = str(value).strip()
    return out


def load_family_emails(raw: str | None) -> list[str]:
    if not raw or not raw.strip():
        return []
    text = raw.strip()
    values: list[Any]
    if text.startswith("[") or text.startswith("{"):
        data = json.loads(text)
        if isinstance(data, dict):
            values = data.get("emails") or data.get("families") or list(data.values())
        elif isinstance(data, list):
            values = data
        else:
            raise ValueError("FAMILY_EMAILS must be a JSON array of emails")
    else:
        values = [part.strip() for part in text.replace(";", ",").split(",")]
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        email = str(value or "").strip()
        key = email.lower()
        if not email or "@" not in email or key in seen:
            continue
        seen.add(key)
        out.append(email)
    return out


def resolve_email(game: dict[str, Any], email_map: dict[str, str]) -> str | None:
    for key in (
        game.get("date"),
        game.get("id"),
        game.get("label"),
        game.get("claimedBy"),
    ):
        if key and key in email_map:
            return email_map[key]
    return None


def find_game(games: list[dict[str, Any]], saturday: str) -> dict[str, Any] | None:
    for game in games:
        if game.get("date") == saturday or game.get("id") == saturday:
            return game
    return None


def claim_url(snacks: dict[str, Any], game: dict[str, Any] | None = None) -> str:
    base = (snacks.get("claimUrl") or DEFAULT_CLAIM_URL).rstrip("/") + "/"
    if not game:
        return base + "#schedule"
    date = game.get("date") or game.get("id")
    if date:
        return f"{base}#snack-{date}"
    return base + "#schedule"


def select_plan(
    snacks: dict[str, Any],
    now: datetime,
    *,
    force: bool = False,
    email_map: dict[str, str] | None = None,
    family_emails: list[str] | None = None,
) -> dict[str, Any]:
    now = chicago_now(now)
    saturday = this_saturday(now)
    game = find_game(snacks.get("games") or [], saturday)
    coach = snacks.get("coachEmail") or "cjfogerty@gmail.com"
    families = list(family_emails or [])
    base = {
        "now": now.isoformat(),
        "weekday": now.strftime("%A"),
        "saturday": saturday,
        "coachEmail": coach,
        "claimUrl": claim_url(snacks, game),
        "game": game,
    }
    if not force and now.weekday() != 3:
        return {**base, "action": "skip", "reason": "not Thursday"}
    if game is None:
        return {**base, "action": "skip", "reason": "no game this Saturday"}
    if game.get("bye"):
        return {**base, "action": "skip", "reason": "bye week"}
    claimed = (game.get("claimedBy") or "").strip()
    if not claimed:
        if families:
            bcc = [coach] if coach.lower() not in {e.lower() for e in families} else []
            return {
                **base,
                "action": "ask-families",
                "reason": "snack slot still open",
                "to": families,
                "bcc": bcc,
                "recipientCount": len(families),
            }
        return {
            **base,
            "action": "alert-coach",
            "reason": "snack slot still open, no FAMILY_EMAILS list",
            "to": coach,
        }
    email = resolve_email(game, email_map or {})
    if not email:
        return {
            **base,
            "action": "alert-coach",
            "reason": f"claimed by {claimed}, but no email in SNACK_EMAIL_MAP",
            "to": coach,
            "claimedBy": claimed,
        }
    return {
        **base,
        "action": "remind",
        "reason": f"claimed by {claimed}",
        "to": email,
        "claimedBy": claimed,
    }


def ha_label(game: dict[str, Any]) -> str:
    if game.get("bye"):
        return "Bye"
    return "Home" if game.get("home") else "Away"


def compose_parent_email(snacks: dict[str, Any], game: dict[str, Any]) -> tuple[str, str, str]:
    parent = game.get("claimedBy") or "there"
    first = parent.split("(")[0].strip().split(" ")[0]
    kickoff = game.get("kickoff") or "TBD"
    opponent = game.get("opponent") or "TBD"
    notes = (game.get("notes") or "").strip()
    field = snacks.get("field") or "Sports Park Field 8B"
    address = snacks.get("address") or "3589 Hwy K, O'Fallon, MO 63368"
    label = game.get("label") or game.get("date")
    subject = f"Snack reminder: {label} · Fogerty U5 vs {opponent}"
    note_line = f"\nNote: {notes}." if notes else ""
    extra_html = f"<p style=\"margin:0 0 16px;color:#3f4a3d\">Note: {notes}.</p>" if notes else ""
    text = (
        f"Hi {first},\n\n"
        f"Friendly reminder that you have snack duty for Saturday's Fogerty U5 soccer game.\n\n"
        f"Game: {label}\n"
        f"Kickoff: {kickoff}\n"
        f"Opponent: {opponent} ({ha_label(game)})\n"
        f"Field: {field}\n"
        f"Address: {address}\n"
        f"{note_line}\n\n"
        "Please bring enough snacks and drinks for the team. "
        "Check field status before you leave home: https://statusfy.com/6363339900/4\n\n"
        "Thank you!\n"
        "Coach Casey Fogerty (Chandler's dad)\n"
        "Fogerty U5 Girls · O'Fallon Parks & Rec\n"
    )
    html = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#06140c;font-family:Georgia,serif;color:#142016">
  <div style="max-width:520px;margin:0 auto;background:#f6f3ea;border-radius:20px;padding:28px 28px 24px">
    <p style="margin:0 0 4px;letter-spacing:.14em;text-transform:uppercase;font-size:11px;color:#3f6b49">Fogerty U5 Girls</p>
    <h1 style="margin:0 0 16px;font-size:26px;color:#14532d">Snack reminder</h1>
    <p style="margin:0 0 16px;line-height:1.5">Hi {first}, you have snack duty this Saturday.</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:15px">
      <tr><td style="padding:6px 0;color:#5b6458">Game</td><td style="padding:6px 0;font-weight:700;color:#142016">{label}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6458">Kickoff</td><td style="padding:6px 0;font-weight:700;color:#142016">{kickoff}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6458">Opponent</td><td style="padding:6px 0;font-weight:700;color:#142016">{opponent} ({ha_label(game)})</td></tr>
      <tr><td style="padding:6px 0;color:#5b6458">Field</td><td style="padding:6px 0;font-weight:700;color:#142016">{field}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6458">Address</td><td style="padding:6px 0;font-weight:700;color:#142016">{address}</td></tr>
    </table>
    {extra_html}
    <p style="margin:0 0 16px;line-height:1.5">Please bring enough snacks and drinks for the team. Check <a href="https://statusfy.com/6363339900/4" style="color:#15803d">field status</a> before you leave home.</p>
    <p style="margin:0;color:#3f4a3d">Thank you!<br>Coach Casey Fogerty (Chandler's dad)</p>
  </div>
</body></html>"""
    return subject, text, html


def compose_open_slot_email(snacks: dict[str, Any], game: dict[str, Any]) -> tuple[str, str, str]:
    kickoff = game.get("kickoff") or "TBD"
    opponent = game.get("opponent") or "TBD"
    notes = (game.get("notes") or "").strip()
    field = snacks.get("field") or "Sports Park Field 8B"
    address = snacks.get("address") or "3589 Hwy K, O'Fallon, MO 63368"
    label = game.get("label") or game.get("date")
    url = claim_url(snacks, game)
    subject = f"Snack still open: {label} · can anyone claim it?"
    note_line = f"\nNote: {notes}." if notes else ""
    extra_html = f"<p style=\"margin:0 0 16px;color:#3f4a3d\">Note: {notes}.</p>" if notes else ""
    text = (
        "Hi Fogerty U5 families,\n\n"
        "Saturday's snack slot is still open. Would anyone be willing to claim it?\n\n"
        f"Game: {label}\n"
        f"Kickoff: {kickoff}\n"
        f"Opponent: {opponent} ({ha_label(game)})\n"
        f"Field: {field}\n"
        f"Address: {address}\n"
        f"{note_line}\n\n"
        "Tap this link to claim this weekend (team passphrase required):\n"
        f"{url}\n\n"
        "After you send the claim, Coach Casey will put your name on the roster.\n\n"
        "Thank you!\n"
        "Coach Casey Fogerty (Chandler's dad)\n"
        "Fogerty U5 Girls · O'Fallon Parks & Rec\n"
    )
    html = f"""<!DOCTYPE html>
<html><body style="margin:0;padding:24px;background:#06140c;font-family:Georgia,serif;color:#142016">
  <div style="max-width:520px;margin:0 auto;background:#f6f3ea;border-radius:20px;padding:28px 28px 24px">
    <p style="margin:0 0 4px;letter-spacing:.14em;text-transform:uppercase;font-size:11px;color:#3f6b49">Fogerty U5 Girls</p>
    <h1 style="margin:0 0 16px;font-size:26px;color:#14532d">Snack still open</h1>
    <p style="margin:0 0 16px;line-height:1.5">Saturday's snack slot has not been claimed yet. Would anyone be willing to take it?</p>
    <table style="width:100%;border-collapse:collapse;margin:0 0 16px;font-size:15px">
      <tr><td style="padding:6px 0;color:#5b6458">Game</td><td style="padding:6px 0;font-weight:700;color:#142016">{label}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6458">Kickoff</td><td style="padding:6px 0;font-weight:700;color:#142016">{kickoff}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6458">Opponent</td><td style="padding:6px 0;font-weight:700;color:#142016">{opponent} ({ha_label(game)})</td></tr>
      <tr><td style="padding:6px 0;color:#5b6458">Field</td><td style="padding:6px 0;font-weight:700;color:#142016">{field}</td></tr>
      <tr><td style="padding:6px 0;color:#5b6458">Address</td><td style="padding:6px 0;font-weight:700;color:#142016">{address}</td></tr>
    </table>
    {extra_html}
    <p style="margin:0 0 20px">
      <a href="{url}" style="display:inline-block;background:#14532d;color:#f6f3ea;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:14px">Claim this weekend</a>
    </p>
    <p style="margin:0 0 16px;line-height:1.5;color:#3f4a3d">The link opens the team page (passphrase required) and jumps to Saturday's snack button.</p>
    <p style="margin:0;color:#3f4a3d">Thank you!<br>Coach Casey Fogerty (Chandler's dad)</p>
  </div>
</body></html>"""
    return subject, text, html


def compose_coach_alert(snacks: dict[str, Any], plan: dict[str, Any]) -> tuple[str, str, str]:
    game = plan.get("game") or {}
    saturday = plan.get("saturday")
    reason = plan.get("reason") or "needs attention"
    subject = f"Snack reminder: {saturday} needs you"
    claimed = plan.get("claimedBy") or game.get("claimedBy") or "(nobody)"
    url = plan.get("claimUrl") or claim_url(snacks, game)
    text = (
        f"Coach Casey,\n\n"
        f"Thursday snack reminder ran for Saturday {saturday}.\n"
        f"Action: {plan.get('action')}\n"
        f"Reason: {reason}\n"
        f"Claimed by: {claimed}\n"
        f"Opponent: {game.get('opponent') or '—'}\n"
        f"Kickoff: {game.get('kickoff') or '—'}\n"
        f"Claim link: {url}\n\n"
        "If the slot is open, add FAMILY_EMAILS (JSON array of parent addresses) "
        "so the next run asks the whole team to claim it. If a parent already "
        "claimed, add their address to SNACK_EMAIL_MAP keyed by YYYY-MM-DD.\n"
    )
    html = f"<pre style='font-family:ui-monospace,monospace'>{text}</pre>"
    return subject, text, html


def as_list(value: Any) -> list[str]:
    if not value:
        return []
    if isinstance(value, str):
        return [value] if value.strip() else []
    return [str(item).strip() for item in value if str(item).strip()]


def redact_plan(plan: dict[str, Any]) -> dict[str, Any]:
    """Keep parent emails out of logs / GitHub Actions summaries."""
    out = {key: value for key, value in plan.items() if key != "game"}
    to_list = as_list(out.get("to"))
    bcc_list = as_list(out.get("bcc"))
    if to_list:
        out["recipientCount"] = out.get("recipientCount") or len(to_list)
        out["to"] = f"{len(to_list)} recipient{'s' if len(to_list) != 1 else ''}"
    if bcc_list:
        out["bccCount"] = len(bcc_list)
        out.pop("bcc", None)
    game = plan.get("game") or {}
    out["game"] = {
        "date": game.get("date"),
        "label": game.get("label"),
        "opponent": game.get("opponent"),
        "kickoff": game.get("kickoff"),
        "claimedBy": game.get("claimedBy"),
        "bye": game.get("bye"),
    } if game else None
    return out


def send_email(
    *,
    to: str | list[str],
    subject: str,
    text: str,
    html: str,
    from_addr: str,
    username: str,
    password: str,
    host: str,
    port: int,
    bcc: str | list[str] | None = None,
) -> None:
    to_list = as_list(to)
    bcc_list = as_list(bcc)
    if not to_list:
        raise ValueError("send_email requires at least one To address")
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"Coach Casey Fogerty <{from_addr}>"
    msg["To"] = ", ".join(to_list)
    if bcc_list:
        msg["Bcc"] = ", ".join(bcc_list)
    msg.attach(MIMEText(text, "plain", "utf-8"))
    msg.attach(MIMEText(html, "html", "utf-8"))
    recipients: list[str] = []
    for addr in to_list + bcc_list:
        if addr not in recipients:
            recipients.append(addr)
    context = ssl.create_default_context()
    with smtplib.SMTP_SSL(host, port, context=context) as server:
        server.login(username, password)
        server.sendmail(from_addr, recipients, msg.as_string())


def parse_now(value: str | None) -> datetime:
    if not value:
        return datetime.now(CHI)
    text = value.strip()
    if text.endswith("Z"):
        text = text[:-1] + "+00:00"
    dt = datetime.fromisoformat(text)
    return chicago_now(dt)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Fogerty U5 Thursday snack reminder")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--force", action="store_true", help="Send even if today is not Thursday")
    parser.add_argument("--now", help="ISO datetime override (America/Chicago if naive)")
    parser.add_argument("--snacks", default=str(DEFAULT_SNACKS))
    args = parser.parse_args(argv)

    snacks = load_snacks(pathlib.Path(args.snacks))
    email_map = load_email_map(os.environ.get("SNACK_EMAIL_MAP"))
    family_emails = load_family_emails(os.environ.get("FAMILY_EMAILS"))
    plan = select_plan(
        snacks,
        parse_now(args.now),
        force=args.force or os.environ.get("FORCE_REMINDER") == "1",
        email_map=email_map,
        family_emails=family_emails,
    )

    print(json.dumps(redact_plan(plan), indent=2))

    action = plan["action"]
    if action == "skip":
        print(f"Skip: {plan['reason']}")
        return 0

    game = plan.get("game") or {}
    bcc: list[str] = []
    if action == "remind":
        subject, text, html = compose_parent_email(snacks, game)
        coach = snacks.get("coachEmail")
        bcc = [coach] if coach else []
    elif action == "ask-families":
        subject, text, html = compose_open_slot_email(snacks, game)
        bcc = as_list(plan.get("bcc"))
    else:
        subject, text, html = compose_coach_alert(snacks, plan)
        bcc = []

    print(f"To: {redact_plan(plan).get('to')}")
    print(f"Subject: {subject}")
    print("---")
    print(text)

    smtp_user = os.environ.get("SMTP_USERNAME") or os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASSWORD") or os.environ.get("SMTP_PASS")
    from_addr = os.environ.get("SMTP_FROM") or smtp_user or snacks.get("coachEmail")
    host = os.environ.get("SMTP_HOST") or "smtp.gmail.com"
    port = int(os.environ.get("SMTP_PORT") or "465")

    if args.dry_run:
        print("Dry run: not sending.")
        return 0
    if not smtp_user or not smtp_pass:
        print(
            "SMTP_USERNAME / SMTP_PASSWORD are not set. "
            "Composed the reminder but did not send.",
            file=sys.stderr,
        )
        return 0

    send_email(
        to=plan["to"],
        subject=subject,
        text=text,
        html=html,
        from_addr=from_addr,
        username=smtp_user,
        password=smtp_pass,
        host=host,
        port=port,
        bcc=bcc,
    )
    print("Sent.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
