// Single-pass reference: capture the full state before each bot turn and each tick.
import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from '../../scripts/events/lib.js';

const KEEP = new Set(['era', 'officeUpgrade', 'incident', 'launch', 'award', 'resign', 'unlock', 'goal', 'hire', 'gameOver']);
const SNAP = new Set(['era', 'officeUpgrade']);
const SNAP_PER_ID = 2;
const SNAP_PER_OTHER = 1;

// Plays with the index's pacing switches pinned, as play.js does.
export async function referencePlay(opts) {
  const { withIndexPacing } = await import(pathToFileURL(join(ROOT, 'scripts/events/play.js')).href);
  return withIndexPacing(() => referencePinned(opts));
}

async function referencePinned({ bot, seed, weeks, dir }) {
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
  const prompts = [];
  const collect = (events, inTick = false) => {
    for (const e of events ?? []) {
      if (e.type === 'chatPrompt') {
        const p = s.chatPrompts.find((x) => x.id === e.promptId);
        if (p) { const row = { ...base(), week: p.week, type: 'chatPrompt', id: p.kind, prompt: p.id }; rows.push(row); prompts.push({ row, inTick }); }
        continue;
      }
      if (e.type === 'decisionResolved' && open && open.id === e.eventId) open.choice = e.choice ?? null;
      else if (KEEP.has(e.type)) rows.push({ ...base(), type: e.type, id: e.eraId ?? e.eventId ?? e.kind ?? e.type });
      // A company-wide celebrate is an office party (a new product, a moonshot, Product of the Year);
      // its id is the event's cause when it carries one.
      else if (e.type === 'celebrate' && !e.staffId) rows.push({ ...base(), type: 'party', id: e.cause ?? 'party' });
    }
  };
  while (!s.gameOver && s.week < weeks) {
    const before = JSON.stringify(s);
    if (s.pendingDecision) {
      const d = s.pendingDecision;
      open = { ...base(), type: 'decision', id: d.eventId, subject: d.subjectId ?? null, stageProp: d.stage?.prop ?? null, choice: null };
      const n = taken.get(d.eventId) ?? 0;
      if (n < ((EVENTS[d.eventId]?.stage || MOMENT_CAPTIONS[d.eventId]) ? SNAP_PER_ID : SNAP_PER_OTHER)) {
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
    collect(tick(s), true);
    // A chat prompt plays from the state before the step that posted it and shows open after it.
    for (const { row, inTick } of prompts.splice(0)) {
      const key = `prompt:${row.id}`, k = taken.get(key) ?? 0;
      if (k >= SNAP_PER_OTHER) continue;
      const tag = `prompt-${row.id}`;
      if (!inTick) {
        row.preTick = snap(`${tag}-pre`, before, row.week);
        row.snapshot = snap(tag, preTick, row.week);
      } else if (!s.gameOver && s.week < weeks) {
        row.preTick = snap(`${tag}-pre`, preTick, s.week - 1);
        row.snapshot = snap(tag, JSON.stringify(s), s.week);
      } else continue;
      taken.set(key, k + 1);
    }
    if (!s.pendingDecision) preTick = null;
    // An era change or an office move this week: snapshot the week before it, so it plays on load.
    for (const r of rows.slice(n)) if (SNAP.has(r.type) && !r.snapshot) { r.week = s.week - 1; r.snapshot = snap(r.type, before, r.week); }
  }
  return rows;
}


