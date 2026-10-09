// @vitest-environment happy-dom
// The picker's plan against the real sim: a chip that is on posts the squad, the unticked stay where they were.
import { afterEach, expect, it, vi } from 'vitest';
import { dispatch } from '../sim/index.js';
import { game, addStaff, addDesks } from '../../tests/sim/helpers.js';
import { commitPlan, createSquadStrip } from './squadPick.js';

vi.hoisted(() => vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => ({}) }))));
afterEach(() => document.body.replaceChildren());

function world() {
  const s = game();
  s.officeStage = 1; addDesks(s, 8); s.unlocks.squads = 0;
  const [a, b, c, x] = [0, 1, 2, 3].map(() => addStaff(s, 'engineer', 'mid'));
  const cr = dispatch(s, { type: 'createSquad', name: 'Core', memberIds: [a.id, b.id, c.id] }); if (!cr.ok) throw new Error(cr.reason);
  const sq = s.squads.find((q) => q.id === cr.squadId);
  const pr = dispatch(s, { type: 'startProject', kind: 'refactor' }); if (!pr.ok) throw new Error(pr.reason); const j = s.projects.find((p) => p.id === pr.projectId);
  const ctx = { getState: () => s, act: (action) => dispatch(s, action), sfx() {} };
  return { s, ctx, sq, j, ids: { a: a.id, b: b.id, c: c.id, x: x.id } };
}

it('posts the squad, leaves the unticked member where they were, and assigns an outsider by hand', () => {
  const { s, ctx, sq, j, ids } = world();
  const picked = new Set();
  const strip = createSquadStrip({ ctx, picked, pool: s.staff, targetProjectId: j.id, onChange() {} });
  document.body.append(strip.el);
  document.querySelector('.sqchipmain').click();
  expect([...picked].sort()).toEqual([ids.a, ids.b, ids.c].sort());
  picked.delete(ids.c);
  picked.add(ids.x);
  const before = structuredClone(s.staff.find((p) => p.id === ids.c).assignment);
  const done = commitPlan(ctx, strip.plan(), j.id, picked.size);
  const on = (id) => s.staff.find((p) => p.id === id).assignment;
  expect(on(ids.a)).toEqual({ type: 'project', targetId: j.id });
  expect(on(ids.b)).toEqual({ type: 'project', targetId: j.id });
  expect(on(ids.x)).toEqual({ type: 'project', targetId: j.id });
  expect(on(ids.c)).toEqual(before);
  expect(sq.posting).toEqual({ type: 'project', targetId: j.id });
  expect(sq.memberIds).toContain(ids.c);
  expect(done).toEqual({ placed: 3, wanted: 3 });
});
