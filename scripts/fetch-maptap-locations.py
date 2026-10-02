#!/usr/bin/env python3
"""Fetch one MapTap day into boyzmaptap/locations.json.

MapTap publishes the day's five locations, in play order, as a script:

    https://maptap.gg/data/this_day_in_history/{Month}{D}.js

October 2, 2026 is https://maptap.gg/data/this_day_in_history/October2.js
(no zero-padding, no year in the filename). The file is public. No login.
City ids inside the file look like 2026-10-02-..., which is how this script
checks that the file is actually that calendar year.

The script adds a missing day. It does not replace a day that is already in
the file unless --force is passed, and even then a hand-written funFact is kept.

Manual append (no fetch): add one object to days[] in boyzmaptap/locations.json.

    {
      "date": "2026-10-03",
      "puzzle": 834,
      "locations": [
        {
          "order": 1,
          "city": "City",
          "region": null,
          "country": "Country",
          "continent": "Europe",
          "lat": 0.0,
          "lng": 0.0,
          "title": "Optional story title",
          "funFact": "One short true fact. Omit the key rather than guessing."
        }
      ]
    }

Puzzle number is the number of days since 2024-06-21 (Oct 2, 2026 is 833).
Round scores are not stored here. They belong on a log in scores.json:

    { "playerId": "sam", "date": "2026-10-02", "puzzle": 833,
      "score": 919, "rounds": [97, 92, 95, 98, 82] }

score is the share text's "Final score", copied as written, not summed from rounds.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from datetime import date, datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "boyzmaptap" / "locations.json"
EPOCH = date(2024, 6, 21)
MONTHS = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
]
SOURCE = "https://maptap.gg/data/this_day_in_history/{play_day}.js"

NODE_PARSE = r"""
import vm from "vm";
let code = "";
process.stdin.on("data", (d) => { code += d; });
process.stdin.on("end", () => {
  const sandbox = {};
  vm.runInNewContext(code, sandbox, { timeout: 5000 });
  if (!Array.isArray(sandbox.cities)) {
    console.error("cities array missing");
    process.exit(2);
  }
  const out = sandbox.cities.map((c) => ({
    name: c.name || "",
    lat: c.lat,
    lng: c.lng,
    title: c.title || "",
    orangeText: c.orangeText || "",
    trivia: c.trivia || "",
    id: c.id || "",
    sources: Array.isArray(c.sources) ? c.sources : []
  }));
  process.stdout.write(JSON.stringify(out));
});
"""


def norm(value: str) -> str:
    text = value.strip().lower().replace("’", "'").replace(".", "")
    text = text.replace("&", " and ")
    return re.sub(r"\s+", " ", text)


def _add(table: dict, continent: str, names: list[str]) -> None:
    for name in names:
        table[norm(name)] = continent


def continent_table() -> dict:
    table: dict[str, str] = {}
    _add(table, "Africa", [
        "algeria", "angola", "benin", "botswana", "burkina faso", "burundi",
        "cabo verde", "cape verde", "cameroon", "central african republic",
        "chad", "comoros", "congo", "republic of the congo",
        "democratic republic of the congo", "dr congo", "drc",
        "cote d'ivoire", "côte d'ivoire", "ivory coast", "djibouti", "egypt",
        "equatorial guinea", "eritrea", "eswatini", "swaziland", "ethiopia",
        "gabon", "gambia", "the gambia", "ghana", "guinea", "guinea-bissau",
        "kenya", "lesotho", "liberia", "libya", "madagascar", "malawi", "mali",
        "mauritania", "mauritius", "morocco", "mozambique", "namibia", "niger",
        "nigeria", "rwanda", "sao tome and principe", "senegal", "seychelles",
        "sierra leone", "somalia", "south africa", "south sudan", "sudan",
        "tanzania", "togo", "tunisia", "uganda", "zambia", "zimbabwe",
        "western sahara",
    ])
    _add(table, "Antarctica", ["antarctica"])
    _add(table, "Asia", [
        "afghanistan", "armenia", "azerbaijan", "bahrain", "bangladesh",
        "bhutan", "brunei", "cambodia", "china", "georgia", "india",
        "indonesia", "iran", "iraq", "israel", "japan", "jordan", "kazakhstan",
        "kuwait", "kyrgyzstan", "laos", "lebanon", "malaysia", "maldives",
        "mongolia", "myanmar", "burma", "nepal", "north korea", "oman",
        "pakistan", "palestine", "philippines", "qatar", "saudi arabia",
        "singapore", "south korea", "republic of korea", "korea", "sri lanka",
        "syria", "taiwan", "tajikistan", "thailand", "timor-leste", "east timor",
        "turkey", "türkiye", "turkiye", "turkmenistan", "united arab emirates",
        "uae", "uzbekistan", "vietnam", "viet nam", "yemen", "hong kong",
        "macau", "macao",
    ])
    _add(table, "Europe", [
        "albania", "andorra", "austria", "belarus", "belgium",
        "bosnia and herzegovina", "bulgaria", "croatia", "cyprus", "czechia",
        "czech republic", "denmark", "estonia", "finland", "france", "germany",
        "greece", "hungary", "iceland", "ireland", "republic of ireland",
        "italy", "kosovo", "latvia", "liechtenstein", "lithuania", "luxembourg",
        "malta", "moldova", "monaco", "montenegro", "netherlands", "holland",
        "north macedonia", "macedonia", "norway", "poland", "portugal",
        "romania", "russia", "san marino", "serbia", "slovakia", "slovenia",
        "spain", "sweden", "switzerland", "ukraine", "united kingdom", "uk",
        "u.k.", "great britain", "britain", "england", "scotland", "wales",
        "northern ireland", "vatican city", "vatican", "vatican city state",
    ])
    _add(table, "North America", [
        "antigua and barbuda", "bahamas", "barbados", "belize", "canada",
        "costa rica", "cuba", "dominica", "dominican republic", "el salvador",
        "grenada", "guatemala", "haiti", "honduras", "jamaica", "mexico",
        "nicaragua", "panama", "saint kitts and nevis", "st kitts and nevis",
        "saint lucia", "st lucia", "saint vincent and the grenadines",
        "trinidad and tobago", "united states", "united states of america",
        "usa", "us", "u.s.", "u.s.a.", "greenland", "puerto rico", "bermuda",
    ])
    _add(table, "Oceania", [
        "australia", "fiji", "kiribati", "marshall islands", "micronesia",
        "nauru", "new zealand", "palau", "papua new guinea", "samoa",
        "solomon islands", "tonga", "tuvalu", "vanuatu", "new caledonia",
    ])
    _add(table, "South America", [
        "argentina", "bolivia", "brazil", "chile", "colombia", "ecuador",
        "guyana", "paraguay", "peru", "suriname", "uruguay", "venezuela",
        "french guiana",
    ])
    return table


CONTINENTS = continent_table()

US_STATES = {
    "alabama", "alaska", "arizona", "arkansas", "california", "colorado",
    "connecticut", "delaware", "florida", "georgia", "hawaii", "idaho",
    "illinois", "indiana", "iowa", "kansas", "kentucky", "louisiana", "maine",
    "maryland", "massachusetts", "michigan", "minnesota", "mississippi",
    "missouri", "montana", "nebraska", "nevada", "new hampshire", "new jersey",
    "new mexico", "new york", "north carolina", "north dakota", "ohio",
    "oklahoma", "oregon", "pennsylvania", "rhode island", "south carolina",
    "south dakota", "tennessee", "texas", "utah", "vermont", "virginia",
    "washington", "west virginia", "wisconsin", "wyoming", "district of columbia",
    "dc",
}
CA_PROVINCES = {
    "alberta", "british columbia", "manitoba", "new brunswick",
    "newfoundland and labrador", "newfoundland", "nova scotia", "ontario",
    "prince edward island", "quebec", "saskatchewan", "northwest territories",
    "nunavut", "yukon",
}
AU_STATES = {
    "new south wales", "queensland", "south australia", "tasmania", "victoria",
    "western australia", "australian capital territory", "northern territory",
}


def continent_for(country: str | None) -> str | None:
    if not country:
        return None
    return CONTINENTS.get(norm(country))


def parse_place(name: str, lng) -> dict:
    parts = [part.strip() for part in (name or "").split(",") if part.strip()]
    city = parts[0] if parts else name
    region = None
    country = None
    if len(parts) >= 2:
        last_key = norm(parts[-1])
        us_state = last_key in US_STATES and not (
            last_key == "georgia" and isinstance(lng, (int, float)) and lng > -30
        )
        if us_state:
            country = "United States"
            region = parts[-1] if len(parts) == 2 else ", ".join(parts[1:-1]) or parts[-1]
        elif last_key in CA_PROVINCES:
            country = "Canada"
            region = parts[-1] if len(parts) == 2 else ", ".join(parts[1:-1]) or parts[-1]
        elif last_key in AU_STATES:
            country = "Australia"
            region = parts[-1] if len(parts) == 2 else ", ".join(parts[1:-1]) or parts[-1]
        else:
            country = parts[-1]
            if len(parts) > 2:
                region = ", ".join(parts[1:-1])
    return {
        "city": city,
        "region": region,
        "country": country,
        "continent": continent_for(country),
    }


def fun_fact(city: dict) -> str | None:
    """Short fact from MapTap's own place line. Skip rather than invent one."""
    blurb = (city.get("orangeText") or "").strip()
    if blurb:
        return blurb
    trivia = (city.get("trivia") or "").replace("(p)", " ").replace("(n)", " ")
    trivia = re.sub(r"\s+", " ", trivia).strip()
    match = re.match(r"^(.+?[.!?])(?:\s|$)", trivia)
    sentence = match.group(1).strip() if match else ""
    if sentence and len(sentence) <= 220:
        return sentence
    return None


