import * as THREE from 'three';
import { pickSpot, spotDebug } from './spots.js';
import { PALETTE as P } from './palette.js';
import { tileCenter, footprint } from './layout.js';
import { roundedBox, roundedCylinder, mesh } from './prims.js';
import { getModel } from './models.js';
import { mat, glow } from './materials.js';

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
  let overlay = null;        // the screen takeover shown now ('red' | 'skull' | null)
  let clock = 0;
  const gone = [];          // { prop, x, z, at }: props that just went, for a few seconds (a pet leaving its carrier)
  let root = null;

  // What is staged now: the open decision's stage, and those of open Yak prompts (an event delivered
  // as a prompt stages its prop exactly as behind a card).
  const stages = (state) => [state.pendingDecision?.stage, ...(state.chatPrompts ?? []).filter((c) => !c.resolved).map((c) => c.stage)].filter((st) => st?.prop);

  function wanted(state) {
    const out = [];
    for (const st of stages(state)) if (BUILDERS[st.prop] && st.anchor !== 'screens') out.push({ key: `stage|${st.prop}|${st.x},${st.y}`, ...st });
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
    // A 'screens' prop takes over every monitor while its decision or prompt is open.
    const st = stages(state).find((x) => x.anchor === 'screens');
    overlay = st ? SCREEN_OVERLAYS[st.prop] ?? null : null;
    screens?.setOverlay(overlay);
    const want = wanted(state);
    const keys = new Set(want.map((w) => w.key));
    for (const [k, e] of live) if (!keys.has(k) && !e.gone) { e.gone = true; e.t = 0; gone.push({ prop: e.prop, x: e.obj.position.x, z: e.obj.position.z, at: clock }); }
    for (const k of dropped) if (!keys.has(k)) dropped.delete(k);
    for (const w of want) {
      const e = live.get(w.key);
      if ((e && !e.gone) || dropped.has(w.key)) continue;
      // Wall props keep clear of each other as well as of windows and wall pieces.
      const taken = [...live.values()].filter((l) => !l.gone && l.obj.userData.span).map((l) => l.obj.userData.span);
      // Desk props already up, so another one on the same desk takes a different spot.
      const onDesk = [...live.values()].filter((l) => !l.gone && l.obj.userData.deskRect).map((l) => ({ deskId: l.obj.userData.follow.deskId, ...l.obj.userData.deskRect }));
      const obj = BUILDERS[w.prop](cur.L, w, { busy: office.wallBusy.concat(taken), state, office, onDesk });
      if (!obj) continue;
      obj.userData.propId = w.prop;
      if (obj.userData.blocks) obj.userData.rect = floorRect(obj, obj.userData.blockPart);
      if (!obj.userData.noPop) obj.scale.setScalar(0.001);
      root.add(obj);
      live.set(w.key, { obj, t: 0, gone: false, prop: w.prop, staffId: w.staffId ?? null });
    }
    pushObstacles();
  }

  // Props standing on the floor block walking while they are up (office.setPropObstacles).
  // Objects a staged moment keeps on the floor after their prop has gone block walking too (pin).
  const pinned = new Map();
  function pushObstacles() {
    office.setPropObstacles?.([...live.values()].filter((e) => !e.gone && e.obj.userData.rect).map((e) => e.obj.userData.rect).concat([...pinned.values()]));
  }
  function pin(obj) { pinned.set(obj, floorRect(obj)); pushObstacles(); }
  function unpin(obj) { if (pinned.delete(obj)) pushObstacles(); }

  function update(dt) {
    clock += dt;
    while (gone.length && clock - gone[0].at > 8) gone.shift();
    let moved = false;
    for (const [k, e] of live) {
      e.t += dt;
      e.obj.userData.tick?.(dt);
      const f = e.obj.userData.follow;
      if (f && !e.gone) {
        const desk = office.placed?.get(f.deskId);
        if (desk) {
          follow(e.obj, desk);
          const r = e.obj.userData.rect;
          if (r && Math.hypot(e.obj.position.x - r.px, e.obj.position.z - r.pz) > 0.05) { e.obj.userData.rect = floorRect(e.obj, e.obj.userData.blockPart); moved = true; }
        } else { e.gone = true; e.t = 0; dropped.add(k); moved = true; }
      }
      // Effects are built in office coordinates and fade on their own: no pop, no shrink.
      if (e.obj.userData.noPop) {
        if (e.gone) { dispose(e.obj); live.delete(k); }
        continue;
      }
      if (e.gone) {
        if (e.obj.userData.rect) { e.obj.userData.rect = null; moved = true; }
        const q = Math.min(1, e.t / GONE_S);
        e.obj.scale.setScalar(Math.max(0.001, 1 - q));
        if (q >= 1) { dispose(e.obj); live.delete(k); }
      } else if (e.t <= POP_S + dt) {
        const q = Math.min(1, e.t / POP_S);
        e.obj.scale.setScalar(q < 0.7 ? Math.max(0.001, (q / 0.7) * 1.15) : 1.15 - ((q - 0.7) / 0.3) * 0.15);
      }
    }
    if (moved) pushObstacles();
  }

  // The live object for a lingering prop id (office.props[].id), for checks.
  const objectOf = (id) => [...live.entries()].find(([k, e]) => !e.gone && k.startsWith(`prop|${id}|`))?.[1].obj ?? null;

  // What is up now, for staff moments: [{ prop, obj }] and the screen takeover ('red' | 'skull' | null).
  // What is up now: { prop, obj, staffId } (staffId: whose desk a desk-staged prop is on, or null).
  const current = () => [...live.values()].filter((e) => !e.gone).map((e) => ({ prop: e.prop, obj: e.obj, staffId: e.staffId }));

  // For checks: the free-top grid of a placed desk entry, as rows of '.' (free) and '#' (taken).
  const deskMap = (e) => { const g = deskGrid(e); const rows = []; for (let k = 0; k < g.nz; k++) { let r = ''; for (let i = 0; i < g.nx; i++) r += g.cells[i + k * g.nx] ? '#' : '.'; rows.push(r); } return rows; };

  // Where a prop of this id stood if it went within the last `within` seconds, else null.
  const goneAt = (prop, within = 5) => [...gone].reverse().find((g) => g.prop === prop && clock - g.at <= within) ?? null;

  // For checks: a counter's free grids for a prop this tall, one per level, as rows of '.' and '#'.
  const counterMap = (e, tall) => counterGrid(e, tall).map((g) => { const rows = []; for (let k = 0; k < g.nz; k++) { let r = ''; for (let i = 0; i < g.nx; i++) r += g.free[i + k * g.nx] ? '.' : '#'; rows.push(r); } return { y: g.y, rows }; });
  return { sync, update, objectOf, current, deskMap, counterMap, goneAt, pin, unpin, get overlay() { return overlay; }, get ids() { return [...Object.keys(BUILDERS), ...Object.keys(SCREEN_OVERLAYS)]; } };
}

