// Builds the seeded event index: bots play seeds with the pure sim (no browser), and every notable
// event is recorded with where and when it happened, plus a save-state snapshot before the ones a
// tool would want to stage.
//
//   node scripts/events/build.js [--seeds 1-20] [--bots balanced,sensible,allHumans] [--weeks 1040]
//                                [--jobs N] [--force]
//
// Writes <cache>/<sim hash>/events.jsonl.gz (one row per event), meta.json, and snapshots/*.json.gz
// (the game's save format, loadable with continueGame). The cache is ~/.cache/hitl-ci/events (see
// lib.js). An index that already exists for this code is kept unless --force.
//
// A row: { seed, bot, week, era, stage, staff, type, id, choice?, subject?, stageProp?, props, snapshot?,
//         preTick? }
//   type  decision (id: the event id; choice: what the bot picked), or a sim event type: era,
//         officeUpgrade, incident, launch, award, resign, unlock, goal, hire, gameOver (id: the type,
//         or its own id where it has one)
//   props the staged props standing in the office that week
// Snapshots, taken just before the moment: a decision with a staged prop or a moment caption (the
// state with the decision open, so loading it stages the prop; the first two per run; with it, as
// preTick, the state just before the tick that raised it, from which the game's own loop ticks into
// the decision), an era change and an office move
// (the state the week before, so the change plays when the game runs on).
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync, existsSync, rmSync, readdirSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { cpus } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, CACHE, simHash, indexDir } from './lib.js';

const KEEP = new Set(['era', 'officeUpgrade', 'incident', 'launch', 'award', 'resign', 'unlock', 'goal', 'hire', 'gameOver']);
const SNAP = new Set(['era', 'officeUpgrade']);
const SNAP_PER_ID = 2;

async function play({ bot, seed, weeks, dir }) {
  const mod = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const { botDecide, botTurn } = await mod('src/sim/bots.js');
  const { createGame } = await mod('src/sim/state.js');
  const { tick } = await mod('src/sim/tick.js');
  const { EVENTS } = await mod('src/data/events.js');
  const { MOMENT_CAPTIONS } = await mod('src/data/moments.js');
  const s = createGame({ seed, companyName: `Bot ${bot}` });
  const rows = [];
  const base = () => ({ seed, bot, week: s.week, era: s.era?.id ?? null, stage: s.officeStage, staff: s.staff.length, props: (s.office?.props ?? []).map((p) => p.prop) });
  // At most SNAP_PER_ID snapshots of one decision per run (the first ones); every era change and move.
  const taken = new Map();
  const snap = (tag, json, week = s.week) => {
    const name = `${seed}-${bot}-w${week}-${tag}.json.gz`;
    writeFileSync(join(dir, 'snapshots', name), gzipSync(json));
    return name;
  };
  let open = null, preTick = null;
  const collect = (events) => {
    for (const e of events ?? []) {
      if (e.type === 'decisionResolved' && open && open.id === e.eventId) open.choice = e.choice ?? null;
      else if (KEEP.has(e.type)) rows.push({ ...base(), type: e.type, id: e.eraId ?? e.eventId ?? e.kind ?? e.type });
    }
  };
  while (!s.gameOver && s.week < weeks) {
    const before = JSON.stringify(s);
    if (s.pendingDecision) {
      const d = s.pendingDecision;
      open = { ...base(), type: 'decision', id: d.eventId, subject: d.subjectId ?? null, stageProp: d.stage?.prop ?? null, choice: null };
      const n = taken.get(d.eventId) ?? 0;
      if ((EVENTS[d.eventId]?.stage || MOMENT_CAPTIONS[d.eventId]) && n < SNAP_PER_ID) {
        open.snapshot = snap(d.eventId, before);
        // And the state just before the tick that raised it, so a page can play into the decision.
        if (preTick) open.preTick = snap(`${d.eventId}-pre`, preTick, s.week - 1);
        taken.set(d.eventId, n + 1);
      }
      rows.push(open);
    }
    botDecide(bot, s, { onEvents: collect });
    open = null;
    if (s.gameOver) break;
    const n = rows.length;
    botTurn(bot, s, { onEvents: collect });
    preTick = JSON.stringify(s);
    collect(tick(s));
    if (!s.pendingDecision) preTick = null;
    // An era change or an office move this week: snapshot the week before it, so it plays on load.
    for (const r of rows.slice(n)) if (SNAP.has(r.type) && !r.snapshot) { r.week = s.week - 1; r.snapshot = snap(r.type, before, r.week); }
  }
  return rows;
}

if (!isMainThread) {
  play(workerData).then((rows) => parentPort.postMessage(rows));
} else {
  const argv = process.argv.slice(2);
  const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
  const range = (v) => v.split(',').flatMap((x) => { const [a, b] = x.split('-').map(Number); return b ? Array.from({ length: b - a + 1 }, (_, i) => a + i) : [a]; });
  const seeds = range(opt('seeds', '1-20'));
  const bots = opt('bots', 'balanced,sensible,allHumans').split(',');
  const weeks = Number(opt('weeks', 1040));
  const jobs = Number(opt('jobs', Math.max(1, Math.floor(cpus().length / 4))));
  const hash = simHash();
  const dir = indexDir(hash);
  if (existsSync(join(dir, 'events.jsonl.gz')) && !argv.includes('--force')) {
    console.log(`events: an index for this code (${hash}) already exists at ${dir}; --force rebuilds it`);
    process.exit(0);
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(join(dir, 'snapshots'), { recursive: true });
  const t0 = Date.now();
  const runs = bots.flatMap((bot) => seeds.map((seed) => ({ bot, seed, weeks, dir })));
  const all = [];
  let next = 0, done = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, runs.length) }, async () => {
    while (next < runs.length) {
      const run = runs[next++];
      const rows = await new Promise((res, rej) => {
        const w = new Worker(fileURLToPath(import.meta.url), { workerData: run });
        w.once('message', res); w.once('error', rej);
      });
      all.push(...rows);
      done++;
      if (done % 10 === 0 || done === runs.length) console.log(`events: ${done}/${runs.length} runs (${Math.round((Date.now() - t0) / 1000)} s)`);
    }
  }));
  all.sort((a, b) => a.bot.localeCompare(b.bot) || a.seed - b.seed || a.week - b.week);
  writeFileSync(join(dir, 'events.jsonl.gz'), gzipSync(all.map((r) => JSON.stringify(r)).join('\n') + '\n'));
  const snaps = readdirSync(join(dir, 'snapshots'));
  const bytes = snaps.reduce((n, f) => n + statSync(join(dir, 'snapshots', f)).size, 0);
  writeFileSync(join(dir, 'meta.json'), JSON.stringify({ hash, seeds, bots, weeks, rows: all.length, snapshots: snaps.length, builtAt: new Date().toISOString() }, null, 1));
  // Indexes for older code are dropped, keeping the three most recent.
  const old = readdirSync(CACHE).filter((d) => d !== hash && existsSync(join(CACHE, d, 'meta.json'))).sort((a, b) => statSync(join(CACHE, b)).mtimeMs - statSync(join(CACHE, a)).mtimeMs);
  for (const d of old.slice(2)) rmSync(join(CACHE, d), { recursive: true, force: true });
  console.log(`events: ${all.length} rows, ${snaps.length} snapshots (${(bytes / 1e6).toFixed(1)} MB) from ${runs.length} runs in ${Math.round((Date.now() - t0) / 1000)} s -> ${dir}`);
}
