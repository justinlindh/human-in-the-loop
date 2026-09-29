import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { compose, ComposeError } from '../../scripts/studio/compose.mjs';

const EX = resolve(__dirname, '../../scripts/studio/examples');
const problemsOf = (spec) => { try { compose(spec); return []; } catch (e) { expect(e).toBeInstanceOf(ComposeError); return e.problems; } };
const base = { base: 'incident', items: [{ item: 'desk', at: [6, 6], id: 'd1' }] };

describe('studio compose', () => {
  it('compiles the slap example: a broken robot, a standing fixer facing it, a slap at 0.4 s', () => {
    const { state, script } = compose(`${EX}/slap.json`);
    expect(state.robot).toMatchObject({ status: 'broken', cause: 'unplug' });
    expect(state.office.placed.map((p) => p.itemId)).toEqual(['desk', 'office_robot']);
    expect(state.staff.map((p) => [p.id, p.appearance.build])).toEqual([['fixer', 1]]);
    expect(script).toEqual([
      { frame: 0, who: 'fixer', op: 'place', at: [5.5, 4.5], dir: [-1, 0] },
      { frame: 12, who: 'fixer', op: 'gesture', name: 'slap' },
    ]);
  });

  it('compiles the seated facepalm example: the desk seats the person, no placement step', () => {
    const { state, script } = compose(`${EX}/facepalm.json`);
    expect(state.staff[0].deskId).toBe('d1');
    expect(script).toEqual([{ frame: 15, who: 'ada', op: 'gesture', name: 'facepalmsit' }]);
  });

  it('keeps each example under 15 lines', () => {
    for (const f of ['slap', 'facepalm']) expect(require('node:fs').readFileSync(`${EX}/${f}.json`, 'utf8').trim().split('\n').length).toBeLessThan(15);
  });

  it('turns a face into a unit direction: compass, degrees, a person, the robot', () => {
    const at = (face) => compose({ ...base, people: [{ id: 'a', at: [3.5, 3.5], face }] }).script[0].dir;
    expect(at('east')).toEqual([1, 0]);
    expect(at(0)).toEqual([0, 1]);
    expect(at(90)[0]).toBeCloseTo(1, 5);
    const two = compose({ ...base, people: [{ id: 'a', at: [3.5, 3.5], face: 'b' }, { id: 'b', at: [3.5, 1.5] }] });
    expect(two.script.find((s) => s.who === 'a').dir).toEqual([0, -1]);
  });

  it('reports every problem at once, each naming its entry', () => {
    const p = problemsOf({ base: 'nowhere', items: [] });
    expect(p).toEqual([expect.stringContaining('base "nowhere"')]);
    const q = problemsOf({ ...base, items: [...base.items, { item: 'sofa', at: [1, 1] }, { item: 'desk', at: [6, 6], id: 'd2' }], people: [{ id: 'a', seat: 'zz' }, { id: 'a', at: [1, 1] }, { id: 'c', at: [1, 1], seat: 'd1' }], robot: { at: [2, 2], cause: 'fire' } });
    expect(q.join('\n')).toMatch(/items\[1\]: unknown item "sofa"/);
    expect(q.join('\n')).toMatch(/items\[2\]: desk at 6,6/);
    expect(q.join('\n')).toMatch(/people\[0\]: seat "zz" is not an item id/);
    expect(q.join('\n')).toMatch(/people\[1\]: duplicate id "a"/);
    expect(q.join('\n')).toMatch(/people\[2\]: give exactly one of seat/);
    expect(q.join('\n')).toMatch(/robot: cause "fire"/);
  });

  it('refuses a seat that is not a desk, a face on a seated person, an unknown key and a person inside furniture', () => {
    const p = problemsOf({ ...base, items: [...base.items, { item: 'plant', at: [1, 1], id: 'p1' }],
      people: [{ id: 'a', seat: 'p1' }, { id: 'b', seat: 'd1', face: 'north' }, { id: 'c', at: [6.5, 6.5] }] });
    expect(problemsOf({ ...base, bogus: 1 })).toEqual([expect.stringContaining('file: unknown key "bogus"')]);
    expect(p.join('\n')).toMatch(/seat "p1" is a plant, not a desk/);
    expect(p.join('\n')).toMatch(/seated person faces their desk/);
    expect(p.join('\n')).toMatch(/inside the desk "d1"/);
  });

  it('refuses two people on one seat, two standing on top of each other, and a gesture the game does not play', () => {
    const seat = problemsOf({ ...base, people: [{ id: 'a', seat: 'd1' }, { id: 'b', seat: 'd1' }] });
    expect(seat.join('\n')).toMatch(/people\[1\]: seat "d1" is already taken by "a"/);
    const spot = problemsOf({ ...base, people: [{ id: 'a', at: [3, 3] }, { id: 'b', at: [3.1, 3] }] });
    expect(spot.join('\n')).toMatch(/people\[1\]: at 3.1,3 is within 0.4 tile of "a"/);
    expect(problemsOf({ ...base, people: [{ id: 'a', at: [3, 3] }, { id: 'b', at: [3.6, 3] }] })).toEqual([]);
    const move = problemsOf({ ...base, people: [{ id: 'a', at: [3, 3], gesture: 'moonwalk' }] });
    expect(move.join('\n')).toMatch(/people\[0\]: gesture "moonwalk" is not an animation/);
    expect(problemsOf({ ...base, people: [{ id: 'a', at: [3, 3], gesture: 'slap' }] })).toEqual([]);
  });

  it('applies the game placement rules: an item off the grid is refused', () => {
    expect(problemsOf({ ...base, items: [{ item: 'desk', at: [99, 99] }] }).join('\n')).toMatch(/items\[0\]: desk at 99,99/);
  });
});
