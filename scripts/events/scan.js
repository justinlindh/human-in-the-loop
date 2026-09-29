// Plays seeds and bots on demand for a state query the index cannot answer (find.js --where).
//
// A run is one bot playing one seed in the pure sim, the way build.js plays it. After every week's
// tick the predicate runs once for each event the week raised and once for a synthetic `week` event,
// so a pure state condition is `e.type === 'week' && s.outage?.weeks === 0`. A match records the
// event and the state just before the tick that raised it, as a snapshot in the game's save format,
// so loading it plays into the moment through the game's own loop.
//
// The predicate is a JS expression over `e` (the event: type, id, its own fields, and seed, bot, week,
// era, stage, staff) and `s` (the state after the tick; read-only). `setup` is a statement list run
// on the state each week just before the tick (`s` in scope), and `turnWhile` an expression that must
// hold for the bot to take its turn that week; both change what the run plays, and a snapshot
// carries their effects. Runs go over worker threads at a lowered priority and stop being handed out
// once enough matches are in. Results are cached under the sim hash, and a repeat query resumes.
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { cpus, setPriority } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { ROOT, indexDir } from './lib.js';

const EVENT_ID = (e) => e.eraId ?? e.eventId ?? e.kind ?? e.type;

async function play({ bot, seed, weeks, where, setup, turnWhile, dir, id, perRun }) {
  const mod = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const { botDecide, botTurn } = await mod('src/sim/bots.js');
  const { createGame } = await mod('src/sim/state.js');
  const { tick } = await mod('src/sim/tick.js');
  const pred = new Function('e', 's', `return (${where});`);
  const prep = setup ? new Function('s', setup) : null;
  const turn = turnWhile ? new Function('s', `return (${turnWhile});`) : null;
  const s = createGame({ seed, companyName: `Bot ${bot}` });
  const hits = [];
  let error = null;
  const base = () => ({ seed, bot, week: s.week, era: s.era?.id ?? null, stage: s.officeStage, staff: s.staff.length });
  const seen = [];
  const collect = (events) => { for (const ev of events ?? []) seen.push(ev); };
  try {
    while (!s.gameOver && s.week < weeks && hits.length < perRun) {
      botDecide(bot, s, { onEvents: collect });
      if (s.gameOver) break;
      if (!turn || turn(s)) botTurn(bot, s, { onEvents: collect });
      prep?.(s);
      const before = JSON.stringify(s);
      collect(tick(s));
      const events = [{ type: 'week' }, ...seen.splice(0)];
      for (const ev of events) {
        const e = { ...ev, id: ev.type === 'week' ? 'week' : EVENT_ID(ev), ...base() };
        if (id != null && e.id !== id && e.type !== id) continue;
        if (pred(e, s)) {
          const name = `${seed}-${bot}-w${s.week}-scan-${e.type}.json.gz`;
          writeFileSync(join(dir, 'snapshots', name), gzipSync(before));
          hits.push({ ...base(), type: e.type, id: e.id, snapshot: name, preTick: name, scanned: true });
          break;
        }
      }
    }
  } catch (err) { error = `${err.message.split('\n')[0]} (seed ${seed}, bot ${bot}, week ${s.week})`; }
  return { hits, error };
}

if (!isMainThread) {
  play(workerData).then((r) => parentPort.postMessage(r), (err) => parentPort.postMessage({ hits: [], error: err.message }));
}

// Matches for a query, from the cache and then from playing more runs. Returns { rows, played, cached,
// error? } with rows in seed, bot order. `onProgress(done, total)` is called as runs finish.
export async function scan(hash, { id = null, where, setup = '', turnWhile = '', seeds, bots, weeks = 1040, limit = 5, perRun = 1, jobs, onProgress }) {
  const key = createHash('sha256').update(JSON.stringify([id, where, setup, turnWhile, weeks, perRun, readFileSync(fileURLToPath(import.meta.url), 'utf8')])).digest('hex').slice(0, 16);
  const dir = join(indexDir(hash), 'scan');
  mkdirSync(join(dir, 'snapshots'), { recursive: true });
  const file = join(dir, `${key}.json`);
  let rec = { rows: [], done: [] };
  try { if (existsSync(file)) rec = JSON.parse(readFileSync(file, 'utf8')); } catch { /* a bad cache is a fresh scan */ }
  const done = new Set(rec.done);
  const runs = seeds.flatMap((seed) => bots.map((bot) => ({ seed, bot }))).filter((r) => !done.has(`${r.seed}:${r.bot}`));
  const wanted = (r) => seeds.includes(r.seed) && bots.includes(r.bot);
  const have = () => rec.rows.filter(wanted).length;
  const cached = have();
  let played = 0, error = null;
  if (have() < limit && runs.length) {
    try { setPriority(10); } catch { /* keep the default */ }
    const n = Math.max(1, Math.min(jobs ?? Math.max(1, Math.floor(cpus().length / 4)), runs.length));
    let next = 0;
    await Promise.all(Array.from({ length: n }, async () => {
      while (next < runs.length && have() < limit && !error) {
        const run = runs[next++];
        const r = await new Promise((res, rej) => {
          const w = new Worker(fileURLToPath(import.meta.url), { workerData: { ...run, weeks, where, setup, turnWhile, dir, id, perRun } });
          w.once('message', res); w.once('error', rej);
        }).catch((e) => ({ hits: [], error: e.message }));
        if (r.error) { error = r.error; return; }
        rec.rows.push(...r.hits);
        rec.done.push(`${run.seed}:${run.bot}`);
        played++;
        onProgress?.(played, runs.length);
      }
    }));
    rec.rows.sort((a, b) => a.seed - b.seed || a.bot.localeCompare(b.bot) || a.week - b.week);
    // A run still going when the limit was reached finishes and is recorded, so the cache never holds
    // a half-played run.
    try { writeFileSync(file, JSON.stringify(rec)); } catch { /* an unwritable cache only costs a rescan */ }
  }
  return { rows: rec.rows.filter(wanted).slice(0, limit), played, cached, error, dir };
}
