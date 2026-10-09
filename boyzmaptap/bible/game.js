/* BibleTap scoring and daily selection.
   Translation of the prompts is the World English Bible (public domain).

   Each round scores 0–100.

   Wrong book, d = books apart in Protestant canon order:
     d = 1 (neighboring book)          → 40
     same section, d > 1               → max(6, round(24 − (d − 1) × 3))
     other section                     → round(22 × (1 − t) ^ 1.35)
                                         where t = min(1, (d − 1) / 28)
     A wrong book never scores above 40, and a different section
     scores 0 once the books are about 29 apart.

   Right book:
     50 base
     + chapter points, up to 35
     + verse points, up to 15, and only when the chapter is exact
     Exact verse = 50 + 35 + 15 = 100.

   Chapter points, cd = chapters off:
     cd = 0 → 35
     else   → round(35 × (1 − t) ^ 1.45), t = min(1, cd / 8)
     Eight or more chapters off adds 0.

   Verse points, vd = verses off from the nearest verse in the passage
   (a two-verse passage counts either verse as exact):
     vd = 0 → 15
     else   → round(15 × (1 − t) ^ 1.3), t = min(1, vd / 5)
     Five or more verses off adds 0. Wrong chapter adds 0 of these.

   Round weights are ×1, ×1, ×2, ×3, ×3. The weighted sum is the
   final score, out of 1000.

   The daily five are a pure function of the America/Chicago date:
   rounds 1–2 easy, 3 medium, 4 hard, 5 obscure. Anything used in
   the previous 6 Chicago days is skipped. Practice draws a random
   five with the same ramp and does not touch the daily. */
