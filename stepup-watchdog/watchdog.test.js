const assert = require('assert');
const fs = require('fs');
const path = require('path');
const w = require('./watchdog.js');

const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'checks.json'), 'utf8'));
const model = w.analyze(data);

assert.strictEqual(model.members.length, 14);
assert.strictEqual(model.days.length, 11);
assert.strictEqual(model.days[0], '2026-10-01');
assert.strictEqual(model.days[10], '2026-10-11');
assert.deepStrictEqual(model.members.map(function (m) { return m.rank; }), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14]);

assert.strictEqual(model.members[0].name, 'Alyssa Fogerty');
assert.strictEqual(model.members[0].totalSteps, 218058);
assert.strictEqual(model.members[0].lastDay, 32918);
assert.strictEqual(model.members[0].totalDistanceMi, 99.12);

const casey = model.members[8];
assert.strictEqual(casey.name, 'Casey Fogerty');
assert.strictEqual(casey.rank, 9);
assert.strictEqual(casey.totalSteps, 131729);
assert.strictEqual(casey.lastDay, 21999);
assert.strictEqual(casey.highlight, true);
assert.strictEqual(model.summary.highlight.name, 'Casey Fogerty');
assert.strictEqual(casey.days[6], 28);
assert.strictEqual(model.summary.groupSteps, 1953512);

const cade = model.members[1];
assert.strictEqual(cade.name, 'Cade Fogerty');
assert.strictEqual(cade.days[7], 2270);
assert.strictEqual(cade.days[8], 27152);

const kevin = model.members[3];
assert.strictEqual(kevin.name, 'Kevin Fogerty');
assert.strictEqual(kevin.days[2], 33232);
assert.strictEqual(model.days[2], '2026-10-03');

model.members.forEach(function (member) {
  var sum = member.days.reduce(function (total, n) { return total + (n || 0); }, 0);
  assert.strictEqual(sum, member.totalSteps, member.name);
});

const rick = model.members[13];
assert.strictEqual(rick.name, 'Rick Warren');
assert.ok(rick.days.every(function (n) { return n == null; }));
assert.ok(!model.watches.some(function (item) { return item.name === 'Rick Warren'; }));

function watchKey(item) {
  return item.name + '|' + item.date + '|' + item.kind + '|' + item.steps;
}
assert.deepStrictEqual(model.watches.map(watchKey), [
  'Kevin Fogerty|2026-10-03|big-day|33232',
  'Alyssa Fogerty|2026-10-11|big-day|32918',
  'Cade Fogerty|2026-10-10|big-day|29117',
  'Paige Fogerty|2026-10-10|big-day|28354',
  'Cade Fogerty|2026-10-09|catch-up|27152',
  'Cade Fogerty|2026-10-02|big-day|25283'
]);
const cadeCatch = model.watches[4];
assert.strictEqual(cadeCatch.priorSteps, 2270);
assert.strictEqual(cadeCatch.priorDate, '2026-10-08');
assert.ok(!model.watches.some(function (item) { return item.name === 'Casey Fogerty'; }));

const synthetic = w.analyze({
  days: ['2026-10-01', '2026-10-02'],
  watch: { bigDay: 25000, catchUpPriorMax: 5000, catchUpMin: 20000 },
  members: [
    { name: 'Quiet', totalSteps: 44999, days: [24999, 20000] },
    { name: 'Just Big', totalSteps: 26000, days: [1000, 25000] },
    { name: 'Catch', totalSteps: 24000, days: [4000, 20000] },
    { name: 'Nope', days: ['N.A', 'N.A'] }
  ]
});
assert.deepStrictEqual(synthetic.watches.map(watchKey), [
  'Just Big|2026-10-02|catch-up|25000',
  'Catch|2026-10-02|catch-up|20000'
]);
assert.strictEqual(synthetic.members.length, 4);
assert.ok(synthetic.members[3].days.every(function (n) { return n == null; }));
assert.strictEqual(w.formatDay('2026-10-11'), 'Oct 11');
assert.strictEqual(w.formatNumber(131729), '131,729');
assert.strictEqual(w.formatMi(99.12), '99.12 mi');

console.log('stepup export tests passed');
