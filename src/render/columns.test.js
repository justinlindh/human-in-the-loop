import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { makeColumns } from './office.js';
import { roundedBox } from './prims.js';

const yRange = (geo) => { geo.computeBoundingBox(); return [+geo.boundingBox.min.y.toFixed(4), +geo.boundingBox.max.y.toFixed(4)]; };
const shaftAndCap = (set) => set.group.children.filter((m) => m instanceof THREE.InstancedMesh).slice(0, 2).map((m) => yRange(m.geometry));

describe('stage columns', () => {
  it('stand on the floor however many times a stage is built, and leave the shared prims geometry alone', () => {
    const L = { wallH: 2.6, wall: 'cream' };
    const columns = () => [{ x: 0, z: 0, h: L.wallH, fade: 1 }];
    const shared = [yRange(roundedBox(0.34, L.wallH, 0.34, 0.03)), yRange(roundedBox(0.38, 0.04, 0.38, 0.01))];
    const builds = [makeColumns(L, columns()), makeColumns(L, columns()), makeColumns(L, columns())].map(shaftAndCap);
    for (const [shaft, cap] of builds) {
      expect(shaft).toEqual([0, 2.6]);
      expect(cap).toEqual([2.6, 2.64]);
    }
    expect([yRange(roundedBox(0.34, L.wallH, 0.34, 0.03)), yRange(roundedBox(0.38, 0.04, 0.38, 0.01))]).toEqual(shared);
    expect(shared).toEqual([[-1.3, 1.3], [-0.02, 0.02]]);
  });
});
