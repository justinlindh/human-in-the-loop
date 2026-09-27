import { afterEach, beforeAll, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { measureScene } from '../blender/checks/pose-scene.js';
import { createCharacter } from '../src/render/character.js';
import { setRigEnabled } from '../src/render/rig.js';

const models = vi.hoisted(() => new Map());
vi.mock('../src/render/models.js', () => ({ getTemplate: name => models.get(name), loadModels: async () => {} }));
beforeAll(async () => {
  for (const name of ['chibi', 'chibi_rig']) {
    const b = readFileSync(new URL(`../public/models/${name}.glb`, import.meta.url));
    const gltf = await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '');
    gltf.scene.userData.clips = gltf.animations;
    models.set(name, gltf.scene);
  }
});
afterEach(() => vi.unstubAllGlobals());

function fixture(width = 640, height = 480) {
  const ctx = new Proxy({}, { get: (_, k) => k === 'createRadialGradient' ? () => ({ addColorStop() {} }) : () => {} });
  const canvas = { getBoundingClientRect: () => ({ left: 37, top: 53, width, height }), getContext: () => ctx };
  vi.stubGlobal('document', { createElement: () => canvas, querySelector: () => canvas, querySelectorAll: () => [] });
  const c = createCharacter({}, undefined, { seed: 'projection' });
  c.root.traverse(o => { if (o.userData.noAO && !o.visible && o.isMesh) o.userData.staffId = 's1'; });
  const scene = new THREE.Scene(), parent = new THREE.Group(); scene.add(parent); parent.add(c.root);
  const camera = new THREE.OrthographicCamera(-2, 2, 2, -1, 0.1, 100);
  camera.position.set(0, 0, 5);
  const R = { scene, camera, probe: () => ({ ...c.probe(), visible: 1, faceCam: 0 }) };
  const measure = () => measureScene(R, {}, { who: ['s1'] })[0];
  const part = name => { let found; c.root.traverse(o => { if (o.userData.part === name) found = o; }); return found; };
  return { c, R, parent, camera, canvas, measure, part, width, height };
}

// Independent oracle: project the unbaked template hand through the authored wrist and shoulder.
function handBounds(f, side) {
  const mesh = models.get('chibi').getObjectByName('hand');
  const arm = f.part(side === 'left' ? 'armL' : 'armR');
  const points = Array.from({ length: mesh.geometry.attributes.position.count }, (_, i) => {
    const p = new THREE.Vector3().fromBufferAttribute(mesh.geometry.attributes.position, i).applyMatrix4(mesh.matrix);
    p.y -= 0.2;
    p.applyMatrix4(arm.parent.matrixWorld).project(f.camera);
    return { x: (p.x + 1) * f.width / 2, y: (1 - p.y) * f.height / 2 };
  });
  return { left: Math.min(...points.map(p => p.x)), right: Math.max(...points.map(p => p.x)), top: Math.min(...points.map(p => p.y)), bottom: Math.max(...points.map(p => p.y)) };
}
function closeRect(a, b) { for (const k of ['left', 'right', 'top', 'bottom']) expect(a[k]).toBeCloseTo(b[k], 4); }

it.each([false, true])('exports actual hand geometry across moving poses, rig=%s', async rig => {
  await setRigEnabled(rig);
  const f = fixture();
  const snapshots = [];
  for (const anim of ['typing', 'wave', 'facepalm']) {
    f.c.setAnim(anim);
    for (let i = 0; i < 20; i++) f.c.update(1 / 30);
    f.parent.position.set(0.1, 0.2, -0.1); f.parent.rotation.set(0.1, 0.2, 0.05);
    const row = f.measure();
    expect(row.projected).toBeDefined();
    expect(row.projected.units).toBe('css-pixels');
    for (const side of ['left', 'right']) {
      const hand = row.projected.hands[side];
      expect(hand.status).toBe('projected');
      closeRect(hand.rect, handBounds(f, side));
    }
    expect(row.projected.face.rect.bottom - row.projected.face.rect.top).toBeGreaterThan(0);
    snapshots.push(row.projected.hands.left.rect);
    expect(JSON.parse(JSON.stringify(row))).toEqual(row);
  }
  expect(snapshots[0]).not.toEqual(snapshots[1]);
});

