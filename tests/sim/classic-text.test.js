import { describe, it, expect } from 'vitest';
import { runBot, BOTS } from '../../src/sim/bots.js';
import { isAiText } from '../../src/sim/eras.js';
import { TRAITS } from '../../src/data/traits.js';
import { ITEMS } from '../../src/data/items.js';
import { GOALS } from '../../src/data/goals.js';
import { UNLOCKS_BY_KEY } from '../../src/data/unlocks.js';
import { TRENDS } from '../../src/data/trends.js';

// The words a Classic-era player must never see. isAiText covers these and more (automation, bots, prompts).
const TERMS = /\b(AI|models?|agents?|agentic|LLMs?|prompts?|GPT|ChatGBT|Claudius|Gemenai|Grokk|Llamarama|DeepSleep|Mistrale)\b/;
const leaks = (text) => TERMS.test(text) || isAiText(text);

// Every player-facing string the sim has put in state or events so far.
function stateStrings(s) {
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

function eventStrings(events) {
  const out = [];
  for (const e of events) {
    if (typeof e.text === 'string') out.push([e.type, e.text]);
    if (e.type === 'standup') for (const l of e.lines) out.push(['standup', l.text]);
  }
  return out;
}

describe('issue #10: no AI talk before the ChatGBT moment', () => {
  it('every bot, several seeds: nothing a player can read in Classic mentions AI', () => {
    const hits = [];
    let scanned = 0;
    for (const name of Object.keys(BOTS)) {
      for (const seed of [1, 2, 3, 4]) {
        let stop = false;
        const check = (s, strings) => {
          for (const [where, raw] of strings) {
            const text = String(raw ?? '').replaceAll(s.companyName, 'the company');
            scanned++;
            if (leaks(text)) hits.push(`${name}/${seed} week ${s.week} ${where}: ${text}`);
          }
        };
        let state = null;
        runBot(name, seed, 400, {
          setup: (s) => { state = s; },
          onEvents: (events) => { if (!stop && state.era.id === 'classic') check(state, eventStrings(events)); },
          onWeek: (s, events) => {
            if (stop) return;
            if (s.era.id !== 'classic') { stop = true; return; }
            check(s, eventStrings(events));
            check(s, stateStrings(s));
          },
        });
      }
    }
    expect(scanned).toBeGreaterThan(50000);
    expect(hits.slice(0, 20)).toEqual([]);
  }, 300000);

  it('the scanner itself catches the obvious cases and ignores ordinary words', () => {
    for (const bad of ['The AI is fine.', 'Our agent rewrote pricing', 'a new model', 'prompt engineering', 'GPT wrapper', 'Claudius is down']) expect(leaks(bad), bad).toBe(true);
    for (const ok of ['Aiko shipped it', 'Maida fixed the build', 'Pairing today was fun', 'The office plant is thriving', 'Main street']) expect(leaks(ok), ok).toBe(false);
  });
});
