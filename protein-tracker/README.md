# Protein Intake Tracker

Simple graphical tool for logging daily protein intake against age-appropriate targets (1.0–1.5 g/kg, default 1.2 g/kg) for older adults.

## Live
https://cjfogerty.github.io/fogertycommunity/protein-tracker/

## Features
- Log person, date, optional weight (kg/lbs), protein grams, notes
- Checkbox to hide weight entry and display (for privacy)
- Calculates recommended intake when weight is provided
- Chart of intake vs target over time (green = at/above, red = below, gray if no weight)
- Summary stats per person
- Local storage by default; optional Google Sheet CSV load
- Hero image of Mom & Dad

## Google Sheet backend
Sheet ID: `1o8RNQzmCRWRzknJ3k2igtUit4pziaWpLiRz8wRr9KM0`

1. In the Sheet: File → Share → Publish to web → choose the tab → CSV → Publish.
2. Paste the published CSV URL into the config box on the page.
3. Columns expected: Date, Person, WeightKg, ProteinG, Notes

For full read/write, deploy a Google Apps Script web app that accepts GET (return JSON) and POST (append row).

Data stays in the browser until you configure a shared endpoint.

## Notes
Built for the Fogerty parents (intermittent fasting, ages 68 & 71). Pair higher protein with resistance training for best muscle and function outcomes. Weight is fully optional and can be hidden.