// Frees what a prop made for itself: geometry and materials marked own. Palette materials (mat()),
// prims geometry (cached and shared) and loaded models (userData.shared) belong to everyone.
// A floor prop's footprint in office coordinates (of `part` alone when given: the solid piece of a
// prop whose effects spill round it), measured at full size, with a little room around it; px, pz
// remember where it stood so a moving prop can tell when to re-measure.
function floorRect(obj, part = null) {
  const s = obj.scale.x;
  obj.scale.setScalar(1);
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(part ?? obj);
  obj.scale.setScalar(s);
  obj.updateMatrixWorld(true);
  const pad = 0.05;
  return { x0: b.min.x - pad, x1: b.max.x + pad, z0: b.min.z - pad, z1: b.max.z + pad, px: obj.position.x, pz: obj.position.z };
}

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
function wallPrint(tex, { w = 0.84, h = 0.63, tilt = 0.035, y = 1.45 } = {}) {
  return (L, anchor, env) => {
    const spot = wallSpot(L, anchor, env.busy, w);
    const g = new THREE.Group();
    g.userData.span = { wall: spot.wall, a: spot.at - w / 2, b: spot.at + w / 2 };
    const onX = spot.wall === 'x';
    // y: a height, or (L) => a height, for props that hang relative to the wall's top.
    g.position.set(onX ? -L.W / 2 + 0.06 : spot.at, typeof y === 'function' ? y(L) : y, onX ? spot.at : -L.D / 2 + 0.06);
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
const deskList = (office) => [...(office.placed?.values() ?? [])].filter((o) => o.desk && o.target);
const dist = (a, b) => Math.hypot(a.target.x - b.target.x, a.target.z - b.target.z);
// The desk a prop goes on: the named person's own (anchor.staffId, with their deskId in state),
// else the one covering the anchor tile, else (nearest) the closest.
function deskFor(L, anchor, office, nearest, state = null) {
  const desks = [...(office.placed?.values() ?? [])].filter((e) => e.desk && e.target);
  const own = anchor.staffId && state?.staff?.find((p) => p.id === anchor.staffId)?.deskId;
  const theirs = own && desks.find((e) => e.id === own);
  if (theirs) return theirs;
  const covers = (e) => { const f = footprint(e.itemId, e.rot ?? 0); return anchor.x >= e.x && anchor.x < e.x + f.w && anchor.y >= e.y && anchor.y < e.y + f.h; };
  const c = tileCenter(L, anchor.x ?? 0, anchor.y ?? 0);
  const d = (e) => Math.hypot(e.target.x - c.x, e.target.z - c.z);
  return desks.find(covers) ?? (nearest ? desks.sort((a, b) => d(a) - d(b))[0] : null) ?? null;
}
// sprawl: the sitter's own mess (the mugs) may use their hand zone, so it keeps its full size.
function atDesk(build, { x: lx = -0.5, z: lz = -0.28, rot = 0.3, y = TOP_Y, scale = DESK_PROP_SCALE, overhang = 0, group = false, sprawl = false } = {}) {
  // Defaults read at call time: the constants are declared further down.
  return (L, anchor, env) => {
    const g = new THREE.Group();
    g.userData.spotMoment = anchor.prop;
    // Oversized, like the rest of the furniture, so a small thing still reads at gameplay zoom.
    const item = build();
    item.scale.setScalar(scale);
    g.add(item);
    if (item.userData.tick) g.userData.tick = item.userData.tick;
    // Things on a desk always find one, whatever the anchor (a wall anchor means the nearest desk);
    // things beside a desk only when the anchor tile is a desk's.
    const onTop = y > 0;
    g.userData.blocks = !onTop;
    const e = onTop || anchor.anchor === undefined || anchor.anchor === 'subjectDesk' ? deskFor(L, anchor, env.office, onTop, env.state) : null;
    if (e) {
      // A prop too big for the free top shrinks a little until it fits (a big pizza stack).
      // Whatever stands around the desk: a prop overhanging its side may only hang over clear floor.
      const around = overhang > 0 ? [...(env.office.placed?.values() ?? [])].filter((o) => o !== e && o.obj).map((o) => new THREE.Box3().setFromObject(o.obj)) : [];
      // On the top: this desk, shrinking a little if need be, else the nearest desks with room. A
      // prop that belongs to its desk's sitter (a subjectDesk anchor: their letter, their stapler)
      // stays on that desk, since moments find the person by the desk it is on.
      let spot = onTop ? null : { x: lx, z: lz }, desk = e;
      if (onTop) {
        // A group prop (a pizza stack for everyone) is nobody's in particular and may move on.
        const mine = anchor.anchor === 'subjectDesk' && !group;
        const near = mine ? [e] : [e, ...deskList(env.office).filter((o) => o !== e).sort((a2, b2) => dist(a2, e) - dist(b2, e)).slice(0, 6)];
        for (const d of near) {
          const others = (env.onDesk ?? []).filter((r) => r.deskId === d.id);
          item.scale.setScalar(scale);
          spot = deskSpot(d, g, lx, lz, rot, overhang, around, others, !sprawl, spotDebug(env.office), anchor.prop);
          for (let k = 0; !spot && k < 4; k++) { item.scale.multiplyScalar(0.88); spot = deskSpot(d, g, lx, lz, rot, overhang, around, others, !sprawl, spotDebug(env.office), anchor.prop); }
          if (spot) { desk = d; break; }
        }
        // Still no room on its own desk: it may take the sitter's hand zone (the thing is theirs,
        // and they will move it), shrinking a little further, rather than leave the desk its
        // moment looks for.
        if (!spot && mine) {
          const others = (env.onDesk ?? []).filter((r) => r.deskId === e.id);
          item.scale.setScalar(scale);
          spot = deskSpot(e, g, lx, lz, rot, overhang, around, others, false, spotDebug(env.office), anchor.prop);
          for (let k = 0; !spot && k < 6; k++) { item.scale.multiplyScalar(0.88); spot = deskSpot(e, g, lx, lz, rot, overhang, around, others, false, spotDebug(env.office), anchor.prop); }
        }
      }
      if (spot) {
        g.userData.follow = { deskId: desk.id, lx: spot.x, lz: spot.z, rot, y };
        if (onTop) g.userData.deskRect = spot.rect;
        follow(g, desk);
      } else if (group && (spot = onCounter(env.office, g, item, scale, rot, e))) {
        // A group prop with no desk to go on: the nearest table or counter with room.
        g.position.set(spot.x, spot.y, spot.z);
      } else {
        // No room on any nearby desk even shrunk: it goes on the floor beside its desk, full size.
        item.scale.setScalar(scale);
        g.userData.blocks = true;
        const o = e.obj, r = o.rotation.y, side = { x: o.position.x + Math.cos(r) * 0.95, z: o.position.z - Math.sin(r) * 0.95 };
        g.rotation.y = rot;
        const at = clearSpot(L, env.office, g, side);
        g.position.set(at.x, 0, at.z);
      }
    } else {
      const c = tileCenter(L, anchor.x ?? 0, anchor.y ?? 0);
      g.rotation.y = rot;
      const p = onTop ? c : clearSpot(L, env.office, g, c);
      g.position.set(p.x, onTop ? 0 : y, p.z);
    }
    return g;
  };
}
// The nearest spot to c where a floor prop fits: clear of furniture and other props with room to
// walk round it, inside the walls, and off the doorway. Wall and door anchors land here.
const DOOR_CLEAR = 1.6, WALK_ROOM = 0.25;
function clearSpot(L, office, g, c) {
  const nav = office.nav?.();
  if (!nav) return c;
  g.position.set(0, 0, 0);
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  const door = L.doorWorld;
  // Furniture reaches past its blocked tiles (a chair mat, a desk's overhang), so the nav grid alone
  // can put a floor prop against it.
  const furniture = [...(office.placed?.values() ?? [])].filter((o) => o.obj).map((o) => new THREE.Box3().setFromObject(o.obj)).filter((f) => f.min.y < b.max.y);
  const fits = (x, z) => {
    if (x + b.min.x < -L.W / 2 + 0.15 || x + b.max.x > L.W / 2 - 0.15 || z + b.min.z < -L.D / 2 + 0.15 || z + b.max.z > L.D / 2 - 0.15) return 'room bounds';
    if (door && Math.hypot(x - door.x, z - door.z) < DOOR_CLEAR) return 'door clearance';
    if (furniture.some((f) => x + b.min.x < f.max.x + 0.02 && x + b.max.x > f.min.x - 0.02 && z + b.min.z < f.max.z + 0.02 && z + b.max.z > f.min.z - 0.02)) return 'furniture footprint';
    for (let sx = b.min.x - WALK_ROOM; sx <= b.max.x + WALK_ROOM + 1e-6; sx += 0.2) {
      for (let sz = b.min.z - WALK_ROOM; sz <= b.max.z + WALK_ROOM + 1e-6; sz += 0.2) if (nav.isBlocked(x + sx, z + sz)) return 'walk clearance';
    }
    return true;
  };
  return pickSpot(c, { ring: { centerFirst: true, radii: Array.from({ length: 31 }, (_, i) => (i + 1) * 0.25), count: (d) => Math.max(8, Math.round(d * 12)) },
    needs: ['clear'], checks: { clear: (q) => fits(q.x, q.z) }, fallback: c,
    debug: spotDebug(office), moment: g.userData.spotMoment ?? 'props', search: 'floor',
  });
}

// Free desk top, per desk model: a grid over the top marking cells where something already stands
// (monitor, keyboard, mug, plant, papers, era dressing), found by rasterising the desk's triangles
// that rise above the top. The sitter's hands keep the front middle clear too.
const TOP_X = 0.72, TOP_Z0 = -0.66, TOP_Z1 = -0.04, CELL = 0.02;
const OVER = new THREE.Vector3();
const deskGrids = new WeakMap();
// hands: keep the sitter's hand zone clear (the default); off, only real clutter counts.
function deskGrid(e, hands = true) {
  const key = hands ? e.obj : e.obj.userData;
  let grid = deskGrids.get(key);
  if (grid) return grid;
  const nx = Math.ceil((2 * TOP_X) / CELL), nz = Math.ceil((TOP_Z1 - TOP_Z0) / CELL);
  const cells = new Uint8Array(nx * nz);
  const mark = (x0, x1, z0, z1) => {
    const i0 = Math.max(0, Math.floor((x0 + TOP_X) / CELL)), i1 = Math.min(nx - 1, Math.floor((x1 + TOP_X) / CELL));
    const k0 = Math.max(0, Math.floor((z0 - TOP_Z0) / CELL)), k1 = Math.min(nz - 1, Math.floor((z1 - TOP_Z0) / CELL));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) cells[i + k * nx] = 1;
  };
  e.obj.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(e.obj.matrixWorld).invert();
  const m = new THREE.Matrix4(), a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  // The top's real extent: desk models differ in width, and the grid spans the widest.
  let tx0 = Infinity, tx1 = -Infinity, tz0 = Infinity, tz1 = -Infinity;
  e.obj.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    m.multiplyMatrices(inv, o.matrixWorld);
    const pos = o.geometry.attributes.position, idx = o.geometry.index;
    const n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const v = (j) => (idx ? idx.getX(t + j) : t + j);
      a.fromBufferAttribute(pos, v(0)).applyMatrix4(m);
      b.fromBufferAttribute(pos, v(1)).applyMatrix4(m);
      c.fromBufferAttribute(pos, v(2)).applyMatrix4(m);
      const lo = Math.min(a.y, b.y, c.y), hi = Math.max(a.y, b.y, c.y);
      if (hi - lo < 0.002 && Math.abs(hi - TOP_Y) < 0.01) {
        tx0 = Math.min(tx0, a.x, b.x, c.x); tx1 = Math.max(tx1, a.x, b.x, c.x);
        tz0 = Math.min(tz0, a.z, b.z, c.z); tz1 = Math.max(tz1, a.z, b.z, c.z);
      }
      // Only what stands on the top: above it, below head height.
      if (hi < TOP_Y + 0.012 || lo > 1.3) continue;
      mark(Math.min(a.x, b.x, c.x), Math.max(a.x, b.x, c.x), Math.min(a.z, b.z, c.z), Math.max(a.z, b.z, c.z));
    }
  });
  if (hands) mark(-0.3, 0.3, -0.2, TOP_Z1);
  // Off the top is taken too, so nothing lands in the air beside a narrow desk.
  if (tx1 > tx0) {
    for (let k = 0; k < nz; k++) for (let i = 0; i < nx; i++) {
      const x = -TOP_X + (i + 0.5) * CELL, z = TOP_Z0 + (k + 0.5) * CELL;
      if (x < tx0 || x > tx1 || z < tz0 || z > tz1) cells[i + k * nx] = 1;
    }
  }
  grid = { cells, nx, nz };
  deskGrids.set(key, grid);
  return grid;
}
// The desk-frame spot nearest (lx, lz) where the prop's footprint lands on free desk top, clear of
// `others` (desk-frame rects of the props already on this desk); with that rect.
// overhang: how far past the desk's side edges the prop may stick out (a stack of boxes), and only
// where none of `around` (world boxes of the items near the desk) is under the part that sticks out.
function deskSpot(e, g, lx, lz, rot, overhang = 0, around = [], others = [], hands = true, debug, moment) {
  g.position.set(0, 0, 0);
  g.rotation.y = rot;
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  const { cells, nx, nz } = deskGrid(e, hands);
  const fits = (x, z) => {
    if (x + b.min.x < -TOP_X - overhang || x + b.max.x > TOP_X + overhang || z + b.min.z < TOP_Z0 || z + b.max.z > TOP_Z1) return 'desk bounds';
    if (others.some((r) => x + b.min.x < r.x1 + 0.01 && x + b.max.x > r.x0 - 0.01 && z + b.min.z < r.z1 + 0.01 && z + b.max.z > r.z0 - 0.01)) return 'another desk prop';
    const i0 = Math.floor((x + b.min.x + TOP_X) / CELL), i1 = Math.floor((x + b.max.x + TOP_X) / CELL);
    const k0 = Math.floor((z + b.min.z - TOP_Z0) / CELL), k1 = Math.floor((z + b.max.z - TOP_Z0) / CELL);
    for (let k = Math.max(0, k0); k <= Math.min(nz - 1, k1); k++) for (let i = Math.max(0, i0); i <= Math.min(nx - 1, i1); i++) if (cells[i + k * nx]) return 'desk clutter or hand zone';
    if (around.length && (x + b.min.x < -TOP_X || x + b.max.x > TOP_X)) {
      // The overhanging part, sampled on a 4 cm grid, in world space at the desk top's height.
      const x0 = x + b.min.x, x1 = x + b.max.x, z0 = z + b.min.z, z1 = z + b.max.z;
      for (let px = x0; px <= x1 + 1e-6; px += 0.04) {
        if (px >= -TOP_X && px <= TOP_X) continue;
        for (let pz = z0; pz <= z1 + 1e-6; pz += 0.04) {
          const w = OVER.set(px, TOP_Y + 0.05, pz).applyMatrix4(e.obj.matrixWorld);
          if (around.some((a) => a.containsPoint(w))) return 'overhang blocked';
        }
      }
    }
    return true;
  };
  const at = (x, z) => ({ x, z, rect: { x0: x + b.min.x, x1: x + b.max.x, z0: z + b.min.z, z1: z + b.max.z } });
  function* radii() { for (let d = CELL; d < 1.4; d += CELL) yield d; }
  const spot = pickSpot({ x: lx, z: lz }, { ring: { centerFirst: true, radii: radii(), count: (d) => Math.max(8, Math.round(d * 60)) },
    needs: ['clear'], checks: { clear: (q) => fits(q.x, q.z) }, debug, moment, search: 'desk',
  });
  return spot && at(spot.x, spot.z);
}

