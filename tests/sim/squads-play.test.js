import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { workSystem } from '../../src/sim/work.js';
import { projectsSystem } from '../../src/sim/projects.js';
import { squadsSystem } from '../../src/sim/squads.js';
import { outputMult } from '../../src/sim/staff.js';
import { advice } from '../../src/sim/advisors.js';
import { B } from '../../src/sim/balance.js';
import { game, addStaff, addDesks } from './helpers.js';

// Runs work, projects and squads for n weeks; returns the events.
function weeks(s, n) {
  const events = [];
  for (let i = 0; i < n; i++) {
    const ctx = makeCtx(s);
    workSystem(ctx);
    projectsSystem(ctx);
    squadsSystem(ctx);
    events.push(...ctx.events);
    s.week++;
  }
  return events;
}

function setup({ engineers = 3, designers = 1 } = {}) {
  const s = game();
  s.officeStage = 1;
  addDesks(s, 10);
  s.staff = [];
  const members = [];
  for (let i = 0; i < engineers; i++) members.push(addStaff(s, 'engineer', 'mid', { knowledge: 20 + 20 * i }));
  for (let i = 0; i < designers; i++) members.push(addStaff(s, 'designer', 'mid'));
  const r = dispatch(s, { type: 'createSquad', name: 'Core', memberIds: members.map((p) => p.id) });
  const squad = s.squads.find((x) => x.id === r.squadId);
  return { s, squad, members };
}

function shipSmall(s, squad) {
  const r = dispatch(s, { type: 'startProject', kind: 'new', name: 'Inboxer', category: 'email', angle: 'summarizer', model: 'chatgbt', size: 'small' });
  const j = s.projects.find((x) => x.id === r.projectId);
  dispatch(s, { type: 'postSquad', squadId: squad.id, posting: { type: 'project', targetId: j.id } });
  const events = [];
  for (let i = 0; i < 80 && s.projects.some((x) => x.id === j.id); i++) events.push(...weeks(s, 1));
  expect(s.projects.some((x) => x.id === j.id)).toBe(false);
  return events;
}

describe('squads after a launch (#938)', () => {
  it('upkeep: the engineers who know most stay on maintenance, the rest are benched, and squadFreed says so', () => {
    const { s, squad, members } = setup();
    const events = shipSmall(s, squad);
    const freed = events.find((e) => e.type === 'squadFreed');
    expect(freed).toMatchObject({ squadId: squad.id, productId: s.products.at(-1).id });
    expect(freed.crewIds.length).toBeGreaterThanOrEqual(1);
    expect(freed.crewIds[0]).toBe(members[2].id);
    for (const id of freed.crewIds) expect(s.staff.find((p) => p.id === id).assignment.type).toBe('maintenance');
    const benched = members.filter((p) => !freed.crewIds.includes(p.id));
    expect(benched.length).toBeGreaterThan(0);
    for (const p of benched) expect(p.assignment.type).toBe('idle');
    expect(squad.posting).toEqual({ type: 'idle', targetId: null });
    expect(squad.benchUntil).toBe(freed && s.week - 1 + B.squadBenchWeeks);
  });

  it('the bench runs out: idle members go back to their default work', () => {
    const { s, squad, members } = setup();
    shipSmall(s, squad);
    const events = weeks(s, B.squadBenchWeeks + 1);
    expect(events.some((e) => e.type === 'squadBenchEnded' && e.squadId === squad.id)).toBe(true);
    for (const p of members) expect(p.assignment.type).toBe(p.role === 'engineer' ? 'maintenance' : 'idle');
    expect(squad.benchUntil).toBe(null);
    expect(squad.posting.type).toBe('maintenance');
  });

  it('posting the squad again clears the bench', () => {
    const { s, squad } = setup();
    shipSmall(s, squad);
    dispatch(s, { type: 'postSquad', squadId: squad.id, posting: { type: 'support', targetId: null } });
    expect(squad.benchUntil).toBe(null);
    expect(weeks(s, B.squadBenchWeeks + 1).some((e) => e.type === 'squadBenchEnded')).toBe(false);
  });

  it("afterLaunch 'maintenance' keeps today's behaviour: everyone to their default work, no bench", () => {
    const { s, squad, members } = setup();
    dispatch(s, { type: 'setSquadAfterLaunch', squadId: squad.id, mode: 'maintenance' });
    const events = shipSmall(s, squad);
    expect(events.some((e) => e.type === 'squadFreed')).toBe(false);
    for (const p of members) expect(p.assignment.type).toBe(p.role === 'engineer' ? 'maintenance' : 'idle');
    expect(squad.benchUntil).toBe(null);
  });

  it('people not in a squad are unchanged by a launch', () => {
    const { s, squad } = setup();
    dispatch(s, { type: 'disbandSquad', squadId: squad.id });
    const r = dispatch(s, { type: 'startProject', kind: 'new', name: 'Inboxer', category: 'email', angle: 'summarizer', model: 'chatgbt', size: 'small' });
    for (const p of s.staff) dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: r.projectId } });
    let events = [];
    for (let i = 0; i < 80 && s.projects.length; i++) events = events.concat(weeks(s, 1));
    expect(events.some((e) => e.type === 'squadFreed')).toBe(false);
    for (const p of s.staff) expect(p.assignment.type).toBe(p.role === 'engineer' ? 'maintenance' : 'idle');
  });
});

