import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { spawnAsync } from './spawn-async.js';
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

  it('do not move when another mesh joins the same owner earlier in its tree (the flat index does)', () => {
    const flat = (root, target) => { const all = []; root.traverse((o) => { if (o.isMesh) all.push(o); }); return all.indexOf(target); };
    const wanted = mesh('leg');
    const item = group('person', mesh('torso'), wanted);
    const before = { path: partId('person:s1', wanted, item), flat: flat(item, wanted) };
    // Something the owner did not have before (a picked-up prop) comes ahead of it.
    item.children[0].add(mesh('prop'));
    item.add(mesh('cup'));
    item.children.unshift(item.children.pop());
    expect(flat(item, wanted)).not.toBe(before.flat);
    expect(partId('person:s1', wanted, item)).toBe(before.path);
  });

  it('do not move when an unrelated object is added or reordered elsewhere', () => {
    const wanted = mesh('leg');
    const item = group('chair', mesh('leg'), wanted);
    const before = partId('item:x', wanted, item);
    const scene = new THREE.Group();
    scene.add(group('table', mesh(), mesh()), item, group('extra', mesh()));
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

describe('carried things', () => {
  it('two unnamed meshes in one hand (a slice) get distinct held ids', async () => {
    const { inventory } = await import('../../scripts/studio/model.mjs');
    const solid = (name = '') => Object.assign(new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial()), { name });
    const part = (name) => Object.assign(solid(), { userData: { part: name } });
    const pivot = new THREE.Group();
    pivot.add(part('hand'), group('', solid(), solid()));
    const character = group('character', part('head'), part('torso'), pivot);
    character.userData.staffId = 's1';
    character.traverse((o) => { if (o.isMesh && o.userData.part) o.userData.staffId = undefined; });
    const wrapper = new THREE.Group(); wrapper.add(character);
    const scene = new THREE.Scene(); scene.add(wrapper);
    scene.updateMatrixWorld(true);
    const { records } = inventory({ scene }, { pets: [] });
    const held = records.filter((r) => r.held).map((r) => r.id);
    expect(held).toHaveLength(2);
    expect(new Set(held).size).toBe(2);
    expect(held.every((id) => id.startsWith('held:s1:'))).toBe(true);
  });
});

describe('studio scene ids', () => {
  const frame = async (n) => {
    const r = await spawnAsync(process.execPath, [resolve(__dirname, '../../scripts/studio/scene.mjs'), '--mock', 'floor', '--from', String(n), '--to', String(n)], { timeout: 240000 });
    expect(r.status, r.stderr).toBe(0);
    return JSON.parse(r.stdout.split('\n')[0]);
  };
  const ids = (scene) => scene.objects.flatMap((o) => o.parts.map((p) => p.id));

  it('are unique in a scene and the same on a later frame', async () => {
    const [first, later] = await Promise.all([frame(1), frame(45)]);
    const a = ids(first), b = ids(later);
    expect(new Set(a).size).toBe(a.length);
    expect(new Set(b).size).toBe(b.length);
    // What is carried changes; everything else keeps its id.
    expect(b.filter((id) => !a.includes(id)).every((id) => id.startsWith('held:'))).toBe(true);
    expect(a.filter((id) => !b.includes(id)).every((id) => id.startsWith('held:'))).toBe(true);
    expect(a.every((id) => !/\/part:\d+$/.test(id))).toBe(true);
  }, 260000);
});
