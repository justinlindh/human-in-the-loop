import * as THREE from 'three';
import { faceLandmarks } from '../../blender/checks/pose-landmarks.js';
import { carried } from '../../blender/checks/intersect.js';
import { getTemplate } from '../../src/render/models.js';
import { projectTriangles } from '../../blender/checks/pose-projection.js';
import { meshContact, castLandmark } from './geometry.mjs';
import { pathOf, partId, heldName } from './ids.mjs';

const boundsVersions = new WeakMap();
const bounds = mesh => {
  if (mesh.isSkinnedMesh || mesh.morphTargetInfluences) {
    const box = new THREE.Box3(), p = new THREE.Vector3();
    for (let i = 0; i < mesh.geometry.attributes.position.count; i++) box.expandByPoint(mesh.getVertexPosition(i, p).applyMatrix4(mesh.matrixWorld));
    return box;
  }
  if (!mesh.geometry.boundingBox || boundsVersions.get(mesh.geometry) !== mesh.geometry.attributes.position.version) mesh.geometry.computeBoundingBox();
  boundsVersions.set(mesh.geometry, mesh.geometry.attributes.position.version);
  return mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld);
};
const boxJSON = box => box.isEmpty() ? null : { min: box.min.toArray(), max: box.max.toArray() };
const shown = object => { for (let p = object; p; p = p.parent) if (!p.visible) return false; return true; };
const solid = mesh => mesh.isMesh && !mesh.isInstancedMesh && !mesh.userData.pickProxy && !mesh.userData.staffId &&
  [].concat(mesh.material).some(m => m?.visible !== false && !(m?.transparent && m.opacity < 0.5) && m?.depthWrite !== false);