// Put a desk-following prop where its desk is now (it may be sliding to a new spot).
function follow(g, e) {
  const f = g.userData.follow, o = e.obj, r = o.rotation.y, cs = Math.cos(r), sn = Math.sin(r);
  g.position.set(o.position.x + cs * f.lx + sn * f.lz, f.y, o.position.z - sn * f.lx + cs * f.lz);
  g.rotation.y = r + f.rot;
}
// A flat, clear spot on the top of the nearest table or counter (a meeting table, a coffee corner)
// for g at its current scale and rotation, as { x, y, z }, or null: the prop's whole footprint must
// be over one level surface at table or counter height, with room above it.
const COUNTERS = new Set(['meeting_table', 'coffee_corner']);
// counterSpot at full size, then shrinking a little, as on a desk.
function onCounter(office, g, item, scale, rot, near) {
  item.scale.setScalar(scale);
  g.rotation.y = rot;
  let spot = counterSpot(office, g, near);
  for (let k = 0; !spot && k < 4; k++) { item.scale.multiplyScalar(0.88); spot = counterSpot(office, g, near); }
  return spot;
}
function counterSpot(office, g, near) {
  const saved = g.position.clone();
  g.position.set(0, 0, 0);
  g.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(g);
  g.position.copy(saved);
  const tall = b.max.y - b.min.y;
  const nw = Math.ceil((b.max.x - b.min.x) / CELL), nd = Math.ceil((b.max.z - b.min.z) / CELL);
  const items = [...(office.placed?.values() ?? [])].filter((o) => COUNTERS.has(o.itemId) && o.target)
    .sort((a, c) => Math.hypot(a.target.x - near.target.x, a.target.z - near.target.z) - Math.hypot(c.target.x - near.target.x, c.target.z - near.target.z));
  function* candidates() {
    for (const it of items.slice(0, 4)) for (const grid of counterGrid(it, tall)) {
      const { nx, nz, x0, z0, y } = grid;
      for (let i = 0; i + nw <= nx; i++) for (let k = 0; k + nd <= nz; k++) {
        yield { x: x0 + (i + nw / 2) * CELL, y, z: z0 + (k + nd / 2) * CELL, grid, i, k };
      }
    }
  }
  const spot = pickSpot(near.target, { candidates: candidates(), needs: ['clear'], checks: {
    clear: ({ grid: { free, nx }, i, k }) => {
      for (let a = 0; a < nw; a++) for (let c = 0; c < nd; c++) if (!free[i + a + (k + c) * nx]) return 'counter footprint blocked';
      return true;
    },
  }, debug: spotDebug(office), moment: g.userData.spotMoment ?? 'props', search: 'counter' });
  return spot && { x: spot.x, y: spot.y, z: spot.z };
}

