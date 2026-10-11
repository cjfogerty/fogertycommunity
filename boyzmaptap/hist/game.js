/* HistTap scoring and daily selection.
   Scoring curve (miles, haversine), continental scale:
     100 if distance <= 0.5
       0 if distance >= 450
       otherwise round(100 * (1 - t) ** 2.1)
       where t = (distance - 0.5) / (450 - 0.5)
   A tenth of a mile is still 100. Around 50 miles is the high 70s.
   Around 200 miles is the high 20s. The far side of a few states is 0.
   Round weights are 1, 1, 2, 3, 3. Final score maxes at 1000.
   The daily five are a pure function of the America/Chicago date.
   One or two pop-culture pins are mixed into the five. Nothing labels
   them ahead of the reveal. Pins dealt on the previous 6 days are skipped.
   The skip list is chained from 2024-01-01 so every player gets the same day. */
(function (root) {
  var PERFECT_MI = 0.5;
  var ZERO_MI = 450;
  var CURVE = 2.1;
  var WEIGHTS = [1, 1, 2, 3, 3];
  var LOOKBACK_DAYS = 6;
  var EPOCH = "2024-01-01";
  var dealCache = {};
  var EMOJI = Array.from("💀🤮👽👻😭😱🤢😝😵🤬🥺🧊😒❄😥🙈😪😴🥶😶😕😞😨😟🫣😔🤫🤨😑😐🫢🙃🙂😁😂🤗🌞👏✨🌟😁🎓🎉👑🏆🏅🔥🎯");

  function scoreForMiles(miles) {
    if (!isFinite(miles) || miles <= PERFECT_MI) return 100;
    if (miles >= ZERO_MI) return 0;
    var t = (miles - PERFECT_MI) / (ZERO_MI - PERFECT_MI);
    return Math.round(100 * Math.pow(1 - t, CURVE));
  }

  function finalScore(roundScores) {
    var total = 0;
    for (var i = 0; i < roundScores.length; i++) total += roundScores[i] * WEIGHTS[i];
    return total;
  }

  function emojiFor(score) {
    var n = EMOJI.length;
    var i = Math.floor((Number(score) / 100) * n);
    if (i >= n) i = n - 1;
    if (i === n - 1 && score < 100) i -= 1;
    if (i < 0) i = 0;
    return EMOJI[i];
  }

  function milesBetween(aLat, aLng, bLat, bLng) {
    var R = 3958.7613;
    var p = Math.PI / 180;
    var dLat = (bLat - aLat) * p;
    var dLng = (bLng - aLng) * p;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2)
      + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  function hashString(s) {
    var h = 2166136261;
    for (var i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffle(list, rng) {
    var pool = list.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool;
  }

  function chicagoISO(date) {
    var fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    });
    return fmt.format(date || new Date());
  }

  function addIsoDays(iso, delta) {
    var parts = iso.split("-");
    var utc = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    utc.setUTCDate(utc.getUTCDate() + delta);
    return utc.toISOString().slice(0, 10);
  }

  function prettyDate(iso) {
    var parts = iso.split("-");
    var utc = new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])));
    return new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      timeZone: "UTC"
    }).format(utc);
  }

  function splitPool(places, avoid) {
    var eggs = [];
    var history = [];
    for (var i = 0; i < places.length; i++) {
      if (avoid && avoid[places[i].id]) continue;
      if (places[i].egg) eggs.push(places[i]);
      else history.push(places[i]);
    }
    if (history.length < 4) history = places.filter(function (p) { return !p.egg; });
    if (!eggs.length) eggs = places.filter(function (p) { return p.egg; });
    return { eggs: eggs, history: history };
  }

  function takeDifficulty(history, used, difficulty) {
    for (var i = 0; i < history.length; i++) {
      if (!used[history[i].id] && history[i].difficulty === difficulty) return history[i];
    }
    for (var j = 0; j < history.length; j++) {
      if (!used[history[j].id]) return history[j];
    }
    return history[0];
  }

  function pickPure(places, isoDate, avoid) {
    var rng = mulberry32(hashString("histtap-v1|" + isoDate));
    var parts = splitPool(places, avoid);
    var eggCount = rng() < 0.45 ? 2 : 1;
    if (parts.eggs.length < eggCount) eggCount = parts.eggs.length;
    var eggs = shuffle(parts.eggs, rng).slice(0, eggCount);
    var history = shuffle(parts.history, rng);
    var used = {};
    eggs.forEach(function (p) { used[p.id] = true; });
    var pattern = eggCount === 2 ? ["easy", "medium", "hard"] : ["easy", "easy", "medium", "hard"];
    var chosen = eggs.slice();
    for (var i = 0; i < pattern.length; i++) {
      var pin = takeDifficulty(history, used, pattern[i]);
      if (!pin) break;
      used[pin.id] = true;
      chosen.push(pin);
    }
    return shuffle(chosen, rng).slice(0, 5);
  }

  function pickDaily(places, isoDate) {
    if (!dealCache[isoDate]) {
      var cursor = isoDate < EPOCH ? isoDate : EPOCH;
      while (cursor <= isoDate) {
        if (!dealCache[cursor]) {
          var avoid = {};
          for (var d = 1; d <= LOOKBACK_DAYS; d++) {
            var prior = dealCache[addIsoDays(cursor, -d)];
            if (!prior) continue;
            for (var i = 0; i < prior.length; i++) avoid[prior[i]] = true;
          }
          dealCache[cursor] = pickPure(places, cursor, avoid).map(function (p) { return p.id; });
        }
        cursor = addIsoDays(cursor, 1);
      }
    }
    var byId = {};
    for (var n = 0; n < places.length; n++) byId[places[n].id] = places[n];
    return dealCache[isoDate].map(function (id) { return byId[id]; });
  }

  function pickPractice(places, rng) {
    var random = rng || Math.random;
    var iso = "practice|" + Math.floor(random() * 1e9) + "|" + Math.floor(random() * 1e9);
    return pickPure(places, iso, null);
  }

  function shareText(opts) {
    var head = opts.practice ? "HistTap practice" : ("HistTap " + prettyDate(opts.date));
    var bits = [];
    for (var i = 0; i < opts.scores.length; i++) {
      bits.push(String(opts.scores[i]) + emojiFor(opts.scores[i]));
    }
    return head + "\n" + bits.join(" ") + "\nFinal score: " + opts.finalScore + "\n" + opts.url;
  }

  function curveExamples() {
    var miles = [0, 0.5, 1, 10, 25, 50, 100, 200, 300, 400, 450, 800];
    var rows = [];
    for (var i = 0; i < miles.length; i++) {
      rows.push({ miles: miles[i], score: scoreForMiles(miles[i]) });
    }
    return rows;
  }

  root.HistTap = {
    PERFECT_MI: PERFECT_MI,
    ZERO_MI: ZERO_MI,
    CURVE: CURVE,
    WEIGHTS: WEIGHTS,
    scoreForMiles: scoreForMiles,
    finalScore: finalScore,
    emojiFor: emojiFor,
    milesBetween: milesBetween,
    chicagoISO: chicagoISO,
    addIsoDays: addIsoDays,
    prettyDate: prettyDate,
    pickDaily: pickDaily,
    pickPractice: pickPractice,
    shareText: shareText,
    curveExamples: curveExamples
  };
})(typeof window !== "undefined" ? window : globalThis);
