import { readFileSync, writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { compare, markdown } from '../../scripts/events/pair-report.js';
import { B } from '../../src/sim/balance.js';
const dir = new URL('./', import.meta.url);
const read = (name) => JSON.parse(readFileSync(new URL(name, dir)));
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? null;
const rows = (d, bot) => Object.entries(d.runs).filter(([k]) => !bot || k.startsWith(`${bot}:`)).map(([, r]) => r);
const classic = read('../e5c-evidence/classic.json');
const dotcom = read('../e5c-evidence/dotcom.json');
const old = read('../e5d-evidence/preinternet.json');
const count = (rs, pred) => rs.filter(pred).length;
const exits = (d, bot) => count(rows(d, bot), (r) => r.exited);
const pooled = (d) => median(rows(d).map((r) => r.score));
const money = (v) => v == null ? 'n/a' : `$${Math.round(v).toLocaleString('en-US')}`;
const cell = (d, bot) => {
  const rs = rows(d, bot), at = rs.map((r) => r.eras.dotcom).filter(Boolean);
  return `${money(median(at.map((r) => r.cash)))} | ${median(at.map((r) => r.staff)) ?? 'n/a'} | ${at.length}/200 | ${count(rs, (r) => r.eras.web2)}/200 | ${exits(d, bot)}/200`;
};
const pre = read('preinternet.json'), raw = read('preinternet-raw.json');
assert.equal(pre.price, B.preinternet.price);
assert.equal(raw.price, pre.price);
assert.equal(raw.config.scoreMult, 1);
assert.deepEqual(pre.config, B.eraStarts.preinternet);
assert(pre.config.scoreShare > dotcom.config.scoreShare && pre.config.scoreShare < 1);
assert(pooled(pre) / pooled(classic) > dotcom.config.scoreShare && pooled(pre) / pooled(classic) < 1);
assert.equal(pre.config.scoreMult, Math.round(pre.config.scoreShare * pooled(classic) / pooled(raw) * 100) / 100);
for (const d of [classic, dotcom, pre, raw]) {
  assert.equal(d.seeds, 200);
  assert.equal(Object.keys(d.runs).length, 1200);
  for (const bot of pre.bots) for (let seed = 1; seed <= 200; seed++) assert(d.runs[`${bot}:${seed}`]);
}
for (const bot of ['balanced', 'sensible']) {
  assert(Math.abs(exits(pre, bot) - exits(classic, bot)) <= 30);
  const rs = rows(pre, bot), control = rows(dotcom, bot);
  const gap = count(control, (r) => r.eras.web2) - count(rs, (r) => r.eras.web2);
  assert(gap >= 2 && gap <= 30);
}
for (const [key, r] of Object.entries(pre.runs)) {
  for (const field of ['exited', 'reason', 'weeks', 'eras', 'incidents', 'caught', 'breaches']) assert.deepEqual(r[field], raw.runs[key][field]);
  assert(Math.abs(r.score - raw.runs[key].score * pre.config.scoreMult) <= 1);
}
for (const row of read('../e5d-evidence/handoff.json').filter((r) => r.price === pre.price)) {
  for (const r of row.runs) {
    const full = pre.runs[`${row.bot}:${r.seed}`];
    assert.deepEqual(full.eras.dotcom, r.eras.dotcom);
    assert.deepEqual(full.eras.web2, r.eras.web2);
    assert.equal(!!full.eras.web2, !!r.eras.web2 && !r.gameOver);
  }
}
let text = 'Seeds 1 through 200, bootstrapped funding, six bots per start. Exits mean IPO or acquisition. Pooled score medians include all 1,200 runs, including failures and zero scores. Medians use the upper middle observation. Cross-start comparisons include kits, chapter routes and exit bars.\n\n';
text += '| Bot | Classic exits | Dot-com exits | Pre-internet exits | Pre minus Classic (points) | Lost / gained vs Classic | Lost / gained vs dot-com |\n|---|---:|---:|---:|---:|---:|---:|\n';
const changes = (base, bot) => {
  const keys = Object.keys(pre.runs).filter((k) => k.startsWith(`${bot}:`));
  return `${count(keys, (k) => base.runs[k].exited && !pre.runs[k].exited)} / ${count(keys, (k) => !base.runs[k].exited && pre.runs[k].exited)}`;
};
for (const bot of pre.bots) text += `| ${bot} | ${exits(classic, bot)}/200 | ${exits(dotcom, bot)}/200 | ${exits(pre, bot)}/200 | ${(exits(pre, bot) - exits(classic, bot)) / 2} | ${changes(classic, bot)} | ${changes(dotcom, bot)} |\n`;
text += '\n| Start | Bot | Dot-com cash median | Staff median | Into dot-com | Through dot-com | Final exits |\n|---|---|---:|---:|---:|---:|---:|\n';
for (const bot of pre.bots) for (const d of [pre, dotcom]) text += `| ${d.era} | ${bot} | ${cell(d, bot)} |\n`;
text += '\nDot-com-start arrivals are its initial kit. Through dot-com means reaching Web 2.0. Cash and staff medians include only runs that enter dot-com.\n\n';
text += '| Bot | Survival shortfall (points) | Paired lost / gained | Paired SE (points) | Approximate 95% interval (points) |\n|---|---:|---:|---:|---:|\n';
for (const bot of pre.bots) {
  const keys = Object.keys(pre.runs).filter((k) => k.startsWith(`${bot}:`));
  const ds = keys.map((k) => Number(!!dotcom.runs[k].eras.web2) - Number(!!pre.runs[k].eras.web2));
  const gap = ds.reduce((a, b) => a + b, 0) / ds.length;
  const se = Math.sqrt(ds.reduce((a, d) => a + (d - gap) ** 2, 0) / (ds.length - 1) / ds.length);
  const low = gap - 1.96 * se, high = gap + 1.96 * se;
  if (['balanced', 'sensible'].includes(bot)) assert(low > 0.01 && high < 0.15);
  text += `| ${bot} | ${(gap * 100).toFixed(1)} | ${ds.filter((d) => d === 1).length} / ${ds.filter((d) => d === -1).length} | ${(se * 100).toFixed(2)} | ${(low * 100).toFixed(2)} to ${(high * 100).toFixed(2)} |\n`;
}
text += '\nThe handoff regression guards balanced and sensible at 1 to 15 percentage points below a dot-com start (2 to 30 fewer survivors out of 200). For each matched seed, d is dot-com survival minus pre-internet survival, in {-1, 0, 1}. SE is sampleSD(d) / sqrt(200); the approximate interval is mean(d) +/- 1.96 * SE. Both bots\' intervals sit inside the guard, so the bounds leave room beyond the measured paired seed noise while rejecting equal survival and an excessive survival penalty. Other bots are reported for context and are not subject to this band.\n\n';
text += '| Bot | Classic median score | Dot-com median score | Pre-internet median score |\n|---|---:|---:|---:|\n';
for (const bot of pre.bots) text += `| ${bot} | ${[classic, dotcom, pre].map((d) => median(rows(d, bot).map((r) => r.score))).join(' | ')} |\n`;
text += `| **Pooled** | **${pooled(classic)}** | **${pooled(dotcom)}** | **${pooled(pre)}** |\n`;
text += '\n| Start | Exit MRR multiplier | Score factor | Declared share | Measured pooled share of Classic |\n|---|---:|---:|---:|---:|\n';
for (const d of [classic, dotcom, pre]) text += `| ${d.era} | ${d.config.exitMrrMult} | ${d.config.scoreMult} | ${d.config.scoreShare} | ${(pooled(d) / pooled(classic)).toFixed(5)} |\n`;
text += `\nRaw pre-internet pooled median: ${pooled(raw)}. Factor: ${pre.config.scoreShare} * ${pooled(classic)} / ${pooled(raw)} = ${(pre.config.scoreShare * pooled(classic) / pooled(raw)).toFixed(8)}, rounded to ${pre.config.scoreMult}. The scored rerun preserves endings, weeks, arrivals, incidents, caught counts and breaches on every seed.\n`;
text += '\nPaired change against the $350 head. Identity hashes include the saved score factor, so changing it makes every full state differ. This report rounds exit percentages to whole points; the exact counts above govern.\n\n' + markdown(compare(old.runs, pre.runs), { a: '$350', b: `$${pre.price}` }) + '\n';
text += '\n| Bot | Lost before dot-com | Lost within dot-com | Ending reasons before Web 2.0 |\n|---|---:|---:|---|\n';
for (const bot of pre.bots) {
  const rs = rows(pre, bot), losses = rs.filter((r) => !r.eras.web2);
  const reasons = {};
  for (const r of losses) reasons[r.reason] = (reasons[r.reason] ?? 0) + 1;
  text += `| ${bot} | ${count(rs, (r) => !r.eras.dotcom)} | ${count(rs, (r) => r.eras.dotcom && !r.eras.web2)} | ${Object.entries(reasons).map(([k, v]) => `${k}: ${v}`).join(', ') || 'none'} |\n`;
}
writeFileSync(new URL('e5e-tables.md', dir), text);
console.log(text);