// A table or counter top as grids of CELL cells in world space, one per surface level: flat, upward
// triangles at table or counter height, largest first (a shelf inside is covered, so all taken). A
// cell is free when that surface is under it and nothing stands on it lower than `tall` above (a
// cabinet higher up is no obstacle). Measured from the triangles, once per item and prop height, like
// the desk-top grid, so choosing a spot casts no rays. The grids are in world space, so they are
// kept for the item's pose and measured again once it moves (build mode slides the same object).
const counterGrids = new WeakMap();
function counterGrid(it, tall) {
  const key = Math.round(tall * 100);
  it.obj.updateMatrixWorld(true);
  const m = it.obj.matrixWorld.elements, pose = [m[0], m[2], m[12], m[14]].map((v) => Math.round(v * 1000)).join();
  let cached = counterGrids.get(it.obj);
  if (cached?.pose !== pose) { cached = { pose, byTall: new Map() }; counterGrids.set(it.obj, cached); }
  const byTall = cached.byTall;
  if (byTall.has(key)) return byTall.get(key);
  const box = new THREE.Box3().setFromObject(it.obj);
  const tris = [];
  const a = new THREE.Vector3(), b2 = new THREE.Vector3(), c = new THREE.Vector3();
  it.obj.traverse((o) => {
    if (!o.isMesh || !o.geometry?.attributes?.position) return;
    const pos = o.geometry.attributes.position, idx = o.geometry.index, n = idx ? idx.count : pos.count;
    for (let t = 0; t < n; t += 3) {
      const v = (j) => (idx ? idx.getX(t + j) : t + j);
      a.fromBufferAttribute(pos, v(0)).applyMatrix4(o.matrixWorld);
      b2.fromBufferAttribute(pos, v(1)).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, v(2)).applyMatrix4(o.matrixWorld);
      tris.push([Math.min(a.x, b2.x, c.x), Math.max(a.x, b2.x, c.x), Math.min(a.y, b2.y, c.y), Math.max(a.y, b2.y, c.y), Math.min(a.z, b2.z, c.z), Math.max(a.z, b2.z, c.z),
        Math.abs((b2.x - a.x) * (c.z - a.z) - (c.x - a.x) * (b2.z - a.z)) / 2]);
    }
  });
  // The surfaces: heights (to the centimetre) of flat triangle area in range, the largest first.
  const area = new Map();
  for (const t of tris) if (t[3] - t[2] < 0.002 && t[2] >= 0.6 && t[3] <= 1.1) { const h = Math.round(t[3] * 100); area.set(h, (area.get(h) ?? 0) + t[6]); }
  const levels = [...area].sort((p, q) => q[1] - p[1]).slice(0, 8).map(([h]) => h / 100);
  const grids = levels.map((y) => levelGrid(tris, box, y, tall));
  byTall.set(key, grids);
  return grids;
}

function levelGrid(tris, box, y, tall) {
  const nx = Math.floor((box.max.x - box.min.x) / CELL), nz = Math.floor((box.max.z - box.min.z) / CELL);
  const top = new Uint8Array(nx * nz), taken = new Uint8Array(nx * nz);
  const cellsOf = (t, into) => {
    const i0 = Math.max(0, Math.ceil((t[0] - box.min.x) / CELL - 0.5)), i1 = Math.min(nx - 1, Math.floor((t[1] - box.min.x) / CELL - 0.5));
    const k0 = Math.max(0, Math.ceil((t[4] - box.min.z) / CELL - 0.5)), k1 = Math.min(nz - 1, Math.floor((t[5] - box.min.z) / CELL - 0.5));
    for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) into[i + k * nx] = 1;
  };
  for (const t of tris) {
    if (t[3] - t[2] < 0.002 && Math.abs(t[3] - y) < 0.006) cellsOf(t, top);
    else if (t[3] > y + 0.012 && t[2] < y + tall + 0.02) { const w = [t[0] - CELL, t[1] + CELL, t[2], t[3], t[4] - CELL, t[5] + CELL]; cellsOf(w, taken); }
  }
  const free = new Uint8Array(nx * nz);
  for (let i = 0; i < nx * nz; i++) free[i] = top[i] && !taken[i] ? 1 : 0;
  return { free, nx, nz, x0: box.min.x, z0: box.min.z, y };
}

