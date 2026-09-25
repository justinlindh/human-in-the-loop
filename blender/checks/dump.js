// In-page scene dump (dump.mjs): exact positions, poses and screen boxes of every character, item
// and staged prop on the current frame, and an annotated copy of the frame.
//
//   dumpFrame(R, S)      -> { people: [...], items: [...], props: [...], camera }
//   annotate(R, frame)   -> PNG data URL: the frame with ids, screen boxes, facing arrows, gaze rays
//
// World coordinates are metres (y up; the floor is y = 0). Screen coordinates are canvas pixels from
// the top left. Yaw is radians about y; a character with yaw 0 faces +z. Nothing here changes the
// scene or the game, and three.js objects made here draw from their own random stream, not the
// game's (three.js takes a UUID from Math.random for each one).
import * as THREE from 'three';

let toolSeed = 424243;
function ownRandom(fn) {
  const game = Math.random;
  Math.random = () => { toolSeed = (toolSeed * 16807) % 2147483647; return (toolSeed - 1) / 2147483646; };
  try { return fn(); } finally { Math.random = game; }
}

const r3 = (v) => (v ? [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)] : null);
const r2 = (p) => (p ? [+p.x.toFixed(1), +p.y.toFixed(1)] : null);
const arr3 = (a) => (a ? a.map((x) => +x.toFixed(3)) : null);

function screenOf(R, v) {
  const c = document.querySelector('canvas');
  const p = v.clone().project(R.camera);
  return { x: ((p.x + 1) / 2) * c.width, y: ((1 - p.y) / 2) * c.height, on: Math.abs(p.x) <= 1 && Math.abs(p.y) <= 1 && p.z < 1 };
}
// A world box's outline on screen, as [left, top, width, height] in canvas pixels.
function screenBox(R, box) {
  if (!box || box.isEmpty()) return null;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < 8; i++) {
    const s = screenOf(R, new THREE.Vector3(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z));
    x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
  }
  return [+x0.toFixed(1), +y0.toFixed(1), +(x1 - x0).toFixed(1), +(y1 - y0).toFixed(1)];
}
const boxJson = (b) => (b && !b.isEmpty() ? { min: r3(b.min), max: r3(b.max) } : null);

function characters(R) {
  const out = new Map();
  R.scene.traverse((o) => {
    if (o.name !== 'character') return;
    let id = null;
    o.traverse((c) => { if (c.userData.staffId !== undefined) id = c.userData.staffId; });
    out.set(id ?? `visitor:${out.size}`, o);
  });
  return out;
}

// A body part's world points: the lowest (feet), or the centre (head, hands).
function partOf(root, name) { let m = null; root.traverse((c) => { if (!m && c.userData.part === name) m = c; }); return m; }
function lowest(mesh) {
  const pos = mesh.geometry.attributes.position, v = new THREE.Vector3();
  let best = null;
  for (let i = 0; i < pos.count; i += 3) { v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); if (!best || v.y < best.y) best = v.clone(); }
  return best;
}

export function dumpFrame(R, S) {
  return ownRandom(() => {
    R.scene.updateMatrixWorld();
    const people = [];
    for (const [id, root] of characters(R)) {
      if (!root.visible) continue;
      const staff = S.staff?.find((p) => p.id === id);
      const probe = staff ? R.probe?.(id) ?? null : null;
      const pk = staff ? R.perks?.peek(id) ?? null : null;
      const st = staff ? R.moments?.staging?.(id) ?? null : null;
      const box = new THREE.Box3();
      root.traverse((c) => { if (c.isMesh && c.userData.part) { c.geometry.computeBoundingBox(); box.union(c.geometry.boundingBox.clone().applyMatrix4(c.matrixWorld)); } });
      const pos = new THREE.Vector3().setFromMatrixPosition(root.matrixWorld);
      const yaw = new THREE.Euler().setFromQuaternion(root.getWorldQuaternion(new THREE.Quaternion()), 'YXZ').y;
      const head = partOf(root, 'head');
      const headAt = head ? new THREE.Box3().setFromObject(head).getCenter(new THREE.Vector3()) : null;
      const feet = ['legL', 'legR'].map((n) => partOf(root, n)).map((m) => (m ? lowest(m) : null));
      const hands = probe?.hands?.map((h) => new THREE.Vector3(...(h.isVector3 ? [h.x, h.y, h.z] : h))) ?? [];
      const held = st?.held ?? null;
      people.push({
        id, name: staff?.name ?? null, role: staff?.role ?? null, mood: staff?.mood ?? null,
        pos: r3(pos), yaw: +yaw.toFixed(3), bounds: boxJson(box), screen: screenBox(R, box),
        anim: probe?.anim ?? pk?.temp?.anim ?? null, animT: pk?.temp?.t != null ? +pk.temp.t.toFixed(2) : null,
        moment: st?.moment ?? null, beat: st?.beat ?? null,
        seated: R.isSeated?.(id) ?? null, seat: pk?.seat ?? null, using: pk?.temp?.key ?? null, walking: !!pk?.path,
        head: headAt ? { world: r3(headAt), screen: r2(screenOf(R, headAt)) } : null,
        eyes: arr3(probe?.eyes), forward: arr3(probe?.forward),
        hands: hands.map((h) => ({ world: r3(h), screen: r2(screenOf(R, h)) })),
        feet: feet.map((f) => (f ? { world: r3(f), screen: r2(screenOf(R, f)) } : null)),
        held: held ? { name: held.name || null, world: r3(new THREE.Box3().setFromObject(held).getCenter(new THREE.Vector3())), ...(probe?.held ?? {}) } : null,
        gaze: probe?.gaze ?? null, faceCam: probe?.faceCam ?? null, visible: probe?.visible ?? null,
      });
    }
    const items = [];
    for (const e of R.office?.placed.values() ?? []) {
      const box = new THREE.Box3().setFromObject(e.obj);
      items.push({
        id: e.id, itemId: e.itemId, level: e.level, tile: { x: e.x, y: e.y, rot: e.rot }, desk: !!e.desk,
        pos: r3(e.obj.position), yaw: +e.obj.rotation.y.toFixed(3), bounds: boxJson(box), screen: screenBox(R, box),
        seat: e.desk?.seat ? { x: +e.desk.seat.x.toFixed(3), z: +e.desk.seat.z.toFixed(3) } : null,
      });
    }
    const props = [];
    for (const p of R.props?.current() ?? []) {
      const box = new THREE.Box3().setFromObject(p.obj);
      props.push({ id: p.obj.userData.propId ?? null, prop: p.prop, pos: r3(p.obj.position), yaw: +p.obj.rotation.y.toFixed(3), bounds: boxJson(box), screen: screenBox(R, box), deskId: p.obj.userData.follow?.deskId ?? null });
    }
    const c = document.querySelector('canvas');
    return { people, items, props, camera: { pos: r3(R.camera.position), zoom: R.camera.zoom, width: c.width, height: c.height } };
  });
}