def puzzle_number(day: date) -> int:
    return (day - EPOCH).days


def play_day(day: date) -> str:
    return f"{MONTHS[day.month - 1]}{day.day}"


def chicago_today() -> date:
    return datetime.now(ZoneInfo("America/Chicago")).date()


def fetch_text(url: str) -> str:
    request = urllib.request.Request(url, headers={"User-Agent": "boyzmaptap-locations/1.0"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return response.read().decode("utf-8")
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"MapTap returned HTTP {exc.code} for {url}") from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"Could not reach MapTap for {url}: {exc.reason}") from exc


def parse_cities(script: str) -> list[dict]:
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", NODE_PARSE],
        input=script.encode("utf-8"),
        capture_output=True,
        check=False,
    )
    if proc.returncode != 0:
        err = proc.stderr.decode("utf-8", "replace").strip()
        raise SystemExit(f"Could not parse the MapTap day file: {err or proc.returncode}")
    return json.loads(proc.stdout.decode("utf-8"))


def ids_match(cities: list[dict], day: date) -> bool:
    dated = []
    for city in cities:
        ident = city.get("id") or ""
        if len(ident) >= 10 and ident[4] == "-" and ident[7] == "-":
            dated.append(ident)
    if not dated:
        return True
    prefix = day.isoformat()
    return any(ident.startswith(prefix) for ident in dated)