// A free-standing prop on the anchor tile's floor, or beside the subject's desk for that anchor.
function onFloor(build, opts = {}) {
  return atDesk(build, { x: 0.95, z: 0.1, rot: 0, y: 0, scale: 1, ...opts });
}
const TOP_Y = 0.57;         // the desk model's top surface
const DESK_PROP_SCALE = 1.6;
// Flat paper needs more size than objects to read from above. It sits on the sitter's right, where
// their head does not hide it from the camera.
const FLAT = { scale: 1.8, x: 0.4, z: -0.3, rot: -0.12, overhang: 0.04 };
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
      else {
        ctx.fillStyle = P.ink; ctx.fillRect(W * 0.3, H * 0.72, W * 0.4, 8);
        // A red urgent stamp, so it reads as bad news at gameplay zoom.
        ctx.strokeStyle = P.alarm_red; ctx.lineWidth = 7; ctx.beginPath(); ctx.arc(W * 0.78, H * 0.3, 26, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = P.alarm_red; ctx.fillRect(W * 0.78 - 4, H * 0.3 - 16, 8, 20); ctx.fillRect(W * 0.78 - 4, H * 0.3 + 8, 8, 7);
      }
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
    box.position.set(((i * 7) % 3 - 1) * 0.015, i * 0.052, ((i * 5) % 3 - 1) * 0.015);
    box.rotation.y = (i % 2 ? 1 : -1) * 0.04 * i;
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
  // Lying on the floor: the centre line one radius up.
  const seg = (x0, x1) => { const m = mesh(roundedCylinder(0.02, 0.02, x1 - x0, 0.006, 8), mat('role_engineer'), x1, 0.02, 0); m.rotation.z = Math.PI / 2; return m; };
  g.add(seg(-0.6, -0.08), seg(0.06, 0.55));
  for (const [x, s] of [[-0.08, 1], [0.06, -1]]) {
    for (let i = 0; i < 4; i++) {
      const w = mesh(roundedCylinder(0.003, 0.003, 0.05, 0.001, 4), mat(['fabric_terracotta', 'marker_green', 'fabric_mustard', 'paper'][i]), x + s * 0.02, 0.02, (i - 1.5) * 0.008);
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
// origin: where puffs start (default the top centre of box); drift: extra travel per life (x, z).
function puffs(box, { n = 8, color = P.metal_soft, rise = 1.2, life = 2.4, size = 0.35, opacity = 0.55, spread = 0.2, glow = false, origin = null, drift = [0, 0] } = {}) {
  const g = new THREE.Group();
  const top = origin ?? new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y, (box.min.z + box.max.z) / 2);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const m = own(new THREE.SpriteMaterial({ map: puffTexture(), color: new THREE.Color(color), transparent: true, opacity: 0, depthWrite: false, blending: glow ? THREE.AdditiveBlending : THREE.NormalBlending }));
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
      p.sp.position.set(top.x + (p.dx + drift[0]) * q, top.y + 0.05 + q * rise, top.z + (p.dz + drift[1]) * q);
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
const OWN_RACK_YAW = Math.PI / 4;   // a staged rack of its own faces the default camera
function rackHot(L, anchor, env) {
  const { box: found, entry } = itemAt(L, anchor, env.office, ['rack']);
  const g = new THREE.Group();
  let box = found;
  if (!entry) {
    // No rack in this office: the staged one brings its own, on clear floor near the anchor, facing
    // the room three-quarters to the camera, and it blocks walking. The effects follow it round.
    const rack = getModel('server_rack');
    rack.userData.shared = true;
    g.add(rack);
    const c = tileCenter(L, anchor.x ?? 0, anchor.y ?? 0);
    g.userData.spotMoment = anchor.prop;
    const q = clearSpot(L, env.office, g, { x: c.x, z: c.z });
    box = new THREE.Box3().setFromObject(rack);
    g.position.set(q.x, 0, q.z);
    g.rotation.y = OWN_RACK_YAW;
    g.userData.blocks = true;
    g.userData.blockPart = rack;
  }
  const heat = puffs(box, { n: 10, color: P.marker_orange, rise: 1.0, life: 1.6, size: 0.6, opacity: 0.9, spread: 0.22, glow: true });
  g.add(heat);
  // Smoke pouring out of the rack's front vents into the room.
  const front = new THREE.Vector3((box.min.x + box.max.x) / 2, box.min.y + (box.max.y - box.min.y) * 0.4, box.max.z + 0.05);
  // Light grey: dark smoke vanishes against the dark rack behind it.
  const smoke = puffs(box, { n: 14, color: P.metal_soft, rise: 0.6, life: 2.4, size: 0.7, opacity: 1, spread: 0.5, origin: front, drift: [0, 1.4] });
  g.add(smoke);
  const size = box.getSize(new THREE.Vector3()), mid = box.getCenter(new THREE.Vector3());
  // A soft orange wash on the rack's face (racks stand with their backs to a wall).
  const glowMat = own(new THREE.MeshBasicMaterial({ map: puffTexture(), color: new THREE.Color(P.marker_orange), transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  const glow = new THREE.Mesh(plane(size.x * 1.3, size.y * 1.1), glowMat);
  glow.position.set(mid.x, mid.y, box.max.z + 0.03);
  glow.userData.noAO = true;
  g.add(glow);
  let t = 0;
  g.userData.tick = (dt) => {
    t += dt;
    heat.userData.tick(dt);
    smoke.userData.tick(dt);
    glowMat.opacity = 0.62 + 0.3 * Math.sin(t * 4);
  };
  g.userData.noPop = true;
  return g;
}


// #339, office classics. The banner: a wide corporate-blue motivational question over the wall.
const companyBanner = () => canvasTex('banner_company', 1024, 256, (ctx, W, H) => {
  ctx.fillStyle = P.role_engineer; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = P.paper; ctx.fillRect(10, 10, W - 20, 6); ctx.fillRect(10, H - 16, W - 20, 6);
  text(ctx, 'IS THIS GOOD FOR', W / 2, 92, 84, P.paper);
  text(ctx, 'THE COMPANY?', W / 2, 184, 84, P.paper);
});
// TPS report cover sheets: a squared-up stack with the memo about them on top.
function coverSheets() {
  const g = new THREE.Group();
  for (let i = 0; i < 6; i++) {
    const sh = mesh(roundedBox(0.21, 0.004, 0.28, 0.002, 1), mat('paper'), (i % 2) * 0.004, 0.002 + i * 0.004, (i % 3) * 0.003);
    sh.rotation.y = (i % 2 ? 1 : -1) * 0.02;
    g.add(sh);
  }
  const memo = cardTex('tps', 128, 170, (ctx, W, H) => {
    ctx.fillStyle = P.paper_sheet; ctx.fillRect(0, 0, W, H);
    text(ctx, 'TPS', W / 2, 28, 30, P.ink);
    text(ctx, 'COVER SHEET', W / 2, 56, 15, P.ink);
    ctx.fillStyle = P.metal_soft; for (let i = 0; i < 5; i++) ctx.fillRect(18, 80 + i * 14, 92 - (i % 2) * 20, 5);
    ctx.fillStyle = P.fabric_mustard; ctx.fillRect(W - 40, 8, 32, 32);
  });
  const top = new THREE.Mesh(plane(0.2, 0.27), flatMat(memo));
  top.rotation.x = -Math.PI / 2; top.position.y = 0.027;
  g.add(top);
  return g;
}
// A red stapler, generic: a rounded base, a hinged top and a steel strip.
function stapler() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.06, 0.02, 0.2, 0.008, 2), mat('metal_dark'), 0, 0.01, 0));
  const top = mesh(roundedBox(0.056, 0.035, 0.19, 0.014, 3), mat('alarm_red'), 0, 0.04, -0.004);
  top.rotation.x = -0.05;
  g.add(top);
  g.add(mesh(roundedBox(0.04, 0.006, 0.05, 0.002, 1), mat('metal_soft'), 0, 0.058, -0.08));
  return g;
}
// An office printer: a boxy body, a paper tray, a jammed sheet sticking out, a blinking light and
// a small screen that says PC LOAD LETTER.
const printerScreen = () => cardTex('pcload', 256, 48, (ctx, W, H) => {
  ctx.fillStyle = '#9fc7a1'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = P.ink; ctx.font = '700 26px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PC LOAD LETTER', W / 2, H / 2);
});
// The printer model on its own (moments.js carries one out the door).
export function printerModel() { return printerBody(false); }
// The visitor's chair, for a moment that keeps it after the staged prop has gone.
export function visitorChairModel() { return visitorChair(); }
function printerBody(broken = false) {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.62, 0.36, 0.5, 0.05, 3), mat('pot_cream'), 0, 0.18, 0));
  g.add(mesh(roundedBox(0.64, 0.04, 0.52, 0.02, 2), mat('metal_soft'), 0, 0.37, 0));
  g.add(mesh(roundedBox(0.44, 0.03, 0.16, 0.01, 2), mat('metal_soft'), 0, 0.12, 0.29));
  const panel = new THREE.Mesh(plane(0.3, 0.056), flatMat(printerScreen()));
  panel.position.set(0.1, 0.395, 0.17); panel.rotation.x = -Math.PI / 2 + 0.5;
  g.add(panel);
  if (!broken) {
    // The jammed sheet, crumpled out of the output slot.
    const jam = mesh(roundedBox(0.24, 0.004, 0.2, 0.002, 1), mat('paper'), -0.05, 0.33, 0.3);
    jam.rotation.set(0.9, 0.2, 0.15);
    g.add(jam);
  }
  return g;
}
function printerJammed() {
  const g = printerBody(false);
  const light = new THREE.Mesh(new THREE.SphereGeometry(0.018, 10, 8), own(new THREE.MeshStandardMaterial({ color: new THREE.Color(P.alarm_red), emissive: new THREE.Color(P.alarm_red), emissiveIntensity: 2 })));
  light.geometry.userData.own = true;
  light.position.set(0.26, 0.37, 0.2);
  g.add(light);
  let t = 0;
  g.userData.tick = (dt) => { t += dt; light.material.emissiveIntensity = Math.sin(t * 7) > 0 ? 2.4 : 0.2; };
  return g;
}
// After "Take it out back": the printer, smashed, on the ground outside, bits scattered and the
// bat leaning on it.
function printerWrecked() {
  const g = new THREE.Group();
  const body = printerBody(true);
  body.rotation.set(0.25, 0.6, -0.35);
  body.scale.set(1, 0.7, 1);
  g.add(body);
  // Tipped over, its lowest corner rests on the floor.
  body.updateMatrixWorld(true);
  body.position.y = -new THREE.Box3().setFromObject(body).min.y + 0.002;
  const bits = [[0.5, 0.2, 'pot_cream'], [-0.45, 0.35, 'metal_soft'], [0.3, -0.45, 'pot_cream'], [-0.2, -0.5, 'metal_dark'], [0.62, -0.1, 'paper'], [-0.6, -0.1, 'paper']];
  bits.forEach(([x, z, m], i) => {
    const b = mesh(roundedBox(0.09 + (i % 3) * 0.03, 0.03, 0.07 + (i % 2) * 0.04, 0.01, 1), mat(m), x, 0.015, z);
    b.rotation.y = i * 1.3;
    g.add(b);
  });
  const bat = new THREE.Group();
  bat.add(mesh(roundedCylinder(0.03, 0.05, 0.8, 0.02, 10), mat('wood_light'), 0, 0, 0));
  // Dropped flat on the floor beside it.
  bat.rotation.set(0, 0.4, Math.PI / 2);
  bat.position.set(0.55, 0.05, 0.25);
  g.add(bat);
  return g;
}
// Inside, a little way in from the door: where the printer was taken to be smashed.
const WRECK_IN = [1.8, 2.2, 2.6, 3];   // metres in from the door the Office Floor wreck may lie
const WRECK_COLUMN_GAP = 2.3;         // and how far it keeps from a column when it can
function byDoor(build, scale = 1, rot = 0.4) {
  return (L, anchor, env) => {
    const g = new THREE.Group();
    g.userData.spotMoment = anchor.prop;
    const item = build();
    item.scale.setScalar(scale);
    g.add(item);
    const d = L.doorWorld;
    {
      // In from the door, clear of the cut-away front wall and away from the columns, so the smash
      // that leaves it shows from either side.
      const cols = (L.blocked ?? []).map(([bx, by]) => ({ x: bx + 0.5 - L.W / 2, z: by + 0.5 - L.D / 2 }));
      const l = Math.hypot(d.x, d.z) || 1, inx = -d.x / l, inz = -d.z / l;
      function* candidates() {
        for (const along of WRECK_IN) for (const side of [0, 1, -1, 2, -2]) {
          yield clearSpot(L, env.office, g, { x: d.x + inx * along - inz * side, z: d.z + inz * along + inx * side });
        }
      }
      const p = pickSpot(d, { candidates: candidates(), minScore: -WRECK_COLUMN_GAP,
        score: (q) => -Math.min(WRECK_COLUMN_GAP, ...cols.map((c) => Math.hypot(c.x - q.x, c.z - q.z))),
        debug: spotDebug(env.office), moment: anchor.prop, search: 'doorColumns',
      });
      g.position.set(p.x, 0, p.z);
      g.userData.blocks = true;
    }
    g.rotation.y = rot;
    return g;
  };
}

// The #228 set: reusable props several decisions stage.

