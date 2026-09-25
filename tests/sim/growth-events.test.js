import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { staffUpkeep } from '../../src/sim/staff.js';
import { progressRecords } from '../../src/sim/progression.js';
import { growthDigest } from '../../src/sim/chat.js';
import { B } from '../../src/sim/balance.js';
import { game, addStaff, addDesks } from './helpers.js';

// One week of staff upkeep for a company where the given people are about to level up.
function upkeep(s) {
  const ctx = makeCtx(s);
  staffUpkeep(ctx);
  return ctx;
}

describe('issue #549: growth events', () => {
  it('a level-up emits levelUp with the skill points it added', () => {
    const s = game(1);
    addDesks(s, 4);
    const p = addStaff(s, 'engineer', 'junior', { level: 2, xp: B.xpPerLevel * 2 });
    const before = { ...p.skills };
    const ctx = upkeep(s);
    const ev = ctx.events.filter((e) => e.type === 'levelUp' && e.staffId === p.id);
    expect(ev.length).toBeGreaterThanOrEqual(1);
    expect(ev[0].level).toBe(3);
    const summed = {};
    for (const e of ev) for (const [k, v] of Object.entries(e.gains)) summed[k] = (summed[k] ?? 0) + v;
    for (const [k, v] of Object.entries(summed)) expect(p.skills[k] - before[k], k).toBe(v);
    expect(Object.values(summed).every((v) => v > 0)).toBe(true);
  });

  it('crossing a promotion level emits promoted after the levelUp', () => {
    const s = game(2);
    addDesks(s, 4);
    const p = addStaff(s, 'engineer', 'junior', { level: B.promoteMidLevel - 1, xp: B.xpPerLevel * (B.promoteMidLevel - 1) });
    const ctx = upkeep(s);
    const types = ctx.events.filter((e) => e.staffId === p.id).map((e) => e.type);
    expect(ctx.events.find((e) => e.type === 'promoted')).toEqual({ type: 'promoted', staffId: p.id, seniority: 'mid' });
    expect(types.indexOf('levelUp')).toBeLessThan(types.indexOf('promoted'));
  });

  it('earning a trait from the record emits traitEarned', () => {
    const s = game(3);
    const p = addStaff(s, 'engineer', 'senior');
    p.traits = [];
    p.record.mentorWeeks = 100;
    const ctx = makeCtx(s);
    progressRecords(ctx, p);
    expect(ctx.events.find((e) => e.type === 'traitEarned')).toEqual({ type: 'traitEarned', staffId: p.id, traitId: 'natural_mentor', source: 'record' });
  });

  it('a workshop emits skillTrained with the real gain, capped at 100', () => {
    const s = game(4);
    s.cash = 1e6;
    const p = addStaff(s, 'engineer', 'mid');
    p.skills.polish = 99;
    const res = dispatch(s, { type: 'train', staffId: p.id, program: 'workshop', focus: 'polish' });
    expect(res.events.find((e) => e.type === 'skillTrained')).toEqual({ type: 'skillTrained', staffId: p.id, skill: 'polish', gain: 1 });
  });

  it('three or more level-ups in a week post a team growth line in #wins without touching the random stream', () => {
    const s = game(5);
    addDesks(s, 6);
    for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'junior', { level: 2, xp: B.xpPerLevel * 2 });
    const ctx = makeCtx(s);
    staffUpkeep(ctx);
    expect(new Set(ctx.happenings.levelUps).size).toBeGreaterThanOrEqual(B.growthDigestMin);
    const rng = s.rng.s;
    const before = ctx.events.length;
    growthDigest(ctx);
    expect(s.rng.s).toBe(rng);
    const digest = ctx.events.slice(before).find((e) => e.type === 'chat' && e.channel === 'wins' && e.from === '@hr-bot');
    expect(digest.text).toMatch(/level/i);
    const quiet = makeCtx(s);
    quiet.happenings = { levelUps: ['s1', 's2'] };
    growthDigest(quiet);
    expect(quiet.events).toEqual([]);
  });
});
