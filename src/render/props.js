import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { tileCenter } from './layout.js';

// Staged props (contract: Staged props): the open decision's stage prop and the lingering
// office.props, diffed each sync. New props pop in, gone ones shrink away, on the frame clock.
//
// createProps(office) -> { sync(state), update(dt), ids }
// Props this file can draw are in BUILDERS; the sim only uses ids listed there.

const POP_S = 0.22, GONE_S = 0.18;

export function createProps(office) {
  const live = new Map();   // key -> { obj, t, gone }
  let root = null;

  function wanted(state) {
    const out = [];
    const st = state.pendingDecision?.stage;
    if (st?.prop && BUILDERS[st.prop] && st.anchor !== 'screens') out.push({ key: `stage|${st.prop}|${st.x},${st.y}`, ...st });
    for (const p of state.office?.props ?? []) if (BUILDERS[p.prop]) out.push({ key: `prop|${p.id}|${p.prop}`, ...p });
    return out;
  }

  function sync(state) {
    const cur = office.current;
    if (!cur || !state) return;
    if (cur.root !== root) {
      // A new office shell: the old props went with the old one.
      for (const e of live.values()) dispose(e.obj);
      live.clear();
      root = cur.root;
    }
    const want = wanted(state);
    const keys = new Set(want.map((w) => w.key));
    for (const [k, e] of live) if (!keys.has(k) && !e.gone) { e.gone = true; e.t = 0; }
    for (const w of want) {
      const e = live.get(w.key);
      if (e && !e.gone) continue;
      const obj = BUILDERS[w.prop](cur.L, w, office.wallBusy);
      if (!obj) continue;
      obj.scale.setScalar(0.001);
      root.add(obj);
      live.set(w.key, { obj, t: 0, gone: false });
    }
  }

  function update(dt) {
    for (const [k, e] of live) {
      e.t += dt;
      if (e.gone) {
        const q = Math.min(1, e.t / GONE_S);
        e.obj.scale.setScalar(Math.max(0.001, 1 - q));
        if (q >= 1) { dispose(e.obj); live.delete(k); }
      } else if (e.t <= POP_S + dt) {
        const q = Math.min(1, e.t / POP_S);
        e.obj.scale.setScalar(q < 0.7 ? Math.max(0.001, (q / 0.7) * 1.15) : 1.15 - ((q - 0.7) / 0.3) * 0.15);
      }
    }
  }

  return { sync, update, get ids() { return Object.keys(BUILDERS); } };
}

function dispose(obj) {
  obj.removeFromParent();
  obj.traverse((o) => { if (o.isMesh) o.material.dispose(); });
}

// A wall prop's spot: the anchor tile's place along its back wall, slid to the nearest stretch
// clear of windows, doors and the era's wall pieces.
function wallSpot(L, { x, y }, busy, w) {
  const wall = y === 0 || x !== 0 ? 'z' : 'x';
  const c = tileCenter(L, x ?? 0, y ?? 0);
  const len = wall === 'x' ? L.D : L.W;
  const want = wall === 'x' ? c.z : c.x;
  const spans = busy.filter((b) => b.wall === wall);
  const free = (at) => at - w / 2 > -len / 2 + 0.3 && at + w / 2 < len / 2 - 0.3 && spans.every((b) => at + w / 2 + 0.08 < b.a || at - w / 2 - 0.08 > b.b);
  for (let k = 0; k <= 80; k++) {
    for (const at of [want + k * 0.1, want - k * 0.1]) if (free(at)) return { wall, at };
  }
  return { wall, at: want };
}

const texCache = new Map();
function canvasTex(key, w, h, draw) {
  let t = texCache.get(key);
  if (t) return t;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  texCache.set(key, t);
  return t;
}

const tapeGeo = new THREE.PlaneGeometry(0.1, 0.035);
let tapeMat = null;