it('projects head vertices independently through head and parent motion and different views/canvases', () => {
  for (const [width, height] of [[640, 480], [1200, 300]]) {
    const f = fixture(width, height);
    f.c.head.rotation.set(0.4, -0.7, 0.2);
    f.parent.rotation.set(-0.1, 0.3, 0.2); f.parent.scale.set(1.2, 0.9, 1.1);
    for (const direction of [1, -1]) {
      f.camera.position.set(direction * 3, 2, direction * 4); f.camera.lookAt(0, 0.5, 0);
      const row = f.measure(), head = f.part('head'), pos = head.geometry.attributes.position;
      const points = Array.from({ length: pos.count }, (_, i) => new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(head.matrixWorld).project(f.camera));
      closeRect(row.projected.face.rect, {
        left: (Math.min(...points.map(p => p.x)) + 1) * width / 2,
        right: (Math.max(...points.map(p => p.x)) + 1) * width / 2,
        top: (1 - Math.max(...points.map(p => p.y))) * height / 2,
        bottom: (1 - Math.min(...points.map(p => p.y))) * height / 2,
      });
      for (const side of ['left', 'right']) closeRect(row.projected.hands[side].rect, handBounds(f, side));
      expect(row.projected.canvas).toEqual({ width, height, clientLeft: 37, clientTop: 53 });
      expect(row.facePx).toBeCloseTo(row.projected.face.coverageRect.bottom - row.projected.face.coverageRect.top, 0);
      expect(row.heldGap).toBeNull();
      expect(row.faceSamples).toHaveLength(7);
    }
  }
});

it('reports hidden hands and rejects absent or unsupported hand geometry', () => {
  const f = fixture(), left = f.part('armL');
  left.parent.visible = false;
  expect(f.measure().projected.hands.left).toEqual({ status: 'hidden', rect: null, clippedRect: null, clipped: false });
  left.parent.visible = true; left.material = left.material.clone(); left.material.visible = false;
  expect(f.measure().projected.hands.left.status).toBe('hidden');
  left.material.visible = true; left.layers.set(2);
  expect(f.measure().projected.hands.left.status).toBe('hidden');
  left.layers.set(0); left.geometry = left.geometry.clone();
  const pos = left.geometry.attributes.position;
  pos.setX(pos.count - 1, pos.getX(pos.count - 1) + 0.2);
  expect(() => f.measure()).toThrow('unsupported baked hand geometry');
  left.removeFromParent();
  expect(() => f.measure()).toThrow('projected left hand requires');
});

it('retains missing-frame failures for hidden subjects', async () => {
  const { judgeScene } = await import('../blender/checks/pose-rules.js');
  const f = fixture(), row = { frame: 0, ...f.measure() };
  f.parent.visible = false;
  expect(measureScene(f.R, {}, { who: ['s1'] })).toEqual([]);
  expect(judgeScene([row], [0, 1], ['s1'], []).pass).toBe(false);
});

it('clips hands at canvas, near and far planes without zero rectangles', () => {
  const f = fixture(), left = f.part('armL');
  left.parent.position.x = -2;
  const edge = f.measure().projected.hands.left;
  expect(edge.clipped).toBe(true);
  expect(edge.rect.left).toBeLessThan(0);
  expect(edge.clippedRect.left).toBeCloseTo(0);
  left.parent.position.x = -4;
  const off = f.measure().projected.hands.left;
  expect(off.status).toBe('offscreen'); expect(off.rect).not.toBeNull(); expect(off.clippedRect).toBeNull();
  left.parent.position.set(0, 0.4, 5);
  expect(f.measure().projected.hands.left).toMatchObject({ status: 'offscreen', rect: null, clippedRect: null });
  left.parent.position.z = -100;
  expect(f.measure().projected.hands.left).toMatchObject({ status: 'offscreen', rect: null, clippedRect: null });
});

it('serializes stable label/emote identities, overlap associations, filtering and canvas-relative bounds', () => {
  const f = fixture();
  const makeLabel = (kind, x, opacity = '1') => {
    const r = { left: x, right: x + 160, top: 160, bottom: 260, width: 160, height: 100 };
    const inner = { textContent: 'Same text', getBoundingClientRect: () => r };
    return { style: { opacity }, isConnected: true, classList: { contains: c => c === kind }, querySelector: () => inner };
  };
  const speech = makeLabel('hitl-say', 300), stat = makeLabel('hitl-stat', 20), sign = makeLabel('hitl-sign', 200), faint = makeLabel('hitl-say', 0, '0.5');
  let labels = [speech, stat, sign, faint];
  document.querySelectorAll = () => labels;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial());
  sprite.renderOrder = 10; sprite.position.set(0, 1.6, 0); sprite.scale.set(0.5, 0.4, 1); f.c.root.add(sprite);
  const row = f.measure(), overlays = row.projected.overlays;
  expect(overlays.map(o => o.kind)).toEqual(['bubble', 'stat', 'label', 'emote']);
  expect(overlays[0].subjectId).toBeNull(); expect(overlays[0].overlapsFace).toBe(true);
  expect(overlays[1].rect.left).toBe(-17); expect(overlays[1].clippedRect.left).toBe(0);
  expect(overlays[3].subjectId).toBe('s1');
  closeRect(overlays[3].rect, { left: 280, right: 360, top: 32, bottom: 96 });
  expect(row.coveredBy).toBe('bubble "Same text"');
  expect(row.faceCovered).toBeGreaterThan(0);
  labels = [stat, speech]; sprite.visible = false;
  const next = f.measure().projected.overlays;
  expect(next.map(o => o.id)).toEqual([overlays[1].id, overlays[0].id, overlays[3].id]);
  expect(next[2]).toMatchObject({ status: 'hidden', rect: null, clippedRect: null, overlapsFace: false });
  speech.style.display = 'none'; stat.isConnected = false;
  expect(f.measure().projected.overlays).toHaveLength(1);
});

