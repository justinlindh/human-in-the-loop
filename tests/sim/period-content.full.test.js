import { describe, expect, it } from 'vitest';
import { advice } from '../../src/sim/advisors.js';
import { runBot } from '../../src/sim/bots.js';
import { safe, visibleStrings } from './_period.js';

// Seeded play through each early era; the content pools themselves are audited in period-content.test.js.
describe('historical content boundaries in seeded play', () => {
  it.each(['classic', 'chatgbt', 'agents'])('respects AI and agent boundaries in a %s founding', (startEra) => {
    for (let seed = 1; seed <= 6; seed++) {
      let state;
      let seen = 0;
      const inspect = (events) => {
        for (const text of [...visibleStrings(events), ...visibleStrings(state.pendingDecision), ...visibleStrings(state.chatPrompts)]) {
          if (state.era.id === 'classic') expect(text).not.toMatch(/\b(AI|ChatGBT|LLMs?|copilots?|robots?|vibe.?cod\w*)\b/i);
          if (['classic', 'chatgbt'].includes(state.era.id)) expect(text).not.toMatch(/\b(agents?|agentic)\b/i);
          seen++;
        }
      };
      runBot('sensible', seed, null, { founding: { startEra, companyName: 'Period Software' }, setup: (s) => { state = s; },
        onEvents: inspect, onWeek: (s, events) => inspect(events), stopWhen: (s) => s.era.id !== startEra });
      expect(seen).toBeGreaterThan(0);
    }
  }, 120000);
  it.each(['preinternet', 'dotcom', 'web2'])('emits deterministic period-safe content across seeded %s play', (startEra) => {
    const trace = (seed) => {
      const seen = [];
      let state;
      const inspect = (events) => {
        if (!['preinternet', 'dotcom', 'web2'].includes(state.era.id)) return;
        for (const e of events) for (const text of visibleStrings(e)) {
          if (state.era.id === 'dotcom') expect(text).not.toMatch(/wi-?fi/i);
          safe(text, `${startEra} seed ${seed} week ${state.week}`); seen.push(text);
        }
        for (const text of visibleStrings(state.pendingDecision)) safe(text, 'pending decision');
        for (const text of visibleStrings(state.chatPrompts)) safe(text, 'reply prompt');
        safe(JSON.stringify(advice(state)), 'advisor');
      };
      runBot('sensible', seed, null, { founding: { startEra, companyName: 'Period Software' }, setup: (s) => { state = s; },
        onEvents: inspect, onWeek: (s, ev) => inspect(ev), stopWhen: (s) => s.era.id === 'classic' });
      return seen;
    };
    for (let seed = 1; seed <= 12; seed++) {
      const a = trace(seed); expect(a.length).toBeGreaterThan(0); expect(trace(seed)).toEqual(a);
    }
  }, 120000);
});
