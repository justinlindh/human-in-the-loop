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

  it('sends a person to a coffee corner, holds another until a time, then lets them walk', () => {
    const rows = frames('coffee-visit.json', ['--from', '0', '--to', '9', '--every', '1']);
    const acts = (id) => rows.map((r) => person(r, id).person.activity);
    expect(acts('ada')).toContain('sip');
    // bo stands still for the six seconds before `until`, then walks
    expect(acts('bo').slice(0, 7).every((a) => a === 'idle')).toBe(true);
    expect(acts('bo').slice(7)).toContain('walk');
    const held = rows.slice(0, 7).map((r) => person(r, 'bo').world.slice(12, 15).join());
    expect(new Set(held).size).toBe(1);
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

describe('compose perk visits and timed releases', () => {
  const cc = { base: 'floor', era: 'agents', items: [{ item: 'coffee_corner', at: [6, 6], id: 'cc' }] };
  it('compiles a use and an until to timed steps', () => {
    const { script } = compose({ ...cc, people: [{ id: 'a', at: [8, 9], t: 2, use: { item: 'cc', slot: 1, dur: 4 } }, { id: 'b', at: [6.4, 8.2], until: 7 }] });
    expect(script).toContainEqual({ frame: 60, who: 'a', op: 'use', item: 'cc', slot: 1, dur: 4 });
    expect(script).toContainEqual({ frame: 210, who: 'b', op: 'release' });
  });
  it('refuses a use of a non-item, a bad slot, an until without a place, and a person with nothing to do', () => {
    const p = (x) => problemsOf({ ...cc, people: [{ id: 'a', at: [8, 9], ...x }] }).join('\n');
    expect(p({ use: { item: 'nope' } })).toMatch(/use: item "nope" is not an item id/);
    expect(p({ use: { item: 'cc', slot: -1 } })).toMatch(/slot must be a whole number/);
    expect(p({ use: { item: 'cc', speed: 2 } })).toMatch(/unknown key "speed"/);
    expect(p({ until: 0 })).toMatch(/until must be seconds/);
    expect(problemsOf({ ...cc, people: [{ id: 'a', use: { item: 'cc' }, until: 3 }] }).join('\n')).toMatch(/until releases a person placed with at/);
    expect(problemsOf({ ...cc, people: [{ id: 'a' }] }).join('\n')).toMatch(/exactly one of seat/);
  });
});

describe('compose moments, era and keep', () => {
  it('compiles a moment to one script step for the game to stage', () => {
    const { script, state } = compose(`${EX}/slap-moment.json`);
    expect(script).toEqual([{ frame: 0, who: null, op: 'moment', name: 'slap', fixer: 'nearest' }]);
    expect(state.staff).toHaveLength(10);
    expect(state.era.id).toBe('agents');
    expect(state.office.placed.some((p) => p.itemId === 'office_robot' && p.level === 2)).toBe(true);
  });

  it('refuses a moment without a robot, an unknown moment, an unknown fixer, an unknown era and a bad keep', () => {
    expect(problemsOf({ ...base, moments: [{ moment: 'slap' }] }).join('\n')).toMatch(/moments\[0\]: slap needs a robot/);
    expect(problemsOf({ ...base, robot: { at: [2, 2] }, moments: [{ moment: 'dance' }] }).join('\n')).toMatch(/moment "dance" is not one of slap/);
    expect(problemsOf({ ...base, robot: { at: [2, 2] }, moments: [{ moment: 'slap', fixer: 'nobody' }] }).join('\n')).toMatch(/fixer "nobody" is not a person/);
    expect(() => compose({ ...base, era: 'stone' })).toThrow(/era "stone"/);
    expect(() => compose({ ...base, keep: ['everything'] })).toThrow(/keep must be/);
  });
});

describe('composed staged moments', () => {
  it('the composed slap reproduces the game: the fixer\'s right hand reaches the robot head like stage.mjs reads', () => {
    const r = spawnSync(process.execPath, [resolve(__dirname, '../../scripts/studio/scene.mjs'), '--compose', `${EX}/slap-moment.json`, '--from', '0', '--to', '6', '--every', '0.1', '--who', 's1'], { encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 28 });
    expect(r.status, r.stderr).toBe(0);
    const rows = r.stdout.trim().split('\n').map((l) => JSON.parse(l));
    let best = Infinity;
    for (const row of rows) {
      const fixer = row.objects.find((o) => o.id === 'person:s1');
      if (fixer.person.activity !== 'slap') continue;
      const box = { min: [Infinity, Infinity, Infinity], max: [-Infinity, -Infinity, -Infinity] };
      for (const p of row.objects.find((o) => o.kind === 'robot').parts.filter((x) => x.id.includes('robot_head'))) {
        for (let i = 0; i < 3; i++) { box.min[i] = Math.min(box.min[i], p.bounds.min[i]); box.max[i] = Math.max(box.max[i], p.bounds.max[i]); }
      }
      const h = fixer.person.hands[1];
      best = Math.min(best, Math.hypot(...[0, 1, 2].map((i) => Math.max(0, box.min[i] - h[i], h[i] - box.max[i]))));
    }
    // stage.mjs reads 0.008 m in this setup, against its 0.06 m rule.
    expect(best).toBeLessThan(0.02);
    expect(best).toBeGreaterThan(0);
  }, 260000);
});

describe('the sweep\'s collision rows on a composed scene', () => {
  it('give the same person-against-furniture rows as the engine, within 5 mm', () => {
    const r = spawnSync(process.execPath, [resolve(__dirname, '../../scripts/studio/compare-sweep.mjs'), '--compose', `${EX}/overlap.json`], { encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 28 });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/match {2}ada\|c1\|torso\|pal_plastic_white/);
    expect(r.stdout).toMatch(/match {2}ada\|c1\|head\|pal_plastic_white/);
    expect(r.stdout).toContain('5 of 5 pairs match within 0.005 m');
  }, 260000);

  it('runs a grid of positions round an item and finds no pair the engine misses (plant: every pair matches)', () => {
    const r = spawnSync(process.execPath, [resolve(__dirname, '../../scripts/studio/compare-sweep.mjs'), '--grid', 'plant', '--positions', '20'], { encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 28 });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/plant +20 positions, \d+ pairs: \d+ match, 0 missed by the engine, 0 differ/);
  }, 260000);

  it('compares the desk too: the sweep\'s own-furniture rule is not applied, so every desk pair matches', () => {
    const r = spawnSync(process.execPath, [resolve(__dirname, '../../scripts/studio/compare-sweep.mjs'), '--grid', 'desk', '--positions', '12'], { encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 28 });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const m = /desk +12 positions, (\d+) pairs: (\d+) match, 0 missed by the engine, 0 differ, 0 engine-only/.exec(r.stdout);
    expect(m, r.stdout).toBeTruthy();
    expect(Number(m[1])).toBeGreaterThan(0);
    expect(m[2]).toBe(m[1]);
  }, 260000);

  it('lets a person stand inside a footprint only when asked', () => {
    const spec = (free) => ({ base: 'floor', items: [{ item: 'coffee_corner', at: [6, 6], id: 'c1' }], people: [{ id: 'a', at: [6.5, 6.5], ...(free ? { free: true } : {}) }] });
    expect(problemsOf(spec(false)).join('\n')).toMatch(/inside the coffee_corner "c1"/);
    expect(problemsOf(spec(true))).toEqual([]);
  });
});
