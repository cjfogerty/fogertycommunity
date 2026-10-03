/**
 * Boyz MapTap shared scores. Paste this into a container-bound Apps Script
 * on a Google Sheet the site owner controls. Players never sign in.
 *
 * Setup (owner's Google account, once):
 * 1. Create a Google Sheet named "Boyz MapTap scores".
 * 2. Extensions → Apps Script. Delete the starter code, paste this file, and save.
 * 3. Project Settings (gear) → Script properties → Add script property:
 *    Property: GROUP_PIN
 *    Value: a short group PIN. Not a password you use anywhere else.
 *    The PIN is sent in the save link, so treat it like a group door code.
 * 4. Deploy → New deployment → Select type → Web app.
 *    Execute as: Me
 *    Who has access: Anyone
 *    Do not choose "Anyone with a Google account".
 * 5. Authorize the script when Google asks (review the permissions, then allow).
 * 6. Copy the Web app URL that ends in /exec. Ignore the /dev URL.
 * 7. Put that URL in boyzmaptap/backend.json as the url value. Commit and push
 *    so GitHub Pages publishes it.
 * 8. Open the /exec URL in a browser. You should see {"ok":true,"logs":[]}.
 *    A Google sign-in page means access is not set to Anyone. Edit the deployment.
 * 9. Tell the group the PIN. It does not go in the repo.
 *
 * After every edit to this script: Deploy → Manage deployments → pencil →
 * Version: New version → Deploy. The /exec URL stays the same.
 *
 * The sheet tab is named Scores. Row 1 is the header. The script creates it.
 * Same playerId + date replaces that row. List is public. Save requires the PIN.
 */

var PLAYERS = ["peter", "andy", "sam", "ben", "micah", "casey"];
var HEADERS = ["playerId", "date", "puzzle", "score", "r1", "r2", "r3", "r4", "r5", "savedAt"];

function doGet(e) {
  return respond_(e);
}

function doPost(e) {
  return respond_(e);
}

function respond_(e) {
  var params = (e && e.parameter) || {};
  var result;
  try {
    var action = String(params.action || "list");
    if (action === "list") result = { ok: true, logs: listLogs_() };
    else if (action === "save") result = saveLog_(params);
    else result = { ok: false, error: "Unknown action." };
  } catch (err) {
    result = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  var body = JSON.stringify(result);
  var callback = String(params.callback || "");
  if (/^[A-Za-z0-9_]+$/.test(callback)) {
    return ContentService
      .createTextOutput(callback + "(" + body + ");")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(body).setMimeType(ContentService.MimeType.JSON);
}

function sheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName("Scores");
  if (!sh) sh = ss.insertSheet("Scores");
  var header = sh.getLastRow() === 0 ? "" : String(sh.getRange(1, 1).getValue());
  if (header !== "playerId") {
    sh.getRange(1, 1, 1, HEADERS.length).setValues([HEADERS]);
    sh.setFrozenRows(1);
  }
  sh.getRange(1, 2, Math.max(sh.getMaxRows(), 2), 1).setNumberFormat("@");
  return sh;
}

function pinOk_(pin) {
  var expected = PropertiesService.getScriptProperties().getProperty("GROUP_PIN");
  if (!expected) return { ok: false, error: "Shared board has no PIN set yet." };
  if (String(pin || "") !== String(expected)) return { ok: false, error: "Wrong PIN." };
  return null;
}

function asDate_(value) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), "yyyy-MM-dd");
  }
  var text = String(value || "").trim();
  var match = text.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : "";
}

function wholeRound_(value) {
  var n = Number(value);
  return isFinite(n) && Math.floor(n) === n && n >= 0 && n <= 100;
}

function saveLog_(params) {
  var pinError = pinOk_(params.pin);
  if (pinError) return pinError;
  var playerId = String(params.playerId || "");
  if (PLAYERS.indexOf(playerId) < 0) return { ok: false, error: "Unknown player." };
  var date = asDate_(params.date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Date must be YYYY-MM-DD." };
  var rounds = [params.r1, params.r2, params.r3, params.r4, params.r5];
  for (var i = 0; i < rounds.length; i++) {
    if (!wholeRound_(rounds[i])) return { ok: false, error: "Each round must be a whole number from 0 to 100." };
    rounds[i] = Number(rounds[i]);
  }
  var weighted = rounds[0] + rounds[1] + rounds[2] * 2 + rounds[3] * 3 + rounds[4] * 3;
  var score = Number(params.score);
  if (score !== weighted) {
    return { ok: false, error: "Final score does not match the 1, 1, 2, 3, 3 weights (" + weighted + ")." };
  }
  var puzzle = "";
  if (params.puzzle !== "" && params.puzzle != null) {
    puzzle = Number(params.puzzle);
    if (!isFinite(puzzle) || Math.floor(puzzle) !== puzzle || puzzle < 1) {
      return { ok: false, error: "Puzzle number is not valid." };
    }
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    var sh = sheet_();
    var values = sh.getDataRange().getValues();
    var rowIndex = 0;
    for (var r = 1; r < values.length; r++) {
      if (String(values[r][0]) === playerId && asDate_(values[r][1]) === date) {
        rowIndex = r + 1;
        break;
      }
    }
    var savedAt = new Date().toISOString();
    var row = [playerId, date, puzzle === "" ? "" : puzzle, score, rounds[0], rounds[1], rounds[2], rounds[3], rounds[4], savedAt];
    var dest = rowIndex > 0 ? rowIndex : sh.getLastRow() + 1;
    sh.getRange(dest, 2).setNumberFormat("@");
    sh.getRange(dest, 1, 1, HEADERS.length).setValues([row]);
  } finally {
    lock.releaseLock();
  }
  return { ok: true, logs: listLogs_() };
}

function listLogs_() {
  var sh = sheet_();
  var values = sh.getDataRange().getValues();
  var logs = [];
  for (var r = 1; r < values.length; r++) {
    var playerId = String(values[r][0] || "");
    var date = asDate_(values[r][1]);
    if (PLAYERS.indexOf(playerId) < 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    var rounds = [];
    var ok = true;
    for (var c = 4; c <= 8; c++) {
      if (!wholeRound_(values[r][c])) { ok = false; break; }
      rounds.push(Number(values[r][c]));
    }
    if (!ok) continue;
    var weighted = rounds[0] + rounds[1] + rounds[2] * 2 + rounds[3] * 3 + rounds[4] * 3;
    var score = Number(values[r][3]);
    if (score !== weighted) continue;
    var puzzle = values[r][2] === "" || values[r][2] == null ? null : Number(values[r][2]);
    logs.push({
      id: playerId + "-" + date,
      playerId: playerId,
      date: date,
      puzzle: puzzle,
      score: score,
      rounds: rounds
    });
  }
  return logs;
}
