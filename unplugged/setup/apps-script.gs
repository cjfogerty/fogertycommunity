/**
 * Fogerty Family Unplugged Challenge - Sheet webhook (Google Apps Script web app).
 * Sheet columns: date,name,device,app,minutes,pickups,notifications,source   (one row per person per day per app)
 *
 * Inputs:
 *  1) Life Dashboard Companion (Android) POST, webhook URL  .../exec?secret=XXX&name=Dad
 *     {"source":"screen_time","device":"Google Pixel 8","sequence":N,
 *      "screen_time":[{"date","total_screen_time_minutes","filtered_screen_time_minutes"?,
 *                      "apps":[{"package":"com.instagram.android","name":"Instagram","minutes":45,"last_used":...}]}]}
 *     -> one row per app, app = "Instagram [com.instagram.android]". Minutes not covered by apps
 *        (apps <=1 min, filtered apps) become one app-less row (scored as 'general').
 *     The app re-sends the last 7 days every sync; each (date,name) is REPLACED, and only by a payload
 *     with a higher `sequence` than the one that last wrote it (late outbox retries can't clobber newer data).
 *  2) iPhone sync page (/unplugged/sync/): GET  .../exec?action=iphone&code=FAMILY_CODE&payload=<json>&callback=fn  (JSONP)
 *     payload {"kind":"iphone","date","name","device","total","categories":{"social":90,"messaging":40,"healthy":20,"general":95},
 *              "pickups","notifications","source"}  -> one "category:<id>" row per category, replacing that date+name.
 *     Same payload can also be POSTed as JSON with "secret".
 *  3) Simple total (old Shortcut / curl) POST {"date","name","device","minutes",...,"secret"} -> one app-less row ('general').
 *     Optional "app" or "apps":[{"app","minutes"}] in a POST are stored per app.
 */
const SECRET = 'CHANGE-ME-to-a-long-random-string';   // for POSTs (Life Dashboard URL, curl)
const FAMILY_CODE = 'CHANGE-ME-short-family-code';     // typed once on the iPhone sync page (it's visible to family, keep it different from SECRET)
const SHEET_NAME = 'Sheet1';
const HEADERS = ['date','name','device','app','minutes','pickups','notifications','source'];
const CATS = ['social','general','messaging','healthy'];

function doPost(e) {
  let body = {};
  try { body = JSON.parse((e.postData && e.postData.contents) || '{}'); } catch (err) { return out_({ok:false,error:'bad json'}); }
  const q = e.parameter || {};
  if ((body.secret || q.secret) !== SECRET) return out_({ok:false,error:'unauthorized'});
  if (body.test === true) return out_({ok:true,test:true});
  if (body.source === 'screen_time' && Array.isArray(body.screen_time)) {
    const name = q.name || body.name;
    if (!name) return out_({ok:false,error:'add &name=... to the webhook URL'});
    let n = 0, skipped = 0;
    body.screen_time.forEach(d => {
      const apps = Array.isArray(d.apps) ? d.apps : [];
      const rows = apps.map(a => ({app: (a.name ? a.name + ' [' + a.package + ']' : a.package), minutes: a.minutes}));
      const covered = apps.reduce((s, a) => s + (Number(a.minutes) || 0), 0);
      const rest = (Number(d.total_screen_time_minutes) || 0) - covered;
      if (rest > 0 || !rows.length) rows.push({app: '', minutes: Math.max(rest, 0)});
      const r = replaceDay_(d.date, name, 'Android', rows, '', '', 'auto', body.sequence);
      if (r < 0) skipped++; else n += r;
    });
    return out_({ok:true,rows:n,skipped_days:skipped});
  }
  if (body.kind === 'iphone') return out_(iphone_(body));
  // simple / generic
  const date = body.date || today_();
  const name = body.name || q.name;
  let rows = Array.isArray(body.apps) ? body.apps.map(a => ({app:a.app || a.name || '', minutes:a.minutes}))
                                      : [{app: body.app || '', minutes: body.minutes}];
  const n = Array.isArray(body.apps) ? replaceDay_(date, name, body.device || '', rows, body.pickups, body.notifications, body.source || 'manual')
                                     : upsertOne_(date, name, body.device || '', rows[0], body.pickups, body.notifications, body.source || 'manual');
  return out_({ok:true,rows:n});
}

