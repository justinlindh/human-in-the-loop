import { describe, it, expect, vi } from 'vitest';
import { createSpotlights } from './spotlight.js';
import { createGrowthMoments } from './growth-moments.js';
import { B } from '../sim/balance.js';

describe('spotlight ownership', () => {
  it('keeps camera and Skip on the same oldest scene through overlapping lifetimes', () => {
    const camera = { hold: vi.fn(), release: vi.fn() };
    const s = createSpotlights({ camera });
    const cut = vi.fn(), target = () => ({ x: 2, z: 3 });
    const a = s.begin('letter', cut, 8, target);
    const b = s.begin('fumes', null, 8, target);
    expect(s.current().key).toBe(a);
    expect(camera.hold).toHaveBeenCalledTimes(1);
    expect(s.cut()).toBe(true);
    expect(cut).toHaveBeenCalledTimes(1);
    expect(s.current().key).toBe(b);
    expect(camera.release).toHaveBeenCalledWith(a);
    expect(camera.hold).toHaveBeenLastCalledWith(b, target, { zoom: 2 });
    s.end(a);
    expect(s.current().key).toBe(b);
    s.end(b);
    expect(s.current()).toBe(null);
    expect(camera.release).toHaveBeenLastCalledWith(b);
  });

  it('ends observed scenes when their actors finish or disappear, without calling Skip', () => {
    const s = createSpotlights(), cut = vi.fn();
    let alive = true;
    s.begin('letter', cut, 8, null, () => alive);
    s.update();
    expect(s.current().kind).toBe('letter');
    alive = false;
    s.update();
    expect(s.current()).toBe(null);
    expect(cut).not.toHaveBeenCalled();
  });

  it('never holds the clock for routine life or an unregistered kind', () => {
    const s = createSpotlights();
    for (const kind of ['standup', 'coffee', 'pair', 'typo']) expect(s.begin(kind)).toBe(null);
    expect(s.current()).toBe(null);
  });
});

describe('career spotlight transitions', () => {
  it('does not replay loaded milestones and retains a new milestone until its actor is ready', () => {
    const g = createGrowthMoments();
    const state = { staff: [{ id: 'a', path: null, legend: false, level: 3 }] };
    g.sync(state);
    expect(g.take(() => true)).toBe(null);
    state.staff[0].path = 'architect';
    g.sync(state);
    expect(g.take(() => false)).toBe(null);
    expect(g.take(() => true)).toEqual({ staffId: 'a', kind: 'promotion' });
    g.sync(state);
    expect(g.take(() => true)).toBe(null);
    g.sync(structuredClone(state));
    expect(g.take(() => true)).toBe(null);
  });

  it('coalesces simultaneous milestones and drops a departed person', () => {
    const g = createGrowthMoments();
    const state = { staff: [{ id: 'a', level: B.maxLevel - 1 }] };
    g.sync(state);
    Object.assign(state.staff[0], { path: 'architect', level: B.maxLevel, legend: true });
    g.sync(state);
    expect(g.take(() => true)?.kind).toBe('legend');
    state.staff.push({ id: 'b', level: B.maxLevel - 1 });
    g.sync(state);
    state.staff[1].level = B.maxLevel;
    g.sync(state);
    state.staff.pop();
    g.sync(state);
    expect(g.take(() => true)).toBe(null);
  });
});
