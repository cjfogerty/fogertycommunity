# Market-share method

The map at [map.html](map.html) is a **model**, not a membership audit. No church publishes a zip-level roll of who actually attends. This is how the estimate is built so it can be challenged and improved.

## Weekly potential in a zip

```
potential_weekly = zip_population × 0.26
```

0.26 is Pew’s 2023–24 Religious Landscape Study figure for adults in the St. Louis metro who attend religious services weekly. It is a metro-wide average. St. Charles County is probably a bit higher; city zips a bit lower. We did not adjust zip-by-zip yet because we do not have a clean zip-level attendance survey.

## Allocating a campus to zips

Each campus’s published (or estimated) weekly attendance is spread across zips within **16 miles** with a simple gravity weight:

```
weight = zip_population / (distance_miles + 1.6)²
allocated = campus_weekly × (weight / sum of weights)
```

Assumptions baked in:

- People usually attend somewhere near home, but megachurches pull farther than parish churches. One distance cap is a compromise.
- Population is a stand-in for “possible attenders.” We do not yet have age, kids-in-home, or tradition mix by zip.
- Multi-site churches were split across campuses when the church did not publish a campus breakdown (The Crossing, Faith Church, Harvester, Waypoint). Those splits are labeled in `churches.json`.
- Catholic weeklies are `registered members × 0.265` (Archdiocese 2025 Mass-count rate), not headcounts from the door.

## How to read “share”

For a selected church in zip Z:

```
share = people allocated from that church into Z / potential_weekly in Z
```

An 8% share in 63368 does **not** mean 8% of O’Fallon is a member. It means: of the people we would expect to be in *somebody’s* sanctuary this weekend, this model sends about 8% of them to that church.

“Tracked coverage” is the sum of every church on the map. The leftover is:

- congregations we have not plotted yet (hundreds of small Baptist, AME, COGIC, Assemblies, storefront, and parish churches)
- people Pew counts as weekly attenders who go somewhere else
- model error

## Giving

Weekly giving is only shown where a church published a budget, surplus, or annual contribution total. Most Catholic parishes and many Protestants do not. Missing giving is not zero giving.

## What would make this sharper

1. Campus-level attendance instead of org-level splits.
2. Parish boundary shapefiles for Catholic (All Things New) instead of gravity.
3. ACS zip age mix + kids-in-household.
4. A donor-zip sample from any church that will share one.
5. Real zip polygons (ZCTA GeoJSON) instead of centroid circles.

Until then, use the map to see **relative** density — who is actually planted in St. Charles vs South County vs West County — not as a precise market-share ledger.
