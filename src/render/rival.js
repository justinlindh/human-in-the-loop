import * as THREE from 'three';
import { mat, color } from './materials.js';
import { roundedCylinder, mesh } from './prims.js';
import { PALETTE as P } from './palette.js';
import { wallGap, kindOf } from './office.js';

// Light rival touches from state.rival: a dartboard on the left back wall with the rival's logo
// colour as the bullseye (three darts in it), and "beat <name>" scribbled on the whiteboard,
// crossed out once the rival is gone (dead, acquired, or merged).

const GONE = new Set(['dead', 'acquired', 'merged']);

function muted(hex) {
  const c = new THREE.Color(hex);
  return c.lerp(color('wall_cream'), 0.15);
}

function dartboard(rival) {
  const g = new THREE.Group();
  const ringCols = [P.ink, P.paper, P.ink, P.paper, P.ink];
  g.add(mesh(roundedCylinder(0.26, 0.26, 0.05, 0.012, 32), mat('wood_dark'), 0, 0, 0));
  ringCols.forEach((c, i) => {
    const r = 0.22 - i * 0.035;
    const m = new THREE.Mesh(new THREE.CircleGeometry(r, 32), new THREE.MeshStandardMaterial({ color: new THREE.Color(c).lerp(color('wood_light'), 0.25), roughness: 0.9 }));
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.051 + i * 0.001;
    g.add(m);
  });
  // The bullseye is a paper logo in the rival's colour with their initial.
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  ctx.fillStyle = `#${muted(rival.logoColor ?? P.role_sales).getHexString()}`;
  ctx.beginPath(); ctx.arc(32, 32, 31, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = P.paper;
  ctx.font = '700 38px Fredoka, sans-serif';
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText((rival.name ?? '?').slice(0, 1).toUpperCase(), 32, 35);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const logo = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.85 }));
  logo.rotation.x = -Math.PI / 2;
  logo.rotation.z = Math.PI;
  logo.position.y = 0.058;
  g.add(logo);
  for (const [x, z, a] of [[0.02, 0.01, 0.2], [-0.04, 0.05, -0.3], [0.06, -0.08, 0.5]]) {
    const dart = new THREE.Group();
    dart.add(mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.11, 6), mat('metal_dark'), 0, 0.055, 0));
    dart.add(mesh(new THREE.ConeGeometry(0.018, 0.035, 4), mat('fabric_mustard'), 0, 0.11, 0));
    dart.position.set(x, 0.055, z);
    dart.rotation.set(0.25, a, 0.2);
    g.add(dart);
  }
  return g;
}

function scribble(rival, crossed) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const ctx = c.getContext('2d');
  ctx.strokeStyle = P.marker_blue;
  ctx.fillStyle = P.marker_blue;
  ctx.font = '700 40px "Comic Sans MS", Fredoka, sans-serif';
  ctx.textBaseline = 'middle';
  const text = `beat ${rival.name ?? 'them'}!`;
  ctx.save();
  ctx.translate(128, 48);
  ctx.rotate(-0.06);
  const w = Math.min(236, ctx.measureText(text).width);
  ctx.fillText(text, -w / 2, 0, 236);
  // Underline, twice, as you do.
  ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(-w / 2, 22); ctx.lineTo(w / 2, 20); ctx.moveTo(-w / 2 + 6, 28); ctx.lineTo(w / 2 - 4, 27); ctx.stroke();
  if (crossed) {
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(-w / 2 - 6, 4); ctx.lineTo(w / 2 + 6, -6); ctx.stroke();
    ctx.lineWidth = 4;
    ctx.fillStyle = P.marker_green;
    ctx.font = '700 34px "Comic Sans MS", Fredoka, sans-serif';
    ctx.fillText('done', w / 2 - 50, -30);
  }
  ctx.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.25), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false }));
  m.userData.dynamic = true;
  m.userData.noAO = true;
  m.renderOrder = 3;
  return m;
}

export function createRival({ office }) {
  let board = null;
  let note = null;
  let key = '';
  let stageSeen = null;
  const ray = new THREE.Raycaster();

  function clear() {
    board?.removeFromParent(); board = null;
    note?.removeFromParent(); note = null;
  }

  // The whiteboard face in its item's own frame: cast from in front at writing height.
  function boardFace(e) {
    const o = e.obj;
    const saved = { p: o.position.clone(), r: o.rotation.y, v: o.visible };
    o.position.set(0, 0, 0); o.rotation.y = 0; o.visible = true;
    o.updateMatrixWorld(true);
    const meshes = [];
    o.traverse((c) => { if (c.isMesh) meshes.push(c); });
    const vis = meshes.map((m) => m.visible);
    meshes.forEach((m) => { m.visible = true; });
    let hit = null;
    for (const y of [1.25, 1.1, 1.0, 0.9]) {
      ray.set(new THREE.Vector3(0, y, 3), new THREE.Vector3(0, 0, -1));
      hit = ray.intersectObjects(meshes, false)[0];
      if (hit) { hit = { y, z: hit.point.z }; break; }
    }
    meshes.forEach((m, i) => { m.visible = vis[i]; });
    o.position.copy(saved.p); o.rotation.y = saved.r; o.visible = saved.v;
    o.updateMatrixWorld(true);
    return hit;
  }

  function sync(state) {
    const cur = office.current;
    const rival = state.rival;
    if (!cur || !rival) { if (board || note) clear(); key = ''; return; }
    const wb = [...office.placed.values()].find((e) => kindOf(e.itemId) === 'whiteboard' || e.itemId === 'whiteboard_wall');
    const gone = GONE.has(rival.status);
    const k = `${cur.stage}|${rival.name}|${rival.logoColor}|${gone}|${wb?.id ?? ''}`;
    if (k === key && stageSeen === cur && (!note || note.parent === wb?.obj)) return;
    key = k;
    stageSeen = cur;
    clear();
    const L = cur.L;
    const gap = wallGap(L, 'x');
    if (gap && gap[1] - gap[0] > 1.2) {
      board = dartboard(rival);
      board.rotation.z = -Math.PI / 2;
      board.position.set(-L.W / 2 + 0.03, 1.6, gap[1] - 0.45);
      cur.root.add(board);
    }
    if (wb) {
      const face = boardFace(wb);
      if (face) {
        note = scribble(rival, gone);
        note.position.set(0.05, face.y - 0.02, face.z + 0.012);
        wb.obj.add(note);
      }
    }
  }

  return { sync, clear };
}
