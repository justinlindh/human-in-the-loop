import { describe, it, expect } from 'vitest';
import { createMockSim, MOCK_SCENARIOS } from '../src/dev/mockSim.js';
import { EVENT_TYPES, ASSIGNMENT_TYPES } from '../src/contract/events.js';

const STATE_KEYS = [
  'version', 'seed', 'rng', 'companyName', 'week', 'nextId', 'cash', 'brand', 'institutionalKnowledge',
  'comprehensionDebt', 'officeStage', 'staff', 'candidates', 'candidatesWeek', 'projects', 'products',
  'automation', 'policies', 'campaigns', 'security', 'ops', 'market', 'models', 'discoveredCombos', 'outage',
  'incidentLog', 'lowCashWeeks', 'pendingDecision', 'flags', 'stats', 'history', 'gameOver',
];

const walkFinite = (v, path = 'state') => {
  if (typeof v === 'number') expect(Number.isFinite(v), path).toBe(true);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walkFinite(x, `${path}.${k}`);
};

describe('mock sim honors the contract', () => {
  for (const scenario of MOCK_SCENARIOS) {
    it(`${scenario}: has every state key, JSON-safe and finite`, () => {
      const m = createMockSim({ scenario });
      expect(Object.keys(m.state).sort()).toEqual([...STATE_KEYS].sort());
      walkFinite(JSON.parse(JSON.stringify(m.state)));
      for (const p of m.state.staff) expect(ASSIGNMENT_TYPES).toContain(p.assignment.type);
    });
  }

  it('emits every event type except gameOver within 60 floor ticks', () => {
    const m = createMockSim({ scenario: 'floor' });
    const seen = new Set();
    for (let i = 0; i < 60; i++) {
      if (m.state.pendingDecision) m.dispatch({ type: 'resolveDecision', choice: 0 });
      for (const e of m.tick()) seen.add(e.type);
    }
    for (const t of EVENT_TYPES.filter((t) => t !== 'gameOver')) expect(seen.has(t), t).toBe(true);
  });

  it('ending scenario emits gameOver once', () => {
    const m = createMockSim({ scenario: 'ending' });
    expect(m.tick().map((e) => e.type)).toEqual(['gameOver']);
    expect(m.tick()).toEqual([]);
  });

  it('hq scenario fits HQ capacity', () => {
    expect(createMockSim({ scenario: 'hq' }).state.staff.length).toBeLessThanOrEqual(30);
  });

  it('failed dispatch leaves state unchanged', () => {
    const m = createMockSim({ scenario: 'floor' });
    const before = JSON.stringify(m.state);
    expect(m.dispatch({ type: 'hire', candidateId: 'nope' }).ok).toBe(false);
    expect(JSON.stringify(m.state)).toBe(before);
  });
});
