# Fogerty Family Unplugged Challenge

Live page: https://cjfogerty.github.io/fogertycommunity/unplugged/

## Data source
`index.html` reads a **published Google Sheet CSV**. Set the constant near the bottom of `index.html`:

```js
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/XXXX/pub?gid=0&single=true&output=csv";
```

Get it in Google Sheets: **File → Share → Publish to web →** pick the sheet tab → **Comma-separated values (.csv)** → Publish → copy the link.

If `SHEET_CSV_URL` is empty or can't be loaded, the page falls back to `data.json` (example data) and shows an **Example data** banner.

## Sheet columns (row 1 header, one row per person per day)
| column | example | meaning |
|---|---|---|
| date | 2026-10-12 | day, `YYYY-MM-DD` |
| name | Casey | person (exact same spelling every day) |
| device | iPhone / Android | shown as a badge |
| minutes | 246 | total screen time that day, in minutes |
| pickups | 62 | phone pickups (bonus stat, optional) |
| notifications | 48 | notifications (bonus stat, optional) |
| source | auto / manual | shows the ⟳ Auto-synced or ✎ Manual tag |

If a person has two rows for the same date, the later row wins.

## Scoring
- **Baseline** = each person's first 7 days of data.
- **Score** = % drop of the average of their most recent 7 days (after the baseline) vs. the baseline average. Highest % wins the weekly-winner banner.
- The sparkline shows the last 7 logged days; pickups/notifications are from the latest day.
