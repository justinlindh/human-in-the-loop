// Plays seeds and bots on demand for a state query the index cannot answer (find.js --where).
//
// A run is one bot playing one seed in the pure sim, the way build.js plays it. After every week's
// tick the predicate runs once for each event the week raised and once for a synthetic `week` event,
// so a pure state condition is `e.type === 'week' && s.outage?.weeks === 0`. A match records the
// event and the state just before the tick that raised it, as a snapshot in the game's save format,
// so loading it plays into the moment through the game's own loop.
//
// `filter` ({ era, stage, from, to }) is applied to events before the predicate, as the index's own
// filters are. The predicate is a JS expression over `e` (the event: type, id, its own fields, and seed, bot, week,
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

// The top-level `&&` parts of an expression, outside brackets and quotes. The scan reports which of
// them were ever true, so a condition no bot game can satisfy names the part that never held.
export function clausesOf(expr) {
  const parts = [];
  let depth = 0, quote = null, start = 0;
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'" || c === '`') quote = c;
    else if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === '&' && expr[i + 1] === '&' && depth === 0) { parts.push(expr.slice(start, i).trim()); start = i + 2; i++; }
  }
  parts.push(expr.slice(start).trim());
  return parts.filter(Boolean);
}

const STAGES = { garage: 0, floor: 1, hq: 2 };
// Moments waiting on a look-ahead at once, per run. A run that would pass it counts the rest as dropped
// and the answer is refused rather than reported as "none satisfied".
const MAX_WAITING = 1000;

async function play({ bot: startBot, seed, weeks, where, then, within, setup, before: beforeJs, botJs, extra: extraJs, turnWhile, dir, id, perRun, key, filter }) {
  const bot = startBot;
  const mod = (p) => import(pathToFileURL(join(ROOT, p)).href);
  const { botDecide, botTurn } = await mod('src/sim/bots.js');
  const { createGame } = await mod('src/sim/state.js');
  const { tick } = await mod('src/sim/tick.js');
  const pred = new Function('e', 's', `return (${where});`);
  const stage = filter.stage == null ? null : STAGES[filter.stage] ?? Number(filter.stage);
  const passes = (e) => (filter.era == null || e.era === filter.era) && (stage == null || e.stage === stage)
    && (filter.from == null || e.week >= Number(filter.from)) && (filter.to == null || e.week <= Number(filter.to));
  const clauses = clausesOf(where).map((c) => new Function('e', 's', `return (${c});`));
  const everTrue = clauses.map(() => false);
  const follow = then ? new Function('e', 's', 'm', `return (${then});`) : null;
  const prep = setup ? new Function('s', setup) : null;
  const pre = beforeJs ? new Function('s', beforeJs) : null;
  const pickBot = botJs ? new Function('s', `return (${botJs});`) : null;
  const more = extraJs ? new Function('e', 's', `return (${extraJs});`) : null;
  const turn = turnWhile ? new Function('s', `return (${turnWhile});`) : null;
  const s = createGame({ seed, companyName: `Bot ${bot}` });
  const hits = [];
  let error = null;
  const base = () => ({ seed, bot, week: s.week, era: s.era?.id ?? null, stage: s.officeStage, staff: s.staff.length });
  const seen = [];
  const collect = (events) => { for (const ev of events ?? []) seen.push(ev); };
  // Starts waiting for their look-ahead condition: { row, before (the pre-tick state), until (week) }.
  let waiting = [];
  let started = 0, dropped = 0;
  const wantsState = /\bm\.s\b/.test(then ?? '');
  const record = (row, before, result) => {
    const name = `${key}-${seed}-${bot}-w${row.week}-${row.type}.json.gz`;
    writeFileSync(join(dir, 'snapshots', name), gzipSync(before));
    hits.push({ ...row, snapshot: name, preTick: name, scanned: true, ...(result !== true ? { result } : {}) });
  };
  try {
    while (!s.gameOver && s.week < weeks && hits.length < perRun) {
      const who = pickBot?.(s) ?? bot;
      pre?.(s);
      botDecide(who, s, { onEvents: collect });
      if (s.gameOver) break;
      pre?.(s);
      if (!turn || turn(s)) botTurn(who, s, { onEvents: collect });
      prep?.(s);
      const before = JSON.stringify(s);
      collect(tick(s));
      const events = [{ type: 'week' }, ...seen.splice(0)].map((ev) => ({ ...ev, id: ev.type === 'week' ? 'week' : EVENT_ID(ev), ...base() }));
      // Look-ahead: a moment found earlier is kept once the condition on what follows holds.
      if (follow && waiting.length) {
        waiting = waiting.filter((w) => {
          for (const e of events) {
            const r = follow(e, s, { ...w.row, e: w.e, s: w.s0 });
            if (r) { record(w.row, w.before, r); return false; }
          }
          return s.week < w.until;
        });
      }
      for (const e of events) {
        if (id != null && e.id !== id && e.type !== id) continue;
        if (!passes(e)) continue;
        clauses.forEach((c, i) => { if (!everTrue[i]) { try { everTrue[i] = !!c(e, s); } catch { /* false */ } } });
        if (!pred(e, s)) continue;
        const row = { ...base(), type: e.type, id: e.id, ...(more?.(e, s) ?? {}) };
        if (follow) { started++;
          if (waiting.length < MAX_WAITING) waiting.push({ row, e, s0: wantsState ? structuredClone(s) : null, before, until: s.week + within }); else dropped++; } else record(row, before, true);
        break;
      }
    }
  } catch (err) { error = `${err.message.split('\n')[0]} (seed ${seed}, bot ${bot}, week ${s.week})`; }
  return { hits, error, everTrue, started, dropped };
}

if (!isMainThread) {
  play(workerData).then((r) => parentPort.postMessage(r), (err) => parentPort.postMessage({ hits: [], everTrue: [], error: err.message }));
}

// Matches for a query, from the cache and then from playing more runs. Returns { rows, played, cached,
// error? } with rows in seed, bot order. `onProgress(done, total)` is called as runs finish.
export async function scan(hash, { id = null, where, then = '', within = 52, rank = '', setup = '', before = '', botJs = '', extra = '', turnWhile = '', filter = {}, seeds, bots, weeks = 1040, limit = 5, perRun = 1, jobs, onProgress }) {
  const key = createHash('sha256').update(JSON.stringify([id, where, then, within, setup, before, botJs, extra, turnWhile, filter, weeks, perRun, readFileSync(fileURLToPath(import.meta.url), 'utf8')])).digest('hex').slice(0, 16);
  const dir = join(indexDir(hash), 'scan');
  mkdirSync(join(dir, 'snapshots'), { recursive: true });
  const file = join(dir, `${key}.json`);
  let rec = { rows: [], done: [], ever: {} };
  try { if (existsSync(file)) rec = { ever: {}, ...JSON.parse(readFileSync(file, 'utf8')) }; } catch { /* a bad cache is a fresh scan */ }
  const done = new Set(rec.done);
  const runs = seeds.flatMap((seed) => bots.map((bot) => ({ seed, bot }))).filter((r) => !done.has(`${r.seed}:${r.bot}`));
  const wanted = (r) => seeds.includes(r.seed) && bots.includes(r.bot);
  // Ranking needs every run's matches, so it never stops early.
  const ranked = !!rank;
  const have = () => (ranked ? -1 : rec.rows.filter(wanted).length);
  const cached = rec.rows.filter(wanted).length;
  let played = 0, error = null;
  if (have() < limit && runs.length) {
    try { setPriority(10); } catch { /* keep the default */ }
    const n = Math.max(1, Math.min(jobs ?? Math.max(1, Math.floor(cpus().length / 4)), runs.length));
    let next = 0;
    await Promise.all(Array.from({ length: n }, async () => {
      while (next < runs.length && have() < limit && !error) {
        const run = runs[next++];
        const r = await new Promise((res, rej) => {
          const w = new Worker(fileURLToPath(import.meta.url), { workerData: { ...run, weeks, where, then, within, setup, before, botJs, extra, turnWhile, dir, id, perRun, key, filter } });
          w.once('message', res); w.once('error', rej);
        }).catch((e) => ({ hits: [], error: e.message }));
        if (r.error) { error = r.error; return; }
        rec.rows.push(...r.hits);
        rec.ever[`${run.seed}:${run.bot}`] = r.everTrue;
        rec.started ??= {};
        rec.started[`${run.seed}:${run.bot}`] = r.started ?? 0;
        rec.dropped ??= {};
        rec.dropped[`${run.seed}:${run.bot}`] = r.dropped ?? 0;
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
  let rows = rec.rows.filter(wanted);
  if (ranked) {
    const score = new Function('m', `return (${rank});`);
    rows = rows.map((r) => ({ ...r, rank: Number(score(r)) })).sort((a, b) => b.rank - a.rank || a.seed - b.seed);
  }
  // For each `&&` part of the predicate, how many of the runs played (in this query's seeds and bots)
  // ever had it true.
  const inRange = Object.entries(rec.ever).filter(([k]) => { const [sd, b] = k.split(':'); return seeds.includes(Number(sd)) && bots.includes(b); });
  const parts = clausesOf(where);
  const clauses = parts.map((expr, i) => ({ expr, runsTrue: inRange.filter(([, v]) => v?.[i]).length }));
  const started = inRange.reduce((n, [k]) => n + (rec.started?.[k] ?? 0), 0);
  const dropped = inRange.reduce((n, [k]) => n + (rec.dropped?.[k] ?? 0), 0);
  return { rows: rows.slice(0, limit), played, cached, error, dir, runs: inRange.length, clauses, started, dropped };
}
