#!/usr/bin/env node
// Saved states for the era clips (scripts/reels/era-manifest.js): plays a founded company in the pure sim
// with the balanced bot and writes the state, gzipped, into shots/era-snaps/<era>-<seed>-<name>.snap at the
// first week a condition holds (state saved after the bot's turn, before the tick).
//
//   node scripts/reels/era-snaps.mjs <startEra> <seed> '<name>=<js over s>' ...
//   node scripts/reels/era-snaps.mjs dotcom 7 "boom=s.week===45" "y2k=s.week===103" \
//     "bust=s.flags.dotcom?.phase==='bust'" "w2=s.era.id==='web2'&&s.week>=s.eraSchedule.web2+20"
import { mkdirSync, writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { botDecide, botTurn } from '../../src/sim/bots.js';
import { createGame } from '../../src/sim/state.js';
import { tick } from '../../src/sim/tick.js';
import { calendarDate } from '../../src/sim/util.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const [startEra, seed, ...wants] = process.argv.slice(2);
if (!startEra || !seed || !wants.length) { console.error("usage: era-snaps.mjs <startEra> <seed> '<name>=<js over s>' ..."); process.exit(2); }
const dir = join(root, 'shots/era-snaps');
mkdirSync(dir, { recursive: true });
const conds = wants.map((w) => {
  const k = w.indexOf('=');
  try { return { name: w.slice(0, k), test: new Function('s', `return (${w.slice(k + 1)});`) }; } catch (e) { console.error(`bad condition ${w}: ${e.message}`); process.exit(2); }
});
const s = createGame({ seed: Number(seed), startEra });
const done = new Set();
for (let i = 0; i < 1200 && !s.gameOver && done.size < conds.length; i++) {
  botDecide('balanced', s);
  botTurn('balanced', s);
  for (const c of conds) {
    if (done.has(c.name) || !c.test(s)) continue;
    done.add(c.name);
    writeFileSync(join(dir, `${startEra}-${seed}-${c.name}.snap`), gzipSync(JSON.stringify(s)));
    console.log(`${c.name}: week ${s.week}, ${calendarDate(s).year}, era ${s.era.id}, staff ${s.staff.length}, stage ${s.officeStage}`);
  }
  tick(s);
}
const missing = conds.filter((c) => !done.has(c.name));
if (missing.length) { console.error(`never held: ${missing.map((c) => c.name).join(', ')}`); process.exit(1); }