function doGet(e) {
  const q = (e && e.parameter) || {};
  if (q.action !== 'iphone') return out_({ok:true,info:'POST JSON here, or GET ?action=iphone'}, q.callback);
  if (q.code !== FAMILY_CODE) return out_({ok:false,error:'wrong family code'}, q.callback);
  let p; try { p = JSON.parse(q.payload || '{}'); } catch (err) { return out_({ok:false,error:'bad payload'}, q.callback); }
  return out_(iphone_(p), q.callback);
}

function iphone_(p) {
  const total = Math.round(Number(p.total));
  if (!p.name || isNaN(total)) return {ok:false,error:'name and total required'};
  const c = p.categories || {};
  const rows = CATS.filter(k => Number(c[k]) > 0).map(k => ({app:'category:' + k, minutes:c[k]}));
  const sum = rows.reduce((s, r) => s + Number(r.minutes), 0);
  if (sum > total) return {ok:false,error:'categories exceed total'};
  if (total > sum) rows.push({app:'category:general', minutes: total - sum}); // leftover
  if (!rows.length) rows.push({app:'category:general', minutes:0});
  const n = replaceDay_(p.date || today_(), p.name, p.device || 'iPhone', merge_(rows), p.pickups ?? '', p.notifications ?? '', p.source || 'manual');
  return {ok:true,rows:n};
}

function merge_(rows) { const m = {}; rows.forEach(r => m[r.app] = (m[r.app] || 0) + Number(r.minutes)); return Object.keys(m).map(k => ({app:k, minutes:m[k]})); }

/** Replace every row for (date,name) with `rows`. Returns rows written, or -1 if an older sequence was ignored. */
function replaceDay_(date, name, device, rows, pickups, notifications, source, sequence) {
  date = String(date || '').slice(0,10); name = String(name || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name) return 0;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    if (sequence != null) {
      const props = PropertiesService.getScriptProperties(), key = 'seq|' + date + '|' + name.toLowerCase();
      const prev = Number(props.getProperty(key) || -1);
      if (Number(sequence) < prev) return -1;
      props.setProperty(key, String(sequence));
    }
    const sh = sheet_();
    const data = sh.getDataRange().getDisplayValues();
    for (let i = data.length - 1; i >= 1; i--)            // delete bottom-up
      if (data[i][0] === date && data[i][1].toLowerCase() === name.toLowerCase()) sh.deleteRow(i + 1);
    const vals = rows.map((r, i) => [date, name, device, r.app, Math.max(0, Math.round(Number(r.minutes) || 0)),
                                      i === 0 ? (pickups ?? '') : '', i === 0 ? (notifications ?? '') : '', source]);
    if (vals.length) sh.getRange(sh.getLastRow() + 1, 1, vals.length, HEADERS.length).setValues(vals);
    return vals.length;
  } finally { lock.releaseLock(); }
}

function upsertOne_(date, name, device, r, pickups, notifications, source) {
  date = String(date || '').slice(0,10); name = String(name || '').trim();
  const min = Math.round(parseFloat(String(r.minutes)));
  if (!date || !name || isNaN(min)) return 0;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const sh = sheet_(), vals = [date, name, device, r.app || '', min, pickups ?? '', notifications ?? '', source];
    const data = sh.getDataRange().getDisplayValues();
    const idx = data.findIndex((x, i) => i > 0 && x[0] === date && x[1].toLowerCase() === name.toLowerCase() && x[3] === vals[3]);
    if (idx > 0) sh.getRange(idx + 1, 1, 1, vals.length).setValues([vals]); else sh.appendRow(vals);
    return 1;
  } finally { lock.releaseLock(); }
}

function sheet_() { return SpreadsheetApp.getActive().getSheetByName(SHEET_NAME); }
function today_() { return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function out_(o, callback) {
  if (callback && /^[\w.]+$/.test(callback))
    return ContentService.createTextOutput(callback + '(' + JSON.stringify(o) + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