def build_day(day: date, cities: list[dict], url: str) -> dict:
    locations = []
    missing_fun = []
    missing_continent = []
    for index, city in enumerate(cities, start=1):
        place = parse_place(city.get("name") or "", city.get("lng"))
        fact = fun_fact(city)
        if not fact:
            missing_fun.append(place["city"] or f"round {index}")
        if place["country"] and not place["continent"]:
            missing_continent.append(f"{place['city']} ({place['country']})")
        locations.append({
            "order": index,
            "city": place["city"],
            "region": place["region"],
            "country": place["country"],
            "continent": place["continent"],
            "lat": city.get("lat"),
            "lng": city.get("lng"),
            "title": city.get("title") or None,
            "funFact": fact,
            "sources": city.get("sources") or [],
        })
    if missing_continent:
        print("No continent for: " + "; ".join(missing_continent), file=sys.stderr)
    if missing_fun:
        print("No fun fact (left blank): " + "; ".join(missing_fun), file=sys.stderr)
    return {
        "date": day.isoformat(),
        "puzzle": puzzle_number(day),
        "sourceUrl": url,
        "locations": locations,
    }


def load_doc() -> dict:
    if not DATA_PATH.exists():
        return {
            "comment": "One object in days[] per puzzle. See scripts/fetch-maptap-locations.py.",
            "puzzleEpoch": EPOCH.isoformat(),
            "roundMultipliers": [1, 1, 2, 3, 3],
            "multiplierNote": "MapTap weights rounds 1, 1, 2, 3, 3. Store the share-text final; do not sum the rounds.",
            "days": [],
        }
    return json.loads(DATA_PATH.read_text(encoding="utf-8"))


