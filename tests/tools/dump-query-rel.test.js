import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';

const QUERY = resolve(__dirname, '../../blender/checks/dump-query.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'dump-query-rel-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// A counter 3 m wide (x) and 1 m deep (z) centred on (0, 0), facing +z (yaw 0), and a second one at x 10
// turned a quarter turn (its ahead is world +x), so its bounds are 1 m wide in x and 3 m long in z.
const box = (cx, cz, hx, hz) => ({ min: [cx - hx, 0, cz - hz], max: [cx + hx, 1, cz + hz] });
const frame = (people) => ({
  frame: 0, t: 0,
  people: people.map(([id, x, z, yaw]) => ({ id, pos: [x, 0, z], yaw, hands: [], feet: [] })),
  items: [
    { id: 'f1', itemId: 'counter', pos: [0, 0, 0], yaw: 0, bounds: box(0, 0, 1.5, 0.5) },
    { id: 'f2', itemId: 'counter', pos: [10, 0, 0], yaw: Math.PI / 2, bounds: box(10, 0, 0.5, 1.5) },
  ],
  props: [],
});
const dump = join(tmp, 'dump.json');
writeFileSync(dump, JSON.stringify({ frames: [frame([['s1', 0, 1.2, Math.PI], ['s2', 2.5, 0, -Math.PI / 2], ['s3', 0.2, 0.1, 0], ['s4', 1.9, 0.9, 0], ['s5', 10, 1.9, 0], ['s6', 0, -1.0, Math.PI]])] }));
const rel = (...a) => spawnSync(process.execPath, [QUERY, dump, 'rel', ...a], { encoding: 'utf8' });

describe('dump-query rel, a person against an item', () => {
  it('reports the edge distance, the side and the facing in the item frame', () => {
    const front = rel('s1', 'f1').stdout;
    expect(front).toContain('edge 0.700 m, front side; yaw 180 deg against the item, facing toward the edge (0 deg off)');
    const end = rel('s2', 'f1').stdout;
    expect(end).toMatch(/edge 1\.000 m, left end side; yaw -90 deg against the item/);
    const back = rel('s6', 'f1').stdout;
    expect(back).toContain('edge 0.500 m, back side; yaw 180 deg against the item, facing away from it');
  });

  it('says inside for a point over the footprint and names a corner', () => {
    expect(rel('s3', 'f1').stdout).toContain('inside the footprint');
    expect(rel('s4', 'f1').stdout).toMatch(/edge 0\.5\d\d m, .* side \(corner with/);
  });

  it('works in a turned item frame', () => {
    // f2 faces world +x and is 3 m wide along its own x (world z): s5 at z 1.9 stands 0.4 m past one end.
    const out = rel('s5', 'f2').stdout;
    expect(out).toMatch(/edge 0\.400 m, (right|left) end side/);
  });

  it('keeps the plain frame line for an item against an item and for a missing id', () => {
    expect(rel('f1', 'f2').stdout).not.toContain('edge');
    expect(rel('s1', 'nobody').stdout).toContain('not in this frame');
    expect(spawnSync(process.execPath, [QUERY, dump, 'rel', 's1', 'f1']).status).toBe(0);
  });
});
