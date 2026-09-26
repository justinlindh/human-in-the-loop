import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { color } from './materials.js';
import { footprint, placedTransform, tileCenter, worldToTile } from './layout.js';
import { buildPlacedModel } from './office.js';

// Build-mode visuals: a tile grid over the floor, a ghost of the item under the cursor tinted by
// the UI's validator, and a hover plate on placed furniture in select mode.
//
// setMode(null)                               off
// setMode({ select: true })                   hover highlight on placed items
// setMode({ itemId, rot, level?, moveId? })   ghost placement; moveId hides the item being moved
export function createBuild({ office, getCamera, canvas }) {
  const group = new THREE.Group();
  group.name = 'build';
  let attached = null;
  let mode = null;
  let validator = null;
  let ghost = null;
  let ghostKey = '';
  let target = null;          // { x, y, rot, ok, reason }
  let hoverId = null;
  let hidden = null;
  let gridFor = null;
  let grid = null;
  const pointer = { x: 0, y: 0, seen: false };
  const validCache = new Map();

  const ghostMats = {
    ok: new THREE.MeshStandardMaterial({ color: color('tone_good'), transparent: true, opacity: 0.72, roughness: 0.6, depthWrite: false, emissive: color('tone_good'), emissiveIntensity: 0.3 }),
    bad: new THREE.MeshStandardMaterial({ color: color('alarm_red'), transparent: true, opacity: 0.72, roughness: 0.6, depthWrite: false, emissive: color('alarm_red'), emissiveIntensity: 0.35 }),
  };
  const plateMats = {
    ok: new THREE.MeshBasicMaterial({ color: color('tone_good'), transparent: true, opacity: 0.5, depthWrite: false }),
    bad: new THREE.MeshBasicMaterial({ color: color('alarm_red'), transparent: true, opacity: 0.5, depthWrite: false }),
    hover: new THREE.MeshBasicMaterial({ color: color('lamp_warm'), transparent: true, opacity: 0.45, depthWrite: false }),
  };
  const plateGeo = new THREE.PlaneGeometry(0.94, 0.94).rotateX(-Math.PI / 2);
  const plates = new THREE.Group();
  group.add(plates);
  // Adjacency preview: plates under the placed items the UI names, shown whenever any are set.
  const marks = new THREE.Group();
  marks.name = 'buildMarks';
  let markIds = [];
  const markMat = new THREE.MeshBasicMaterial({ color: color('gold'), transparent: true, opacity: 0.7, depthWrite: false, toneMapped: false });

  // A mouse aims by hovering. Touch has no hover: a tap aims at a tile (aim), and a drag that
  // starts on the ghost carries it; any other drag pans the camera and leaves the ghost where it is.
  let aimTile = null;  // touch aim: { x, y } tile under the finger, or null
  let grab = null;     // pointerId of the finger carrying the ghost
  function onMove(e) {
    if (e.pointerType === 'mouse') { pointer.x = e.clientX; pointer.y = e.clientY; pointer.seen = true; aimTile = null; return; }
    if (grab === e.pointerId) { const t = pickTile(e.clientX, e.clientY); if (t) aimTile = t; }
  }
  // Runs before the camera's own listener on the canvas, so a grab never pans.
  function onDown(e) {
    if (e.pointerType === 'mouse' || !mode?.itemId || !target) return;
    const t = pickTile(e.clientX, e.clientY);
    const f = footprint(mode.itemId, target.rot);
    if (!t || t.x < target.x - 1 || t.x > target.x + f.w || t.y < target.y - 1 || t.y > target.y + f.h) return;
    grab = e.pointerId;
    e.stopImmediatePropagation();
    try { canvas.setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
  }
  function onUp(e) { if (grab === e.pointerId) grab = null; }
  addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerdown', onDown, { capture: true });
  addEventListener('pointerup', onUp);
  addEventListener('pointercancel', onUp);

  // The placement corner for a tile under the finger: big footprints are centred on it.
  function corner(L, t, rot) {
    const f = footprint(mode.itemId, rot);
    return {
      x: Math.max(0, Math.min(L.grid.w - f.w, t.x - Math.floor((f.w - 1) / 2))),
      y: Math.max(0, Math.min(L.grid.h - f.h, t.y - Math.floor((f.h - 1) / 2))),
    };
  }
  // Touch: aim the ghost at the tile under a screen point. Returns the placement corner, or null
  // off the floor (the aim is kept).
  function aim(cx, cy) {
    const cur = office.current;
    const t = pickTile(cx, cy);
    if (!t || !cur || !mode?.itemId) return null;
    aimTile = t;
    return corner(cur.L, t, mode.rot ?? 0);
  }

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const hit = new THREE.Vector3();
  function ray(cx, cy) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((cx - rect.left) / rect.width) * 2 - 1, -((cy - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, getCamera());
    return raycaster;
  }

  function pickTile(cx, cy) {
    const cur = office.current;
    if (!cur) return null;
    if (!ray(cx, cy).ray.intersectPlane(floor, hit)) return null;
    const t = worldToTile(cur.L, hit.x, hit.z);
    if (t.x < 0 || t.y < 0 || t.x >= cur.L.grid.w || t.y >= cur.L.grid.h) return null;
    return t;
  }

  function pickPlaced(cx, cy) {
    const cur = office.current;
    if (!cur) return null;
    const hits = ray(cx, cy).intersectObjects(cur.furniture.children, true);
    for (const h of hits) {
      let o = h.object;
      while (o && o.userData.placedId === undefined) o = o.parent;
      if (o) return o.userData.placedId;
    }
    // No mesh under the cursor: fall back to whichever footprint covers the tile.
    const t = pickTile(cx, cy);
    if (!t) return null;
    for (const e of office.placed.values()) {
      const f = footprint(e.itemId, e.rot);
      if (t.x >= e.x && t.x < e.x + f.w && t.y >= e.y && t.y < e.y + f.h) return e.id;
    }
    return null;
  }

  // Grid lines as thin floor strips (GL lines are one pixel wide and vanish at gameplay zoom).
  function buildGrid(L) {
    const strips = [];
    const x0 = -L.W / 2, z0 = -L.D / 2, t = 0.04;
    for (let i = 0; i <= L.grid.w; i++) strips.push(new THREE.PlaneGeometry(t, L.grid.h).rotateX(-Math.PI / 2).translate(x0 + i, 0.012, z0 + L.grid.h / 2));
    for (let k = 0; k <= L.grid.h; k++) strips.push(new THREE.PlaneGeometry(L.grid.w, t).rotateX(-Math.PI / 2).translate(x0 + L.grid.w / 2, 0.012, z0 + k));
    const g = mergeGeometries(strips, false);
    for (const x of strips) x.dispose();
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: color('ink'), transparent: true, opacity: 0.28, depthWrite: false }));
  }

  function clearGhost() {
    if (ghost) { ghost.removeFromParent(); ghost = null; }
    ghostKey = '';
    target = null;
  }

  function showHidden(on) {
    if (hidden) hidden.visible = on;
    if (on) hidden = null;
  }

  function setMode(m) {
    showHidden(true);
    // Rotating or placing another of the same item keeps the touch aim; a new item starts fresh.
    if (!m?.itemId || m.itemId !== mode?.itemId || m.moveId !== mode?.moveId) { aimTile = null; grab = null; }
    mode = m && (m.select || m.itemId) ? { ...m } : null;
    if (typeof m?.validate === 'function') validator = m.validate;
    validCache.clear();
    if (!mode?.itemId) clearGhost();
    if (mode?.moveId) {
      hidden = office.placed.get(mode.moveId)?.obj ?? null;
      if (hidden) hidden.visible = false;
    }
    hoverId = null;
  }

  function validate(x, y, rot) {
    if (!validator) return { ok: true };
    const key = `${mode.itemId}|${x}|${y}|${rot}|${mode.moveId ?? ''}`;
    let v = validCache.get(key);
    if (!v) {
      const r = validator(x, y, rot);
      v = typeof r === 'object' && r ? { ok: !!r.ok, reason: r.reason ?? null } : { ok: !!r, reason: null };
      validCache.set(key, v);
    }
    return v;
  }

  function setPlates(list, material) {
    while (plates.children.length > list.length) plates.remove(plates.children[plates.children.length - 1]);
    while (plates.children.length < list.length) plates.add(new THREE.Mesh(plateGeo, material));
    list.forEach((p, i) => {
      const m = plates.children[i];
      m.material = material;
      m.position.set(p.x, 0.032, p.z);
    });
  }

  function footprintTiles(L, x, y, w, h) {
    const out = [];
    for (let i = 0; i < w; i++) for (let k = 0; k < h; k++) out.push(tileCenter(L, x + i, y + k));
    return out;
  }

  function highlightItems(ids) {
    markIds = Array.isArray(ids) ? ids.slice() : [];
    marksDirty = true;
  }
  let marksDirty = false;
  function updateMarks(cur) {
    if (!marksDirty) return;
    marksDirty = false;
    marks.clear();
    for (const id of markIds) {
      const e = office.placed.get(id);
      if (!e) continue;
      const f = footprint(e.itemId, e.rot);
      for (const c of footprintTiles(cur.L, e.x, e.y, f.w, f.h)) {
        const m = new THREE.Mesh(plateGeo, markMat);
        m.position.set(c.x, 0.034, c.z);
        marks.add(m);
      }
    }
  }

  // Validation results depend on sim state, so they are dropped whenever the office changes.
  function invalidate() { validCache.clear(); marksDirty = true; }

  function update(dt, scene) {
    const cur = office.current;
    if (attached !== scene) { scene.add(group); scene.add(marks); attached = scene; }
    if (cur) updateMarks(cur);
    const t0 = performance.now() / 1000;
    markMat.opacity = 0.85 + 0.12 * Math.sin(t0 * 4);
    marks.visible = !!cur && markIds.length > 0;
    group.visible = !!mode && !!cur;
    if (!mode || !cur) return;
    if (gridFor !== cur) {
      if (grid) { grid.removeFromParent(); grid.geometry.dispose(); }
      grid = buildGrid(cur.L);
      group.add(grid);
      gridFor = cur;
      clearGhost();
    }
    if (mode.select) {
      hoverId = pointer.seen ? pickPlaced(pointer.x, pointer.y) : null;
      const e = hoverId && office.placed.get(hoverId);
      if (e) { const f = footprint(e.itemId, e.rot); setPlates(footprintTiles(cur.L, e.x, e.y, f.w, f.h), plateMats.hover); }
      else setPlates([], plateMats.hover);
      return;
    }
    const rot = mode.rot ?? 0;
    const key = `${mode.itemId}|${mode.level ?? 1}|${cur.stage}`;
    if (ghostKey !== key) {
      if (ghost) ghost.removeFromParent();
      ghost = buildPlacedModel({ itemId: mode.itemId, level: mode.level ?? 1, rot: 0 }, cur.stage);
      ghost.traverse((c) => { if (c.isMesh) { c.material = ghostMats.ok; c.castShadow = false; c.receiveShadow = false; c.renderOrder = 3; } });
      ghost.visible = false;
      group.add(ghost);
      ghostKey = key;
    }
    const t = aimTile ?? (pointer.seen ? pickTile(pointer.x, pointer.y) : null);
    if (!t) { ghost.visible = false; setPlates([], plateMats.ok); target = null; return; }
    const f = footprint(mode.itemId, rot);
    const { x, y } = corner(cur.L, t, rot);
    const v = validate(x, y, rot);
    target = { x, y, rot, ok: v.ok, reason: v.reason };
    const tr = placedTransform(cur.L, { itemId: mode.itemId, x, y, rot });
    if (!ghost.visible) { ghost.position.set(tr.x, 0, tr.z); ghost.rotation.y = tr.rotY; ghost.visible = true; }
    const k = 1 - Math.exp(-dt * 18);
    ghost.position.x += (tr.x - ghost.position.x) * k;
    ghost.position.z += (tr.z - ghost.position.z) * k;
    let dr = ((tr.rotY - ghost.rotation.y + Math.PI) % (Math.PI * 2)) - Math.PI;
    if (dr < -Math.PI) dr += Math.PI * 2;
    ghost.rotation.y += dr * k;
    ghost.position.y = 0.02 + Math.sin(performance.now() / 260) * 0.015;
    const m = v.ok ? ghostMats.ok : ghostMats.bad;
    ghost.traverse((c) => { if (c.isMesh && c.material !== m) c.material = m; });
    setPlates(footprintTiles(cur.L, x, y, f.w, f.h), v.ok ? plateMats.ok : plateMats.bad);
  }

  function dispose() {
    removeEventListener('pointermove', onMove);
    canvas.removeEventListener('pointerdown', onDown, { capture: true });
    removeEventListener('pointerup', onUp);
    removeEventListener('pointercancel', onUp);
    group.removeFromParent();
  }

  return {
    setMode, aim, pickTile, pickPlaced, highlightItems, update, invalidate, dispose,
    set validator(fn) { validator = typeof fn === 'function' ? fn : null; validCache.clear(); },
    get validator() { return validator; },
    get target() { return target; },
    get hoverId() { return hoverId; },
    get mode() { return mode; },
    get grabbing() { return grab !== null; },
  };
}
