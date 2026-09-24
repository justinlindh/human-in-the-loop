import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { eraAllowsText, NEEDS_PROGRESS } from '../../src/sim/eras.js';
import { classicGame, addProduct } from './helpers.js';

// Words that assume the company has launched something people use.
const PROGRESS = /\b(customers?|launched|shipped|reviews?|on-?call|users|revenue)\b/i;

// Everything people say or post, with where it came from.
function peopleLines(events) {
  const out = [];
  for (const e of events) {
    if (e.type === 'say') out.push(['say', e.text]);
    if (e.type === 'chat' && e.fromId) out.push([`chat #${e.channel}`, e.text]);
    if (e.type === 'standup') for (const l of e.lines) if (l.text) out.push(['standup', l.text]);
  }
  return out;
}

describe('issue #14: nobody talks about progress that has not happened', () => {
  it('before the first launch, no line from anyone assumes customers, reviews, or a shipped product', () => {
    const hits = [];
    let scanned = 0;
    for (const [name, founders] of [['sensible', undefined], ['balanced', undefined], ['recklessHumans', undefined], ['sensible', ['hustler', 'seller']]]) {
      for (const seed of [1, 2, 3, 4, 5]) {
        let state = null;
        const check = (events) => {
          if (!state || state.stats.launches > 0) return;
          for (const [where, text] of peopleLines(events)) {
            scanned++;
            if (PROGRESS.test(text)) hits.push(`${name}/${seed} week ${state.week} ${where}: ${text}`);
          }
        };
        runBot(name, seed, 60, {
          founding: founders ? { founders } : {},
          setup: (s) => { state = s; },
          onEvents: (events) => check(events),
          onWeek: (s, events) => check(events),
        });
      }
    }
    expect(scanned).toBeGreaterThan(300);
    expect(hits.slice(0, 20)).toEqual([]);
  }, 300000);

  it('the gate reads the state: progress lines need a launch, office lines need people in the office', () => {
    const s = classicGame();
    const line = 'The customer said "wow". Out loud. On a call.';
    expect(eraAllowsText(s, line)).toBe(false);
    addProduct(s, { model: null, angle: 'web' });
    s.stats.launches = 1;
    expect(eraAllowsText(s, line)).toBe(true);
    expect(eraAllowsText(s, 'Who brought donuts?')).toBe(true);
    for (const p of s.staff) p.remote = true;
    expect(eraAllowsText(s, 'Who brought donuts?')).toBe(false);
    expect(NEEDS_PROGRESS.length).toBeGreaterThanOrEqual(3);
  });
});
