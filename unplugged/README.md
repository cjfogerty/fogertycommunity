# Fogerty Family Unplugged Challenge

Live page: https://cjfogerty.github.io/fogertycommunity/unplugged/

## Data source
`index.html` reads a **published Google Sheet CSV**. Set the constant near the bottom of `index.html`:

```js
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=0&single=true&output=csv";
```

Get it in Google Sheets: **File → Share → Publish to web →** pick the sheet tab → **Comma-separated values (.csv)** → Publish → copy the link.

If `SHEET_CSV_URL` is empty or can't be loaded, the page falls back to `data.json` (example data) and shows an **Example data** banner.

## Sheet columns (row 1 header, one row per person per day per app)
`date,name,device,app,minutes,pickups,notifications,source` — `app` may be an app name, Android package, `Name [package]`, `category:<id>`, or empty (plain total → general). Same date+name+app twice: later row wins. Pickups/notifications: any non-empty value that day.

## Scoring
- Weights in [`weights.json`](weights.json): social/short video 1.5×, general 1× (default for unknown apps), messaging/calls 0.5×, healthy 0×.
- **Baseline** = each person's first 7 days. **Score** = % drop of weighted minutes (avg of most recent 7 days after baseline) vs. baseline weighted avg.
- Each row shows raw vs weighted minutes, minutes per category and top 3 apps (last 7 days).

## Logging
- Android: Life Dashboard Companion → Apps Script (per app, automatic).
- iPhone: [sync page](sync/) (no app download) or an optional Shortcut that opens it prefilled.
- Full setup: [setup/SETUP.md](setup/SETUP.md), script: [setup/apps-script.gs](setup/apps-script.gs).
