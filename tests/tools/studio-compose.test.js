import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
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
      { frame: 0, who: 'fixer', op: 'place', at: [5, 4.6], toward: 'robot' },
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

describe('studio scene --compose', () => {
  const frames = (file, args) => {
    const r = spawnSync(process.execPath, [resolve(__dirname, '../../scripts/studio/scene.mjs'), '--compose', `${EX}/${file}`, ...args], { encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 28 });
    expect(r.status, r.stderr).toBe(0);
    return r.stdout.trim().split('\n').map((l) => JSON.parse(l));
  };
  const person = (frame, id) => frame.objects.find((o) => o.id === `person:${id}`);

  it('stands the fixer at the composed spot, and the slap plays from its frame', () => {
    const rows = frames('slap.json', ['--from', '0', '--to', '1', '--every', '0.2']);
    const fixer = rows.map((r) => person(r, 'fixer'));
    expect(fixer[0].world.slice(12, 15).map((v) => +v.toFixed(2))).toEqual([-2.5, 0, -1.4]);
    // The slap is at frame 12 (0.4 s) and a sample at frame 12 already shows it.
    expect(fixer.map((f) => f.person.activity)).toEqual(['idle', 'idle', 'slap', 'slap', 'slap', 'slap']);
    // The fixer faces the robot where it rests, within a few degrees.
    const robot = rows[0].objects.find((o) => o.kind === 'robot');
    expect(robot.id).toBe('robot:office');
    const m = fixer[0].world, r = robot.world;
    const heading = Math.atan2(m[8], m[10]), bearing = Math.atan2(r[12] - m[12], r[14] - m[14]);
    const off = Math.abs(((heading - bearing + 3 * Math.PI) % (2 * Math.PI)) - Math.PI) * 180 / Math.PI;
    expect(off).toBeLessThan(3);
  }, 260000);

  it('seats the composed person at the desk and plays the gesture over it', () => {
    const rows = frames('facepalm.json', ['--from', '0', '--to', '1', '--every', '1']);
    const ada = person(rows[0], 'ada');
    expect(ada.person.walk.goal.seated).toBe(true);
    expect(ada.person.activity).toBe('typing');
    const later = frames('facepalm.json', ['--from', '0.5', '--to', '0.5'])[0];
    expect(person(later, 'ada').person.activity).toBe('facepalmsit');
    expect(rows[0].objects.find((o) => o.id === 'item:d1')).toBeTruthy();
    expect(rows[0].objects.find((o) => o.id === 'item:w1')).toBeTruthy();
  }, 260000);
});
