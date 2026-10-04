import { describe, it, expect } from 'vitest';
import { GROUPS, OWN_PAGE, mainGroups, emptyGroups, groupsFor } from '../../blender/checks/clip-groups.mjs';
import { OWN_PAGES, mainPage } from '../../blender/checks/clip-pages.js';

describe('clip groups', () => {
  it('runs every registered group on a floor page unless it opens its own scene', () => {
    const groups = { seats: [], robot: [], garage: [], novel: [] };
    expect(mainGroups(groups)).toEqual(['seats', 'robot', 'novel']);
    expect(OWN_PAGE).toContain('garage');
  });

  it('names a wanted group that returned no case, and only that group', () => {
    expect(emptyGroups(['seats', 'novel', 'perks'], { seats: [{ name: 'a' }], novel: [], perks: [{ name: 'b' }] })).toEqual(['novel']);
    expect(emptyGroups(['ghost'], {})).toEqual(['ghost']);
  });

  it('has a runner for every registered group and registers every group a runner reads', () => {
    const registered = Object.keys(GROUPS);
    expect(registered.length).toBeGreaterThan(8);
    const read = new Set([...String(mainPage).matchAll(/\bruns\.(\w+)/g)].map((m) => m[1]));
    for (const g of registered) expect(read.has(g) || g in OWN_PAGES, `group ${g} is registered but has no own page and mainPage never reads runs.${g}`).toBe(true);
    for (const g of [...read, ...Object.keys(OWN_PAGES)]) expect(registered, `group ${g} has a runner but is not registered in GROUPS`).toContain(g);
  });

  it('reaches a group from a pattern inside a case name or one that starts with it', () => {
    const on = (only) => Object.entries(groupsFor(only)).filter(([, v]) => v).map(([g]) => g);
    expect(on(['desk:f3'])).toEqual(['seats']);
    expect(on(['printer'])).toEqual(['props', 'y2k']);
    expect(on(null)).toEqual(Object.keys(GROUPS));
  });

  it('keeps every page function free of its module\'s scope, as a page receives only the source', () => {
    const fns = { mainPage, ...Object.fromEntries(Object.entries(OWN_PAGES).map(([g, p]) => [g, p.fn])) };
    for (const [name, fn] of Object.entries(fns)) expect(String(fn), name).not.toMatch(/\b(OWN_PAGES|mainPage|garagePage|celebrationsPage|respondPage|controlPage|installExact)\b/);
  });
});