// A printed sheet taped up: a one-star review, a heading, lines of text, a bar chart.
const printout = () => canvasTex('printout', 384, 512, (ctx, W, H) => {
  ctx.fillStyle = P.paper_sheet; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = P.ink; ctx.fillRect(28, 30, W - 56, 26);
  ctx.fillStyle = P.fabric_mustard; ctx.font = '700 40px sans-serif'; ctx.textBaseline = 'top';
  ctx.fillText('★', 28, 74);
  ctx.fillStyle = P.metal_soft; ctx.fillText('★★★★', 70, 74);
  for (let i = 0; i < 9; i++) ctx.fillRect(28, 140 + i * 22, W - 56 - (i % 3) * 60, 9);
  const bars = [0.8, 0.55, 0.35, 0.2];
  bars.forEach((b, i) => { ctx.fillStyle = i ? P.metal_soft : P.alarm_red; ctx.fillRect(40 + i * 80, H - 40 - b * 110, 56, b * 110); });
});
// Marker on a whiteboard: boxes, arrows between them, a scribbled heading and a circled word.
// The pivot board: wiped (the board's own writing gone, a smear left over), then "the market has
// spoken" in big marker over a panicked diagram of boxes, arrows and a circled "?!".
const scrawl = () => canvasTex('whiteboard_scrawl', 1024, 640, (ctx, W, H) => {
  ctx.fillStyle = P.plastic_white; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.12; ctx.fillStyle = P.marker_blue;
  for (let i = 0; i < 5; i++) ctx.fillRect(80 + i * 170, 380 + (i % 2) * 60, 150, 24);
  ctx.globalAlpha = 1;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const pen = (col, w) => { ctx.strokeStyle = col; ctx.lineWidth = w; };
  ctx.fillStyle = P.marker_blue; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
  ctx.font = '800 92px sans-serif';
  ctx.save(); ctx.translate(56, 92); ctx.rotate(-0.035); ctx.fillText('the market', 0, 0); ctx.restore();
  ctx.save(); ctx.translate(96, 200); ctx.rotate(-0.02); ctx.fillText('has spoken', 0, 0); ctx.restore();
  pen(P.marker_blue, 9);
  ctx.beginPath(); ctx.moveTo(96, 262); for (let x = 96; x < 600; x += 30) ctx.lineTo(x + 15, 262 + ((x / 30) % 2 ? -9 : 9)); ctx.stroke();
  pen(P.ink, 8);
  ctx.strokeRect(90, 340, 170, 100); ctx.strokeRect(380, 330, 180, 100); ctx.strokeRect(680, 440, 200, 100);
  pen(P.marker_orange, 8);
  ctx.beginPath(); ctx.moveTo(265, 390); ctx.lineTo(375, 380); ctx.moveTo(355, 364); ctx.lineTo(377, 380); ctx.lineTo(358, 398);
  ctx.moveTo(560, 400); ctx.lineTo(675, 470); ctx.moveTo(652, 470); ctx.lineTo(677, 472); ctx.lineTo(665, 450); ctx.stroke();
  pen(P.ink, 6);
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.moveTo(115, 368 + i * 24); ctx.lineTo(235 - i * 26, 368 + i * 24); ctx.stroke(); }
  pen(P.alarm_red, 14);
  ctx.beginPath(); ctx.ellipse(850, 170, 110, 90, -0.1, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = P.alarm_red; ctx.font = '900 120px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('?!', 850, 176);
});
// The writing on a back wall, as a wall-mounted whiteboard: a brushed frame, a marker tray, and
// the sheet lit a touch so the white and the ink read like the real board.
function wallBoard(L, anchor, env) {
  const { w, h } = WALL_SCRAWL;
  const g = wallPrint(scrawl, WALL_SCRAWL)(L, anchor, env);
  // A board has no tape.
  for (const c of g.children) if (!c.material?.map) c.visible = false;
  const sheet = g.children.find((c) => c.material?.map);
  if (sheet) { sheet.material.emissive = new THREE.Color(P.plastic_white); sheet.material.emissiveIntensity = 0.18; sheet.material.emissiveMap = sheet.material.map; sheet.position.z = 0.02; }
  g.add(mesh(roundedBox(w + 0.07, h + 0.07, 0.03, 0.012, 2), mat('metal_soft'), 0, 0, 0));
  g.add(mesh(roundedBox(w * 0.5, 0.03, 0.07, 0.01, 1), mat('metal_soft'), 0, -h / 2 - 0.04, 0.04));
  return g;
}
// Written on the board's face (both faces of a free-standing one); on the back wall without a board.
const DEFAULT_CAM = [Math.SQRT1_2, Math.SQRT1_2];   // the default camera's side of the room, as a floor direction
// Without a readable board the writing goes up big on a back wall as a wall-mounted board.
const WALL_SCRAWL = { w: 1.5, h: 0.94, tilt: 0, y: 1.55 };
const BOARD_ROOM = 1.2;      // metres of open floor a written board face needs in front of it to count as facing the room
function whiteboardScrawl(L, anchor, env) {
  const selection = {
    debug: spotDebug(env.office), moment: 'whiteboard_scrawl', search: 'face',
    fallback: () => {
      const obj = wallBoard(L, anchor, env);
      return { x: obj.position.x, y: obj.position.y, z: obj.position.z, yaw: obj.rotation.y, obj };
    },
  };
  const { entry } = itemAt(L, anchor, env.office, ['whiteboard']);
  if (!entry) return pickSpot(null, { ...selection, candidates: [] }).obj;
  const face = new THREE.Box3();
  entry.obj.updateMatrixWorld(true);
  entry.obj.traverse((o) => { if (o.isMesh && /whiteboard/.test(o.material?.name ?? '')) face.expandByObject(o); });
  if (face.isEmpty()) face.setFromObject(entry.obj);
  const r = entry.target.rotY, n = [Math.sin(r), Math.cos(r)];
  const c = face.getCenter(new THREE.Vector3()), size = face.getSize(new THREE.Vector3());
  // A written face has to face the default camera with open room in front of it. A board against
  // the cut-away front wall shows the camera the face that looks at that wall, and the room its back:
  // then the writing goes up on the back wall instead, where everyone reads it.
  const sides = entry.itemId === 'whiteboard_wall' ? [1] : [1, -1];
  const readable = pickSpot(c, {
    ...selection,
    candidates: sides.map((sd) => ({ x: c.x, y: c.y, z: c.z, yaw: r + (sd < 0 ? Math.PI : 0), nx: n[0] * sd, nz: n[1] * sd })),
    needs: ['facesCamera', 'openRoom'],
    checks: {
      facesCamera: ({ nx, nz }) => nx * DEFAULT_CAM[0] + nz * DEFAULT_CAM[1] > 0.2 || 'face points away from camera',
      openRoom: ({ nx, nz }) => {
        const room = Math.min(nx > 0 ? (L.W / 2 - c.x) / nx : nx < 0 ? (-L.W / 2 - c.x) / nx : Infinity, nz > 0 ? (L.D / 2 - c.z) / nz : nz < 0 ? (-L.D / 2 - c.z) / nz : Infinity);
        return room > BOARD_ROOM || 'insufficient room in front of face';
      },
    },
  });
  if (readable.obj) return readable.obj;
  // The face's width across the board, its thickness along the facing.
  const across = Math.abs(n[1]) * size.x + Math.abs(n[0]) * size.z, thick = Math.abs(n[0]) * size.x + Math.abs(n[1]) * size.z;
  const g = new THREE.Group();
  g.position.set(c.x, c.y, c.z);
  g.rotation.y = r;
  const m = own(new THREE.MeshStandardMaterial({ map: scrawl(), roughness: 0.6 }));
  for (const side of sides) {
    // Nearly the whole face, so none of the board's own writing shows round it.
    const pl = new THREE.Mesh(plane(across * 0.94, size.y * 0.9), m);
    // In front of anything already written on the board (the rival note sits 12 mm out).
    pl.position.z = side * (thick / 2 + 0.02);
    if (side < 0) pl.rotation.y = Math.PI;
    pl.userData.noAO = true;
    g.add(pl);
  }
  return g;
}
function mugMesh(scale = 1, color = 'mug') {
  const g = new THREE.Group();
  g.add(mesh(roundedCylinder(0.04 * scale, 0.036 * scale, 0.1 * scale, 0.01 * scale, 14), mat(color), 0, 0, 0));
  g.add(mesh(roundedCylinder(0.034 * scale, 0.034 * scale, 0.004, 0.001, 14), mat('coffee'), 0, 0.09 * scale, 0));
  const handle = mesh(new THREE.TorusGeometry(0.024 * scale, 0.007 * scale, 6, 12), mat(color), 0.045 * scale, 0.05 * scale, 0);
  handle.geometry.userData.own = true;
  g.add(handle);
  return g;
}
// Mugs nobody took back to the kitchen, stacked into a leaning tower: one mug's footprint, so it fits a busy desk at full size and reads from across the room.
function mugPile() {
  const g = new THREE.Group();
  const cols = ['plastic_white', 'fabric_teal', 'fabric_mustard', 'screen_pink', 'plastic_white', 'fabric_teal'];
  cols.forEach((c, i) => {
    const m = mugMesh(1.4, c);
    m.position.set(i * 0.008, i * 0.125, i * 0.004);
    m.rotation.set(0, i * 1.7, (i % 2 ? 1 : -1) * 0.04);
    g.add(m);
  });
  return g;
}
// One absurdly big mug: the size of a waste bin, on the floor beside its owner's desk.
function mugBucket() { return mugMesh(5.5, 'fabric_teal'); }
// A wall shelf with a big mug on it, its slogan to the room: SOFTWEAR, the swapped letters in red
// and askew, so the typo reads without reading the word.
const mugLabel = () => canvasTex('mug_typo', 256, 128, (ctx, W, H) => {
  ctx.fillStyle = P.plastic_white; ctx.fillRect(0, 0, W, H);
  ctx.textBaseline = 'middle'; ctx.font = '900 52px sans-serif';
  const parts = [['SOFTW', P.ink, 0], ['E', P.alarm_red, -0.25], ['A', P.alarm_red, 0.3], ['R', P.ink, 0]];
  const widths = parts.map(([t]) => ctx.measureText(t).width);
  let x = (W - widths.reduce((a, b) => a + b, 0)) / 2;
  parts.forEach(([t, col, rot], i) => {
    ctx.save(); ctx.translate(x + widths[i] / 2, H / 2 + (rot ? -4 : 0)); ctx.rotate(rot);
    ctx.fillStyle = col; ctx.textAlign = 'center'; ctx.fillText(t, 0, 0); ctx.restore();
    x += widths[i];
  });
});
function mugShelf() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.5, 0.03, 0.22, 0.01, 2), mat('wood_honey'), 0, 0, 0.11));
  for (const sx of [-0.19, 0.19]) g.add(mesh(roundedBox(0.025, 0.09, 0.14, 0.006, 1), mat('metal_dark'), sx, -0.06, 0.07));
  const m = mugMesh(3.4, 'plastic_white');
  m.position.set(0, 0.015, 0.13);
  // Handle to the side, so the printed front faces the room.
  m.rotation.y = Math.PI;
  g.add(m);
  // The slogan on a flat band across the mug's front, so it reads.
  const label = new THREE.Mesh(plane(0.24, 0.12), flatMat(mugLabel(), 0.6));
  label.position.set(0, 0.015 + 0.17, 0.13 + 0.138);
  label.userData.noAO = true;
  g.add(label);
  return g;
}
// A 3D thing on the wall at a height, placed along the wall as a print is.
function wallThing(build, { w = 0.5, y = 1.3, scale = 1 } = {}) {
  return (L, anchor, env) => {
    const spot = wallSpot(L, anchor, env.busy, w);
    const g = new THREE.Group();
    g.userData.span = { wall: spot.wall, a: spot.at - w / 2, b: spot.at + w / 2 };
    const onX = spot.wall === 'x';
    g.position.set(onX ? -L.W / 2 + 0.03 : spot.at, y, onX ? spot.at : -L.D / 2 + 0.03);
    if (onX) g.rotation.y = Math.PI / 2;
    const item = build();
    item.scale.setScalar(scale);
    g.add(item);
    return g;
  };
}
// Two cardboard boxes stacked by the door, the top one open with a monitor peeking out.
function movingBoxes() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.55, 0.38, 0.42, 0.02, 2), mat('cardboard'), 0, 0.19, 0));
  const top = mesh(roundedBox(0.48, 0.3, 0.38, 0.02, 2), mat('cardboard'), 0.03, 0.53, 0.01);
  top.rotation.y = 0.12;
  g.add(top);
  for (const [sx, r] of [[-1, 0.9], [1, -0.9]]) {
    const flap = mesh(roundedBox(0.2, 0.012, 0.36, 0.004, 1), mat('cardboard'), 0.03 + sx * 0.33, 0.7, 0.01);
    flap.rotation.set(0, 0.12, r);
    g.add(flap);
  }
  const mon = mesh(roundedBox(0.36, 0.24, 0.03, 0.01, 2), mat('plastic_charcoal'), 0.03, 0.72, -0.02);
  mon.rotation.set(-0.2, 0.12, 0.05);
  g.add(mon);
  g.add(mesh(roundedBox(0.4, 0.004, 0.06, 0.001, 1), mat('paper'), 0, 0.38, 0.21));
  return g;
}
// A would-be mentor's hand-painted sign on a gallows post: INCUBATOR in uneven brush letters.
const incubatorBoard = () => canvasTex('house_sign', 512, 200, (ctx, W, H) => {
  ctx.fillStyle = P.wood_honey; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = P.wood_dark; ctx.lineWidth = 3;
  for (let y = 34; y < H; y += 44) { ctx.beginPath(); ctx.moveTo(0, y); ctx.bezierCurveTo(W * 0.3, y + 6, W * 0.6, y - 5, W, y + 3); ctx.stroke(); }
  ctx.fillStyle = P.paper_sheet; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
  ctx.font = '900 68px sans-serif';
  // Letter by letter, each a little off, as if painted by someone confident and in a hurry.
  const word = 'INCUBATOR';
  word.split('').forEach((ch, i) => {
    ctx.save();
    ctx.translate(46 + i * 52, H * 0.46 + ((i * 7) % 5 - 2) * 3);
    ctx.rotate(((i * 13) % 7 - 3) * 0.025);
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  });
  // A drip under the second I, and the underline that ran out of paint.
  ctx.fillRect(44, H * 0.64, 6, 26);
  ctx.strokeStyle = P.paper_sheet; ctx.lineWidth = 7; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(40, H * 0.84); ctx.lineTo(W * 0.62, H * 0.82); ctx.stroke();
});
function houseSign() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.08, 1.35, 0.08, 0.015, 2), mat('wood_dark'), 0, 0.675, 0));
  g.add(mesh(roundedBox(0.7, 0.06, 0.06, 0.012, 2), mat('wood_dark'), 0.32, 1.3, 0));
  const board = new THREE.Group();
  board.position.set(0.36, 1.02, 0);
  board.rotation.z = 0.04;
  board.add(mesh(roundedBox(0.66, 0.28, 0.035, 0.012, 2), mat('wood_honey'), 0, 0, 0));
  for (const sz of [-1, 1]) {
    const face = new THREE.Mesh(plane(0.62, 0.24), flatMat(incubatorBoard(), 0.8));
    face.position.z = sz * 0.019;
    if (sz < 0) face.rotation.y = Math.PI;
    face.userData.noAO = true;
    board.add(face);
  }
  for (const sx of [-0.26, 0.26]) board.add(mesh(roundedBox(0.012, 0.16, 0.012, 0.004, 1), mat('metal_soft'), sx, 0.2, 0));
  g.add(board);
  return g;
}
// The rival's keynote poster: a brushed aluminium cube floating on a gradient, and very little else.
const boxPoster = () => canvasTex('box_poster', 480, 640, (ctx, W, H) => {
  const bg = ctx.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, P.fabric_slate); bg.addColorStop(1, P.ink);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);
  const cx = W / 2, cy = H * 0.42, s = 120;
  const face = (pts, a, b) => {
    const gr = ctx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
    gr.addColorStop(0, a); gr.addColorStop(1, b);
    ctx.fillStyle = gr; ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.closePath(); ctx.fill();
  };
  const top = [[cx, cy - s], [cx + s * 0.87, cy - s / 2], [cx, cy], [cx - s * 0.87, cy - s / 2]];
  const left = [[cx - s * 0.87, cy - s / 2], [cx, cy], [cx, cy + s], [cx - s * 0.87, cy + s / 2]];
  const right = [[cx, cy], [cx + s * 0.87, cy - s / 2], [cx + s * 0.87, cy + s / 2], [cx, cy + s]];
  face(top, P.plastic_white, P.metal_soft);
  face(left, P.metal_soft, P.fabric_slate);
  face(right, P.plastic_white, P.metal_soft);
  // A soft glow under it, as if it hovers.
  const glow = ctx.createRadialGradient(cx, cy + s * 1.35, 4, cx, cy + s * 1.35, s);
  glow.addColorStop(0, 'rgba(242,236,225,0.45)'); glow.addColorStop(1, 'rgba(242,236,225,0)');
  ctx.fillStyle = glow; ctx.fillRect(0, cy + s, W, s * 0.8);
  ctx.fillStyle = P.plastic_white; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = '300 64px sans-serif'; ctx.fillText('The Box', cx, H * 0.82);
  ctx.font = '400 22px sans-serif'; ctx.globalAlpha = 0.7; ctx.fillText('It is a box.', cx, H * 0.9);
});
// A small brushed aluminium cube left on a desk: the company's own box.
function boxCube() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.13, 0.13, 0.13, 0.018, 3), mat('metal_soft'), 0, 0.065, 0));
  const led = mesh(roundedBox(0.05, 0.006, 0.004, 0.002, 1), glow('led_green', 3), 0, 0.04, 0.066);
  led.userData.noAO = true;
  g.add(led);
  return g;
}
// Pallets of shrink-wrapped oat milk cartons, the kind that fill a lobby: slatted pallets, cartons
// stacked three high, and a glossy wrap round each stack.
const cartonsTex = () => canvasTex('oat_cartons', 256, 256, (ctx, W, H) => {
  ctx.fillStyle = P.plastic_white; ctx.fillRect(0, 0, W, H);
  const cw = W / 3, ch = H / 3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
    const x = i * cw, y = j * ch;
    ctx.fillStyle = P.fabric_mustard; ctx.fillRect(x + 6, y + ch * 0.5, cw - 12, ch * 0.28);
    ctx.fillStyle = P.fabric_teal; ctx.font = '800 22px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('OAT', x + cw / 2, y + ch * 0.3);
    ctx.strokeStyle = P.metal_soft; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, cw - 3, ch - 3);
  }
});
let wrapMat = null;
function oatMilk() {
  const g = new THREE.Group();
  wrapMat ??= new THREE.MeshStandardMaterial({ color: new THREE.Color(P.glass), roughness: 0.15, metalness: 0, transparent: true, opacity: 0.28, depthWrite: false });
  for (const [px, pz, rot] of [[-0.44, 0, 0.04], [0.44, 0.06, -0.06]]) {
    const pal = new THREE.Group();
    pal.position.set(px, 0, pz);
    pal.rotation.y = rot;
    for (const sx of [-0.3, 0, 0.3]) pal.add(mesh(roundedBox(0.12, 0.08, 0.6, 0.012, 1), mat('wood_honey'), sx, 0.04, 0));
    for (const sz of [-0.25, 0, 0.25]) pal.add(mesh(roundedBox(0.8, 0.03, 0.1, 0.008, 1), mat('wood_honey'), 0, 0.095, sz));
    const stack = new THREE.Mesh(new THREE.BoxGeometry(0.74, 0.66, 0.54), flatMat(cartonsTex(), 0.8));
    stack.geometry.userData.own = true;
    stack.position.y = 0.11 + 0.33;
    stack.castShadow = stack.receiveShadow = true;
    pal.add(stack);
    const wrap = mesh(roundedBox(0.77, 0.69, 0.57, 0.04, 2), wrapMat, 0, 0.11 + 0.345, 0);
    wrap.castShadow = false;
    wrap.userData.noAO = true;
    pal.add(wrap);
    g.add(pal);
  }
  return g;
}
// An oversized novelty cheque: the hackathon prize, to the winner, the amount left blank.
const cheque = () => canvasTex('giant_cheque', 1024, 440, (ctx, W, H) => {
  ctx.fillStyle = '#e9f1e4'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = P.fabric_teal; ctx.lineWidth = 14; ctx.strokeRect(14, 14, W - 28, H - 28);
  ctx.fillStyle = P.ink; ctx.textBaseline = 'middle';
  ctx.font = '700 40px sans-serif'; ctx.fillText('PAY TO THE ORDER OF', 60, 110);
  ctx.fillStyle = P.metal_soft; ctx.fillRect(520, 128, 440, 6);
  ctx.fillStyle = P.ink; ctx.font = 'italic 700 56px sans-serif'; ctx.fillText('Winner', 560, 104);
  ctx.fillStyle = P.ink; ctx.font = '800 120px sans-serif'; ctx.fillText('$', 60, 260);
  ctx.strokeStyle = P.fabric_teal; ctx.lineWidth = 8; ctx.strokeRect(160, 200, 420, 110);
  ctx.fillStyle = P.metal_soft; ctx.fillRect(620, 360, 340, 6);
  ctx.strokeStyle = P.ink; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(640, 350);
  for (let x = 640; x < 940; x += 30) ctx.quadraticCurveTo(x + 15, 300 + (x % 60), x + 30, 345);
  ctx.stroke();
});
// An open box of stickers and swag, a folded banner leaning on it.
function swagBox() {
  const g = new THREE.Group();
  g.add(mesh(roundedBox(0.5, 0.26, 0.38, 0.02, 2), mat('cardboard'), 0, 0.13, 0));
  const cols = ['fabric_mustard', 'fabric_teal', 'screen_pink', 'marker_green', 'marker_orange', 'role_engineer'];
  for (let i = 0; i < 12; i++) {
    const st = mesh(roundedBox(0.08, 0.01, 0.08, 0.003, 1), mat(cols[i % cols.length]), -0.18 + (i % 4) * 0.12, 0.26 + (i % 3) * 0.008, -0.12 + Math.floor(i / 4) * 0.12);
    st.rotation.set(((i * 7) % 5 - 2) * 0.08, i * 0.7, 0);
    g.add(st);
  }
  const banner = mesh(roundedBox(0.5, 0.06, 0.2, 0.02, 2), mat('fabric_teal'), 0.26, 0.24, 0.02);
  banner.rotation.set(0, 0, 1.25);
  g.add(banner);
  return g;
}
// A French press on a small round stand.
function frenchPress() {
  const g = new THREE.Group();
  g.add(mesh(roundedCylinder(0.2, 0.2, 0.03, 0.01, 20), mat('wood_honey'), 0, 0.62, 0));
  g.add(mesh(roundedCylinder(0.025, 0.035, 0.6, 0.008, 10), mat('metal_dark'), 0, 0.02, 0));
  g.add(mesh(roundedCylinder(0.15, 0.15, 0.02, 0.008, 16), mat('metal_dark'), 0, 0, 0));
  const top = 0.65;
  const glass = mesh(roundedCylinder(0.065, 0.065, 0.2, 0.01, 18), mat('glass'), 0, top, 0);
  g.add(glass);
  g.add(mesh(roundedCylinder(0.058, 0.058, 0.12, 0.005, 16), mat('coffee'), 0, top + 0.01, 0));
  g.add(mesh(roundedCylinder(0.07, 0.07, 0.025, 0.008, 18), mat('metal_soft'), 0, top + 0.2, 0));
  g.add(mesh(roundedCylinder(0.008, 0.008, 0.08, 0.003, 8), mat('metal_soft'), 0, top + 0.22, 0));
  g.add(mesh(roundedCylinder(0.02, 0.02, 0.018, 0.006, 10), mat('plastic_charcoal'), 0, top + 0.3, 0));
  const handle = mesh(roundedBox(0.02, 0.14, 0.03, 0.008, 2), mat('plastic_charcoal'), 0.085, top + 0.08, 0);
  g.add(handle);
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
  gift_cards: atDesk(giftCards, { ...FLAT, group: true }),
  sticky_notes: atDesk(stickyNotes, { x: 0.4, z: -0.28, rot: 0.1 }),
  photos_laminated: atDesk(photosLaminated, FLAT),
  smoothie: atDesk(smoothie, { x: 0.45, z: -0.25, rot: 0, group: true }),
  pizza_boxes: atDesk(pizzaBoxes, { x: 0.5, z: -0.38, rot: 0.06, scale: 1.0, overhang: 0.1, group: true }),
  curtain: onFloor(curtain, { x: 1.4, z: -0.3, rot: Math.PI / 2 }),
  sledgehammer: onFloor(sledgehammer, { scale: 1.3 }),
  tape_measure: onFloor(tapeMeasure, { x: 0.9, z: 0.35, rot: 0.4, scale: 1.4 }),
  pet_carrier: byDoor(petCarrier, 1.2, -0.5),
  cable_chewed: onFloor(cableChewed, { x: 0.95, z: 0.25, rot: 0.6, scale: 1.4 }),
  visitor_chair: onFloor(visitorChair, { x: 0.95, z: 0.15, rot: Math.PI + 0.7 }),
  smoke_puff: smokePuff,
  rack_hot: rackHot,
  // A banner hangs high, across the top of the wall, over the posters.
  banner_company: wallPrint(companyBanner, { w: 2.0, h: 0.46, tilt: 0.01, y: (L) => L.wallH - 0.3 }),
  cover_sheets: atDesk(coverSheets, FLAT),
  stapler: atDesk(stapler, { x: 0.45, z: -0.35, rot: -0.3, scale: 1.8 }),
  printer_jammed: onFloor(printerJammed, { x: 1.1, z: 0.2, rot: 0.2, scale: 1.2 }),
  printer_wrecked: byDoor(printerWrecked, 1.2),
  printout: wallPrint(printout, { w: 0.52, h: 0.69, tilt: -0.04 }),
  whiteboard_scrawl: whiteboardScrawl,
  mug_pile: atDesk(mugPile, { x: 0.2, z: -0.25, rot: 0.3, scale: 1.1, sprawl: true }),
  mug_bucket: onFloor(mugBucket, { x: 0.95, z: 0.05, rot: -0.4 }),
  mug_typo: wallThing(mugShelf, { w: 1.0, y: 1.15, scale: 1.8 }),
  moving_boxes: onFloor(movingBoxes, { x: 0.9, z: 0.2, rot: 0.3, scale: 1.1 }),
  house_sign: byDoor(houseSign, 1.3, Math.PI / 4),
  box_poster: wallPrint(boxPoster, { w: 0.84, h: 1.12, tilt: 0, y: 1.55 }),
  box_cube: atDesk(boxCube, { x: FLAT.x, z: FLAT.z, rot: 0.5, scale: 1.8 }),
  oat_milk: byDoor(oatMilk),
  giant_cheque: wallPrint(cheque, { w: 1.6, h: 0.69, tilt: 0.02, y: 1.5 }),
  swag_box: onFloor(swagBox, { x: 0.9, z: 0.25, rot: -0.3, scale: 1.25 }),
  french_press: onFloor(frenchPress, { x: 0.9, z: 0.2, rot: 0.2, scale: 1.3 }),
};