describe('squad cohesion (#938)', () => {
  it('builds while the squad works its posting, reaches 1 after squadCohesionWeeks, and adds output', () => {
    const { s, squad, members } = setup({ engineers: 2, designers: 0 });
    dispatch(s, { type: 'postSquad', squadId: squad.id, posting: { type: 'maintenance', targetId: null } });
    const before = outputMult(s, members[0]);
    weeks(s, B.squadCohesionWeeks);
    expect(squad.cohesion).toBeCloseTo(1);
    expect(outputMult(s, members[0])).toBeCloseTo(before * (1 + B.squadCohesionOutput));
  });

  it('a member on loan gets no bonus, and an idle squad builds none', () => {
    const { s, squad, members } = setup({ engineers: 2, designers: 0 });
    dispatch(s, { type: 'postSquad', squadId: squad.id, posting: { type: 'maintenance', targetId: null } });
    weeks(s, 6);
    const c = squad.cohesion;
    expect(c).toBeGreaterThan(0);
    const base = outputMult(s, members[1]);
    dispatch(s, { type: 'assign', staffId: members[1].id, assignment: { type: 'support', targetId: null } });
    expect(outputMult(s, members[1])).toBeLessThan(base);
    dispatch(s, { type: 'postSquad', squadId: squad.id, posting: { type: 'idle', targetId: null } });
    weeks(s, 3);
    expect(squad.cohesion).toBeCloseTo(c);
  });
});

describe('the idle squad advisor (#938)', () => {
  it('speaks after a squad has sat idle for squadIdleWeeks, and offers to post it', () => {
    const { s, squad } = setup();
    dispatch(s, { type: 'postSquad', squadId: squad.id, posting: { type: 'idle', targetId: null } });
    weeks(s, B.squadIdleWeeks - 1);
    expect(advice(s).some((a) => a.key === `squadIdle:${squad.id}`)).toBe(false);
    weeks(s, 1);
    const a = advice(s).find((x) => x.key === `squadIdle:${squad.id}`);
    expect(a).toBeTruthy();
    expect(a.advisor).toBe('people');
    expect(a.text).not.toMatch(/\{|\}/);
    expect(a.options.length).toBeGreaterThanOrEqual(1);
    dispatch(s, { type: 'postSquad', squadId: squad.id, posting: { type: 'maintenance', targetId: null } });
    weeks(s, 1);
    expect(advice(s).some((x) => x.key === `squadIdle:${squad.id}`)).toBe(false);
  });
});
