# Intel Snatcher Grok Bot — Church Research

Research project: catalog churches of all denominations across the Saint Louis metro area.

## Goals

1. Identify churches (all denominations) in the St. Louis metro.
2. Estimate **weekly attendance** for each — start with the largest and work down.
3. Where available, capture **weekly giving** amounts.

## Status

- Folder scaffolded. Initial data table populated with the largest churches (see `st-louis-churches-attendance.md`).
- Sources: public websites, directories, news, IRS filings (Form 990 where applicable), LCMS stats, Hartford Institute / Outreach data.

## Notes

- Attendance figures are often self-reported or estimated; treat as approximate.
- Giving data is sparse and usually only available for larger or more transparent congregations (annual reports, financial statements).
- Catholic parishes rarely publish per-parish weekly counts; Archdiocese releases aggregate October Mass counts.

## Next steps

- Expand table with more LCMS, UMC, Baptist, and smaller non-denominational churches.
- Add structured CSV/JSON export for easier analysis.
- Pull Form 990s for churches that file as nonprofits.
- Cross-reference with Hartford Institute megachurch database for verification.