export function inventory(R, S) {
  const owners = new Map(), records = [], assigned = new Set();
  const add = (id, kind, root, extra = {}) => {
    if (!root || assigned.has(root)) return;
    assigned.add(root);
    const meshes = [];
    root.traverse(o => { if (o.isMesh && !o.userData.pickProxy && o.userData.staffId == null) meshes.push(o); });
    const record = { id, kind, root, meshes, ...extra };
    for (const mesh of meshes) owners.set(mesh, record);
    records.push(record);
  };
  for (const e of R.office?.placed.values() ?? []) add(`item:${e.id}`, 'item', e.obj, { itemId: e.itemId, placedId: e.id });
  for (const p of R.props?.current() ?? []) add(`prop:${p.obj.userData.propId ?? p.id ?? p.prop}`, 'prop', p.obj);
  for (const [id, root] of Object.entries(R.office?.current?.walls ?? {})) add(`wall:${id}`, 'wall', root);
  add('wall:columns', 'wall', R.office?.current?.columnSet?.group);
  if (R.robot?.root?.parent) add('robot:office', 'robot', R.robot.root, { activity: R.robot.peek?.() ?? null });
  const extras = R.moments?.extras?.() ?? [];
  let petIndex = 0;
  R.scene.traverse(root => {
    if (root.name === 'character') {
      let staffId = null;
      root.traverse(o => { if (o.userData.staffId != null) staffId = String(o.userData.staffId); });
      const actorId = staffId ?? extras.find(e => e.char?.root === root)?.id ?? pathOf(root);
      add(`person:${actorId}`, 'person', root, { staffId, actorId });
    }
    if (root.name === 'pet') {
      const pet = S.pets?.[petIndex++];
      add(`pet:${pet?.id ?? pathOf(root)}`, 'pet', root, { petId: pet?.id ?? null });
    }
  });
  const heldCount = new Map();
  for (const held of carried(R)) {
    const existing = records.find(r => r.root === held.thing.obj);
    if (existing) Object.assign(existing, { staffId: String(held.staffId), held: true });
    else {
      // Two unnamed things in one hand (a slice's cheese and crust) share a name, so it carries an index.
      const base = `held:${held.staffId}:${heldName(held.thing.obj)}`;
      const n = heldCount.get(base) ?? 0; heldCount.set(base, n + 1);
      add(`${base}:${n}`, 'prop', held.thing.obj, { staffId: String(held.staffId), held: true });
    }
  }
  // Draw batches and unowned environment geometry remain explicit, with structural path ids.
  R.scene.traverse(mesh => {
    if (mesh.isMesh && !mesh.userData.pickProxy && mesh.userData.staffId == null && !owners.has(mesh)) add(`environment:${pathOf(mesh)}`, 'prop', mesh, { role: 'environment-or-draw-batch' });
  });
  for (const record of records) record.meshes = record.meshes.filter(mesh => owners.get(mesh) === record);
  records.sort((a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  return { records, owners };
}

export function projectedHead(head, camera, width, height) {
  const positions = head.geometry.attributes.position;
  const p = new THREE.Vector3();
  let left = Infinity, right = -Infinity, top = Infinity, bottom = -Infinity, clipped = false;
  for (let i = 0; i < positions.count; i++) {
    head.getVertexPosition(i, p).applyMatrix4(head.matrixWorld).project(camera);
    left = Math.min(left, (p.x + 1) * width / 2); right = Math.max(right, (p.x + 1) * width / 2);
    top = Math.min(top, (1 - p.y) * height / 2); bottom = Math.max(bottom, (1 - p.y) * height / 2);
    clipped ||= Math.abs(p.x) > 1 || Math.abs(p.y) > 1 || Math.abs(p.z) > 1;
  }
  if (clipped) {
    const index = head.geometry.index, n = index?.count ?? positions.count;
    const triangles = Array.from({ length: n }, (_, i) => head.getVertexPosition(index ? index.getX(i) : i, new THREE.Vector3()));
    const projected = projectTriangles(triangles, head.matrixWorld, camera, { width, height });
    return { headHeightPx: projected.rect ? projected.rect.bottom - projected.rect.top : null,
      onScreen: projected.status === 'projected', rectangle: projected.rect, clipped: projected.clipped, clippedRectangle: projected.clippedRect };
  }
  const rectangle = { left, right, top, bottom };
  return { headHeightPx: bottom - top, onScreen: true, rectangle, clipped: false, clippedRectangle: rectangle };
}

export function sampleScene(R, S, { frame, who = null, facts = [], width = 1600, height = 1000 } = {}) {
  if (facts.some(f => !['intersections', 'clearances', 'visibility', 'projections', 'occupancy', 'walker'].includes(f))) throw new Error('scene-engine: unknown fact family');
  R.scene.updateMatrixWorld(); R.camera.updateMatrixWorld();
  const { records, owners } = inventory(R, S);
  for (const id of who ?? []) if (!records.some(r => r.staffId === id || r.id === id)) throw new Error(`scene-engine: unknown subject ${id}`);
  const partIds = new Map();
  const wanted = record => !who || who.includes(record.staffId) || who.includes(record.id);
  const objects = records.map(record => {
    const { root } = record;
    const box = new THREE.Box3();
    const parts = record.meshes.map((mesh) => {
      const id = partId(record.id, mesh, record.root); partIds.set(mesh, id);
      const b = bounds(mesh); box.union(b);
      return { id, name: mesh.userData.part || mesh.name || 'unnamed', world: mesh.matrixWorld.toArray(),
        bounds: boxJSON(b), visible: shown(mesh), instanced: !!mesh.isInstancedMesh, skinned: !!mesh.isSkinnedMesh };
    });
    const object = { id: record.id, kind: record.kind, staffId: record.staffId ?? null, itemId: record.itemId ?? null,
      placedId: record.placedId ?? null, role: record.role ?? null, visible: shown(root), world: root.matrixWorld.toArray(), position: root.matrixWorld.elements.slice(12, 15), bounds: boxJSON(box), parts };
    if (record.kind === 'person') {
      const character = globalThis.__sceneCharacters?.get(root);
      const walk = R.walkOf(record.staffId);
      const stage = R.moments?.staging?.(record.actorId);
      object.person = { joints: character ? Object.fromEntries(Object.entries(character.joints()).map(([name, p]) => [name, p.toArray()])) : null,
        hands: character ? character.probe().hands.map(h => h.toArray()) : null,
        activity: character?.anim ?? walk?.temp?.anim ?? walk?.mode ?? null, walk,
        target: stage?.target?.isVector3 ? stage.target.toArray() : stage?.target?.isObject3D ? stage.target.getWorldPosition(new THREE.Vector3()).toArray() : walk?.goal ?? null,
        holds: records.filter(r => r.held && r.staffId === record.staffId).map(r => r.id) };
    }
    return object;
  });
  const result = { schema: 'hitl.scene/0.1', frame, timeSeconds: frame / 30, stepHz: 30,
    state: { week: S.week ?? null, officeStage: S.officeStage ?? null },
    capabilities: { domLayout: false, exactGeneralPenetrationDepth: false, crossMachineByteIdentity: false,
      bounds: 'transformed-local-aabb', stableIds: 'semantic-owners-and-owner-relative-part-paths',
      intersections: 'owned-office-solids-excludes-environment-and-draw-batches',
      instancedMeshParts: 'aggregate-only', cameraViews: 'current' },
    cameras: [{ id: 'current', type: R.camera.type, world: R.camera.matrixWorld.toArray(), projection: R.camera.projectionMatrix.toArray(), width, height }],
    objects: objects.filter((o, i) => o.kind !== 'person' || wanted(records[i])), facts: {} };
  if (facts.includes('occupancy')) {
    const nav = R.office?.nav();
    result.facts.occupancy = nav ? { nx: nav.nx, nz: nav.nz, cellM: nav.cell, order: 'x+z*nx',
      origin: [-R.office.current.L.W / 2, -R.office.current.L.D / 2], blocked: Array.from(nav.blocked), obstacles: R.office.obstacles() } : null;
  }
  // Why each walking person moves as they do (the renderer's own record: route, next waypoint, heading, speed,
  // the drift rule that fired, the wait): only people who are walking have one.
  if (facts.includes('walker')) {
    if (!R.walkDebug) throw new Error('scene-engine: --facts walker needs R.walkDebug (a checkout that predates it)');
    result.facts.walkers = records.filter(r => r.kind === 'person' && wanted(r)).map(r => ({ id: r.id, ...R.walkDebug(r.staffId) })).filter(w => w.path);
  }
  if (facts.includes('visibility') || facts.includes('projections')) {
    const local = faceLandmarks(getTemplate('chibi'));
    const landmarks = [['eyeLeft', local.EyeLeft[0]], ['eyeRight', local.EyeRight[0]], ['browLeft', local.Brow[0]], ['browRight', local.Brow[1]], ['forehead', local.Forehead[0]], ['mouth', local.Mouth[0]], ['chin', local.Chin[0]]];
    result.facts.people = records.filter(r => r.kind === 'person' && wanted(r)).map(record => {
      const head = record.meshes.find(m => m.userData.part === 'head');
      if (!head) return { id: record.id, error: 'head-unavailable' };
      return { id: record.id,
        ...(facts.includes('projections') ? { projection: projectedHead(head, R.camera, width, height) } : {}),
        ...(facts.includes('visibility') ? { landmarks: landmarks.map(([name, point]) => ({ name,
          ...castLandmark(R.scene, R.camera, point.clone().applyMatrix4(head.parent.matrixWorld), {
            exclude: mesh => mesh.parent === head.parent && mesh.name === 'baked' && mesh.userData.noAO && !mesh.userData.part,
            identify: mesh => partIds.get(mesh) ?? owners.get(mesh)?.id ?? pathOf(mesh),
          }) })) } : {}),
      };
    });
  }
  if (facts.includes('intersections') || facts.includes('clearances')) {
    const physical = records.filter(r => !r.role);
    const contacts = [], clearances = [];
    for (let i = 0; i < physical.length; i++) for (let j = i + 1; j < physical.length; j++) {
      const a = physical[i], b = physical[j];
      if (who && !wanted(a) && !wanted(b)) continue;
      if (a.kind === 'wall' && b.kind === 'wall') continue;
      const wantClearance = facts.includes('clearances') && ((a.kind === 'person' && b.kind === 'item') || (b.kind === 'person' && a.kind === 'item'));
      let nearest = null, bestGap = 0.5;
      const activeMeshes = record => record.meshes.filter(mesh => solid(mesh) && (record.kind === 'item' || record.kind === 'wall' || shown(mesh)));
      for (const ma of activeMeshes(a)) for (const mb of activeMeshes(b)) {
        const ba = bounds(ma), bb = bounds(mb);
        const lower = Math.hypot(...['x', 'y', 'z'].map(axis => Math.max(0, ba.min[axis] - bb.max[axis], bb.min[axis] - ba.max[axis])));
        const clearance = wantClearance && lower <= bestGap && bestGap > 0;
        if (!clearance && !(facts.includes('intersections') && ba.intersectsBox(bb))) continue;
        const contact = meshContact(ma, mb, { clearance });
        const row = { a: partIds.get(ma), b: partIds.get(mb), ...contact };
        if (contact.intersects && facts.includes('intersections')) contacts.push(row);
        if (clearance && contact.clearanceM != null && contact.clearanceM <= bestGap) {
          bestGap = contact.clearanceM;
          nearest = { a: a.id, b: b.id, partA: row.a, partB: row.b, clearanceM: bestGap };
        }
      }
      if (nearest) clearances.push(nearest);
    }
    if (facts.includes('intersections')) result.facts.intersections = contacts;
    if (facts.includes('clearances')) result.facts.clearances = clearances;
  }
  return result;
}

// Sorted keys and fixed precision remove serialization order and insignificant numeric noise.
export function canonical(value) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('scene-engine: non-finite output');
    return Math.round(value * 1e6) / 1e6 || 0;
  }
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])]));
  return value;
}