(function (root) {
  var WEIGHTS = [1, 1, 2, 3, 3];
  var SLOTS = ["easy", "easy", "medium", "hard", "obscure"];
  var LOOKBACK_DAYS = 6;
  var EPOCH = "2024-01-01";
  var FORMULA = "Each round scores 0–100. Wrong book: 40 if it is the next book over in canon order. Same section, farther away: max(6, round(24 − (d−1)×3)), where d is how many books apart. A different section: round(22 × (1−t)^1.35), where t = min(1, (d−1)/28), which reaches 0 about 29 books away. A wrong book never scores above 40. Right book: 50, plus up to 35 for the chapter and up to 15 for the verse. Chapter points are 35 if exact, otherwise round(35 × (1−t)^1.45) with t = min(1, chapters off / 8). Verse points are added only on an exact chapter: 15 if the verse hits the passage (either verse of a two-verse passage counts), otherwise round(15 × (1−t)^1.3) with t = min(1, verses off / 5). Exact verse = 100. Weights are ×1, ×1, ×2, ×3, ×3, and the weighted sum is the score out of 1000. Everyone gets the same five verses for a Chicago day: recognizable, recognizable, middle, hard, obscure, skipping verses used on the previous six days.";

  var chainCache = { key: "", days: null };

  function scoreGuess(canon, answer, guess) {
    var parts = scoreParts(canon, answer, guess);
    return parts.total;
  }

  function scoreParts(canon, answer, guess) {
    var empty = { total: 0, book: 0, chapter: 0, verse: 0, bookDistance: null, rightBook: false };
    if (!canon || !answer || !guess) return empty;
    var ai = bookIndex(canon, answer.book);
    var gi = bookIndex(canon, guess.book);
    if (ai < 0 || gi < 0) return empty;
    var d = Math.abs(ai - gi);
    if (d !== 0) {
      var bookPts = wrongBookPoints(canon, ai, gi, d);
      return { total: bookPts, book: bookPts, chapter: 0, verse: 0, bookDistance: d, rightBook: false };
    }
    var cd = Math.abs(Number(guess.chapter) - Number(answer.chapter));
    var chapterPts = chapterPoints(cd);
    var versePts = 0;
    var vd = null;
    if (cd === 0) {
      vd = verseDistance(answer, Number(guess.verse));
      versePts = versePoints(vd);
    }
    var total = Math.min(100, 50 + chapterPts + versePts);
    return {
      total: total,
      book: 50,
      chapter: chapterPts,
      verse: versePts,
      bookDistance: 0,
      chapterDistance: cd,
      verseDistance: vd,
      rightBook: true
    };
  }

  function wrongBookPoints(canon, ai, gi, d) {
    if (d === 1) return 40;
    var same = canon.books[ai].section === canon.books[gi].section;
    if (same) return Math.max(6, Math.round(24 - (d - 1) * 3));
    var t = Math.min(1, (d - 1) / 28);
    return Math.round(22 * Math.pow(1 - t, 1.35));
  }

  function chapterPoints(cd) {
    if (cd === 0) return 35;
    var t = Math.min(1, cd / 8);
    return Math.round(35 * Math.pow(1 - t, 1.45));
  }

  function versePoints(vd) {
    if (vd === 0) return 15;
    var t = Math.min(1, vd / 5);
    return Math.round(15 * Math.pow(1 - t, 1.3));
  }

  function verseDistance(answer, verse) {
    var start = Number(answer.verse);
    var end = answer.verseEnd == null ? start : Number(answer.verseEnd);
    if (end < start) {
      var tmp = start;
      start = end;
      end = tmp;
    }
    if (verse < start) return start - verse;
    if (verse > end) return verse - end;
    return 0;
  }

  function bookIndex(canon, id) {
    var books = canon.books;
    for (var i = 0; i < books.length; i++) {
      if (books[i].id === id) return i;
    }
    return -1;
  }

  function bookById(canon, id) {
    var i = bookIndex(canon, id);
    return i < 0 ? null : canon.books[i];
  }

  function formatRef(canon, bookId, chapter, verse, verseEnd) {
    var book = bookById(canon, bookId);
    var name = book ? book.name : bookId;
    var v = String(verse);
    if (verseEnd != null && Number(verseEnd) !== Number(verse)) {
      v = verse + "\u2013" + verseEnd;
    }
    return name + " " + chapter + ":" + v;
  }

  function distanceNote(canon, answer, guess) {
    var ai = bookIndex(canon, answer.book);
    var gi = bookIndex(canon, guess.book);
    if (ai < 0 || gi < 0) return "";
    var d = Math.abs(ai - gi);
    var answerName = canon.books[ai].name;
    if (d === 0) {
      var cd = Math.abs(Number(guess.chapter) - Number(answer.chapter));
      if (cd === 0) {
        var vd = verseDistance(answer, Number(guess.verse));
        if (vd === 0) return "Same verse.";
        return vd + (vd === 1 ? " verse off." : " verses off.");
      }
      return cd + (cd === 1 ? " chapter off in " : " chapters off in ") + answerName + ".";
    }
    var guessName = canon.books[gi].name;
    var apart = d + (d === 1 ? " book apart" : " books apart");
    return apart + " \u2014 " + guessName + " to " + answerName + ".";
  }

  function finalScore(roundScores) {
    var total = 0;
    for (var i = 0; i < roundScores.length; i++) total += Number(roundScores[i]) * WEIGHTS[i];
    return total;
  }

  function emojiFor(score) {
    var s = Math.round(Number(score));
    if (s >= 100) return "\uD83D\uDC51";
    if (s >= 90) return "\uD83D\uDCDC";
    if (s >= 80) return "\uD83D\uDD6F\uFE0F";
    if (s >= 70) return "\uD83D\uDD4A\uFE0F";
    if (s >= 60) return "\u2B50";
    if (s >= 50) return "\uD83C\uDF5E";
    if (s >= 40) return "\uD83D\uDC11";
    if (s >= 30) return "\uD83C\uDF3F";
    if (s >= 20) return "\uD83E\uDEA8";
    if (s >= 10) return "\uD83C\uDF2B\uFE0F";
    return "\uD83D\uDC80";
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

  function poolFor(verses, difficulty, avoid) {
    function gather(respect, onlyDifficulty) {
      var pool = [];
      for (var i = 0; i < verses.length; i++) {
        var v = verses[i];
        if (onlyDifficulty && v.difficulty !== difficulty) continue;
        if (respect && avoid[v.id]) continue;
        pool.push(v);
      }
      return pool;
    }
    var pool = gather(true, true);
    if (!pool.length) pool = gather(false, true);
    if (!pool.length) pool = gather(true, false);
    if (!pool.length) pool = verses.slice();
    pool.sort(function (a, b) {
      if (a.id < b.id) return -1;
      if (a.id > b.id) return 1;
      return 0;
    });
    return pool;
  }

  function pickPure(verses, iso, avoid) {
    var used = {};
    if (avoid) {
      for (var k in avoid) used[k] = true;
    }
    var out = [];
    for (var s = 0; s < SLOTS.length; s++) {
      var pool = poolFor(verses, SLOTS[s], used);
      var rng = mulberry32(hashString("bibletap-v1|" + iso + "|slot|" + s));
      var choice = pool[Math.floor(rng() * pool.length)];
      out.push(choice);
      used[choice.id] = true;
    }
    return out;
  }

  function cacheKey(verses) {
    var first = verses[0] ? verses[0].id : "";
    var last = verses.length ? verses[verses.length - 1].id : "";
    return verses.length + "|" + first + "|" + last;
  }

  function pickDaily(verses, isoDate) {
    var key = cacheKey(verses);
    if (chainCache.key !== key) {
      chainCache.key = key;
      chainCache.days = {};
    }
    var days = chainCache.days;
    if (days[isoDate]) return days[isoDate].slice();
    if (isoDate < EPOCH) {
      days[isoDate] = pickPure(verses, isoDate, {});
      return days[isoDate].slice();
    }
    var day = EPOCH;
    var history = [];
    while (day <= isoDate) {
      if (!days[day]) {
        var avoid = {};
        for (var h = 0; h < history.length; h++) {
          var ids = history[h];
          for (var id in ids) avoid[id] = true;
        }
        days[day] = pickPure(verses, day, avoid);
      }
      var set = {};
      var picked = days[day];
      for (var i = 0; i < picked.length; i++) set[picked[i].id] = true;
      history.push(set);
      if (history.length > LOOKBACK_DAYS) history.shift();
      if (day === isoDate) return picked.slice();
      day = addIsoDays(day, 1);
    }
    return days[isoDate] ? days[isoDate].slice() : pickPure(verses, isoDate, {});
  }

  function pickPractice(verses, rng) {
    var random = rng || Math.random;
    var used = {};
    var out = [];
    for (var s = 0; s < SLOTS.length; s++) {
      var pool = poolFor(verses, SLOTS[s], used);
      var choice = pool[Math.floor(random() * pool.length)];
      out.push(choice);
      used[choice.id] = true;
    }
    return out;
  }

  function shareText(opts) {
    var head = opts.practice ? "BibleTap practice" : ("BibleTap " + prettyDate(opts.date));
    var bits = [];
    for (var i = 0; i < opts.scores.length; i++) {
      bits.push(String(opts.scores[i]) + emojiFor(opts.scores[i]));
    }
    return head + "\n" + bits.join(" ") + "\nFinal score: " + opts.finalScore + "\n" + opts.url;
  }

  root.BibleTap = {
    WEIGHTS: WEIGHTS,
    SLOTS: SLOTS,
    FORMULA: FORMULA,
    scoreGuess: scoreGuess,
    scoreParts: scoreParts,
    verseDistance: verseDistance,
    bookIndex: bookIndex,
    bookById: bookById,
    formatRef: formatRef,
    distanceNote: distanceNote,
    finalScore: finalScore,
    emojiFor: emojiFor,
    chicagoISO: chicagoISO,
    addIsoDays: addIsoDays,
    prettyDate: prettyDate,
    pickDaily: pickDaily,
    pickPractice: pickPractice,
    shareText: shareText
  };
})(typeof window !== "undefined" ? window : globalThis);
