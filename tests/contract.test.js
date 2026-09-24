import { describe, it, expect } from 'vitest';
import { createMockSim, MOCK_SCENARIOS } from '../src/dev/mockSim.js';
import { EVENT_TYPES, ASSIGNMENT_TYPES, CHAT_CHANNELS } from '../src/contract/events.js';

const STATE_KEYS = [
  'version', 'seed', 'rng', 'companyName', 'week', 'nextId', 'cash', 'brand', 'institutionalKnowledge',
  'comprehensionDebt', 'officeStage', 'staff', 'candidates', 'candidatesWeek', 'projects', 'products',
  'automation', 'policies', 'office', 'era', 'eraSchedule', 'unlocks', 'goals', 'founding', 'research', 'modifiers', 'scheduled', 'campaigns', 'security', 'ops', 'market', 'models', 'discoveredCombos', 'outage',
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

  it('chat events carry channel, ids, and reactions', () => {
    const m = createMockSim({ scenario: 'floor' });
    const chats = [];
    for (let i = 0; i < 30; i++) {
      if (m.state.pendingDecision) m.dispatch({ type: 'resolveDecision', choice: 0 });
      chats.push(...m.tick().filter((e) => e.type === 'chat'));
    }
    const channels = new Set(chats.map((c) => c.channel));
    for (const ch of CHAT_CHANNELS) expect(channels.has(ch), ch).toBe(true);
    for (const c of chats) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.reactions).toBe('object');
      if (c.replyTo) expect(chats.some((x) => x.id === c.replyTo)).toBe(true);
    }
  });

  it('say events are spoken by present staff, answer earlier says, and stay out of chatLog', () => {
    const m = createMockSim({ scenario: 'floor' });
    const says = [];
    for (let i = 0; i < 30; i++) {
      if (m.state.pendingDecision) m.dispatch({ type: 'resolveDecision', choice: 0 });
      const said = m.tick().filter((e) => e.type === 'say');
      for (const e of said) expect(m.state.staff.find((p) => p.id === e.staffId)?.mood, e.staffId).not.toBe('away');
      says.push(...said);
    }
    expect(says.some((e) => e.replyTo)).toBe(true);
    for (const e of says) {
      expect(typeof e.id).toBe('string');
      if (e.replyTo) expect(says.findIndex((x) => x.id === e.replyTo)).toBeLessThan(says.indexOf(e));
      if (e.toId) expect(e.toId).not.toBe(e.staffId);
    }
    expect((m.state.chatLog ?? []).some((c) => c.type === 'say')).toBe(false);
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

describe('mock sim placement', () => {
  const garage = () => createMockSim({ scenario: 'garage' });

  it('every scenario starts with a valid layout and a desk per person', () => {
    for (const scenario of MOCK_SCENARIOS) {
      const m = createMockSim({ scenario });
      const placed = m.state.office.placed;
      expect(placed.filter((o) => o.itemId === 'desk').length, scenario).toBeGreaterThanOrEqual(m.state.staff.length);
      // Moving an item onto its own spot re-validates it against everything else.
      for (const o of placed) expect(m.dispatch({ type: 'moveItem', id: o.id, x: o.x, y: o.y, rot: o.rot }).reason, `${scenario} ${o.id} ${o.itemId}`).toBeUndefined();
    }
  });

  it('places, moves, upgrades, and sells on office.placed', () => {
    const m = garage();
    const cash = m.state.cash;
    const res = m.dispatch({ type: 'placeItem', itemId: 'plant', x: 7, y: 5, rot: 0 });
    expect(res.ok, res.reason).toBe(true);
    expect(m.state.cash).toBe(cash - 150);
    const it = m.state.office.placed.find((o) => o.id === res.id);
    expect(it).toMatchObject({ itemId: 'plant', x: 7, y: 5, level: 1 });
    expect(m.dispatch({ type: 'moveItem', id: res.id, x: 6, y: 5, rot: 1 }).ok).toBe(true);
    expect(it).toMatchObject({ x: 6, y: 5, rot: 1 });
    expect(m.dispatch({ type: 'upgradeItem', id: res.id }).reason).toBe('Already max level');
    expect(m.dispatch({ type: 'sellItem', id: res.id }).ok).toBe(true);
    expect(m.state.office.placed.some((o) => o.id === res.id)).toBe(false);
    expect(m.state.cash).toBe(cash - 150 + 75);
    walkFinite(JSON.parse(JSON.stringify(m.state)));
  });

  it('rejects bad placements with the contract reasons and leaves state unchanged', () => {
    const m = garage();
    const before = JSON.stringify(m.state);
    expect(m.dispatch({ type: 'placeItem', itemId: 'plant', x: 9, y: 0, rot: 0 }).reason).toBe('Out of bounds');
    expect(m.dispatch({ type: 'placeItem', itemId: 'plant', x: 8, y: 0, rot: 0 }).reason).toBe('Blocked');
    expect(m.dispatch({ type: 'placeItem', itemId: 'plant', x: 4, y: 6, rot: 0 }).reason).toBe('Blocked');
    const desk = m.state.office.placed.find((o) => o.itemId === 'desk');
    expect(m.dispatch({ type: 'placeItem', itemId: 'plant', x: desk.x, y: desk.y, rot: 0 }).reason).toBe('Blocked');
    expect(JSON.stringify(m.state)).toBe(before);
  });

  it('refuses a placement that walls a desk off from the door', () => {
    const m = garage();
    const desk = m.state.office.placed.find((o) => o.itemId === 'desk');
    const ring = [[desk.x - 1, desk.y], [desk.x + 1, desk.y], [desk.x - 1, desk.y + 1], [desk.x + 1, desk.y + 1], [desk.x, desk.y - 1], [desk.x, desk.y + 2]];
    const results = ring.map(([x, y]) => m.dispatch({ type: 'placeItem', itemId: 'plant', x, y, rot: 0 }));
    expect(results.at(-1).reason).toBe('Would block the path to a desk');
  });
});
