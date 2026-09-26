import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { measureHeldRead } from '../blender/checks/pose-held.js';

function fixture() {
  const scene = new THREE.Scene(), prop = new THREE.Group();
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.6, 8), new THREE.MeshBasicMaterial());
  handle.name = 'hammer-handle'; handle.position.y = -0.24;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.13), new THREE.MeshBasicMaterial());
  head.name = 'hammer-head'; head.position.y = -0.5;
  prop.add(handle, head); scene.add(prop);
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(0, 0, 3); camera.lookAt(0, 0, 0); camera.updateMatrixWorld();
  const R = { scene, camera, moments: { staging: () => ({ held: prop }) }, probe: () => ({ hands: [[0, -0.3, 0], [0, 0, 0]] }) };
  const measure = () => { scene.updateMatrixWorld(true); return measureHeldRead(R, 's1'); };
  return { R, scene, prop, handle, head, measure };
}

describe('held hammer readability', () => {
  it('recognizes two palms on a visible connected shaft and cross head', () => {
    const m = fixture().measure();
    expect(m.heldPalmGap).toBeLessThan(0.02);
    expect(m.heldSupportGap).toBeLessThan(0.02);
    expect(m.heldHeadJoint).toBeLessThan(0.08);
    expect(m.heldHandleVisible).toBeGreaterThan(0.5);
    expect(m.heldHeadVisible).toBeGreaterThan(0.5);
    expect(m.heldShaftProjection).toBeGreaterThan(0.6);
    expect(m.heldHeadCross).toBeGreaterThan(0.25);
  });
  it('measures the grip from either hand', () => {
    const f = fixture(); f.prop.userData.primaryHand = 0;
    f.R.probe = () => ({ hands: [[0, 0, 0], [0, -0.3, 0]] });
    const m = f.measure();
    expect(m.heldPalmGap).toBeLessThan(0.02);
    expect(m.heldSupportGap).toBeLessThan(0.02);
    expect(m.heldHeadDistance).toBeCloseTo(0.5);
  });
  it('rejects a disconnected shaft even when the prop origin stays at the palm', () => {
    const f = fixture(); f.handle.position.x = 0.08;
    expect(f.measure().heldPalmGap).toBeGreaterThan(0.02);
    f.head.position.x = 0.2;
    expect(f.measure().heldHeadJoint).toBeGreaterThan(0.08);
  });
  it('detects an occluded handle even when the head is visible', () => {
    const f = fixture();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.35, 0.2), new THREE.MeshBasicMaterial());
    torso.position.set(0, -0.15, 0.3); f.scene.add(torso);
    const m = f.measure();
    expect(m.heldHandleVisible).toBeLessThan(0.5);
    expect(m.heldHeadVisible).toBeGreaterThan(0.5);
  });
  it('detects a shaft pointing into the screen and a head flattened along it', () => {
    const f = fixture(); f.prop.rotation.x = Math.PI / 2;
    expect(f.measure().heldShaftProjection).toBeLessThan(0.1);
    f.prop.rotation.x = 0; f.head.scale.x = 0.1;
    expect(f.measure().heldHeadCross).toBeLessThan(0.25);
  });
  it('fails missing, hidden and offscreen pieces', () => {
    const f = fixture(); f.handle.visible = false;
    expect(f.measure().heldHandleVisible).toBeNull();
    f.handle.visible = true; f.prop.position.x = 3;
    expect(f.measure().heldHandleVisible).toBe(0);
    f.head.removeFromParent();
    expect(f.measure().heldHeadDistance).toBeNull();
  });
});
