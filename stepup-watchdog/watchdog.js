(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StepUpWatchdog = api;
})(typeof window !== 'undefined' ? window : null, function () {
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var PALETTE = ['#e06a78', '#d5dde6', '#3dbe8a', '#f0b429', '#d7a4e8', '#7fd3d0', '#f0a07a', '#9ad29a'];

  function parseCtParts(value) {
    if (value == null) return null;
    var s = String(value).trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?(?:\s*(?:ct|cst|cdt))?$/i);
    if (!m) return null;
    var hour = Number(m[4]);
    var minute = Number(m[5]);
    var second = Number(m[6] || 0);
    var ampm = (m[7] || '').toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (hour > 23 || minute > 59 || second > 59) return null;
    var month = Number(m[2]);
    var day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return {
      y: Number(m[1]),
      m: month,
      d: day,
      hour: hour,
      minute: minute,
      second: second,
      ms: Date.UTC(Number(m[1]), month - 1, day, hour, minute, second)
    };
  }

  function parseSteps(value) {
    if (typeof value === 'number' && isFinite(value)) return Math.round(value);
    if (typeof value === 'string') {
      var cleaned = value.replace(/,/g, '').trim();
      if (!cleaned) return null;
      var n = Number(cleaned);
      if (!isFinite(n)) return null;
      return Math.round(n);
    }
    return null;
  }

  function personKey(name) {
    return String(name || '').trim().toLowerCase();
  }

  function derivedInitials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  function derivedColor(name) {
    var n = 0;
    var s = String(name || '');
    for (var i = 0; i < s.length; i++) n = (n + s.charCodeAt(i)) % PALETTE.length;
    return PALETTE[n];
  }

  function safeColor(color, name) {
    if (typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color)) return color;
    return derivedColor(name);
  }

  function profileFor(name, roster) {
    var hit = roster[personKey(name)] || {};
    return {
      role: hit.role || '',
      initials: hit.initials || derivedInitials(name),
      color: safeColor(hit.color, name)
    };
  }

  function defaultRules() {
    return [
      { id: 'amber', severity: 'amber', min_delta: 6000, max_hours: 1, label: 'More than 6,000 steps in under 1 hour' },
      { id: 'red', severity: 'red', min_delta: 10000, max_hours: 1.5, label: 'More than 10,000 steps in under 1.5 hours' }
    ];
  }

  function normalizeRules(rules) {
    if (!Array.isArray(rules) || !rules.length) return defaultRules();
    var out = [];
    rules.forEach(function (rule) {
      if (!rule) return;
      var minDelta = Number(rule.min_delta);
      var maxHours = Number(rule.max_hours);
      if (!isFinite(minDelta) || !isFinite(maxHours)) return;
      var severity = rule.severity === 'red' ? 'red' : 'amber';
      out.push({
        id: rule.id || severity,
        severity: severity,
        min_delta: minDelta,
        max_hours: maxHours,
        label: rule.label || ('More than ' + minDelta + ' steps in under ' + maxHours + ' hours')
      });
    });
    return out.length ? out : defaultRules();
  }

  function severityRank(rule) {
    return rule && rule.severity === 'red' ? 2 : 1;
  }

  function matchRule(rules, delta, hours) {
    if (delta == null || hours == null || !isFinite(hours) || hours < 0) return null;
    var matched = null;
    rules.forEach(function (rule) {
      if (!(delta > rule.min_delta && hours < rule.max_hours)) return;
      if (!matched || severityRank(rule) > severityRank(matched) ||
          (severityRank(rule) === severityRank(matched) && rule.min_delta > matched.min_delta)) {
        matched = rule;
      }
    });
    return matched;
  }

  function inWindow(parts, watch) {
    var start = Number(watch && watch.start_hour);
    var end = Number(watch && watch.end_hour);
    if (!isFinite(start)) start = 18;
    if (!isFinite(end)) end = 24;
    var hour = parts.hour + (parts.minute / 60) + (parts.second / 3600);
    if (end > start) return hour >= start && hour < end;
    return hour >= start || hour < end;
  }

  function formatNumber(n) {
    if (n == null || !isFinite(n)) return '—';
    var rounded = Math.round(n);
    var sign = rounded < 0 ? '−' : '';
    var abs = Math.abs(rounded);
    return sign + String(abs).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatDelta(n) {
    if (n == null || !isFinite(n)) return '—';
    if (n > 0) return '+' + formatNumber(n);
    if (n === 0) return '+0';
    return formatNumber(n);
  }

  function formatHours(hours) {
    if (hours == null || !isFinite(hours)) return '—';
    var sign = hours < 0 ? '−' : '';
    var totalMin = Math.round(Math.abs(hours) * 60);
    if (totalMin < 90) {
      if (totalMin < 60) return sign + totalMin + ' min';
      var h = Math.floor(totalMin / 60);
      var m = totalMin % 60;
      if (m === 0) return sign + h + ' h';
      return sign + h + ' h ' + m + ' min';
    }
    return sign + (Math.round(Math.abs(hours) * 10) / 10).toFixed(1) + ' h';
  }

  function formatPace(n) {
    if (n == null || !isFinite(n)) return '—';
    return formatNumber(n) + '/hr';
  }

  function formatClock(parts) {
    var suffix = parts.hour >= 12 ? 'pm' : 'am';
    var h = parts.hour % 12;
    if (h === 0) h = 12;
    var min = parts.minute < 10 ? '0' + parts.minute : String(parts.minute);
    return h + ':' + min + suffix;
  }

  function formatDate(parts) {
    return MONTHS[parts.m - 1] + ' ' + parts.d;
  }

  function formatWhen(parts) {
    return formatDate(parts) + ' · ' + formatClock(parts);
  }

  function formatStamp(value) {
    var parts = parseCtParts(value);
    if (!parts) return value == null || value === '' ? '—' : String(value);
    return formatWhen(parts);
  }

  function formatCompact(n) {
    if (!isFinite(n)) return '';
    var rounded = Math.round(n);
    if (Math.abs(rounded) >= 10000) {
      var k = Math.round(rounded / 100) / 10;
      return (k % 1 === 0 ? k.toFixed(0) : String(k)) + 'k';
    }
    return formatNumber(rounded);
  }

  function rankingAt(checks, timeMs) {
    var latest = {};
    checks.forEach(function (row) {
      if (row.timeMs <= timeMs) latest[row.person] = row;
    });
    var list = Object.keys(latest).map(function (name) { return latest[name]; });
    list.sort(function (a, b) {
      if (b.steps !== a.steps) return b.steps - a.steps;
      return a.person.localeCompare(b.person);
    });
    var map = {};
    list.forEach(function (row, i) { map[row.person] = i + 1; });
    return map;
  }

  function analyze(data) {
    data = data || {};
    var rules = normalizeRules(data.rules);
    var watch = data.watch || { label: '6pm–midnight CT', start_hour: 18, end_hour: 24 };
    if (!watch.label) watch.label = '6pm–midnight CT';
    var roster = {};
    (Array.isArray(data.people) ? data.people : []).forEach(function (person) {
      if (person && person.name) roster[personKey(person.name)] = person;
    });

    var skipped = 0;
    var checks = [];
    (Array.isArray(data.checks) ? data.checks : []).forEach(function (row, index) {
      if (!row || typeof row !== 'object') { skipped += 1; return; }
      var rawName = String(row.person || '').trim();
      var steps = parseSteps(row.steps);
      var parts = parseCtParts(row.check_time_ct);
      if (!rawName || steps == null || steps < 0 || !parts) { skipped += 1; return; }
      var canonical = roster[personKey(rawName)] ? roster[personKey(rawName)].name : rawName;
      var profile = profileFor(canonical, roster);
      checks.push({
        index: index,
        person: canonical,
        steps: steps,
        parts: parts,
        timeMs: parts.ms,
        check_time_ct: String(row.check_time_ct).trim(),
        last_update: row.last_update == null ? '' : String(row.last_update),
        notes: row.notes == null ? '' : String(row.notes),
        in_window: inWindow(parts, watch),
        role: profile.role,
        initials: profile.initials,
        color: profile.color
      });
    });

    checks.sort(function (a, b) {
      if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
      return a.index - b.index;
    });

    var prevByPerson = {};
    checks.forEach(function (row) {
      var prev = prevByPerson[row.person] || null;
      row.previous = prev;
      if (!prev) {
        row.delta_steps = null;
        row.hours_since_prev = null;
        row.steps_per_hour = null;
        row.flag = '';
        row.flag_label = '';
        row.baseline = true;
      } else {
        var hours = (row.timeMs - prev.timeMs) / 3600000;
        var delta = row.steps - prev.steps;
        row.delta_steps = delta;
        row.hours_since_prev = hours;
        row.steps_per_hour = hours > 0 ? delta / hours : null;
        row.baseline = false;
        var matched = matchRule(rules, delta, hours);
        row.flag = matched ? matched.severity : '';
        row.flag_label = matched ? matched.label : '';
      }
      prevByPerson[row.person] = row;
    });

    var latest = {};
    checks.forEach(function (row) { latest[row.person] = row; });
    Object.keys(roster).forEach(function (key) {
      var name = roster[key].name;
      if (!latest[name]) {
        var profile = profileFor(name, roster);
        latest[name] = {
          person: name,
          steps: null,
          missing: true,
          last_update: '',
          notes: '',
          delta_steps: null,
          hours_since_prev: null,
          steps_per_hour: null,
          flag: '',
          flag_label: '',
          baseline: false,
          in_window: false,
          parts: null,
          role: profile.role,
          initials: profile.initials,
          color: profile.color
        };
      }
    });

    var standings = Object.keys(latest).map(function (name) { return latest[name]; });
    standings.sort(function (a, b) {
      var as = a.steps == null ? -1 : a.steps;
      var bs = b.steps == null ? -1 : b.steps;
      if (bs !== as) return bs - as;
      return a.person.localeCompare(b.person);
    });

    var maxSteps = 0;
    standings.forEach(function (row) {
      if (row.steps != null && row.steps > maxSteps) maxSteps = row.steps;
    });
    var rank = 0;
    standings.forEach(function (row) {
      if (row.steps == null) {
        row.rank = null;
        row.share = 0;
      } else {
        rank += 1;
        row.rank = rank;
        row.share = maxSteps ? row.steps / maxSteps : 0;
      }
      row.movement = null;
    });

    var times = [];
    var seenTime = {};
    checks.forEach(function (row) {
      if (!seenTime[row.timeMs]) {
        seenTime[row.timeMs] = true;
        times.push(row.timeMs);
      }
    });
    if (times.length >= 2) {
      var currentRanks = rankingAt(checks, times[times.length - 1]);
      var previousRanks = rankingAt(checks, times[times.length - 2]);
      standings.forEach(function (row) {
        var now = currentRanks[row.person];
        var then = previousRanks[row.person];
        if (now == null) return;
        if (then == null) row.movement = { direction: 'new', places: 0 };
        else if (then > now) row.movement = { direction: 'up', places: then - now };
        else if (then < now) row.movement = { direction: 'down', places: now - then };
        else row.movement = { direction: 'same', places: 0 };
      });
    }

    var flags = checks.filter(function (row) { return row.flag; });
    flags.sort(function (a, b) {
      if (a.timeMs !== b.timeMs) return b.timeMs - a.timeMs;
      if (a.flag !== b.flag) return a.flag === 'red' ? -1 : 1;
      return (b.delta_steps || 0) - (a.delta_steps || 0);
    });

    var history = checks.slice().sort(function (a, b) {
      if (a.timeMs !== b.timeMs) return b.timeMs - a.timeMs;
      if (b.steps !== a.steps) return b.steps - a.steps;
      return a.person.localeCompare(b.person);
    });

    var family = 0;
    standings.forEach(function (row) {
      if (row.steps != null) family += row.steps;
    });
    var leader = null;
    standings.some(function (row) {
      if (row.steps != null) { leader = row; return true; }
      return false;
    });

    return {
      group: data.group || 'Fogerty',
      view: data.view || 'Today',
      source: data.source || '',
      watch: watch,
      rules: rules,
      standings: standings,
      history: history,
      flags: flags,
      skipped: skipped,
      summary: {
        familySteps: family,
        leader: leader,
        rows: checks.length,
        snapshots: times.length,
        flags: flags.length,
        nightRows: checks.filter(function (row) { return row.in_window; }).length,
        hasDeltas: checks.some(function (row) { return row.delta_steps != null; }),
        latest: checks.length ? checks[checks.length - 1] : null,
        people: standings.filter(function (row) { return row.steps != null; }).length
      }
    };
  }

  function h(tag, props) {
    var node = document.createElement(tag);
    var children = Array.prototype.slice.call(arguments, 2);
    if (props) {
      Object.keys(props).forEach(function (key) {
        var value = props[key];
        if (value == null || value === false) return;
        if (key === 'class') node.className = value;
        else node.setAttribute(key, value === true ? '' : String(value));
      });
    }
    children.forEach(function (child) { append(node, child); });
    return node;
  }

  function append(node, child) {
    if (child == null || child === false) return;
    if (Array.isArray(child)) {
      child.forEach(function (item) { append(node, item); });
      return;
    }
    if (typeof child === 'string' || typeof child === 'number') {
      node.appendChild(document.createTextNode(String(child)));
      return;
    }
    node.appendChild(child);
  }

  function svg(tag, props) {
    var node = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (props) {
      Object.keys(props).forEach(function (key) {
        if (props[key] != null) node.setAttribute(key, String(props[key]));
      });
    }
    return node;
  }

  function rankClass(rank) {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return '';
  }

  function movementLabel(movement) {
    if (!movement) return '';
    if (movement.direction === 'up') return '▲ ' + movement.places;
    if (movement.direction === 'down') return '▼ ' + movement.places;
    if (movement.direction === 'new') return 'new';
    return '–';
  }

  function kpi(label, value, meta) {
    return h('article', { class: 'card kpi' },
      h('p', { class: 'label' }, label),
      h('p', { class: 'value' }, value),
      h('p', { class: 'meta' }, meta)
    );
  }

  function buildKpis(model) {
    var leader = model.summary.leader;
    var flagCount = model.summary.flags;
    return h('div', { class: 'kpis', 'data-testid': 'kpis' },
      kpi(
        "Today's lead",
        leader ? formatNumber(leader.steps) : '—',
        leader ? leader.person : 'Waiting for the first check'
      ),
      kpi(
        'Family today',
        formatNumber(model.summary.familySteps),
        model.summary.people ? model.summary.people + ' on the board' : 'Nobody logged yet'
      ),
      kpi(
        'Logged checks',
        formatNumber(model.summary.rows),
        model.summary.snapshots === 1 ? '1 snapshot' : model.summary.snapshots + ' snapshots'
      ),
      kpi(
        'Flags',
        String(flagCount),
        flagCount ? flagCount + ' to review' : 'Nothing to review'
      )
    );
  }

  function standingRow(row) {
    var flagClass = row.flag ? ' flag-' + row.flag : '';
    var leadClass = row.rank === 1 ? ' leader' : '';
    var deltaText = row.missing ? 'no log yet' : (row.baseline ? 'first log' : formatDelta(row.delta_steps));
    var deltaClass = 'delta' + (row.flag ? ' ' + row.flag : '');
    var updated = row.missing ? 'Not in the log yet' : ('Updated ' + formatStamp(row.last_update));
    return h('article', { class: 'person-row' + leadClass + flagClass, 'data-person': row.person },
      h('div', { class: 'rank ' + rankClass(row.rank), 'aria-hidden': 'true' }, row.rank == null ? '–' : String(row.rank)),
      h('div', { class: 'avatar', style: 'background:' + row.color }, row.initials),
      h('div', { class: 'who' },
        h('div', { class: 'name-line' },
          h('span', { class: 'name' }, row.person),
          row.role ? h('span', { class: 'badge' }, row.role) : null,
          row.movement && row.movement.direction !== 'same'
            ? h('span', { class: 'move ' + row.movement.direction }, movementLabel(row.movement))
            : null
        ),
        h('p', { class: 'meta' }, updated),
        row.notes ? h('p', { class: 'note' }, row.notes) : null,
        h('div', { class: 'track', 'aria-hidden': 'true' },
          h('span', { style: 'width:' + Math.round((row.share || 0) * 100) + '%;background:' + row.color })
        )
      ),
      h('div', { class: 'score' },
        h('p', { class: 'num' }, row.steps == null ? '—' : formatNumber(row.steps)),
        h('p', { class: deltaClass }, deltaText)
      )
    );
  }

  function standingsCard(model) {
    var body;
    if (!model.standings.length || model.summary.people === 0 && model.standings.every(function (row) { return row.missing; })) {
      body = h('div', { class: 'empty', 'data-testid': 'standings-empty' },
        h('p', { class: 'empty-title' }, 'No standings yet'),
        h('p', {}, 'The Fogerty Today board will list here after the first check is in the log.')
      );
    } else {
      body = h('div', { class: 'standings', 'data-testid': 'standings' },
        model.standings.map(standingRow)
      );
    }
    var foot = model.source ? h('p', { class: 'source' }, model.source) : null;
    return h('section', { class: 'card', id: 'standings' },
      h('div', { class: 'card-head' },
        h('h2', {}, model.group + ' standings'),
        h('p', { class: 'hint' }, (model.view || 'Today') + ' totals · latest check per person')
      ),
      body,
      foot
    );
  }

  function flagCard(row) {
    return h('article', { class: 'flag ' + row.flag, 'data-testid': 'flag' },
      h('div', { class: 'flag-top' },
        h('span', { class: 'pill ' + row.flag }, row.flag === 'red' ? 'Red' : 'Amber'),
        h('strong', {}, row.person),
        h('span', { class: 'when' }, row.parts ? formatWhen(row.parts) : '')
      ),
      h('p', { class: 'flag-stat' },
        formatDelta(row.delta_steps) + ' steps in ' + formatHours(row.hours_since_prev) + ' · ' + formatPace(row.steps_per_hour)
      ),
      h('p', { class: 'flag-rule' }, row.flag_label),
      row.notes ? h('p', { class: 'note' }, row.notes) : null
    );
  }

  function legend(model) {
    return h('div', { class: 'legend', 'data-testid': 'legend' },
      h('h3', {}, 'Flag rules'),
      model.rules.map(function (rule) {
        return h('div', { class: 'rule' },
          h('span', { class: 'swatch ' + rule.severity, 'aria-hidden': 'true' }),
          h('div', {},
            h('p', { class: 'rule-label' }, (rule.severity === 'red' ? 'Red' : 'Amber') + ' — ' + rule.label),
            h('p', { class: 'hint' },
              'A gain bigger than ' + formatNumber(rule.min_delta) + ' steps, measured across checks under ' + formatHours(rule.max_hours) + ' apart.'
            )
          )
        );
      }),
      h('p', { class: 'hint tight' }, 'When both match, the row is red. A drop in steps is not a flag. The first check for a person has no earlier hour, so it stays quiet.')
    );
  }

  function flagsCard(model) {
    var body = model.flags.length
      ? h('div', { class: 'flag-list', 'data-testid': 'flags' }, model.flags.map(flagCard))
      : h('div', { class: 'empty', 'data-testid': 'flags-empty' },
          h('p', { class: 'empty-title' }, 'No suspicious jumps'),
          h('p', {}, 'Flags land here when a later check gains more than 6,000 steps in under an hour, or more than 10,000 in under an hour and a half.')
        );
    return h('section', { class: 'card', id: 'flags' },
      h('div', { class: 'card-head' },
        h('h2', {}, 'Flags'),
        h('p', { class: 'hint' }, model.watch.label + ' is the watch. Rules apply whenever two checks are close.')
      ),
      body,
      legend(model)
    );
  }

  function buildChart(model) {
    var ordered = model.history.slice().sort(function (a, b) { return a.timeMs - b.timeMs; });
    var times = [];
    var timeIndex = {};
    ordered.forEach(function (row) {
      if (timeIndex[row.timeMs] == null) {
        timeIndex[row.timeMs] = times.length;
        times.push(row);
      }
    });
    if (times.length < 2) return null;

    var series = {};
    ordered.forEach(function (row) {
      if (!series[row.person]) series[row.person] = [];
      series[row.person].push(row);
    });
    var max = 1;
    ordered.forEach(function (row) { if (row.steps > max) max = row.steps; });

    var W = 640;
    var H = 220;
    var L = 52;
    var R = 12;
    var T = 16;
    var B = 36;
    var innerW = W - L - R;
    var innerH = H - T - B;
    function x(ms) {
      return L + (timeIndex[ms] / (times.length - 1)) * innerW;
    }
    function y(steps) {
      return T + (1 - steps / max) * innerH;
    }

    var plot = svg('svg', {
      viewBox: '0 0 ' + W + ' ' + H,
      class: 'chart',
      role: 'img',
      'aria-label': 'Step totals across logged checks'
    });
    [0, 0.5, 1].forEach(function (g) {
      var yy = y(max * g);
      plot.appendChild(svg('line', { x1: L, x2: W - R, y1: yy, y2: yy, class: 'grid' }));
      var label = svg('text', { x: L - 8, y: yy + 4, 'text-anchor': 'end', class: 'axis' });
      label.textContent = formatCompact(max * g);
      plot.appendChild(label);
    });
    times.forEach(function (t, i) {
      if (times.length > 8 && i % 2 === 1 && i !== times.length - 1) return;
      var label = svg('text', { x: x(t.timeMs), y: H - 12, 'text-anchor': 'middle', class: 'axis' });
      label.textContent = formatClock(t.parts);
      plot.appendChild(label);
    });
    Object.keys(series).forEach(function (name) {
      var rows = series[name];
      var color = rows[0].color;
      var d = rows.map(function (row, i) {
        return (i ? 'L' : 'M') + x(row.timeMs).toFixed(1) + ' ' + y(row.steps).toFixed(1);
      }).join(' ');
      plot.appendChild(svg('path', {
        d: d,
        fill: 'none',
        stroke: color,
        'stroke-width': '2.5',
        'stroke-linejoin': 'round',
        'stroke-linecap': 'round'
      }));
      rows.forEach(function (row) {
        var dot = svg('circle', { cx: x(row.timeMs).toFixed(1), cy: y(row.steps).toFixed(1), r: '3.5', fill: color });
        var title = svg('title');
        title.textContent = name + ' · ' + formatNumber(row.steps);
        dot.appendChild(title);
        plot.appendChild(dot);
      });
    });
    return plot;
  }

  function historyCells(row) {
    var flag = row.flag
      ? h('span', { class: 'pill ' + row.flag }, row.flag === 'red' ? 'Red' : 'Amber')
      : '—';
    return [
      h('div', { class: 'cell person-cell', 'data-label': 'Person' },
        h('span', { class: 'mini-avatar', style: 'background:' + row.color }, row.initials),
        h('span', {}, row.person)
      ),
      h('div', { class: 'cell num', 'data-label': 'Steps' }, formatNumber(row.steps)),
      h('div', { class: 'cell', 'data-label': 'Last update' }, formatStamp(row.last_update)),
      h('div', { class: 'cell' + (row.flag ? ' ' + row.flag : ''), 'data-label': 'Delta' }, row.baseline ? '—' : formatDelta(row.delta_steps)),
      h('div', { class: 'cell', 'data-label': 'Elapsed' }, formatHours(row.hours_since_prev)),
      h('div', { class: 'cell', 'data-label': 'Pace' }, formatPace(row.steps_per_hour)),
      h('div', { class: 'cell', 'data-label': 'Flag' }, flag),
      h('div', { class: 'cell notes', 'data-label': 'Notes' }, row.notes || '—')
    ];
  }

  function historyCard(model) {
    var bannerText = '';
    if (!model.history.length) {
      bannerText = '';
    } else if (!model.summary.hasDeltas) {
      bannerText = 'Deltas show up after a second check for the same person. Each person has one baseline row, so the change column is empty on purpose.';
    } else if (model.summary.nightRows === 0) {
      bannerText = 'No ' + model.watch.label + ' rows yet. Earlier snapshots stay in the log so the board is not blank.';
    }

    var groups = [];
    var current = null;
    model.history.forEach(function (row) {
      if (!current || current.timeMs !== row.timeMs) {
        current = { timeMs: row.timeMs, parts: row.parts, in_window: row.in_window, rows: [] };
        groups.push(current);
      }
      current.rows.push(row);
    });

    var chart = buildChart(model);
    var chartBlock = chart
      ? h('div', { class: 'chart-wrap' }, chart)
      : h('p', { class: 'hint chart-empty' }, 'The chart starts when a second check time is in the log.');

    var table;
    if (!model.history.length) {
      table = h('div', { class: 'empty', 'data-testid': 'history-empty' },
        h('p', { class: 'empty-title' }, 'No hourly log yet'),
        h('p', {}, 'Append rows to checks.json and refresh. One row per person, each hour you look.')
      );
    } else {
      table = h('div', { class: 'log-scroll', 'data-testid': 'history' },
        groups.map(function (group) {
          var chips = [
            h('span', { class: group.in_window ? 'chip on' : 'chip' }, group.in_window ? 'Night watch' : 'Outside night window')
          ];
          if (!model.summary.hasDeltas) chips.push(h('span', { class: 'chip' }, 'Baseline'));
          return h('div', { class: 'snap' },
            h('div', { class: 'snap-label' },
              h('span', {}, formatWhen(group.parts) + ' CT'),
              chips
            ),
            h('div', { class: 'log' },
              h('div', { class: 'log-head' },
                ['Person', 'Steps', 'Last update', 'Delta', 'Elapsed', 'Pace', 'Flag', 'Notes'].map(function (label) {
                  return h('div', {}, label);
                })
              ),
              group.rows.map(function (row) {
                return h('div', { class: 'log-row' + (row.flag ? ' flag-' + row.flag : '') }, historyCells(row));
              })
            )
          );
        })
      );
    }

    return h('section', { class: 'card', id: 'log' },
      h('div', { class: 'card-head' },
        h('h2', {}, 'Hourly history'),
        h('p', { class: 'hint' }, 'Same check time for everyone you log in one pass. Delta is the change in the Today total since that person’s previous row.')
      ),
      bannerText ? h('p', { class: 'banner', 'data-testid': 'history-banner' }, bannerText) : null,
      chartBlock,
      table
    );
  }

  function asofText(model) {
    var latest = model.summary.latest;
    var base = latest ? 'Latest check · ' + formatWhen(latest.parts) + ' CT' : 'No checks in the log yet.';
    if (model.skipped) {
      base += ' · ' + model.skipped + (model.skipped === 1 ? ' row was skipped' : ' rows were skipped') + ' (missing name, steps, or time).';
    }
    return base;
  }

  function render(container, model) {
    if (!container) return;
    container.textContent = '';
    var asof = document.getElementById('asof');
    if (asof) asof.textContent = asofText(model);
    var flagKpi = container;
    container.appendChild(buildKpis(model));
    var cards = container.querySelectorAll('.kpi');
    if (cards.length === 4) {
      if (model.summary.flags) {
        cards[3].classList.add(model.flags.some(function (row) { return row.flag === 'red'; }) ? 'hot' : 'warm');
      } else if (model.summary.rows) {
        cards[3].classList.add('clear');
      }
    }
    var grid = h('div', { class: 'board' });
    grid.appendChild(standingsCard(model));
    grid.appendChild(flagsCard(model));
    container.appendChild(grid);
    container.appendChild(historyCard(model));
    return flagKpi;
  }

  function renderError(container, message) {
    if (!container) return;
    container.textContent = '';
    var asof = document.getElementById('asof');
    if (asof) asof.textContent = 'The log did not load.';
    container.appendChild(h('div', { class: 'empty', role: 'alert' },
      h('p', { class: 'empty-title' }, 'The board did not load'),
      h('p', {}, message)
    ));
  }

  return {
    analyze: analyze,
    render: render,
    renderError: renderError,
    parseCtParts: parseCtParts,
    formatNumber: formatNumber,
    formatDelta: formatDelta,
    formatHours: formatHours,
    formatPace: formatPace
  };
});
