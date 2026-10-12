(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.StepUpWatchdog = api;
})(typeof window !== 'undefined' ? window : null, function () {
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatNumber(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    var rounded = Math.round(Number(n));
    var sign = rounded < 0 ? '−' : '';
    return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function formatMi(n) {
    if (n == null || !isFinite(Number(n))) return '—';
    var text = (Math.round(Number(n) * 100) / 100).toFixed(2).replace(/0$/, '').replace(/\.0$/, '');
    return text + ' mi';
  }

  function formatDay(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
    if (!m) return iso ? String(iso) : '—';
    return MONTHS[Number(m[2]) - 1] + ' ' + Number(m[3]);
  }

  function dayNum(iso) {
    var m = /-(\d{2})$/.exec(String(iso || ''));
    return m ? String(Number(m[1])) : '';
  }

  function parseSteps(value) {
    if (value == null) return null;
    if (typeof value === 'number' && isFinite(value)) return Math.round(value);
    var text = String(value).replace(/,/g, '').trim();
    if (!text || /^n\.?a\.?$/i.test(text)) return null;
    var n = Number(text);
    return isFinite(n) ? Math.round(n) : null;
  }

  function safeColor(color) {
    return typeof color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(color) ? color : '#d4c4bf';
  }

  function slug(name) {
    return String(name || '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  function seriesFrom(row, days) {
    if (Array.isArray(row.days)) {
      var listed = row.days.map(parseSteps);
      if (!days.length || listed.length === days.length) return listed;
      var aligned = days.map(function (_, i) { return i < listed.length ? listed[i] : null; });
      return aligned;
    }
    if (!days.length) return [];
    return days.map(function (day) {
      if (row[day] != null) return parseSteps(row[day]);
      if (row['day_' + day] != null) return parseSteps(row['day_' + day]);
      return null;
    });
  }

  function normalizeMember(row, days, index) {
    if (!row || typeof row !== 'object') return null;
    var name = String(row.name || '').trim();
    if (!name) return null;
    var series = seriesFrom(row, days);
    var total = parseSteps(row.totalSteps);
    if (total == null) {
      total = 0;
      series.forEach(function (n) { if (n != null) total += n; });
    }
    var rank = parseSteps(row.rank);
    var peak = null;
    series.forEach(function (n, i) {
      if (n == null) return;
      if (!peak || n > peak.steps) peak = { steps: n, date: days[i] || '', index: i };
    });
    return {
      rank: rank,
      name: name,
      initials: row.initials ? String(row.initials).slice(0, 3) : name.slice(0, 2).toUpperCase(),
      color: safeColor(row.color),
      highlight: row.highlight === true,
      totalSteps: total,
      avgDailySteps: parseSteps(row.avgDailySteps),
      dailyGoal: parseSteps(row.dailyGoal),
      totalDistanceMi: row.totalDistanceMi == null || row.totalDistanceMi === '' ? null : Number(row.totalDistanceMi),
      days: series,
      hot: series.map(function () { return ''; }),
      slump: series.map(function () { return false; }),
      estimate: null,
      peak: peak,
      lastDay: series.length ? series[series.length - 1] : null,
      slug: slug(name),
      index: index
    };
  }

  function analyze(data) {
    data = data || {};
    var days = Array.isArray(data.days) ? data.days.map(function (day) { return String(day); }) : [];
    var rules = data.watch || {};
    var bigDay = Number(rules.bigDay);
    var catchPrior = Number(rules.catchUpPriorMax);
    var catchMin = Number(rules.catchUpMin);
    if (!isFinite(bigDay)) bigDay = 25000;
    if (!isFinite(catchPrior)) catchPrior = 5000;
    if (!isFinite(catchMin)) catchMin = 20000;

    var skipped = 0;
    var sourceRows = Array.isArray(data.members) ? data.members : (Array.isArray(data.leaderboard) ? data.leaderboard : []);
    var members = [];
    sourceRows.forEach(function (row, index) {
      var member = normalizeMember(row, days, index);
      if (!member) skipped += 1;
      else members.push(member);
    });
    members.sort(function (a, b) {
      if (a.rank != null && b.rank != null && a.rank !== b.rank) return a.rank - b.rank;
      if (b.totalSteps !== a.totalSteps) return b.totalSteps - a.totalSteps;
      return a.name.localeCompare(b.name);
    });

    var maxDay = 0;
    var watches = [];
    members.forEach(function (member) {
      member.days.forEach(function (steps, i) {
        if (steps != null && steps > maxDay) maxDay = steps;
        if (steps == null) return;
        var prior = i > 0 ? member.days[i - 1] : null;
        var isBig = steps >= bigDay;
        var isCatch = prior != null && prior < catchPrior && steps >= catchMin;
        if (!isBig && !isCatch) return;
        member.hot[i] = isCatch ? 'catch-up' : 'big-day';
        watches.push({
          name: member.name,
          initials: member.initials,
          color: member.color,
          slug: member.slug,
          date: days[i] || '',
          steps: steps,
          priorDate: isCatch ? (days[i - 1] || '') : '',
          priorSteps: isCatch ? prior : null,
          kind: isCatch ? 'catch-up' : 'big-day',
          alsoBig: isBig && isCatch
        });
      });
    });
    if (maxDay <= 0) maxDay = 1;
    watches.sort(function (a, b) {
      if (b.steps !== a.steps) return b.steps - a.steps;
      return a.name.localeCompare(b.name);
    });

    var highlight = null;
    members.forEach(function (member) { if (member.highlight && !highlight) highlight = member; });
    var slumpFloor = Number(data.slump && data.slump.floor);
    if (!isFinite(slumpFloor) || slumpFloor < 0) slumpFloor = 5000;
    if (highlight) highlight.estimate = slumpEstimate(highlight, members, days, slumpFloor);
    var groupSteps = 0;
    members.forEach(function (member) { groupSteps += member.totalSteps || 0; });
    var loggedDays = 0;
    members.forEach(function (member) {
      member.days.forEach(function (n) { if (n != null) loggedDays += 1; });
    });

    return {
      group: data.group || 'Fogerty',
      source: data.source || '',
      exportedAtCt: data.exportedAtCt || '',
      dateRange: data.dateRange || { label: days.length ? formatDay(days[0]) + '–' + formatDay(days[days.length - 1]) : '' },
      days: days,
      rules: { bigDay: bigDay, catchUpPriorMax: catchPrior, catchUpMin: catchMin, label: rules.label || '' },
      slumpFloor: slumpFloor,
      members: members,
      watches: watches,
      maxDay: maxDay,
      skipped: skipped,
      summary: {
        leader: members.length ? members[0] : null,
        highlight: highlight,
        groupSteps: groupSteps,
        people: members.length,
        watches: watches.length,
        loggedDays: loggedDays,
        lastDate: days.length ? days[days.length - 1] : ''
      }
    };
  }

  function slumpEstimate(member, members, days, floor) {
    var slumpDays = [];
    var keptSum = 0;
    var keptCount = 0;
    member.days.forEach(function (steps, i) {
      if (steps == null) return;
      if (steps < floor) {
        member.slump[i] = true;
        slumpDays.push({ date: days[i] || '', steps: steps });
      } else {
        keptSum += steps;
        keptCount += 1;
      }
    });
    if (!slumpDays.length || !keptCount) return null;
    var average = Math.round(keptSum / keptCount);
    var slumpSum = 0;
    slumpDays.forEach(function (day) { slumpSum += day.steps; });
    var reconstructed = member.totalSteps - slumpSum + average * slumpDays.length;
    var ahead = 0;
    members.forEach(function (other) {
      if (other === member) return;
      if (other.totalSteps > reconstructed) ahead += 1;
    });
    return {
      floor: floor,
      days: slumpDays,
      keptCount: keptCount,
      average: average,
      actual: member.totalSteps,
      actualRank: member.rank,
      reconstructed: reconstructed,
      reconstructedRank: ahead + 1,
      gap: reconstructed - member.totalSteps,
      method: 'Slump days are ' + member.name + "'s logged days under " + formatNumber(floor) + ' steps. Each one is replaced with ' + formatNumber(average) + ', the mean of the other ' + keptCount + ' days in this export.'
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

  function rankClass(rank) {
    if (rank === 1) return 'gold';
    if (rank === 2) return 'silver';
    if (rank === 3) return 'bronze';
    return '';
  }

  function bars(member, model, tall) {
    var chartH = tall ? 112 : 26;
    var labels = model.days.map(function (day, i) {
      var steps = member.days[i];
      var title = formatDay(day) + (steps == null ? ' · not logged' : ' · ' + formatNumber(steps));
      var px = steps == null ? 0 : Math.max(3, Math.round((steps / model.maxDay) * chartH));
      var mark = member.hot[i] ? ' hot ' + member.hot[i] : (member.slump && member.slump[i] ? ' slump' : '');
      var cls = 'bar' + mark + (steps == null ? ' na' : '');
      return h('span', { class: 'slot', title: title },
        h('span', { class: cls, style: 'height:' + px + 'px' })
      );
    });
    var track = h('div', { class: tall ? 'bars tall' : 'bars', style: 'height:' + chartH + 'px', 'aria-hidden': 'true' }, labels);
    if (!tall) return track;
    var nums = h('div', { class: 'day-labels' }, model.days.map(function (day, i) {
      var labelClass = member.hot[i] ? 'hot' : (member.slump && member.slump[i] ? 'slump' : '');
      return h('span', { class: labelClass }, dayNum(day));
    }));
    return h('div', {}, track, nums);
  }

  function kpi(label, value, meta, extraClass) {
    return h('article', { class: 'card kpi' + (extraClass ? ' ' + extraClass : '') },
      h('p', { class: 'label' }, label),
      h('p', { class: 'value' }, value),
      h('p', { class: 'meta' }, meta)
    );
  }

  function buildKpis(model) {
    var leader = model.summary.leader;
    var focus = model.summary.focus || model.summary.highlight;
    var last = formatDay(model.summary.lastDate);
    var range = (model.dateRange && model.dateRange.label) || 'this export';
    return h('div', { class: 'kpis', 'data-testid': 'kpis' },
      kpi('Period lead', leader ? formatNumber(leader.totalSteps) : '—', leader ? leader.name + ' · rank ' + leader.rank : 'No export loaded'),
      kpi(
        focus ? focus.name : 'Highlighted',
        focus ? formatNumber(focus.totalSteps) : '—',
        focus ? 'Rank ' + focus.rank + ' · ' + last + ' · ' + formatNumber(focus.lastDay) : 'Nobody marked on this export',
        focus ? 'focus-kpi' : ''
      ),
      kpi('Group total', formatNumber(model.summary.groupSteps), model.summary.people + ' people · ' + range),
      kpi('Watch items', String(model.summary.watches), model.summary.watches ? 'Large days to look at' : 'Nothing above the line')
    );
  }

  function slumpDayList(days) {
    return days.map(function (day, i) {
      var text = formatDay(day.date) + ' (' + formatNumber(day.steps) + ')';
      if (days.length > 1 && i === days.length - 1) return 'and ' + text;
      return text;
    }).join(days.length > 2 ? ', ' : ' ');
  }

  function slumpFig(label, value, sub) {
    return h('div', { class: 'slump-fig' },
      h('p', { class: 'label' }, label),
      h('p', { class: 'value' }, value),
      h('p', { class: 'sub' }, sub)
    );
  }

  function slumpPanel(member) {
    var estimate = member.estimate;
    var gap = (estimate.gap > 0 ? '+' : '') + formatNumber(estimate.gap);
    return h('aside', { class: 'slump', 'data-testid': 'casey-slump' },
      h('p', { class: 'slump-kicker' }, 'Estimate · counterfactual'),
      h('p', { class: 'slump-days' }, 'Treated as slump: ' + slumpDayList(estimate.days) + '.'),
      h('p', { class: 'slump-method' }, estimate.method),
      h('div', { class: 'slump-figs' },
        slumpFig('Actual total', formatNumber(estimate.actual), 'Rank ' + estimate.actualRank + ' on the export'),
        slumpFig('Reconstructed', formatNumber(estimate.reconstructed), 'Would be rank ' + estimate.reconstructedRank),
        slumpFig('Gap', gap, 'Steps those slump days sit below the mean')
      ),
      h('p', { class: 'slump-honest' }, 'This is an estimate. StepUp did not report the reconstructed total, and these days were not synced back. The rank uses everyone else’s actual totals.')
    );
  }

  function standingRow(member, model) {
    var last = formatDay(model.summary.lastDate);
    var meta = [
      member.dailyGoal != null ? 'Goal ' + formatNumber(member.dailyGoal) : '',
      member.avgDailySteps != null ? 'Avg ' + formatNumber(member.avgDailySteps) + '/day' : '',
      formatMi(member.totalDistanceMi)
    ].filter(Boolean).join(' · ');
    return h('article', {
      class: 'person-row' + (member.rank === 1 ? ' leader' : '') + (member.highlight ? ' focus' : ''),
      id: 'rank-' + member.slug,
      'data-person': member.name
    },
      h('div', { class: 'rank ' + rankClass(member.rank), 'aria-hidden': 'true' }, member.rank == null ? '–' : String(member.rank)),
      h('div', { class: 'avatar', style: 'background:' + member.color }, member.initials),
      h('div', { class: 'who' },
        h('div', { class: 'name-line' },
          h('span', { class: 'name' }, member.name)
        ),
        h('p', { class: 'meta' }, meta),
        bars(member, model, false)
      ),
      h('div', { class: 'score' },
        h('p', { class: 'num' }, formatNumber(member.totalSteps)),
        h('p', { class: 'delta' }, last + ' · ' + formatNumber(member.lastDay))
      )
    );
  }

  function standingsCard(model) {
    var range = (model.dateRange && model.dateRange.label) || 'the export';
    var body = model.members.length
      ? h('div', { class: 'standings', 'data-testid': 'standings' }, model.members.map(function (member) {
          var row = standingRow(member, model);
          if (!member.estimate) return row;
          return h('div', { class: 'person-block' }, row, slumpPanel(member));
        }))
      : h('div', { class: 'empty', 'data-testid': 'standings-empty' },
          h('p', { class: 'empty-title' }, 'No leaderboard yet'),
          h('p', {}, 'Add a members array to checks.json and refresh.')
        );
    return h('section', { class: 'card', id: 'standings' },
      h('div', { class: 'card-head' },
        h('h2', {}, model.group + ' standings'),
        h('p', { class: 'hint' }, 'Total steps for ' + range + '. Bars are each day in the export, on one shared scale.')
      ),
      body,
      model.source ? h('p', { class: 'source' }, model.source) : null
    );
  }

  function watchCard(item) {
    var title = item.kind === 'catch-up'
      ? formatNumber(item.steps) + ' on ' + formatDay(item.date) + ' after ' + formatNumber(item.priorSteps) + ' on ' + formatDay(item.priorDate)
      : formatNumber(item.steps) + ' on ' + formatDay(item.date);
    var detail = item.kind === 'catch-up'
      ? 'A quiet day, then a day this large. That pattern can be a sync catch-up. It is not a cheating call.'
      : 'A single day of ' + formatNumber(item.steps) + ' steps. Worth a look. Not a cheating call.';
    return h('a', { class: 'flag ' + (item.kind === 'catch-up' ? 'amber' : 'red'), href: '#series-' + item.slug, 'data-testid': 'watch' },
      h('div', { class: 'flag-top' },
        h('span', { class: 'pill ' + (item.kind === 'catch-up' ? 'amber' : 'red') }, item.kind === 'catch-up' ? 'Catch-up' : 'Big day'),
        h('strong', {}, item.name),
        h('span', { class: 'when' }, formatDay(item.date))
      ),
      h('p', { class: 'flag-stat' }, title),
      h('p', { class: 'flag-rule' }, detail)
    );
  }

  function watchesCard(model) {
    var rules = model.rules;
    var body = model.watches.length
      ? h('div', { class: 'flag-list', 'data-testid': 'watches' }, model.watches.map(watchCard))
      : h('div', { class: 'empty', 'data-testid': 'watches-empty' },
          h('p', { class: 'empty-title' }, 'No large days'),
          h('p', {}, 'Watch items show up when a day reaches the line below. An empty list means nobody cleared it in this export.')
        );
    return h('section', { class: 'card', id: 'flags' },
      h('div', { class: 'card-head' },
        h('h2', {}, 'Watch items'),
        h('p', { class: 'hint' }, 'Large single-day jumps. These are not automatic cheating calls.')
      ),
      body,
      h('div', { class: 'legend', 'data-testid': 'legend' },
        h('h3', {}, 'What gets called out'),
        h('div', { class: 'rule' },
          h('span', { class: 'swatch red', 'aria-hidden': 'true' }),
          h('div', {},
            h('p', { class: 'rule-label' }, 'Big day — ' + formatNumber(rules.bigDay) + ' steps or more'),
            h('p', { class: 'hint' }, 'One column in the export, on its own.')
          )
        ),
        h('div', { class: 'rule' },
          h('span', { class: 'swatch amber', 'aria-hidden': 'true' }),
          h('div', {},
            h('p', { class: 'rule-label' }, 'Catch-up — ' + formatNumber(rules.catchUpMin) + '+ after a day under ' + formatNumber(rules.catchUpPriorMax)),
            h('p', { class: 'hint' }, 'A very quiet day, then a much bigger one. Often a phone that synced late.')
          )
        ),
        h('p', { class: 'hint tight' }, rules.label || 'A watch item is a reason to look, not a verdict.')
      )
    );
  }

  function seriesCard(member, model) {
    var peak = member.peak
      ? 'Peak ' + formatDay(member.peak.date) + ' · ' + formatNumber(member.peak.steps)
      : 'No days logged';
    return h('article', {
      class: 'series-card' + (member.highlight ? ' focus' : ''),
      id: 'series-' + member.slug,
      'data-testid': 'series'
    },
      h('div', { class: 'series-top' },
        h('div', { class: 'name-line' },
          h('span', { class: 'rank mini ' + rankClass(member.rank) }, member.rank == null ? '–' : String(member.rank)),
          h('span', { class: 'name' }, member.name)
        ),
        h('p', { class: 'meta' }, formatNumber(member.totalSteps) + ' total')
      ),
      bars(member, model, true),
      h('p', { class: 'peak' }, peak),
      member.estimate
        ? h('p', { class: 'peak slump-note' }, 'Blue bars are the slump days in the estimate under his standings row.')
        : null
    );
  }

  function seriesSection(model) {
    var body = model.members.length && model.days.length
      ? h('div', { class: 'series-grid', 'data-testid': 'daily-series' }, model.members.map(function (member) {
          return seriesCard(member, model);
        }))
      : h('div', { class: 'empty' },
          h('p', { class: 'empty-title' }, 'No daily series yet'),
          h('p', {}, 'Each member needs a days array lined up with the dates on this export.')
        );
    return h('section', { class: 'card', id: 'log' },
      h('div', { class: 'card-head' },
        h('h2', {}, 'Daily series'),
        h('p', { class: 'hint' }, 'One bar per day, ' + formatDay(model.days[0]) + ' through ' + formatDay(model.summary.lastDate) + '. Gold bars are watch items. Taller means more steps, on the same scale for everyone.')
      ),
      body
    );
  }

  function asofText(model) {
    var range = (model.dateRange && model.dateRange.label) || 'the export';
    var text = 'StepUp export · ' + range;
    if (model.exportedAtCt) text += ' · saved ' + model.exportedAtCt;
    if (model.skipped) text += ' · ' + model.skipped + (model.skipped === 1 ? ' row skipped' : ' rows skipped');
    return text;
  }

  function render(container, model) {
    if (!container) return;
    container.textContent = '';
    var asof = document.getElementById('asof');
    if (asof) asof.textContent = asofText(model);
    container.appendChild(buildKpis(model));
    var cards = container.querySelectorAll('.kpi');
    if (cards.length === 4) {
      if (model.summary.watches) cards[3].classList.add('warm');
      else if (model.summary.people) cards[3].classList.add('clear');
    }
    var grid = h('div', { class: 'board' });
    grid.appendChild(standingsCard(model));
    grid.appendChild(watchesCard(model));
    container.appendChild(grid);
    container.appendChild(seriesSection(model));
  }

  function renderError(container, message) {
    if (!container) return;
    container.textContent = '';
    var asof = document.getElementById('asof');
    if (asof) asof.textContent = 'The export did not load.';
    container.appendChild(h('div', { class: 'empty', role: 'alert' },
      h('p', { class: 'empty-title' }, 'The board did not load'),
      h('p', {}, message)
    ));
  }

  return {
    analyze: analyze,
    render: render,
    renderError: renderError,
    formatNumber: formatNumber,
    formatDay: formatDay,
    formatMi: formatMi
  };
});
