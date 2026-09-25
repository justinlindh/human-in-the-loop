import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { tileCenter, footprint } from './layout.js';
import { roundedBox, roundedCylinder, mesh } from './prims.js';
import { getModel } from './models.js';
import { mat } from './materials.js';

// Staged props (contract: Staged props): the open decision's stage prop and the lingering
// office.props, diffed each sync. New props pop in, gone ones shrink away, on the frame clock.
//
// createProps(office) -> { sync(state), update(dt), ids }
// Props this file can draw are in BUILDERS; the sim only uses ids listed there.

const POP_S = 0.22, GONE_S = 0.18;

const SCREEN_OVERLAYS = { screens_red: 'red', screens_skull: 'skull' };

export function createProps(office, screens = null) {
  const live = new Map();   // key -> { obj, t, gone }
  const dropped = new Set(); // keys whose desk was sold: not rebuilt while the sim still lists them
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
    // A 'screens' prop takes over every monitor while its decision is open.
    const st = state.pendingDecision?.stage;
    screens?.setOverlay(st?.anchor === 'screens' ? SCREEN_OVERLAYS[st.prop] ?? null : null);
    const want = wanted(state);
    const keys = new Set(want.map((w) => w.key));
    for (const [k, e] of live) if (!keys.has(k) && !e.gone) { e.gone = true; e.t = 0; }
    for (const k of dropped) if (!keys.has(k)) dropped.delete(k);
    for (const w of want) {
      const e = live.get(w.key);
      if ((e && !e.gone) || dropped.has(w.key)) continue;
      // Wall props keep clear of each other as well as of windows and wall pieces.
      const taken = [...live.values()].filter((l) => !l.gone && l.obj.userData.span).map((l) => l.obj.userData.span);
      const obj = BUILDERS[w.prop](cur.L, w, { busy: office.wallBusy.concat(taken), state, office });
      if (!obj) continue;
      if (!obj.userData.noPop) obj.scale.setScalar(0.001);
      root.add(obj);
      live.set(w.key, { obj, t: 0, gone: false });
    }
  }

  function update(dt) {
    for (const [k, e] of live) {
      e.t += dt;
      e.obj.userData.tick?.(dt);
      const f = e.obj.userData.follow;
      if (f && !e.gone) {
        const desk = office.placed?.get(f.deskId);
        if (desk) follow(e.obj, desk);
        else { e.gone = true; e.t = 0; dropped.add(k); }
      }
      // Effects are built in office coordinates and fade on their own: no pop, no shrink.
      if (e.obj.userData.noPop) {
        if (e.gone) { dispose(e.obj); live.delete(k); }
        continue;
      }
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

  return { sync, update, get ids() { return [...Object.keys(BUILDERS), ...Object.keys(SCREEN_OVERLAYS)]; } };
}

// Frees what a prop made for itself: geometry and materials marked own. Palette materials (mat()),
// prims geometry (cached and shared) and loaded models (userData.shared) belong to everyone.
function dispose(obj) {
  obj.removeFromParent();
  const walk = (o) => {
    if (o.userData.shared) return;
    if (o.isMesh) {
      if (o.geometry.userData.own) o.geometry.dispose();
      if (o.material.userData.own) o.material.dispose();
    }
    for (const c of o.children) walk(c);
  };
  walk(obj);
}
const own = (m) => { m.userData.own = true; return m; };
const plane = (w, h) => own(new THREE.PlaneGeometry(w, h));

// A wall prop's spot: the anchor tile's place along its back wall, slid to the nearest stretch
// clear of windows, doors, the era's wall pieces, tall furniture and other props; if that wall is
// full, the nearest clear stretch of the other back wall. A staged prop matters more than decor,
// so when both walls are full it may go over an era wall piece.
function wallSpot(L, { x, y }, busy, w) {
  const home = y === 0 || x !== 0 ? 'z' : 'x';
  const c = tileCenter(L, x ?? 0, y ?? 0);
  for (const [wall, ignoreDecor] of [[home, false], [home === 'z' ? 'x' : 'z', false], [home, true], [home === 'z' ? 'x' : 'z', true]]) {
    const len = wall === 'x' ? L.D : L.W;
    // On the other wall, start from the corner nearest the anchor.
    const want = wall === home ? (wall === 'x' ? c.z : c.x) : -len / 2;
    const spans = busy.filter((b) => b.wall === wall && !(ignoreDecor && b.decor));
    const free = (at) => at - w / 2 > -len / 2 + 0.3 && at + w / 2 < len / 2 - 0.3 && spans.every((b) => at + w / 2 + 0.08 < b.a || at - w / 2 - 0.08 > b.b);
    for (let k = 0; k <= len * 10; k++) {
      for (const at of [want + k * 0.1, want - k * 0.1]) if (free(at)) return { wall, at };
    }
  }
  return { wall: home, at: home === 'x' ? c.z : c.x };
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

const tapeGeo = new THREE.PlaneGeometry(0.1, 0.035);  // shared by every tape strip; never disposed
let tapeMat = null;

// A printed picture taped to the wall at eye level, a little crooked.
function wallPrint(tex, { w = 0.84, h = 0.63, tilt = 0.035 } = {}) {
  return (L, anchor, env) => {
    const spot = wallSpot(L, anchor, env.busy, w);
    const g = new THREE.Group();
    g.userData.span = { wall: spot.wall, a: spot.at - w / 2, b: spot.at + w / 2 };
    const onX = spot.wall === 'x';
    g.position.set(onX ? -L.W / 2 + 0.06 : spot.at, 1.45, onX ? spot.at : -L.D / 2 + 0.06);
    if (onX) g.rotation.y = Math.PI / 2;
    const sheet = new THREE.Mesh(plane(w, h), own(new THREE.MeshStandardMaterial({ map: tex(env.state), roughness: 0.9 })));
    sheet.rotation.z = tilt;
    sheet.userData.noAO = true;
    sheet.receiveShadow = true;
    g.add(sheet);
    tapeMat ??= new THREE.MeshStandardMaterial({ color: new THREE.Color(P.paper_sheet), roughness: 0.6, transparent: true, opacity: 0.75 });
    for (const sx of [-1, 1]) {
      const tape = new THREE.Mesh(tapeGeo, tapeMat);
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


// Hand-lettering and small drawing helpers for the printed props.
function text(ctx, t, x, y, px, col, wt = 700, align = 'center') {
  ctx.fillStyle = col; ctx.font = `${wt} ${px}px Fredoka, sans-serif`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.fillText(t, x, y);
}
function lines(ctx, x, y, w, n, gap, col = P.metal_soft) {
  ctx.fillStyle = col;
  for (let i = 0; i < n; i++) ctx.fillRect(x, y + i * gap, w * (i % 3 === 2 ? 0.6 : 1), 7);
}
function lakeScene(ctx, x, y, w, h) {
  ctx.fillStyle = '#bcd7e6'; ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#5d8f8b';
  ctx.beginPath(); ctx.moveTo(x, y + h * 0.55); ctx.lineTo(x + w * 0.3, y + h * 0.2); ctx.lineTo(x + w * 0.55, y + h * 0.5); ctx.lineTo(x + w * 0.8, y + h * 0.25); ctx.lineTo(x + w, y + h * 0.5); ctx.lineTo(x + w, y + h * 0.6); ctx.lineTo(x, y + h * 0.6); ctx.fill();
  ctx.fillStyle = '#4f8cff'; ctx.fillRect(x, y + h * 0.6, w, h * 0.4);
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 0; i < 5; i++) ctx.fillRect(x + w * (0.1 + i * 0.18), y + h * (0.7 + (i % 2) * 0.12), w * 0.08, 3);
}

// Offsite brochure: a tri-fold with the cabin and the lake.
const brochure = () => canvasTex('brochure', 512, 384, (ctx, W, H) => {
  ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
  lakeScene(ctx, 16, 16, 160, 352);
  ctx.fillStyle = P.wood_dark; ctx.fillRect(60, 150, 70, 50);
  ctx.fillStyle = P.fabric_terracotta; ctx.beginPath(); ctx.moveTo(50, 152); ctx.lineTo(95, 115); ctx.lineTo(140, 152); ctx.fill();
  text(ctx, 'LAKESIDE', 344, 60, 44, P.ink); text(ctx, 'CABIN', 344, 104, 44, P.ink);
  text(ctx, 'zero wifi. zero Yak.', 344, 150, 24, P.fabric_teal, 600);
  lines(ctx, 200, 190, 290, 6, 26);
  ctx.strokeStyle = P.metal_soft; ctx.lineWidth = 2;
  for (const x of [180, 346]) { ctx.beginPath(); ctx.moveTo(x, 10); ctx.lineTo(x, H - 10); ctx.stroke(); }
});
// Offsite photo: the team at the lake, one of them mid-splash.
const photoLake = () => canvasTex('photo_lake', 512, 384, (ctx, W, H) => {
  ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
  lakeScene(ctx, 20, 20, W - 40, H - 90);
  const cols = [P.role_engineer, P.role_designer, P.role_marketer, P.role_sales, P.fabric_mustard];
  cols.forEach((c, i) => {
    const x = 70 + i * 62, y = 200;
    ctx.fillStyle = c; ctx.fillRect(x - 16, y, 32, 44);
    ctx.fillStyle = P.skin_2 ?? '#d9a37a'; ctx.beginPath(); ctx.arc(x, y - 14, 18, 0, Math.PI * 2); ctx.fill();
  });
  ctx.fillStyle = P.paper; for (let i = 0; i < 7; i++) { ctx.beginPath(); ctx.arc(420 + Math.cos(i) * 30, 250 + Math.sin(i * 2) * 10 - i * 3, 9, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillStyle = P.skin_3 ?? '#b97b55'; ctx.beginPath(); ctx.arc(420, 238, 15, 0, Math.PI * 2); ctx.fill();
  text(ctx, 'best offsite ever', W / 2, H - 36, 34, P.ink, 600);
});
// The agent invoice: a long itemised sheet with a stamped total.
const invoice = () => canvasTex('invoice', 384, 512, (ctx, W, H) => {
  ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
  text(ctx, 'INVOICE', 40, 50, 48, P.ink, 700, 'left');
  text(ctx, 'agent compute, itemised', 40, 92, 20, P.ink, 500, 'left');
  for (let i = 0; i < 11; i++) {
    ctx.fillStyle = P.metal_soft; ctx.fillRect(40, 130 + i * 24, 200 - (i % 4) * 25, 8);
    ctx.fillRect(290, 130 + i * 24, 54, 8);
  }
  ctx.fillStyle = P.ink; ctx.fillRect(40, 404, 304, 4);
  text(ctx, 'TOTAL', 40, 436, 30, P.ink, 700, 'left');
  text(ctx, '$$$$$$', 344, 436, 30, P.ink, 700, 'right');
  ctx.save(); ctx.translate(250, 250); ctx.rotate(-0.3);
  ctx.strokeStyle = P.fabric_terracotta; ctx.lineWidth = 7; ctx.strokeRect(-110, -36, 220, 72);
  text(ctx, 'PAST DUE', 0, 2, 44, P.fabric_terracotta);
  ctx.restore();
});
// The pre-rebrand sign: the company name in its own colour, kept for posterity.
const oldSign = (state) => {
  const name = String(state?.companyName ?? 'Our Company').slice(0, 18);
  const col = state?.logoColor ?? P.role_engineer;
  return canvasTex(`old_sign|${name}|${col}`, 512, 256, (ctx, W, H) => {
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = col; ctx.beginPath(); ctx.roundRect(24, 24, W - 48, 150, 20); ctx.fill();
    const px = Math.min(72, Math.floor(880 / Math.max(6, name.length)));
    text(ctx, name.toUpperCase(), W / 2, 100, px, P.paper);
    text(ctx, 'the old logo. we miss it.', W / 2, 212, 28, P.ink, 600);
  });
};
// #163: the rival keeps copying you, and someone keeps count.
const rivalCopied = (state) => {
  const name = String(state?.rival?.name ?? 'The Rival').slice(0, 16);
  const col = state?.rival?.logoColor ?? P.fabric_slate;
  return canvasTex(`rival_copied|${name}|${col}`, 512, 384, (ctx, W, H) => {
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, W, H);
    text(ctx, 'DAYS SINCE', W / 2, 56, 50, P.ink);
    const px = Math.min(54, Math.floor(820 / Math.max(6, name.length)));
    text(ctx, name.toUpperCase(), W / 2, 116, px, col);
    text(ctx, 'COPIED US:', W / 2, 176, 50, P.ink);
    // The flip counter.
    for (const [i, d] of [[0, '0']]) {
      ctx.fillStyle = P.ink; ctx.beginPath(); ctx.roundRect(W / 2 - 60 + i * 130, 214, 120, 146, 14); ctx.fill();
      ctx.fillStyle = P.paper_sheet; ctx.fillRect(W / 2 - 60 + i * 130, 286, 120, 4);
      text(ctx, d, W / 2 + i * 130, 290, 118, P.paper);
    }
  });
};

// Desk props sit on (or beside) the subject's desk: the desk whose footprint covers the anchor
// tile, else the nearest desk. Offsets are in the desk's own frame: x across the top, z from its
// centre toward the sitter; y is the height (the desk top for things on it, 0 beside it). The prop
// remembers its desk, follows it when it moves and goes when it is sold (see follow()). Without a
// desk, or for other anchors, it stands on the anchor tile's floor.
function deskFor(L, anchor, office, nearest) {
  const desks = [...(office.placed?.values() ?? [])].filter((e) => e.desk && e.target);
  const covers = (e) => { const f = footprint(e.itemId, e.rot ?? 0); return anchor.x >= e.x && anchor.x < e.x + f.w && anchor.y >= e.y && anchor.y < e.y + f.h; };
  const c = tileCenter(L, anchor.x ?? 0, anchor.y ?? 0);
  const d = (e) => Math.hypot(e.target.x - c.x, e.target.z - c.z);
  return desks.find(covers) ?? (nearest ? desks.sort((a, b) => d(a) - d(b))[0] : null) ?? null;
}
function atDesk(build, { x: lx = -0.5, z: lz = -0.28, rot = 0.3, y = TOP_Y, scale = DESK_PROP_SCALE } = {}) {
  // Defaults read at call time: the constants are declared further down.
  return (L, anchor, env) => {
    const g = new THREE.Group();
    // Oversized, like the rest of the furniture, so a small thing still reads at gameplay zoom.
    const item = build();
    item.scale.setScalar(scale);
    g.add(item);
    // Things on a desk always find one; things beside a desk only when the anchor tile is a desk's.
    const onTop = y > 0;
    const e = anchor.anchor === undefined || anchor.anchor === 'subjectDesk' ? deskFor(L, anchor, env.office, onTop) : null;
    if (e) {
      g.userData.follow = { deskId: e.id, lx, lz, rot, y };
      follow(g, e);
    } else {
      const c = tileCenter(L, anchor.x ?? 0, anchor.y ?? 0);
      g.position.set(c.x, onTop ? 0 : y, c.z);
      g.rotation.y = rot;
    }
    return g;
  };
}
// Put a desk-following prop where its desk is now (it may be sliding to a new spot).
function follow(g, e) {
  const f = g.userData.follow, o = e.obj, r = o.rotation.y, cs = Math.cos(r), sn = Math.sin(r);
  g.position.set(o.position.x + cs * f.lx + sn * f.lz, f.y, o.position.z - sn * f.lx + cs * f.lz);
  g.rotation.y = r + f.rot;
}
// A free-standing prop on the anchor tile's floor, or beside the subject's desk for that anchor.
function onFloor(build, opts = {}) {
  return atDesk(build, { x: 0.95, z: 0.1, rot: 0, y: 0, scale: 1, ...opts });
}
const TOP_Y = 0.57;
const DESK_PROP_SCALE = 1.6;
// Flat paper needs more size than objects to read from above, and sits further in so it stays on the top.
const FLAT = { scale: 2.0, x: -0.36, z: -0.3 };
const flatMat = (tex, rough = 0.85) => own(new THREE.MeshStandardMaterial({ map: tex, roughness: rough }));
const cardTex = (key, w, h, draw) => canvasTex(key, w, h, draw);

function envelope(thick) {
  return () => {
    const g = new THREE.Group();
    const h = thick ? 0.05 : 0.012;
    const tex = cardTex(`env|${thick}`, 256, 170, (ctx, W, H) => {
      ctx.fillStyle = P.paper_sheet; ctx.fillRect(0, 0, W, H);
      ctx.strokeStyle = P.metal_soft; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(W / 2, H * 0.55); ctx.lineTo(W, 0); ctx.stroke();
      if (thick) { ctx.fillStyle = P.fabric_terracotta; ctx.fillRect(W * 0.62, 0, 16, H); }
      else { ctx.fillStyle = P.ink; ctx.fillRect(W * 0.3, H * 0.72, W * 0.4, 8); }
    });
    const body = mesh(roundedBox(0.26, h, 0.17, Math.min(0.006, h / 2.2), 2), mat('paper_sheet'), 0, h / 2, 0);
    const top = new THREE.Mesh(plane(0.26, 0.17), flatMat(tex));
    top.rotation.x = -Math.PI / 2; top.position.y = h + 0.001;
    g.add(body, top);
    return g;
  };
}
function binder() {
  const g = new THREE.Group();
  for (let i = 0; i < 2; i++) {
    const b = mesh(roundedBox(0.07, 0.3, 0.26, 0.01, 2), mat(i ? 'fabric_slate' : 'role_security'), i * 0.08, 0.15, 0);
    g.add(b);
    const label = mesh(roundedBox(0.072, 0.09, 0.12, 0.004, 1), mat('paper'), i * 0.08, 0.2, 0);
    label.scale.set(1.02, 1, 1);
    g.add(label);
  }
  return g;
}
function giftCards() {
  const g = new THREE.Group();
  const cols = ['fabric_mustard', 'role_engineer', 'marker_green', 'screen_pink', 'fabric_terracotta'];
  cols.forEach((c, i) => {
    const card = mesh(roundedBox(0.12, 0.004, 0.076, 0.002, 1), mat(c), 0, 0.003 + i * 0.004, 0);
    card.rotation.y = (i - 2) * 0.28;
    card.position.x = (i - 2) * 0.02;
    g.add(card);
  });
  return g;
}
function stickyNotes() {
  const g = new THREE.Group();
  const cols = ['fabric_mustard', 'marker_orange', 'fabric_teal', 'screen_pink'];
  for (let i = 0; i < 7; i++) {
    const n = mesh(roundedBox(0.075, 0.004, 0.075, 0.002, 1), mat(cols[i % 4]), (i % 4) * 0.085 - 0.12, 0.002 + Math.floor(i / 4) * 0.004, Math.floor(i / 4) * 0.09 - 0.04);
    n.rotation.y = ((i * 37) % 11 - 5) * 0.05;
    g.add(n);
  }
  return g;
}
function photosLaminated() {
  const g = new THREE.Group();
  const tex = cardTex('dogphoto', 128, 96, (ctx, W, H) => {
    ctx.fillStyle = '#bcd7e6'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#5d8f8b'; ctx.fillRect(0, H * 0.7, W, H * 0.3);
    ctx.fillStyle = P.wood_light; ctx.beginPath(); ctx.ellipse(W * 0.5, H * 0.6, 30, 18, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(W * 0.72, H * 0.42, 15, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.wood_dark; ctx.beginPath(); ctx.ellipse(W * 0.8, H * 0.32, 5, 9, 0.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = P.ink; ctx.beginPath(); ctx.arc(W * 0.76, H * 0.4, 2.5, 0, Math.PI * 2); ctx.fill();
  });
  for (let i = 0; i < 4; i++) {
    const card = new THREE.Group();
    card.add(mesh(roundedBox(0.15, 0.003, 0.115, 0.002, 1), mat('paper'), 0, 0.0015, 0));
    const pic = new THREE.Mesh(plane(0.13, 0.095), flatMat(tex, 0.25));
    pic.rotation.x = -Math.PI / 2; pic.position.y = 0.0035;
    card.add(pic);
    card.position.set(i * 0.05 - 0.07, i * 0.004, (i % 2) * 0.03);
    card.rotation.y = (i - 1.5) * 0.25;
    g.add(card);
  }
  return g;
}


// Hackathon aftermath: a leaning stack of pizza boxes.
function pizzaBoxes() {
  const g = new THREE.Group();
  const lid = cardTex('pizza', 128, 128, (ctx, W, H) => {
    ctx.fillStyle = P.wood_light; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = P.fabric_terracotta; ctx.lineWidth = 8; ctx.beginPath(); ctx.arc(W / 2, H / 2, 38, 0, Math.PI * 2); ctx.stroke();
    text(ctx, 'PIZZA', W / 2, H / 2, 24, P.fabric_terracotta);
  });
  for (let i = 0; i < 4; i++) {
    const box = new THREE.Group();
    box.add(mesh(roundedBox(0.42, 0.05, 0.42, 0.008, 1), mat('wood_light'), 0, 0.025, 0));
    const top = new THREE.Mesh(plane(0.4, 0.4), flatMat(lid));
    top.rotation.x = -Math.PI / 2; top.position.y = 0.051;
    box.add(top);
    box.position.set(((i * 7) % 3 - 1) * 0.03, i * 0.052, ((i * 5) % 3 - 1) * 0.03);
    box.rotation.y = (i % 2 ? 1 : -1) * 0.12 * i;
    g.add(box);
  }
  return g;
}
// The moonshot's secret corner: a curtain on a rod between two stands.
function curtain() {
  const g = new THREE.Group();
  const W = 1.5, H = 1.9;
  for (const x of [-W / 2, W / 2]) {
    g.add(mesh(roundedCylinder(0.02, 0.02, H, 0.006, 8), mat('metal_dark'), x, 0, 0));
    g.add(mesh(roundedCylinder(0.12, 0.14, 0.03, 0.01, 12), mat('metal_dark'), x, 0.015, 0));
  }
  // roundedCylinder grows up from its base; turned onto its side it runs from x toward -x.
  const rod = mesh(roundedCylinder(0.018, 0.018, W + 0.08, 0.006, 8), mat('metal_dark'), (W + 0.08) / 2, H, 0);
  rod.rotation.z = Math.PI / 2;
  g.add(rod);
  // Folds: a row of soft, slightly staggered panels.
  const n = 9;
  for (let i = 0; i < n; i++) {
    const x = -W / 2 + 0.06 + (i / (n - 1)) * (W - 0.12);
    g.add(mesh(roundedBox(W / n + 0.03, H - 0.12, 0.05, 0.02, 2), mat('fabric_terracotta'), x, (H - 0.12) / 2 + 0.06, (i % 2) * 0.04));
  }
  return g;
}
// Lying on the floor where someone put it down.
function sledgehammer() {
  const g = new THREE.Group();
  const handle = mesh(roundedCylinder(0.025, 0.03, 0.85, 0.008, 8), mat('wood_light'), 0.425, 0.05, 0);
  handle.rotation.z = Math.PI / 2;
  g.add(handle);
  g.add(mesh(roundedBox(0.12, 0.12, 0.24, 0.025, 2), mat('metal_dark'), 0.47, 0.06, 0));
  return g;
}
// A tape measure with its tape run out across the floor.
function tapeMeasure() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.12, 0.12, 0.06, 0.025, 3), mat('fabric_mustard'), 0, 0.06, 0));
  g.add(mesh(roundedCylinder(0.03, 0.03, 0.065, 0.008, 12), mat('metal_dark'), 0, 0.06, -0.0325).rotateX(Math.PI / 2));
  const tape = mesh(roundedBox(0.9, 0.004, 0.03, 0.001, 1), mat('fabric_mustard'), 0.52, 0.004, 0);
  g.add(tape);
  g.add(mesh(roundedBox(0.012, 0.03, 0.035, 0.002, 1), mat('metal_dark'), 0.97, 0.015, 0));
  return g;
}
// A pet carrier with a wire door and a handle.
function petCarrier() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.55, 0.36, 0.38, 0.06, 3), mat('pot_cream'), 0, 0.18, 0));
  g.add(mesh(roundedBox(0.56, 0.05, 0.39, 0.02, 2), mat('fabric_teal'), 0, 0.2, 0));
  g.add(mesh(roundedBox(0.24, 0.04, 0.05, 0.015, 2), mat('fabric_teal'), 0, 0.39, 0));
  const door = new THREE.Group();
  door.add(mesh(roundedBox(0.012, 0.24, 0.26, 0.004, 1), mat('metal_dark'), 0, 0, 0));
  for (let i = -2; i <= 2; i++) door.add(mesh(roundedBox(0.016, 0.24, 0.012, 0.003, 1), mat('metal_soft'), 0.004, 0, i * 0.05));
  door.position.set(0.28, 0.18, 0);
  g.add(door);
  // Two eyes looking out.
  for (const z of [-0.035, 0.035]) g.add(mesh(roundedBox(0.01, 0.022, 0.022, 0.005, 1), mat('paper'), 0.27, 0.2, z));
  return g;
}
// A network cable run along the floor from the desk, bitten through, frayed ends and all.
function cableChewed() {
  const g = new THREE.Group();
  const seg = (x0, x1) => { const m = mesh(roundedCylinder(0.012, 0.012, x1 - x0, 0.004, 8), mat('role_engineer'), x1, 0.012, 0); m.rotation.z = Math.PI / 2; return m; };
  g.add(seg(-0.6, -0.08), seg(0.06, 0.55));
  for (const [x, s] of [[-0.08, 1], [0.06, -1]]) {
    for (let i = 0; i < 4; i++) {
      const w = mesh(roundedCylinder(0.003, 0.003, 0.05, 0.001, 4), mat(['fabric_terracotta', 'marker_green', 'fabric_mustard', 'paper'][i]), x + s * 0.02, 0.012, (i - 1.5) * 0.008);
      w.rotation.z = Math.PI / 2 + (i - 1.5) * 0.4 * s;
      g.add(w);
    }
  }
  return g;
}
// The demo-day smoothie: a tall cup with a lid and a straw.
function smoothie() {
  const g = new THREE.Group();
  g.add(mesh(roundedCylinder(0.035, 0.045, 0.14, 0.01, 14), mat('screen_pink'), 0, 0, 0));
  g.add(mesh(roundedCylinder(0.048, 0.048, 0.02, 0.006, 14), mat('paper'), 0, 0.135, 0));
  const straw = mesh(roundedCylinder(0.006, 0.006, 0.12, 0.002, 6), mat('marker_green'), 0.01, 0.14, 0);
  straw.rotation.z = -0.25;
  g.add(straw);
  return g;
}
// A visitor pulls up a spare desk chair beside the desk.
function visitorChair() {
  const m = getModel('chair');
  m.userData.shared = true;
  return m;
}


