# Protein Intake Tracker

Simple graphical tool for logging daily protein intake against age-appropriate targets (1.0–1.5 g/kg, default 1.2 g/kg) for older adults.

## Live
https://cjfogerty.github.io/fogertycommunity/protein-tracker/

## Features
- Log person, date, weight (kg/lbs), protein grams, notes
- Calculates recommended intake and shows range
- Chart of intake vs target over time (green = at/above, red = below)
- Summary stats per person
- Local storage by default; optional Google Sheet CSV load

## Google Sheet backend
1. Create a Sheet with headers: `Date,Person,WeightKg,ProteinG,Notes`
2. Publish to web → CSV, or build a simple Apps Script web app for read/write.
3. Paste the URL into the config box on the page.

Data stays in the browser until you configure a shared endpoint.

## Notes
Built for the Fogerty parents (intermittent fasting, ages 68 & 71). Pair higher protein with resistance training for best muscle and function outcomes.
