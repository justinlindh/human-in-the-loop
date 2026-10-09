// @vitest-environment happy-dom
import { afterEach, expect, it, vi } from 'vitest';
import { commitPlan, createSquadStrip, memberStand, postPlan, squadStand } from './squadPick.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterEach(() => document.body.replaceChildren());

const person = (id, o = {}) => ({ id, name: `${id} Test`, role: 'engineer', mood: 'happy', assignment: { type: 'idle', targetId: null }, ...o });
function world() {
  const s = {
    products: [{ id: 'prod1', name: 'Ledgerster' }],
    projects: [{ id: 'jA', kind: 'new', name: 'Alpha' }, { id: 'jB', kind: 'new', name: 'Beta' }],
    staff: [person('a'), person('b', { assignment: { type: 'maintenance', targetId: 'prod1' } }), person('c'), person('d', { assignment: { type: 'project', targetId: 'jB' } }),
      person('e', { mood: 'away' }), person('x'), person('y', { mood: 'away' })],
    squads: [
      { id: 'q1', name: 'Payments', memberIds: ['a', 'b', 'c', 'd', 'e'], leadId: 'a', posting: { type: 'idle', targetId: null }, afterLaunch: 'upkeep', cohesion: 5, crewIds: ['b'] },
      { id: 'q2', name: 'Platform', memberIds: ['y'], leadId: 'y', posting: { type: 'idle', targetId: null }, afterLaunch: 'upkeep', cohesion: 0, crewIds: [] },
    ],
  };
  const ctx = { getState: () => s, act: vi.fn(() => ({ ok: true, placed: [] })), sfx: vi.fn() };
  return { s, ctx, pool: s.staff.filter((p) => p.mood !== 'away') };
}

it('says who can come from a squad and why the others cannot', () => {
  const { s } = world();
  const q = s.squads[0];
  const by = (id) => memberStand(s, q, s.staff.find((p) => p.id === id), 'jA');
  expect(by('a')).toMatchObject({ kind: 'ok', comes: true });
  expect(by('b')).toMatchObject({ kind: 'crew', comes: false, text: 'upkeep: stays on Ledgerster' });
  expect(by('d')).toMatchObject({ kind: 'moves', comes: true, text: 'moves from Beta' });
  expect(by('e')).toMatchObject({ kind: 'away', comes: false });
  expect(memberStand(s, q, s.staff.find((p) => p.id === 'd'), 'jB')).toMatchObject({ kind: 'here', comes: false });
});

it('a squad nobody can join from gives its first reason', () => {
  const { s } = world();
  expect(squadStand(s, s.squads[1], 'jA')).toMatchObject({ comers: [], reason: 'y: away' });
  expect(squadStand(s, s.squads[0], 'jA').comers.map((x) => x.p.id)).toEqual(['a', 'c', 'd']);
});

it('one tap ticks everyone who can come, and a second clears them', () => {
  const { ctx, pool } = world();
  const picked = new Set();
  const onChange = vi.fn();
  const strip = createSquadStrip({ ctx, picked, pool, targetProjectId: 'jA', onChange });
  document.body.append(strip.el);
  const chip = () => document.querySelector('.sqchipmain');
  chip().click();
  expect([...picked].sort()).toEqual(['a', 'c', 'd']);
  expect(strip.squadOf('a').name).toBe('Payments');
  expect(document.querySelector('.sqchip').classList.contains('on')).toBe(true);
  chip().click();
  expect(picked.size).toBe(0);
  expect(onChange).toHaveBeenCalledTimes(2);
});

it('a squad nobody can join has a disabled chip that carries the reason', () => {
  const { ctx, pool } = world();
  const strip = createSquadStrip({ ctx, picked: new Set(), pool, targetProjectId: 'jA', onChange() {} });
  document.body.append(strip.el);
  const chips = [...document.querySelectorAll('.sqchipmain')];
  expect(chips[1].disabled).toBe(true);
  expect(chips[1].textContent).toContain('y: away');
});

it('the breakdown opens inline with the amber and grey lines and the After launch row', () => {
  const { ctx, pool } = world();
  const strip = createSquadStrip({ ctx, picked: new Set(), pool, targetProjectId: 'jA', onChange() {} });
  document.body.append(strip.el);
  document.querySelector('.sqchev').click();
  expect(document.querySelector('.sqwhy.moves').textContent).toBe('moves from Beta');
  expect(document.querySelector('.sqwhy.crew').textContent).toBe('upkeep: stays on Ledgerster');
  const row = document.querySelector('.sqafter');
  expect(row.querySelectorAll('.sqsegb')).toHaveLength(2);
  row.querySelectorAll('.sqsegb')[1].click();
  expect(ctx.act).toHaveBeenCalledWith({ type: 'setSquadAfterLaunch', squadId: 'q1', mode: 'maintenance' });
});

it('confirming posts a chosen squad with the unticked left off, and assigns the rest by hand', () => {
  const { s, ctx, pool } = world();
  const picked = new Set();
  const strip = createSquadStrip({ ctx, picked, pool, targetProjectId: 'jA', onChange() {} });
  document.body.append(strip.el);
  document.querySelector('.sqchipmain').click(); // a, c, d
  picked.delete('d'); // the player unticks one
  picked.add('x'); // and ticks someone outside the squad
  expect(strip.plan()).toEqual({ squads: [{ squadId: 'q1', exclude: ['d'] }], people: ['x'] });
  expect(postPlan(s, new Set(['a', 'x']), new Set(), 'jA')).toEqual({ squads: [], people: ['a', 'x'] });
  ctx.act.mockImplementation((a) => (a.type === 'postSquad' ? { ok: true, placed: ['a', 'c'] } : { ok: true }));
  const done = commitPlan(ctx, strip.plan(), 'jA', picked.size);
  expect(done).toEqual({ placed: 3, wanted: 3 });
  expect(ctx.act).toHaveBeenCalledWith({ type: 'postSquad', squadId: 'q1', posting: { type: 'project', targetId: 'jA' }, exclude: ['d'] });
  expect(ctx.act).toHaveBeenCalledWith({ type: 'assign', staffId: 'x', assignment: { type: 'project', targetId: 'jA' } });
});

it('with nobody left off, no exclude is sent', () => {
  const { ctx, pool } = world();
  const picked = new Set();
  const strip = createSquadStrip({ ctx, picked, pool, targetProjectId: 'jA', onChange() {} });
  document.body.append(strip.el);
  document.querySelector('.sqchipmain').click();
  commitPlan(ctx, strip.plan(), 'jA', picked.size);
  expect(ctx.act.mock.calls.find(([a]) => a.type === 'postSquad')[0]).toEqual({ type: 'postSquad', squadId: 'q1', posting: { type: 'project', targetId: 'jA' } });
});