// The current frame with the dump drawn over it: item boxes (thin), people boxes with ids, facing
// arrows on the floor, gaze rays from the eyes, and hands as dots.
export function annotate(R, f) {
  const src = document.querySelector('canvas');
  const t = document.createElement('canvas');
  t.width = src.width; t.height = src.height;
  const g = t.getContext('2d');
  g.drawImage(src, 0, 0);
  g.font = '600 12px sans-serif';
  g.textBaseline = 'bottom';
  const label = (text, x, y, color) => {
    const w = g.measureText(text).width + 6;
    g.fillStyle = 'rgba(0,0,0,0.65)'; g.fillRect(x, y - 15, w, 15);
    g.fillStyle = color; g.fillText(text, x + 3, y - 2);
  };
  for (const it of f.items) {
    if (!it.screen) continue;
    g.strokeStyle = 'rgba(255,200,0,0.7)'; g.lineWidth = 1;
    g.strokeRect(...it.screen);
    label(`${it.id} ${it.itemId}`, it.screen[0], it.screen[1], '#ffd34d');
  }
  for (const p of f.props) {
    if (!p.screen) continue;
    g.strokeStyle = '#4dd2ff'; g.lineWidth = 1.5;
    g.strokeRect(...p.screen);
    label(p.prop, p.screen[0], p.screen[1] + p.screen[3] + 15, '#4dd2ff');
  }
  const at = (w) => screenOf(R, new THREE.Vector3(...w));
  for (const p of f.people) {
    if (!p.screen) continue;
    g.strokeStyle = '#ff2d55'; g.lineWidth = 2;
    g.strokeRect(...p.screen);
    // Facing: an arrow on the floor from the feet, 0.5 m along the yaw.
    const a = at(p.pos), b = at([p.pos[0] + Math.sin(p.yaw) * 0.5, p.pos[1], p.pos[2] + Math.cos(p.yaw) * 0.5]);
    g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke();
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    g.beginPath(); g.moveTo(b.x, b.y); g.lineTo(b.x - 8 * Math.cos(ang - 0.5), b.y - 8 * Math.sin(ang - 0.5)); g.lineTo(b.x - 8 * Math.cos(ang + 0.5), b.y - 8 * Math.sin(ang + 0.5)); g.closePath(); g.fillStyle = '#ff2d55'; g.fill();
    // Gaze: from the eyes along the face's direction, as far as the probe's hit (or 1 m).
    if (p.eyes && p.forward) {
      const d = p.gaze?.dist ?? 1;
      const e = at(p.eyes), q = at(p.eyes.map((v, i) => v + p.forward[i] * Math.min(d, 3)));
      g.strokeStyle = '#7CFC00'; g.lineWidth = 1.5; g.setLineDash([4, 3]);
      g.beginPath(); g.moveTo(e.x, e.y); g.lineTo(q.x, q.y); g.stroke(); g.setLineDash([]);
    }
    g.fillStyle = '#ffffff';
    for (const h of p.hands) if (h.screen) { g.beginPath(); g.arc(h.screen[0], h.screen[1], 3, 0, Math.PI * 2); g.fill(); }
    label(`${p.id}${p.anim ? ` ${p.anim}` : ''}${p.moment ? ` [${p.moment}]` : ''}`, p.screen[0], p.screen[1], '#ff8fa6');
  }
  return t.toDataURL('image/png');
}
