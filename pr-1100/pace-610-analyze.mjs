import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const r = JSON.parse(readFileSync(join(dir, 'observed.json'), 'utf8'));
assert.equal(r.mode, 'browser');
assert.equal(r.speed, 1);
assert.equal(r.seed, 1);
assert.equal(r.stop, 'weeks');
assert.equal(r.weeks, 156);
assert.deepEqual(r.errors, []);
assert(r.elapsedSeconds >= 156 * 8);
const shown = r.records.filter(e => e.transition === 'shown');
assert.equal(new Set(shown.map(e => e.sequence)).size, shown.length);
for (const e of r.records) {
  assert(Number.isFinite(e.t) && Number.isInteger(e.week) && e.era && Number.isInteger(e.officeStage));
  assert(e.id && ['game', 'player'].includes(e.origin));
  assert.equal(typeof e.actionable, 'boolean');
}
const kinds = Object.keys(r.rates);
for (const kind of kinds) {
  const rows = shown.filter(e => e.kind === kind);
  assert.equal(rows.length, r.rates[kind].count);
  assert(Math.abs(rows.length * 60 / r.elapsedSeconds - r.rates[kind].perMinute) < 1e-10);
  assert.equal(r.rates[kind].game + r.rates[kind].player, rows.length);
}
const sampled = shown.filter(e => e.t >= r.sample.from && e.t < r.sample.to);
const captured = new Set(r.sample.frames.flatMap(f => f.shown));
assert.deepEqual([...captured].sort((a,b) => a-b), sampled.map(e => e.sequence).sort((a,b) => a-b));
for (const frame of r.sample.frames) assert(existsSync(join(dir, frame.file)));
const counts = Object.fromEntries(kinds.map(k => [k, sampled.filter(e => e.kind === k).length]));
assert.deepEqual(counts, {
  decision: 0, toast: 5, yak: 8, 'yak-prompt': 0, 'advisor-prompt': 0,
  'office-prompt': 0, panel: 0, card: 1, tutorial: 0,
});
const table = [
  '| Kind | Count | Per real minute | Actionable episodes | Game | Player |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...kinds.map(k => { const x=r.rates[k]; return `| ${k} | ${x.count} | ${x.perMinute.toFixed(3)} | ${x.actionable} | ${x.game} | ${x.player} |`; }),
].join('\n');
const minute = [
  `Sample [${r.sample.from}, ${r.sample.to}) seconds: ${sampled.length} newly shown presentations.`,
  JSON.stringify(counts),
  ...sampled.map(e => `${e.sequence}\t${e.t.toFixed(3)}\t${e.kind}\t${e.id}\t${e.origin}\t${e.text}`),
].join('\n');
writeFileSync(join(dir, 'rates.md'), table+'\n');
writeFileSync(join(dir, 'sample-records.txt'), minute+'\n');
writeFileSync(join(dir, 'summary.json'), JSON.stringify({ elapsedSeconds:r.elapsedSeconds, weeks:r.weeks, rates:r.rates, sampleCounts:counts, sampleRecords:sampled },null,2)+'\n');
console.log(`PASS: real seed 1, 1x, weeks 0-156, ${r.elapsedSeconds.toFixed(3)} elapsed seconds, no browser errors.`);
console.log(`PASS: ${shown.length} presentation episodes reconcile by kind and origin.`);
console.log(`PASS: all ${sampled.length} sampled-minute shown records link to screenshot frames.`);
console.log('PASS: screenshot count matches the trace: 5 toasts, 8 Yak posts, 1 information card; 14 total.');
console.log(table);
console.log(minute);
