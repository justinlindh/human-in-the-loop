import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import * as THREE from 'three';
import { pathBelow, partId, heldName } from '../../scripts/studio/ids.mjs';

const mesh = (name = '') => Object.assign(new THREE.Mesh(), { name });
const group = (name, ...kids) => { const g = new THREE.Group(); g.name = name; g.add(...kids); return g; };

describe('studio part ids', () => {
  it('are the owner id plus the path below the owner root, with sibling indices among the same name', () => {
    const a = mesh(), b = mesh(), c = mesh('screen');
    const root = group('desk', group('', a, b), c);
    expect(partId('item:f1', a, root)).toBe('item:f1/Group:0/Mesh:0');
    expect(partId('item:f1', b, root)).toBe('item:f1/Group:0/Mesh:1');
    expect(partId('item:f1', c, root)).toBe('item:f1/screen:0');
    expect(partId('item:f1', root, root)).toBe('item:f1/self');
  });

  it('do not move when an unrelated object is added or reordered elsewhere', () => {
    const wanted = mesh('leg'), other = mesh('leg');
    const item = group('chair', other, wanted);
    const before = partId('item:x', wanted, item);
    const scene = new THREE.Group();
    scene.add(group('table', mesh(), mesh()), item);
    scene.add(group('extra', mesh()));
    scene.children.reverse();
    expect(partId('item:x', wanted, item)).toBe(before);
  });

  it('use a person part name in place of an index, and name a carried prop the same wherever it hangs', () => {
    const head = Object.assign(mesh(), { userData: { part: 'head' } });
    expect(pathBelow(head, group('character', head))).toBe('head:0');
    const cup = Object.assign(group('mug'), { userData: { propId: 'coffee' } });
    const hand = group('hand'); hand.add(cup);
    expect(heldName(cup)).toBe('coffee');
    hand.remove(cup); const torso = group('torso'); torso.add(cup);
    expect(heldName(cup)).toBe('coffee');
  });
});

describe('studio scene ids', () => {
  const frame = (n) => {
    const r = spawnSync(process.execPath, [resolve(__dirname, '../../scripts/studio/scene.mjs'), '--mock', 'floor', '--from', String(n), '--to', String(n)], { encoding: 'utf8', timeout: 240000, maxBuffer: 1 << 28 });
    expect(r.status, r.stderr).toBe(0);
    return JSON.parse(r.stdout.split('\n')[0]);
  };
  const ids = (scene) => scene.objects.flatMap((o) => o.parts.map((p) => p.id));

  it('are unique in a scene and the same on a later frame', () => {
    const a = ids(frame(1)), b = ids(frame(45));
    expect(new Set(a).size).toBe(a.length);
    expect(new Set(b).size).toBe(b.length);
    // What is carried changes; everything else keeps its id.
    expect(b.filter((id) => !a.includes(id)).every((id) => id.startsWith('held:'))).toBe(true);
    expect(a.filter((id) => !b.includes(id)).every((id) => id.startsWith('held:'))).toBe(true);
    expect(a.every((id) => !/\/part:\d+$/.test(id))).toBe(true);
  }, 260000);
});
