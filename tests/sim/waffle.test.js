import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { incentivesSystem, GENRES, stageIncentive } from '../../src/sim/incentives.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { game, addStaff, addDesks } from './helpers.js';

const run = (s) => { const c = makeCtx(s); incentivesSystem(c); return c.events; };

function program(seed = 7) {
  const s = game(seed);
  addDesks(s, 6);
  for (let i = 0; i < 8; i++) addStaff(s, 'engineer', 'mid');
  s.policies.incentives = true;
  s.purpose = { value: 60, mission: 'people', tests: [] };
  return s;
}

describe('music night', () => {
  it('asks the winner for a genre, then stages a dance break with 3 to 5 others', () => {
    const s = program();
    s.flags.incentiveCount = 4;
    s.flags.incentiveWeek = s.week - B.incentiveEveryWeeks;
    const ev = run(s);
    expect(ev.some((e) => e.type === 'incentive')).toBe(false);
    expect(s.pendingDecision?.eventId).toBe('music_night_genre');
    const winner = s.pendingDecision.subjectId;
    expect(s.pendingDecision.text).toContain(s.staff.find((p) => p.id === winner).name.split(' ')[0]);
    const labels = EVENTS.music_night_genre.choices.map((c) => c.label);
    expect(labels).toEqual(['Corporate Synthwave', 'Motivational Polka', 'Aggressive Bossa Nova', 'Sad Lo-fi']);
    const res = dispatch(s, { type: 'resolveDecision', choice: 2 });
    const inc = res.events.find((e) => e.type === 'incentive');
    expect(inc).toMatchObject({ staffId: winner, reward: 'music_night', genre: 'aggressive_bossa_nova' });
    expect(inc.dancers[0]).toBe(winner);
    expect(inc.dancers.length).toBeGreaterThanOrEqual(4);
    expect(inc.dancers.length).toBeLessThanOrEqual(6);
    expect(new Set(inc.dancers).size).toBe(inc.dancers.length);
    for (const id of inc.dancers) expect(s.staff.some((p) => p.id === id && p.mood !== 'away')).toBe(true);
    expect(Object.keys(GENRES)).toContain(inc.genre);
  });
});

describe('the Waffle Party', () => {
  it('is earned by a twentieth shipped launch or the top level, once per person, with a cooldown', () => {
    const s = program(8);
    s.flags.incentiveWeek = s.week;
    const [a, b, c] = s.staff.filter((p) => !p.founder);
    s.flags.shippedBy = { [a.id]: B.waffleLaunches };
    let ev = run(s);
    const party = ev.find((e) => e.type === 'incentive');
    expect(party).toMatchObject({ staffId: a.id, reward: 'waffle_party', milestone: 'launches', count: B.waffleLaunches });
    expect(ev.find((e) => e.type === 'chat' && e.channel === 'wins').text).toMatch(/just shipped their twentieth launch\. Waffles have been authorised\.$/);
    b.level = B.waffleLevel;
    s.week += 10;
    s.flags.incentiveWeek = s.week;
    expect(run(s).some((e) => e.reward === 'waffle_party')).toBe(false);
    s.week += B.waffleCooldownWeeks;
    s.flags.incentiveWeek = s.week;
    ev = run(s);
    expect(ev.find((e) => e.type === 'incentive')).toMatchObject({ staffId: b.id, milestone: 'level', count: B.waffleLevel });
    s.week += B.waffleCooldownWeeks;
    s.flags.incentiveWeek = s.week;
    s.flags.shippedBy[c.id] = 1;
    expect(run(s).some((e) => e.reward === 'waffle_party')).toBe(false);
  });

  it('shipping a launch credits everyone on the team', async () => {
    const s = game(9);
    s.cash = 1e6;
    const p = addStaff(s, 'engineer', 'senior');
    const r = dispatch(s, { type: 'startProject', kind: 'new', category: s.market.unlockedCategories[0], angle: 'web', model: null, size: 'small', name: 'Shipit' });
    dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: r.projectId } });
    const { tick } = await import('../../src/sim/index.js');
    for (let i = 0; i < 200 && s.projects.some((j) => j.id === r.projectId); i++) { tick(s); s.pendingDecision = null; }
    expect(s.flags.shippedBy[p.id]).toBe(1);
  });
});

describe('stageIncentive (dev and capture)', () => {
  it('stages music night or the Waffle Party on the next tick', async () => {
    const { tick } = await import('../../src/sim/index.js');
    const s = program(10);
    s.policies = {};
    stageIncentive(s, 'music_night');
    tick(s);
    expect(s.pendingDecision?.eventId).toBe('music_night_genre');
    const t = program(11);
    const id = stageIncentive(t, 'waffle_party');
    const ev = tick(t);
    expect(ev.find((e) => e.type === 'incentive')).toMatchObject({ staffId: id, reward: 'waffle_party', milestone: 'launches' });
  });
});

describe('capture findings', () => {
  it('music night grants its glow only once the genre is picked', () => {
    const s = program(12);
    s.flags.incentiveCount = 4;
    s.flags.incentiveWeek = s.week - B.incentiveEveryWeeks;
    run(s);
    expect(s.pendingDecision?.eventId).toBe('music_night_genre');
    expect(s.modifiers.some((m) => m.source === 'incentives')).toBe(false);
    dispatch(s, { type: 'resolveDecision', choice: 0 });
    expect(s.modifiers.some((m) => m.source === 'incentives' && /music night/.test(m.label))).toBe(true);
  });

  it('after a Waffle Party, staged or earned, the ladder waits a full round', async () => {
    const { tick } = await import('../../src/sim/index.js');
    const s = program(13);
    s.policies = {};
    stageIncentive(s, 'waffle_party');
    const rewards = [];
    for (let w = 0; w <= B.incentiveEveryWeeks; w++) {
      for (const e of tick(s)) if (e.type === 'incentive') rewards.push([w, e.reward]);
      s.pendingDecision = null;
    }
    expect(rewards[0]).toEqual([0, 'waffle_party']);
    expect(rewards.slice(1).every(([w]) => w >= B.incentiveEveryWeeks)).toBe(true);
  });
});
