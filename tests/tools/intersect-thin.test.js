import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { overlaps, depthInto } from '../../blender/checks/intersect.js';

// A slab (a desk top) planted through the middle of a head-sized sphere, at several thicknesses.
const CM = [1, 3, 6, 12, 25];
const body = (geo, y = 0) => {
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial());
  mesh.position.y = y;
  mesh.updateMatrixWorld(true);
  geo.computeBoundingBox();
  return { mesh, box: new THREE.Box3().setFromObject(mesh), meshes: [mesh] };
};
const head = () => body(new THREE.IcosahedronGeometry(0.06, 3));
const slab = (cm) => body(new THREE.BoxGeometry(2, cm / 100, 2));

describe('thin surfaces through a body', () => {
  it('flags a slab through a head at every thickness', () => {
    for (const cm of CM) {
      const found = overlaps([head(), slab(cm)]);
      expect(found, `${cm} cm`).toHaveLength(1);
    }
  });

  it('is missed by the vertex depth alone at some thicknesses', () => {
    const missed = CM.filter((cm) => {
      const h = head(), s = slab(cm);
      return Math.max(depthInto(h.mesh, s.mesh).depth, depthInto(s.mesh, h.mesh).depth) <= 0.01;
    });
    expect(missed.length).toBeGreaterThan(0);
  });

  it('leaves a body resting clear of a slab, and a light graze, unflagged', () => {
    expect(overlaps([body(new THREE.IcosahedronGeometry(0.06, 3), 0.2), slab(6)])).toHaveLength(0);
    // A sphere sunk 2 mm into the slab's top face.
    expect(overlaps([body(new THREE.IcosahedronGeometry(0.06, 3), 0.03 + 0.06 - 0.002), slab(6)])).toHaveLength(0);
    // A mug-sized cylinder sunk 3 mm into a desk top: its whole base crosses, but only from one side.
    expect(overlaps([body(new THREE.CylinderGeometry(0.04, 0.04, 0.09, 24), 0.03 + 0.045 - 0.003), slab(6)])).toHaveLength(0);
  });
});
