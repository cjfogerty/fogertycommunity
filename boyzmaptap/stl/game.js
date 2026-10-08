/* STL MapTap scoring and daily selection.
   Scoring curve (miles, haversine):
     100 if distance <= 0.15
       0 if distance >= 22
       otherwise round(100 * (1 - t) ** 1.6)
       where t = (distance - 0.15) / (22 - 0.15)
   Round weights are 1, 1, 2, 3, 3. Final score maxes at 1000.
   The daily five are a pure function of the America/Chicago date and
   the landmark list, skipping anything used in the previous 6 days. */
(function (root) {
  var PERFECT_MI = 0.15;
  var ZERO_MI = 22;
  var CURVE = 1.6;
  var WEIGHTS = [1, 1, 2, 3, 3];
  var LOOKBACK_DAYS = 6;
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

  function sortedPool(landmarks, avoid) {
    var pool = [];
    for (var i = 0; i < landmarks.length; i++) {
      if (!avoid || !avoid[landmarks[i].id]) pool.push(landmarks[i]);
    }
    if (pool.length < 5) pool = landmarks.slice();
    pool.sort(function (a, b) {
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    return pool;
  }

  function pickFromSeed(landmarks, isoDate, avoid) {
    var rng = mulberry32(hashString("stl-maptap-v1|" + isoDate));
    var pool = sortedPool(landmarks, avoid);
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, 5);
  }

  function pickDaily(landmarks, isoDate) {
    var avoid = {};
    for (var d = 1; d <= LOOKBACK_DAYS; d++) {
      var prior = pickFromSeed(landmarks, addIsoDays(isoDate, -d), null);
      for (var i = 0; i < prior.length; i++) avoid[prior[i].id] = true;
    }
    return pickFromSeed(landmarks, isoDate, avoid);
  }

  function pickPractice(landmarks, rng) {
    var random = rng || Math.random;
    var pool = landmarks.slice();
    for (var i = pool.length - 1; i > 0; i--) {
      var j = Math.floor(random() * (i + 1));
      var tmp = pool[i];
      pool[i] = pool[j];
      pool[j] = tmp;
    }
    return pool.slice(0, 5);
  }

  function shareText(opts) {
    var head = opts.practice ? "STL MapTap practice" : ("STL MapTap " + prettyDate(opts.date));
    var bits = [];
    for (var i = 0; i < opts.scores.length; i++) {
      bits.push(String(opts.scores[i]) + emojiFor(opts.scores[i]));
    }
    return head + "\n" + bits.join(" ") + "\nFinal score: " + opts.finalScore + "\n" + opts.url;
  }

  function curveExamples() {
    var miles = [0, 0.15, 0.5, 1, 2, 5, 10, 15, 20, 22, 30];
    var rows = [];
    for (var i = 0; i < miles.length; i++) {
      rows.push({ miles: miles[i], score: scoreForMiles(miles[i]) });
    }
    return rows;
  }

  root.STLMap = {
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
