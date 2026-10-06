// Discover snapshot checkpoints, then replay the deterministic game to serialize only those states.
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { botDecide, botTurn } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { createGame } from '../../src/sim/state.js';
import { tick } from '../../src/sim/tick.js';
import { EVENTS } from '../../src/data/events.js';
import { MOMENT_CAPTIONS } from '../../src/data/moments.js';

const KEEP = new Set(['era', 'officeUpgrade', 'incident', 'launch', 'award', 'resign', 'unlock', 'goal', 'hire', 'gameOver']);
const SNAP = new Set(['era', 'officeUpgrade']);
// Snapshots per id per run: a staged or captioned decision gets two, any other decision or chat
// prompt one, enough for a capture to open it.
const SNAP_PER_ID = 2;
const SNAP_PER_OTHER = 1;

// The pacing switches the index plays with off. With askRates, letterMail and quietEvents on, most events
// resolve without a decision card; with askQueue (and its askExpiry) on, a decision opens only when the
// game presents it, not on the tick that raises it. Either way the moments captures and sweeps open would
// never be indexed or never come. Anything that runs the game on
// from an index snapshot pins the same switches (pinIndexPacing in the page, withIndexPacing in Node).
export const INDEX_PACING = { askRates: false, letterMail: false, quietEvents: false, askQueue: false, askExpiry: false };

// Runs fn with B.pacing (the given balance object's, default the sim's) set to INDEX_PACING, then restores it.
export function withIndexPacing(fn, b = B) {
  const keep = { ...b.pacing };
  Object.assign(b.pacing, INDEX_PACING);
  const restore = () => { for (const k of Object.keys(INDEX_PACING)) b.pacing[k] = keep[k]; };
  let out;
  try { out = fn(); } catch (e) { restore(); throw e; }
  if (out && typeof out.then === 'function') return out.finally(restore);
  restore();
  return out;
}

// Pins INDEX_PACING in a browser page running the game (Playwright page), before it plays a snapshot.
export const pinIndexPacing = (page) => page.evaluate(async (v) => {
  const { B: b } = await import('/src/sim/balance.js');
  Object.assign(b.pacing, v);
}, INDEX_PACING);

// Workers reuse this module across runs; simulation results must depend only on each game's state.
// `stopped()` is checked each week of both passes; when it turns true the run returns early with
// `stopped: true`, so a worker is never terminated in the middle of a write.
export function play(opts, stopped = () => false) {
  return withIndexPacing(() => playPinned(opts, stopped));
}

function playPinned({ bot, seed, weeks, dir, profile = false }, stopped) {
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
  // A chat prompt posted in a tick plays from the state before that tick (checkpoint 2t+1) and shows
  // open after it (2t+2, while the game goes on); one posted during the bot's turn, from the state
  // before the turn (2t) and after it (2t+1).
  const prompts = [];
  const collect = (events, inTick = false) => timed('extraction', () => {
    for (const e of events ?? []) {
      if (e.type === 'chatPrompt') {
        const p = s.chatPrompts.find((x) => x.id === e.promptId);
        if (!p) continue;
        const row = { ...base(), week: p.week, type: 'chatPrompt', id: p.kind, prompt: p.id };
        rows.push(row);
        prompts.push({ row, inTick });
        continue;
      }
      if (e.type === 'decisionResolved' && open && open.id === e.eventId) open.choice = e.choice ?? null;
      else if (KEEP.has(e.type)) rows.push({ ...base(), type: e.type, id: e.eraId ?? e.eventId ?? e.kind ?? e.type });
      else if (e.type === 'celebrate' && !e.staffId) rows.push({ ...base(), type: 'party', id: e.cause ?? 'party' });
    }
  });
  while (!s.gameOver && s.week < weeks) {
    if (stopped()) return { rows, stopped: true };
    timed('extraction', () => {
      if (s.pendingDecision) {
        const d = s.pendingDecision;
        open = { ...base(), type: 'decision', id: d.eventId, subject: d.subjectId ?? null, stageProp: d.stage?.prop ?? null, choice: null };
        const n = taken.get(d.eventId) ?? 0;
        if (n < ((EVENTS[d.eventId]?.stage || MOMENT_CAPTIONS[d.eventId]) ? SNAP_PER_ID : SNAP_PER_OTHER)) {
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
    collect(timed('sim', () => tick(s)), true);
    timed('extraction', () => {
      for (const { row, inTick } of prompts.splice(0)) {
        const key = `prompt:${row.id}`, k = taken.get(key) ?? 0;
        if (k >= SNAP_PER_OTHER) continue;
        // Tagged apart from decisions: a prompt opened by an event shares the event's id.
        const tag = `prompt-${row.id}`;
        if (!inTick) {
          row.preTick = snap(`${tag}-pre`, turn * 2, row.week);
          row.snapshot = snap(tag, turn * 2 + 1, row.week);
        } else if (!s.gameOver && s.week < weeks) {
          row.preTick = snap(`${tag}-pre`, turn * 2 + 1, s.week - 1);
          row.snapshot = snap(tag, turn * 2 + 2, s.week);
        } else continue;
        taken.set(key, k + 1);
      }
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
    if (stopped()) return { rows, stopped: true };
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
