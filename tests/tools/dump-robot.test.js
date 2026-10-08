import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import * as THREE from 'three';
import { toolTmp } from '../../scripts/tools/tmp.mjs';

const QUERY = resolve(__dirname, '../../blender/checks/dump-query.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'dump-robot-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// A renderer with nothing but a camera and the office robot: a 0.6 m box standing at (2, 0, -1), turned a quarter turn.
function fakeR(peek) {
  const scene = new THREE.Scene();
  const root = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.6), new THREE.MeshBasicMaterial());
  body.position.y = 0.4;
  root.add(body);
  root.position.set(2, 0, -1);
  root.rotation.y = Math.PI / 2;
  scene.add(root);
  const camera = new THREE.OrthographicCamera(-8, 8, 5, -5, 0.1, 100);
  camera.position.set(10, 10, 10); camera.lookAt(0, 0, 0); camera.updateMatrixWorld(); camera.updateProjectionMatrix();
  scene.updateMatrixWorld(true);
  return { scene, camera, office: { placed: new Map() }, robot: { root, peek: () => peek } };
}

describe('dump records the office robot', () => {
  let robotOf;
  beforeAll(async () => {
    globalThis.document = { querySelector: () => ({ width: 1280, height: 800 }) };
    ({ robotOf } = await import('../../blender/checks/dump.js'));
  });
  afterAll(() => { delete globalThis.document; });

  it('records where it is, its job, its goal and its way', () => {
    const peek = { plan: 'rounds', cause: null, docked: false, pos: [2, -1], yaw: 1.57, path: 2, target: { x: 4, z: 1 }, stop: { x: 4, z: 1, who: 's7', desk: 'f3' }, party: null, fix: null, settled: false,
      way: [{ x: 3, z: 0 }, { x: 4, z: 1 }] };
    const r = robotOf(fakeR(peek));
    expect(r).toMatchObject({ id: 'robot', pos: [2, 0, -1], yaw: 1.571, plan: 'rounds', docked: false, stop: { who: 's7', desk: 'f3' }, goal: { x: 4, z: 1 }, pathLength: 2, path: peek.way, pathHits: [] });
    // As dump.json stores it (a -0 reads 0).
    expect(JSON.parse(JSON.stringify(r.bounds))).toEqual({ min: [1.7, 0, -1.3], max: [2.3, 0.8, -0.7] });
    expect(r.screen).toHaveLength(4);
  });

  it('keeps the way empty when the renderer gives only its length, and is null with no robot', () => {
    const r = robotOf(fakeR({ plan: 'home', cause: null, docked: false, path: 3, target: { x: 0, z: 0 }, stop: null }));
    expect(r.path).toBe(null);
    expect(r.pathLength).toBe(3);
    expect(r.pathHits).toBe(null);
    expect(robotOf({ robot: null })).toBe(null);
    const gone = fakeR({ plan: 'dock' });
    gone.scene.remove(gone.robot.root);
    expect(robotOf(gone)).toBe(null);
  });
});

describe('dump-query accepts robot', () => {
  const robot = { id: 'robot', pos: [2, 0, -1], yaw: Math.PI / 2, bounds: { min: [1.7, 0, -1.3], max: [2.3, 0.8, -0.7] }, screen: [600, 400, 40, 50],
    plan: 'broken', cause: 'unplug', docked: false, stop: { x: 3, z: -1, who: null, desk: 'f3' }, goal: { x: 3, z: -1 }, party: null, fix: { fixer: 's1', slapped: false },
    pathLength: 1, path: [{ x: 3, z: -1 }], pathHits: [] };
  const frame = (r) => ({ frame: 0, t: 0, people: [{ id: 's1', pos: [2, 0, 0], yaw: Math.PI, hands: [], feet: [] }], items: [{ id: 'f3', itemId: 'desk', pos: [5, 0, -1], yaw: 0, bounds: { min: [4.5, 0, -1.5], max: [5.5, 1, -0.5] } }], props: [], ...r });
  const file = join(tmp, 'dump.json');
  writeFileSync(file, JSON.stringify({ frames: [frame({ robot }), frame({ robot: null }), frame({})] }));
  const q = (...a) => spawnSync(process.execPath, [QUERY, file, ...a], { encoding: 'utf8' });

  it('where, dist, rel and near take it like a person', () => {
    const where = q('where', 'robot').stdout.split('\n');
    expect(where[0]).toBe('frame    0 t=0.00s  robot (2.000, 0.000, -1.000) yaw 1.571 plan broken (unplug) screen [600, 400, 40, 50]');
    expect(where[1]).toContain('robot: not in this frame');
    expect(q('where', 'robot.center').stdout).toContain('robot.center (2.000, 0.400, -1.000)');
    expect(q('dist', 's1', 'robot').stdout).toContain('1.000 m, s1 -> robot (0.000, 0.000, -1.000)');
    // The robot faces +x, so its right is world +z (rel's convention), where s1 stands 1 m off, level with it.
    expect(q('rel', 's1', 'robot').stdout).toContain("s1 in robot's frame: right 1.000, up 0.000, ahead 0.000 m");
    expect(q('near', 's1', '1.5').stdout.split('\n')[0]).toBe('frame    0 t=0.00s  robot 1.00 m');
  });

  it('refuses a missing thing and a robot point it does not have', () => {
    const none = q('path');
    expect(none.status).toBe(2);
    expect(none.stderr).toContain('path wants a thing');
    expect(q('rel', 's1').status).toBe(2);
    const hand = q('where', 'robot.hand1');
    expect(hand.status).toBe(2);
    expect(hand.stderr).toContain('the robot has .pos and .center, not .hand1');
  });

  it('path robot gives its job, goal and way, and says when a dump has no robot record', () => {
    const out = q('path', 'robot').stdout.split('\n');
    expect(out[0]).toBe('frame    0 t=0.00s  robot at (2.00, -1.00) yaw 1.57; plan broken (unplug), being fixed by s1; stop (3.00, -1.00) desk f3');
    expect(out[1]).toBe('  goal (3.00, -1.00)');
    expect(out[2]).toBe('  path: (3.00, -1.00)');
    expect(out[3]).toBe('  passes through: nothing');
    expect(out[4]).toBe('frame    0 t=0.00s  robot: not in this frame');
    expect(out[5]).toBe('frame    0 t=0.00s  robot: not in this frame (a dump made before dump.js recorded the robot)');
  });
});
