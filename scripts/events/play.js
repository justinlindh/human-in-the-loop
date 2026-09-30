// Discover snapshot checkpoints, then replay the deterministic game to serialize only those states.
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { botDecide, botTurn } from '../../src/sim/bots.js';
import { createGame } from '../../src/sim/state.js';
import { tick } from '../../src/sim/tick.js';
import { EVENTS } from '../../src/data/events.js';
import { MOMENT_CAPTIONS } from '../../src/data/moments.js';

const KEEP = new Set(['era', 'officeUpgrade', 'incident', 'launch', 'award', 'resign', 'unlock', 'goal', 'hire', 'gameOver']);
const SNAP = new Set(['era', 'officeUpgrade']);
const SNAP_PER_ID = 2;

// Workers reuse this module across runs; simulation results must depend only on each game's state.
export function play({ bot, seed, weeks, dir, profile = false }) {
  const started = performance.now();
  const ms = { sim: 0, extraction: 0, serialization: 0, compression: 0, io: 0 };
  const timed = profile ? (phase, fn) => {
    const t = performance.now(), extraction = ms.extraction;
    const result = fn();
    ms[phase] += performance.now() - t - (phase === 'sim' ? ms.extraction - extraction : 0);
    return result;
  } : (_phase, fn) => fn();
  const s = createGame({ seed, companyName: `Bot ${bot}` });
  const rows = [], checkpoints = new Map();
  const base = () => ({ seed, bot, week: s.week, era: s.era?.id ?? null, stage: s.officeStage, staff: s.staff.length, props: (s.office?.props ?? []).map((p) => p.prop) });
  const taken = new Map();
  let turn = 0, open = null;
  const snap = (tag, at, week = s.week) => {
    const name = `${seed}-${bot}-w${week}-${tag}.json.gz`;
    if (!checkpoints.has(at)) checkpoints.set(at, []);
    checkpoints.get(at).push(name);
    return name;
  };
  const collect = (events) => timed('extraction', () => {
    for (const e of events ?? []) {
      if (e.type === 'decisionResolved' && open && open.id === e.eventId) open.choice = e.choice ?? null;
      else if (KEEP.has(e.type)) rows.push({ ...base(), type: e.type, id: e.eraId ?? e.eventId ?? e.kind ?? e.type });
      else if (e.type === 'celebrate' && !e.staffId) rows.push({ ...base(), type: 'party', id: e.cause ?? 'party' });
    }
  });
  while (!s.gameOver && s.week < weeks) {
    timed('extraction', () => {
      if (s.pendingDecision) {
        const d = s.pendingDecision;
        open = { ...base(), type: 'decision', id: d.eventId, subject: d.subjectId ?? null, stageProp: d.stage?.prop ?? null, choice: null };
        const n = taken.get(d.eventId) ?? 0;
        if ((EVENTS[d.eventId]?.stage || MOMENT_CAPTIONS[d.eventId]) && n < SNAP_PER_ID) {
          open.snapshot = snap(d.eventId, turn * 2);
          if (turn) open.preTick = snap(`${d.eventId}-pre`, turn * 2 - 1, s.week - 1);
          taken.set(d.eventId, n + 1);
        }
        rows.push(open);
      }
    });
    timed('sim', () => botDecide(bot, s, { onEvents: collect }));
    open = null;
    if (s.gameOver) break;
    const n = rows.length;
    timed('sim', () => botTurn(bot, s, { onEvents: collect }));
    collect(timed('sim', () => tick(s)));
    timed('extraction', () => {
      for (let i = n; i < rows.length; i++) {
        const r = rows[i];
        if (SNAP.has(r.type) && !r.snapshot) {
          r.week = s.week - 1;
          r.snapshot = snap(r.type, turn * 2, r.week);
        }
      }
    });
    turn++;
  }
  const replay = createGame({ seed, companyName: `Bot ${bot}` });
  const save = (at) => {
    const names = checkpoints.get(at);
    if (!names) return;
    const json = timed('serialization', () => JSON.stringify(replay));
    const gz = timed('compression', () => gzipSync(json));
    timed('io', () => { for (const name of names) writeFileSync(join(dir, 'snapshots', name), gz); });
    checkpoints.delete(at);
  };
  // Checkpoint numbers distinguish the state before the bot from the state just before its tick.
  for (let i = 0; checkpoints.size; i++) {
    if (replay.gameOver || replay.week >= weeks) throw new Error(`snapshot replay ended early: ${bot} seed ${seed}`);
    save(i * 2);
    if (!checkpoints.size) break;
    timed('sim', () => botDecide(bot, replay));
    if (replay.gameOver) throw new Error(`snapshot replay ended in a decision: ${bot} seed ${seed}`);
    timed('sim', () => botTurn(bot, replay));
    save(i * 2 + 1);
    if (checkpoints.size) timed('sim', () => tick(replay));
  }
  return { rows, ...(profile ? { profile: { bot, seed, weeks: s.week, ...ms, total: performance.now() - started } } : {}) };
}