def write_doc(doc: dict) -> None:
    doc["days"] = sorted(doc.get("days") or [], key=lambda item: item.get("date") or "")
    DATA_PATH.write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def merge_day(doc: dict, fresh: dict, force: bool) -> str:
    days = doc.setdefault("days", [])
    for index, existing in enumerate(days):
        if existing.get("date") != fresh["date"]:
            continue
        if not force:
            return "exists"
        old_by_order = {loc.get("order"): loc for loc in existing.get("locations") or []}
        for loc in fresh["locations"]:
            old = old_by_order.get(loc["order"]) or {}
            if old.get("funFact"):
                loc["funFact"] = old["funFact"]
            if old.get("sources"):
                loc["sources"] = old["sources"]
        days[index] = fresh
        return "updated"
    days.append(fresh)
    return "added"


def self_test() -> None:
    assert puzzle_number(date(2026, 10, 1)) == 832
    assert puzzle_number(date(2026, 10, 2)) == 833
    assert play_day(date(2026, 10, 2)) == "October2"
    belfast = parse_place("Belfast, Northern Ireland, United Kingdom", -5.93)
    assert belfast["continent"] == "Europe" and belfast["region"] == "Northern Ireland"
    assert parse_place("Marrakech, Morocco", -7.98)["continent"] == "Africa"
    gainesville = parse_place("Gainesville, Florida, USA", -82.32)
    assert gainesville["continent"] == "North America" and gainesville["region"] == "Florida"
    assert parse_place("Szeged, Hungary", 20.14)["continent"] == "Europe"
    assert parse_place("Kathmandu, Nepal", 85.32)["continent"] == "Asia"
    assert parse_place("Kagoshima, Japan", 130.5)["continent"] == "Asia"
    assert parse_place("Caen, France", -0.37)["continent"] == "Europe"
    cagliari = parse_place("Cagliari, Sardinia, Italy", 9.12)
    assert cagliari["region"] == "Sardinia" and cagliari["continent"] == "Europe"
    assert parse_place("Juba, South Sudan", 31.57)["continent"] == "Africa"
    assert parse_place("Ciudad del Este, Paraguay", -54.6)["continent"] == "South America"
    texas = parse_place("San Antonio, Texas", -98.5)
    assert texas["country"] == "United States" and texas["continent"] == "North America"
    tbilisi = parse_place("Tbilisi, Georgia", 44.8)
    assert tbilisi["country"] == "Georgia" and tbilisi["continent"] == "Asia"
    atlanta = parse_place("Atlanta, Georgia", -84.4)
    assert atlanta["country"] == "United States"
    assert fun_fact({"orangeText": "Capital of Sardinia."}) == "Capital of Sardinia."
    assert fun_fact({"trivia": ""}) is None
    print("self-test ok")


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch one MapTap day into boyzmaptap/locations.json")
    parser.add_argument("--date", help="YYYY-MM-DD. Default: today in America/Chicago.")
    parser.add_argument("--force", action="store_true", help="Refresh a day that is already stored. Keeps an existing funFact.")
    parser.add_argument("--dry-run", action="store_true", help="Print the day JSON and do not write.")
    parser.add_argument("--self-test", action="store_true", help="Check puzzle numbers and place parsing.")
    args = parser.parse_args()
    if args.self_test:
        self_test()
        return

    day = date.fromisoformat(args.date) if args.date else chicago_today()
    url = SOURCE.format(play_day=play_day(day))
    script = fetch_text(url)
    cities = parse_cities(script)
    if len(cities) != 5:
        raise SystemExit(f"Expected 5 locations in {url}, found {len(cities)}")
    if not ids_match(cities, day):
        raise SystemExit(
            f"{url} does not look like {day.isoformat()} "
            "(city ids are a different year). Not writing."
        )
    fresh = build_day(day, cities, url)
    if args.dry_run:
        print(json.dumps(fresh, indent=2, ensure_ascii=False))
        return
    doc = load_doc()
    status = merge_day(doc, fresh, args.force)
    if status == "exists":
        print(f"{day.isoformat()} already in {DATA_PATH}. Leaving it.")
        return
    write_doc(doc)
    print(f"{status} {day.isoformat()} (#{fresh['puzzle']}) in {DATA_PATH}")


if __name__ == "__main__":
    main()
