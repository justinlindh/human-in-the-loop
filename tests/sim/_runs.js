// One full bot run per (bot, seed), shared by every test in a file that reads it. Vitest gives each test
// file its own modules, so the tests that share runs live together in full-runs.test.js.
import { runBot, assertFinite } from '../../src/sim/bots.js';
import { capacity } from '../../src/sim/staff.js';
import { B } from '../../src/sim/balance.js';
import { TRAITS } from '../../src/data/traits.js';
import { ITEMS } from '../../src/data/items.js';
import { GOALS } from '../../src/data/goals.js';
import { UNLOCKS_BY_KEY } from '../../src/data/unlocks.js';
import { TRENDS } from '../../src/data/trends.js';
import { isAiText } from '../../src/sim/eras.js';

// The words a Classic-era player must never see. isAiText covers these and more (automation, bots, prompts).
const TERMS = /\b(AI|models?|agents?|agentic|LLMs?|prompts?|GPT|ChatGBT|Claudius|Gemenai|Grokk|Llamarama|DeepSleep|Mistrale)\b/;
export const leaks = (text) => TERMS.test(text) || isAiText(text);

// Every player-facing string the sim has put in state so far.
export function stateStrings(s) {
  const out = [];
  for (const p of s.products) for (const r of p.reviews) out.push(['review', r.quote]);
  for (const p of [...s.staff, ...s.candidates]) for (const t of p.traits) out.push(['trait', `${TRAITS[t].name}: ${TRAITS[t].desc}`]);
  for (const m of s.chatLog) out.push(['chatLog', m.text]);
  const d = s.pendingDecision;
  if (d) out.push(['decision', [d.title, d.text, ...d.choices.flatMap((c) => [c.label, c.hint, c.reason ?? ''])].join(' | ')]);
  for (const line of s.gameOver?.epilogue ?? []) out.push(['epilogue', line]);
  for (const g of GOALS) if (s.goals[g.id]?.done) out.push(['goal', `${g.name}: ${g.desc}`]);
  for (const it of s.office.placed) out.push(['item', `${ITEMS[it.itemId].name}: ${ITEMS[it.itemId].desc}`]);
  for (const k of Object.keys(s.unlocks)) if (UNLOCKS_BY_KEY[k]) out.push(['unlock', UNLOCKS_BY_KEY[k].explainer]);
  const t = TRENDS[s.market.trend];
  out.push(['trend', `${t.name}: ${t.text}`]);
  return out;
}

// Every player-facing string in a batch of events.
export function eventStrings(events) {
  const out = [];
  for (const e of events) {
    if (typeof e.text === 'string') out.push([e.type, e.text]);
    if (e.type === 'standup') for (const l of e.lines) out.push(['standup', l.text]);
  }
  return out;
}

const cache = new Map();

// What the full-run tests read from a run: invariant violations, everything readable in the Classic era,
// resignations week by week, and the state at the weeks other tests stop at (780 and 800).
export function fullRun(name, seed) {
  const key = `${name}/${seed}`;
  if (cache.has(key)) return cache.get(key);
  const rec = { violations: [], classic: [], resignsByWeek: [], at: {} };
  let state = null;
  let classic = true;
  const snapshot = (s) => ({ week: s.week, resignations: s.stats.resignations, beats: { ...(s.flags.beats ?? {}) }, agents: s.eraSchedule.agents });
  const result = runBot(name, seed, B.runWeeks, {
    setup: (s) => { state = s; },
    onEvents: (events) => { if (classic && state.era.id === 'classic') rec.classic.push(...eventStrings(events).map(([w, t]) => [w, String(t ?? '').replaceAll(state.companyName, 'the company'), state.week])); },
    onWeek: (s, events) => {
      try { assertFinite(s); } catch (e) { rec.violations.push(`${name}/${seed}: ${e.message}`); }
      if (s.staff.length > capacity(s)) rec.violations.push(`${name}/${seed}: ${s.staff.length} staff over capacity at week ${s.week}`);
      if (s.history.length > B.maxHistory) rec.violations.push('history over cap');
      if (classic) {
        if (s.era.id !== 'classic') classic = false;
        else rec.classic.push(...[...eventStrings(events), ...stateStrings(s)].map(([w, t]) => [w, String(t ?? '').replaceAll(s.companyName, 'the company'), s.week]));
      }
      rec.resignsByWeek.push(events.filter((e) => e.type === 'resign' && !e.fired).length);
      for (const w of [780, 800]) if (s.week === w) rec.at[w] = snapshot(s);
    },
  });
  // A run that ended early reads its final state at the later stop weeks.
  for (const w of [780, 800]) rec.at[w] ??= snapshot(state);
  rec.result = { reason: result.reason, weeks: result.weeks, resignations: result.resignations };
  cache.set(key, Object.freeze(rec));
  return rec;
}
