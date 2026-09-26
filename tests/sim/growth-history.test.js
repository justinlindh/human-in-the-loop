import { describe, it, expect } from 'vitest';
import { dispatch, createGame } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { staffUpkeep } from '../../src/sim/staff.js';
import { progressRecords, recordGrowth } from '../../src/sim/progression.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { B } from '../../src/sim/balance.js';
import { game, addStaff, addDesks } from './helpers.js';

describe('issue #604: each person keeps a growth history', () => {
  it('founders and hires start with an empty history', () => {
    const s = createGame({ seed: 1 });
    for (const p of [...s.staff, ...s.candidates]) expect(p.growth).toEqual([]);
  });

  it('level-ups and a promotion are recorded with the same details as their events', () => {
    const s = game(2);
    addDesks(s, 4);
    const p = addStaff(s, 'engineer', 'junior', { level: B.promoteMidLevel - 1, xp: B.xpPerLevel * (B.promoteMidLevel - 1) });
    const ctx = makeCtx(s);
    staffUpkeep(ctx);
    const up = ctx.events.find((e) => e.type === 'levelUp' && e.staffId === p.id);
    expect(p.growth).toContainEqual({ week: s.week, kind: 'level', detail: { level: up.level, gains: up.gains } });
    expect(p.growth).toContainEqual({ week: s.week, kind: 'promoted', detail: { seniority: 'mid' } });
  });

  it('training and an earned trait are recorded, the training with its program', () => {
    const s = game(3);
    s.cash = 1e6;
    const p = addStaff(s, 'engineer', 'senior');
    p.skills.polish = 50;
    dispatch(s, { type: 'train', staffId: p.id, program: 'workshop', focus: 'polish' });
    expect(p.growth.at(-1)).toEqual({ week: s.week, kind: 'trained', detail: { skill: 'polish', gain: 3, program: 'workshop' } });
    p.traits = [];
    p.record.mentorWeeks = 100;
    progressRecords(makeCtx(s), p);
    expect(p.growth.at(-1)).toEqual({ week: s.week, kind: 'trait', detail: { traitId: 'natural_mentor', source: 'record' } });
  });

  it('level and training entries are capped, oldest first; milestones are kept for good', () => {
    const s = game(4);
    const p = addStaff(s, 'engineer', 'mid');
    recordGrowth(s, p, 'promoted', { seniority: 'mid' });
    for (let i = 0; i < B.growthHistoryMax + 7; i++) { s.week++; recordGrowth(s, p, i % 3 ? 'level' : 'trained', { level: i }); }
    recordGrowth(s, p, 'legend');
    const capped = p.growth.filter((e) => e.kind === 'level' || e.kind === 'trained');
    expect(capped).toHaveLength(B.growthHistoryMax);
    expect(capped[0].detail.level).toBe(7);
    expect(p.growth[0]).toMatchObject({ kind: 'promoted' });
    expect(p.growth.at(-1)).toMatchObject({ kind: 'legend' });
  });

  it('survives a save and load; older saves load with an empty history', () => {
    const s = game(5);
    const p = addStaff(s, 'engineer', 'mid');
    recordGrowth(s, p, 'promoted', { seniority: 'mid' });
    const m = new Map();
    const store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    saveGame(s, store);
    expect(loadGame(store).state.staff.find((x) => x.id === p.id).growth).toEqual(p.growth);
    for (const x of s.staff) delete x.growth;
    saveGame(s, store);
    for (const x of loadGame(store).state.staff) expect(x.growth).toEqual([]);
  });
});