it('clips perspective triangles spanning the viewport and crossing the near plane', async () => {
  const { projectTriangles } = await import('../blender/checks/pose-projection.js');
  const camera = new THREE.PerspectiveCamera(90, 1, 1, 10); camera.updateMatrixWorld();
  const tri = coords => coords.map(p => new THREE.Vector3(...p));
  const project = coords => projectTriangles(tri(coords), new THREE.Matrix4(), camera, { width: 200, height: 200 });
  // At z=-2 the frustum is [-2,2] in x/y. All vertices are outside, but the triangle covers it.
  const spanning = project([[-10, -10, -2], [10, -10, -2], [0, 10, -2]]);
  closeRect(spanning.clippedRect, { left: 0, right: 200, top: 0, bottom: 200 });
  const near = project([[-0.5, 0, -0.5], [0.5, 0, -2], [0, 0.5, -2]]);
  // Near intersections: (-1/6,0,-1) and (-1/3,1/6,-1).
  closeRect(near.rect, { left: 100 - 100 / 3, right: 125, top: 75, bottom: 100 });
  expect(near.clipped).toBe(true);
  expect(project([[0, 0, 1], [0.1, 0, 1], [0, 0.1, 1]])).toMatchObject({ status: 'offscreen', rect: null, clippedRect: null });
  expect(() => project([[NaN, 0, -2], [0, 0, -2], [0, 1, -2]])).toThrow('nonfinite');
});

it('projects rotated emote quads with noncentral anchors and perspective size attenuation', () => {
  const f = fixture();
  f.camera = f.R.camera = new THREE.PerspectiveCamera(90, f.width / f.height, 0.1, 100);
  f.camera.position.set(0, 0, 5);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ rotation: Math.PI / 2, sizeAttenuation: false }));
  sprite.renderOrder = 10; sprite.center.set(0, 0); sprite.scale.set(0.2, 0.4, 1); f.c.root.add(sprite);
  let emote = f.measure().projected.overlays[0];
  // Nonattenuated size in a 90-degree camera: 0.4 units maps to 0.4 * height/2 pixels.
  closeRect(emote.rect, { left: 224, right: 320, top: 192, bottom: 240 });
  sprite.position.z = -5;
  closeRect(f.measure().projected.overlays[0].rect, emote.rect);
  sprite.material.sizeAttenuation = true;
  closeRect(f.measure().projected.overlays[0].rect, { left: 310.4, right: 320, top: 235.2, bottom: 240 });
  sprite.position.x = 100;
  emote = f.measure().projected.overlays[0];
  expect(emote.status).toBe('offscreen'); expect(emote.clippedRect).toBeNull();
});

it('shares overlay IDs across subject rows without assigning an unknown speaker', () => {
  const f = fixture(), second = f.c.root.clone();
  second.traverse(o => { if (o.userData.staffId) o.userData.staffId = 's2'; });
  second.position.x = 1; f.R.scene.add(second);
  const inner = { textContent: 'Label', getBoundingClientRect: () => ({ left: 100, right: 200, top: 100, bottom: 130, width: 100, height: 30 }) };
  document.querySelectorAll = () => [{ style: {}, isConnected: true, querySelector: () => inner, classList: { contains: () => false } }];
  const rows = measureScene(f.R, {});
  expect(rows.map(r => r.id)).toEqual(['s1', 's2']);
  expect(rows[0].projected.overlays[0].id).toBe(rows[1].projected.overlays[0].id);
  expect(rows[0].projected.overlays[0].subjectId).toBeNull();
});
