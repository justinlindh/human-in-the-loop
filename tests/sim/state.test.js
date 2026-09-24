import { describe, it, expect } from 'vitest';
import { createGame, tick, dispatch, FUNCTIONS, SAVE_VERSION, dateOf } from '../../src/sim/index.js';
import { B } from '../../src/sim/balance.js';

const STATE_KEYS = [
  'version', 'seed', 'rng', 'companyName', 'week', 'nextId', 'cash', 'brand', 'institutionalKnowledge',
  'comprehensionDebt', 'officeStage', 'staff', 'candidates', 'candidatesWeek', 'projects', 'products',
  'automation', 'policies', 'campaigns', 'security', 'ops', 'market', 'models', 'office', 'founding', 'research', 'modifiers', 'scheduled', 'chatLog', 'discoveredCombos', 'outage',
  'incidentLog', 'lowCashWeeks', 'pendingDecision', 'flags', 'stats', 'history', 'gameOver',
  'era', 'eraSchedule', 'unlocks', 'goals',
];

const game = (seed = 1) => createGame({ seed, companyName: 'Loopworks' });
import { advance } from './helpers.js';

const run = (s, n) => advance(s, n, tick, dispatch);

describe('game state', () => {
  it('a fresh game has the starting shape', () => {
    const s = game();
    expect(Object.keys(s).sort()).toEqual([...STATE_KEYS].sort());
    expect(s.week).toBe(0);
    expect(s.officeStage).toBe(0);
    expect(s.staff.length).toBe(2);
    expect(s.staff.every((p) => p.founder)).toBe(true);
    expect(s.staff.map((p) => `${p.role}:${p.seniority}`).sort()).toEqual(['designer:mid', 'engineer:senior']);
    expect(s.staff.every((p) => p.assignment.type === 'idle')).toBe(true);
    expect(s.cash).toBe(B.funding.bootstrapped.cash);
    expect(s.cash).toBeGreaterThan(0);
    expect(s.brand).toBe(B.startBrand);
    expect(s.version).toBe(SAVE_VERSION);
    expect(Object.keys(s.automation)).toEqual(FUNCTIONS);
    expect(Object.values(s.automation).every((a) => a.level === 0 && a.model === 'chatgbt')).toBe(true);
    expect(s.candidates.length).toBe(B.candidateCount);
    expect(s.market.trend).toBe('steady');
    expect(s.market.unlockedCategories).toEqual(['notes', 'email', 'pm', 'support']);
    expect(Object.values(s.models).some((m) => m.available)).toBe(false);
    expect(s.era).toEqual({ id: 'classic', since: 0 });
    expect(s.unlocks).toEqual({});
    expect(Object.values(s.goals).every((g) => g.done === false && g.week === null)).toBe(true);
    expect(s.market.categories.crm.incumbentStrength).toBe(650);
    expect(s.office).toEqual({ stage: 0, placed: [] });
    expect(s.founding).toEqual({ founders: ['engineer', 'designer'], funding: 'bootstrapped', logoColor: '#ffb020', tagline: '' });
    expect(s.research).toEqual({ done: [] });
    expect(s.modifiers).toEqual([]);
    expect(s.scheduled).toEqual([]);
  });

  it('founders never share a first name', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const [a, b] = game(seed).staff;
      expect(a.name.split(' ')[0], `seed ${seed}`).not.toBe(b.name.split(' ')[0]);
    }
  });

  it('only the economy counts down the GPU shortage', () => {
    const s = game();
    s.flags.gpuShortageWeeks = 5;
    tick(s);
    expect(s.flags.gpuShortageWeeks).toBe(4);
  });

  it('is JSON-safe', () => {
    const s = game();
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
  });

  it('same seed plus 20 ticks gives identical JSON', () => {
    expect(JSON.stringify(run(game(5), 20))).toBe(JSON.stringify(run(game(5), 20)));
  });

  it('different seeds give different games', () => {
    expect(JSON.stringify(game(1).candidates)).not.toBe(JSON.stringify(game(2).candidates));
  });

  it('tick increments week', () => {
    const s = game();
    tick(s);
    expect(s.week).toBe(1);
  });

  it('tick is a no-op with a pending decision or game over', () => {
    const s = game();
    s.pendingDecision = { eventId: 'x', title: 't', text: 't', subjectId: null, choices: [] };
    let before = JSON.stringify(s);
    expect(tick(s)).toEqual([]);
    expect(JSON.stringify(s)).toBe(before);
    s.pendingDecision = null;
    s.gameOver = { won: false, reason: 'runway', score: 0, epilogue: [] };
    before = JSON.stringify(s);
    expect(tick(s)).toEqual([]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('unknown action fails without touching state', () => {
    const s = game();
    const before = JSON.stringify(s);
    const res = dispatch(s, { type: 'launchIntoSun' });
    expect(res.ok).toBe(false);
    expect(typeof res.reason).toBe('string');
    expect(res.events).toEqual([]);
    expect(JSON.stringify(s)).toBe(before);
  });

  it('JSON round trip then tick matches ticking the original', () => {
    const a = run(game(9), 5);
    const b = JSON.parse(JSON.stringify(a));
    run(a, 10);
    run(b, 10);
    expect(JSON.stringify(b)).toBe(JSON.stringify(a));
  });

  it('dateOf is exported from the public API', () => {
    expect(dateOf(0).year).toBe(2019);
  });
});
