# Unplugged Challenge – setup (≈20 min)

Scoreboard: https://cjfogerty.github.io/fogertycommunity/unplugged/
iPhone log page: https://cjfogerty.github.io/fogertycommunity/unplugged/sync/

**How scoring works now:** every Sheet row is one app (or category) for one person on one day. Minutes are multiplied by a category weight from `unplugged/weights.json` — 🔥 social/short video 1.5×, 📱 general 1× (also any unknown app), 💬 messaging/calls 0.5×, 🌱 healthy 0× — and each person's score is the % drop in **weighted** minutes (last 7-day avg) vs. their own first 7 days. To change weights or add apps, edit `weights.json` (names and Android package names, case-insensitive).

## 1. Make the Sheet
1. Google Sheets → **File → Import → Upload** `template.csv` (Replace spreadsheet). Delete the Example rows, keep the header row:
   `date,name,device,app,minutes,pickups,notifications,source`. Tab must be `Sheet1` (or change `SHEET_NAME` in the script).
2. Format column A as **Plain text** so dates stay `YYYY-MM-DD`.
   - `app` can be an app name (`Instagram`), a package (`com.instagram.android`), both (`Instagram [com.instagram.android]`, what Android writes), `category:social|general|messaging|healthy` (what the iPhone page writes), or empty = a plain daily total (counted as general 1×).

## 2. Add the webhook script
1. In the Sheet: **Extensions → Apps Script**. Replace the code with `apps-script.gs`.
2. Set `SECRET` (long random, for Android/curl) and `FAMILY_CODE` (short, you'll tell the family; typed once on the iPhone page). Save.
3. **Deploy → New deployment → Web app**. Execute as **Me**, access **Anyone**. Deploy, authorize, copy the `/exec` URL.
   (After later edits: Deploy → Manage deployments → edit → **New version**, so the URL stays the same.)

## 3. Connect the pages (one commit)
1. Sheet: **File → Share → Publish to web** → `Sheet1` → **CSV** → Publish → copy link → `unplugged/index.html`: `const SHEET_CSV_URL = "<link>";`
2. `unplugged/sync/index.html`: `const SYNC_ENDPOINT = "<exec URL>";` — this turns off test mode. Also edit `NAMES` there if the family list changes.
   The "Example data" banner disappears once the CSV loads (published CSV can lag ~5 min).

## 4. Android – Life Dashboard Companion (auto, per app)
1. Install https://github.com/owen282000/life-dashboard-companion-app/releases/latest, grant Usage Access.
2. **Screen Time** tab → **Webhook URLs** → add `<exec URL>?secret=<SECRET>&name=Dad` (name exactly as on the leaderboard).
3. Optional: Day Boundary → off (midnight-to-midnight) to match iPhones.
- The script writes one row per app (`apps[].name` + `apps[].package`, `minutes`) plus one app-less row for minutes not covered by listed apps (apps ≤1 min, or filtered via "Apps to send"). Each sync re-sends 7 days; each person-day is replaced, and only by a payload with a higher `sequence` (so late outbox retries can't overwrite newer data).
- Pickups/notifications aren't sent by the app → "—".
- Heads-up: Apps Script answers POSTs with a 302 redirect; the row is already written, but the app may log a failure and retry (harmless). A tiny relay (e.g. Cloudflare Worker) fixes that if needed.

## 5. iPhone – no download: the sync page
1. Each person bookmarks / Adds to Home Screen: https://cjfogerty.github.io/fogertycommunity/unplugged/sync/
2. Nightly: open Settings → Screen Time → See All App & Website Activity → Day, then on the page pick your name, enter the total and minutes for Social / Messages / Healthy (leftover counts as Other 1×), optional pickups/notifications, family code (remembered), Submit → ✅ screen shows the weighted score. Re-submitting the same day replaces it.
3. Under the hood: `GET <exec URL>?action=iphone&code=<FAMILY_CODE>&payload=<json>&callback=…` (JSONP so the page can read the reply; Apps Script doesn't allow CORS on POST). JSON POST with `"kind":"iphone"` and `secret` also works.
4. Optional iOS 26 Shortcut (**untested**): **Get App & Website Data** → minutes → **Open URLs** `…/unplugged/sync/?name=Casey&total=245&social=90&messaging=40&healthy=20` (also `general`/`other`, `pickups`, `notifications`, `date`, `auto=1` to auto-submit). Steps are on the sync page.

## Test
Before `SYNC_ENDPOINT` is set the sync page is in **test mode**: Submit only previews the payload and the weighted score.
After deploying:
- iPhone path: `curl -L '<exec URL>?action=iphone&code=<FAMILY_CODE>&callback=x&payload={"kind":"iphone","name":"Test","date":"2026-10-12","total":120,"categories":{"social":30}}'` → `x({"ok":true,"rows":2})`
- Android shape: `curl -L -H 'Content-Type: application/json' -d '{"source":"screen_time","sequence":1,"screen_time":[{"date":"2026-10-12","total_screen_time_minutes":60,"apps":[{"package":"com.instagram.android","name":"Instagram","minutes":40}]}]}' '<exec URL>?secret=<SECRET>&name=Test'`
Delete the Test rows afterwards.