// Effects on existing furniture: soft rising puffs (smoke, heat) from the item on the anchor tile.
let puffTex = null;
function puffTexture() {
  if (puffTex) return puffTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  puffTex = new THREE.CanvasTexture(c);
  return puffTex;
}
// The item standing on the anchor tile (or the nearest one of the given kinds), as a world box.
function itemAt(L, anchor, office, kinds = null) {
  const c = tileCenter(L, anchor.x ?? 0, anchor.y ?? 0);
  let best = null, bestD = Infinity;
  for (const e of office.placed?.values() ?? []) {
    if (kinds && !kinds.some((k) => e.itemId.includes(k))) continue;
    const f = footprint(e.itemId, e.rot ?? 0);
    const covers = anchor.x >= e.x && anchor.x < e.x + f.w && anchor.y >= e.y && anchor.y < e.y + f.h;
    const d = covers ? -1 : Math.hypot(e.target.x - c.x, e.target.z - c.z);
    if (d < bestD) { bestD = d; best = e; }
  }
  if (!best || (!kinds && bestD > 0)) return { box: new THREE.Box3(new THREE.Vector3(c.x - 0.3, 0, c.z - 0.3), new THREE.Vector3(c.x + 0.3, 0.6, c.z + 0.3)) };
  return { box: new THREE.Box3().setFromObject(best.obj), entry: best };
}
// n puffs rising `rise` metres from the top of box over `life` seconds, looping, staggered.
function puffs(box, { n = 8, color = P.metal_soft, rise = 1.2, life = 2.4, size = 0.35, opacity = 0.55, spread = 0.2 } = {}) {
  const g = new THREE.Group();
  const top = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const m = own(new THREE.SpriteMaterial({ map: puffTexture(), color: new THREE.Color(color), transparent: true, opacity: 0, depthWrite: false }));
    const sp = new THREE.Sprite(m);
    sp.userData.noAO = true;
    parts.push({ sp, t0: (i / n) * life, dx: Math.sin(i * 2.4) * spread, dz: Math.cos(i * 1.7) * spread });
    g.add(sp);
  }
  let t = 0;
  g.userData.tick = (dt) => {
    t += dt;
    for (const p of parts) {
      const q = ((t + p.t0) % life) / life;
      p.sp.position.set(top.x + p.dx * q, top.y + 0.05 + q * rise, top.z + p.dz * q);
      p.sp.scale.setScalar(size * (0.5 + q * 1.3));
      p.sp.material.opacity = opacity * Math.min(1, q * 5) * (1 - q);
    }
  };
  g.userData.tick(0);
  g.userData.noPop = true;
  return g;
}
// Something is burning (the toaster, the demo): grey smoke from the item on the anchor tile.
function smokePuff(L, anchor, env) {
  // Dark enough to read against the cream walls behind most counters.
  return puffs(itemAt(L, anchor, env.office).box, { color: P.metal_dark, size: 0.5, opacity: 0.75, rise: 1.4 });
}
// The server rack is running hot: a pulsing orange glow over its front and heat rising off the top.
function rackHot(L, anchor, env) {
  const { box } = itemAt(L, anchor, env.office, ['rack']);
  const g = new THREE.Group();
  const heat = puffs(box, { n: 8, color: P.marker_orange, rise: 1.0, life: 1.6, size: 0.45, opacity: 0.7, spread: 0.2 });
  g.add(heat);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  const glowMat = own(new THREE.SpriteMaterial({ map: puffTexture(), color: new THREE.Color(P.marker_orange), transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  const glow = new THREE.Sprite(glowMat);
  glow.position.copy(mid);
  glow.scale.set(Math.max(size.x, size.z) * 2.2, size.y * 1.6, 1);
  glow.userData.noAO = true;
  g.add(glow);
  let t = 0;
  g.userData.tick = (dt) => {
    t += dt;
    heat.userData.tick(dt);
    glowMat.opacity = 0.45 + 0.25 * Math.sin(t * 4);
  };
  g.userData.noPop = true;
  return g;
}

const BUILDERS = {
  picture_pingpong: wallPrint(pingPongPicture(false)),
  picture_pingpong_ball: wallPrint(pingPongPicture(true)),
  brochure: wallPrint(brochure),
  photo_lake: wallPrint(photoLake),
  invoice: wallPrint(invoice, { w: 0.5, h: 0.67 }),
  old_sign: wallPrint(oldSign, { w: 0.9, h: 0.45 }),
  sign_rival_copied: wallPrint(rivalCopied),
  envelope: atDesk(envelope(false), FLAT),
  envelope_thick: atDesk(envelope(true), FLAT),
  binder: atDesk(binder, { x: -0.62, z: -0.42, rot: 0 }),
  gift_cards: atDesk(giftCards, FLAT),
  sticky_notes: atDesk(stickyNotes, { x: -0.45, z: -0.25, rot: 0.1 }),
  photos_laminated: atDesk(photosLaminated, FLAT),
  smoothie: atDesk(smoothie, { x: 0.45, z: -0.25, rot: 0 }),
  pizza_boxes: atDesk(pizzaBoxes, { x: 0.35, z: -0.4, rot: 0.2, scale: 1.2 }),
  curtain: onFloor(curtain, { x: 1.4, z: -0.3, rot: Math.PI / 2 }),
  sledgehammer: onFloor(sledgehammer, { scale: 1.3 }),
  tape_measure: onFloor(tapeMeasure, { x: 0.9, z: 0.35, rot: 0.4, scale: 1.4 }),
  pet_carrier: onFloor(petCarrier, { x: 1.0, z: 0.2, rot: -0.5, scale: 1.2 }),
  cable_chewed: onFloor(cableChewed, { x: 0.2, z: 0.05, rot: 0, scale: 1.4 }),
  visitor_chair: onFloor(visitorChair, { x: 0.95, z: 0.15, rot: Math.PI + 0.7 }),
  smoke_puff: smokePuff,
  rack_hot: rackHot,
};