// A printed picture taped to the wall at eye level, a little crooked.
function wallPrint(tex, { w = 0.84, h = 0.63, tilt = 0.035 } = {}) {
  return (L, anchor, busy) => {
    const spot = wallSpot(L, anchor, busy, w);
    const g = new THREE.Group();
    const onX = spot.wall === 'x';
    g.position.set(onX ? -L.W / 2 + 0.012 : spot.at, 1.45, onX ? spot.at : -L.D / 2 + 0.012);
    if (onX) g.rotation.y = Math.PI / 2;
    const sheet = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex(), roughness: 0.9 }));
    sheet.rotation.z = tilt;
    sheet.userData.noAO = true;
    sheet.receiveShadow = true;
    g.add(sheet);
    tapeMat ??= new THREE.MeshStandardMaterial({ color: new THREE.Color(P.paper_sheet), roughness: 0.6, transparent: true, opacity: 0.75 });
    for (const sx of [-1, 1]) {
      const tape = new THREE.Mesh(tapeGeo, tapeMat.clone());
      tape.position.set(sx * (w / 2 - 0.03), h / 2 - 0.02 + sx * tilt * (w / 2), 0.004);
      tape.rotation.z = sx * -0.6 + tilt;
      tape.userData.noAO = true;
      g.add(tape);
    }
    return g;
  };
}

// The ping pong print: a table in a sunny room, a caption, and (after "Not yet") a tiny ball
// someone drew on in marker.
function pingPongPicture(ball) {
  return () => canvasTex(`pingpong|${ball}`, 512, 384, (ctx, W, H) => {
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = P.fabric_mustard; ctx.fillRect(18, 18, W - 36, H - 110);
    ctx.fillStyle = P.wood_dark; ctx.fillRect(18, 214, W - 36, H - 110 - 196);
    // Table: a green top in perspective, white edges, a centre line, the net and legs.
    const top = [[110, 120], [402, 120], [470, 222], [42, 222]];
    ctx.fillStyle = P.ink;
    for (const [x0, x1] of [[74, 90], [422, 438]]) ctx.fillRect(x0, 222, x1 - x0, 52);
    ctx.fillStyle = P.fabric_teal;
    ctx.beginPath(); top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2f5a57'; ctx.fillRect(42, 222, 428, 14);
    ctx.strokeStyle = P.paper; ctx.lineWidth = 6;
    ctx.beginPath(); top.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(256, 120); ctx.lineTo(256, 222); ctx.stroke();
    ctx.fillStyle = P.paper_sheet; ctx.fillRect(80, 156, 352, 22);
    ctx.strokeStyle = P.ink; ctx.lineWidth = 3; ctx.strokeRect(80, 156, 352, 22);
    // Paddles resting on the table.
    for (const [x, y, r, col] of [[160, 196, 0.4, P.fabric_terracotta], [360, 140, -0.5, P.role_engineer]]) {
      ctx.save(); ctx.translate(x, y); ctx.rotate(r);
      ctx.fillStyle = P.wood_dark; ctx.fillRect(-5, 16, 10, 28);
      ctx.fillStyle = col; ctx.beginPath(); ctx.ellipse(0, 0, 26, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = P.ink; ctx.lineWidth = 3; ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = P.ink; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = '700 54px Fredoka, sans-serif';
    ctx.fillText('PING PONG?', W / 2, H - 62);
    ctx.font = '500 22px Fredoka, sans-serif';
    ctx.fillText('morale +100%* (*citation needed)', W / 2, H - 22);
    if (ball) {
      // Marker additions: a ball mid-flight with a dashed arc and a scrawled note.
      ctx.strokeStyle = P.paper; ctx.lineWidth = 6; ctx.setLineDash([12, 10]); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(180, 170); ctx.quadraticCurveTo(250, 30, 330, 80); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = P.paper; ctx.beginPath(); ctx.arc(336, 84, 16, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = P.ink; ctx.lineWidth = 2.5; ctx.stroke();
      ctx.save(); ctx.translate(410, 60); ctx.rotate(-0.12);
      ctx.fillStyle = P.ink; ctx.font = '700 36px Fredoka, sans-serif';
      ctx.fillText('soon!!', 0, 0);
      ctx.restore();
    }
  });
}

const BUILDERS = {
  picture_pingpong: wallPrint(pingPongPicture(false)),
  picture_pingpong_ball: wallPrint(pingPongPicture(true)),
};
