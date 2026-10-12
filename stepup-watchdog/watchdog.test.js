const assert = require('assert');
const fs = require('fs');
const path = require('path');
const w = require('./watchdog.js');

function row(time, person, steps, extra) {
  return Object.assign({
    check_time_ct: time,
    person: person,
    steps: steps,
    last_update: time,
    delta_steps: null,
    hours_since_prev: null,
    steps_per_hour: null,
    flag: '',
    notes: ''
  }, extra || {});
}

function flagged(checks) {
  return w.analyze({ checks: checks }).flags.map(function (item) {
    return item.person + ':' + item.flag;
  });
}

const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'checks.json'), 'utf8'));
const model = w.analyze(seed);

assert.strictEqual(model.standings.length, 6);
assert.deepStrictEqual(model.standings.map(function (item) { return item.person; }), [
  'Alyssa Fogerty',
  'Paige Fogerty',
  'Casey Fogerty',
  'Cade Fogerty',
  'Stephanie Fogerty',
  'Kevin Fogerty'
]);
assert.deepStrictEqual(model.standings.map(function (item) { return item.steps; }), [
  31158, 23019, 21808, 17255, 12144, 10407
]);
assert.strictEqual(model.summary.familySteps, 115791);
assert.strictEqual(model.summary.leader.person, 'Alyssa Fogerty');
assert.strictEqual(model.standings[0].role, 'Admin');
assert.strictEqual(model.standings[0].initials, 'AF');
assert.strictEqual(model.standings[4].initials, 'SF');
assert.strictEqual(model.summary.flags, 0);
assert.strictEqual(model.flags.length, 0);
assert.strictEqual(model.summary.hasDeltas, false);
assert.strictEqual(model.summary.nightRows, 0);
assert.strictEqual(model.summary.snapshots, 1);
assert.strictEqual(model.skipped, 0);
assert.ok(model.standings.every(function (item) { return item.movement == null && item.baseline; }));
assert.strictEqual(model.rules.length, 2);

assert.deepStrictEqual(flagged([
  row('2026-10-12 18:00', 'Casey Fogerty', 1000),
  row('2026-10-12 18:30', 'Casey Fogerty', 7001)
]), ['Casey Fogerty:amber']);

assert.deepStrictEqual(flagged([
  row('2026-10-12 18:00', 'Casey Fogerty', 1000),
  row('2026-10-12 19:00', 'Casey Fogerty', 7001)
]), []);

assert.deepStrictEqual(flagged([
  row('2026-10-12 18:00', 'Casey Fogerty', 1000),
  row('2026-10-12 18:30', 'Casey Fogerty', 7000)
]), []);

assert.deepStrictEqual(flagged([
  row('2026-10-12 18:00', 'Paige Fogerty', 1000),
  row('2026-10-12 19:20', 'Paige Fogerty', 11002)
]), ['Paige Fogerty:red']);

assert.deepStrictEqual(flagged([
  row('2026-10-12 18:00', 'Paige Fogerty', 1000),
  row('2026-10-12 19:30', 'Paige Fogerty', 11002)
]), []);

assert.deepStrictEqual(flagged([
  row('2026-10-12 18:00', 'Paige Fogerty', 1000),
  row('2026-10-12 19:20', 'Paige Fogerty', 11000)
]), []);

assert.deepStrictEqual(flagged([
  row('2026-10-12 18:00', 'Cade Fogerty', 1000),
  row('2026-10-12 18:20', 'Cade Fogerty', 12000)
]), ['Cade Fogerty:red']);

assert.deepStrictEqual(flagged([
  row('2026-10-12 18:00', 'Kevin Fogerty', 5000),
  row('2026-10-12 18:20', 'Kevin Fogerty', 4900)
]), []);

assert.deepStrictEqual(flagged([
  row('2026-10-12 18:00', 'Alyssa Fogerty', 1000, { flag: 'red', delta_steps: 99999 })
]), []);

const sameStamp = w.analyze({
  checks: [
    row('2026-10-12 19:00', 'Stephanie Fogerty', 1000),
    row('2026-10-12 19:00', 'Stephanie Fogerty', 8000)
  ]
});
assert.strictEqual(sameStamp.flags.length, 1);
assert.strictEqual(sameStamp.flags[0].flag, 'amber');
assert.strictEqual(sameStamp.flags[0].hours_since_prev, 0);

const moved = w.analyze({
  checks: [
    row('2026-10-12 18:00', 'Alyssa Fogerty', 100),
    row('2026-10-12 18:00', 'Paige Fogerty', 90),
    row('2026-10-12 19:00', 'Paige Fogerty', 200)
  ]
});
const byName = {};
moved.standings.forEach(function (item) { byName[item.person] = item; });
assert.strictEqual(byName['Paige Fogerty'].rank, 1);
assert.strictEqual(byName['Paige Fogerty'].movement.direction, 'up');
assert.strictEqual(byName['Alyssa Fogerty'].movement.direction, 'down');
assert.strictEqual(byName['Paige Fogerty'].in_window, true);
assert.strictEqual(moved.summary.nightRows, 3);

const messy = w.analyze({
  people: [{ name: 'Casey Fogerty', initials: 'CF', color: 'javascript:alert(1)' }],
  checks: [
    row('2026-10-12 21:00', 'casey fogerty', '21,808'),
    { person: '', steps: 10, check_time_ct: '2026-10-12 21:00' },
    { person: 'Nope', steps: -5, check_time_ct: '2026-10-12 21:00' }
  ]
});
assert.strictEqual(messy.standings.filter(function (item) { return item.steps != null; })[0].person, 'Casey Fogerty');
assert.strictEqual(messy.standings.filter(function (item) { return item.steps != null; })[0].steps, 21808);
assert.ok(/^#/.test(messy.standings[0].color));
assert.strictEqual(messy.skipped, 2);
assert.strictEqual(w.formatHours(1), '1 h');
assert.strictEqual(w.formatHours(0.5), '30 min');
assert.strictEqual(w.formatDelta(1642), '+1,642');
assert.strictEqual(w.formatDelta(-12), '−12');

console.log('stepup watchdog tests passed');
