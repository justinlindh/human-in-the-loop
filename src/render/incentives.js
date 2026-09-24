import * as THREE from 'three';
import { getModel } from './models.js';
import { mat, color } from './materials.js';
import { roundedBox, roundedCylinder, mesh } from './prims.js';
import { PALETTE as P } from './palette.js';
import { wallGap } from './office.js';

// Incentive rewards. { type: 'incentive', staffId, reward } where reward is 'balloons' (on the
// winner's desk until the next award), 'caricature' (a framed big-head portrait on the wall), or
// 'waffle_party' (a staged scene: the cart rolls in, the room goes dark around one warm pool of
// light, the winner eats a towering stack alone under bunting, and colleagues watch through a
// frosted partition; the caricature goes up afterwards).

const PARTY_S = 15;
const REACTIONS = ['whisper', 'point', 'press', 'shake'];
const ROLL_S = 2.2;
const DIM = 1.9;            // how far the room lights drop (see lighting.setSkeleton)
const POOL = 5.5;             // warm light over the table

function rnd(a, b) { return a + Math.random() * (b - a); }

// Chibi-sized waffles: a tall stack with a grid on top, syrup running down, cream and berries.
function waffleStack() {
  const g = new THREE.Group();
  const syrup = new THREE.MeshStandardMaterial({ color: color('wood_walnut'), roughness: 0.12, metalness: 0.05 });
  g.add(mesh(roundedCylinder(0.24, 0.22, 0.03, 0.01, 24), mat('paper'), 0, 0, 0));
  const n = 5, S = 0.3, T = 0.055;
  for (let k = 0; k < n; k++) {
    const w = mesh(roundedBox(S, T, S, 0.018), mat('wood_honey'), 0, 0.03 + T / 2 + k * T, 0);
    w.rotation.y = (k % 2 ? 1 : -1) * 0.12;
    g.add(w);
  }
  const top = 0.03 + n * T;
  // The waffle grid: raised ridges across the top face.
  for (let i = -2; i <= 2; i++) {
    g.add(mesh(roundedBox(S - 0.03, 0.012, 0.018, 0.004, 1), mat('wood_light'), 0, top + 0.004, i * 0.055, { cast: false }));
    g.add(mesh(roundedBox(0.018, 0.012, S - 0.03, 0.004, 1), mat('wood_light'), i * 0.055, top + 0.005, 0, { cast: false }));
  }
  // A glossy puddle of syrup and drips running down the sides.
  g.add(mesh(roundedCylinder(0.11, 0.12, 0.02, 0.008, 18), syrup, 0.02, top + 0.012, 0.01, { cast: false }));
  for (const [x, z, h] of [[0.15, 0.04, 0.12], [-0.06, 0.15, 0.17], [0.07, -0.15, 0.09], [-0.15, -0.05, 0.14]]) {
    g.add(mesh(roundedCylinder(0.018, 0.022, h, 0.008, 8), syrup, x, top - h + 0.01, z, { cast: false }));
  }
  const cream = new THREE.Mesh(new THREE.SphereGeometry(0.08, 14, 10), mat('paper'));
  cream.scale.set(1, 0.75, 1);
  cream.position.set(0, top + 0.07, 0);
  g.add(cream);
  g.add(mesh(new THREE.SphereGeometry(0.03, 10, 8), mat('fabric_terracotta'), 0.01, top + 0.14, 0));
  for (const [x, z, m] of [[0.1, 0.08, 'role_engineer'], [-0.09, -0.07, 'fabric_terracotta'], [0.05, -0.1, 'role_engineer']]) {
    g.add(mesh(new THREE.SphereGeometry(0.022, 8, 6), mat(m), x, top + 0.03, z));
  }
  return g;
}

// Pennant bunting spelling a word, strung between two poles.
function bunting(word, len) {
  const g = new THREE.Group();
  const H = 1.95;
  for (const sx of [-1, 1]) g.add(mesh(roundedCylinder(0.02, 0.025, H + 0.1, 0.006, 8), mat('metal_dark'), sx * len / 2, 0, 0));
  const letters = [...word];
  const n = letters.length;
  const cols = [P.role_designer, P.fabric_mustard, P.fabric_teal, P.marker_orange];
  for (let i = 0; i < n; i++) {
    if (letters[i] === ' ') continue;
    const t = (i + 0.5) / n;
    const x = -len / 2 + t * len;
    const sag = Math.sin(t * Math.PI) * 0.14;
    const c = document.createElement('canvas');
    c.width = 64; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.fillStyle = cols[i % cols.length];
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(64, 0); ctx.lineTo(32, 80); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.paper;
    ctx.font = '700 40px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(letters[i], 32, 36);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    const flag = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.32), new THREE.MeshStandardMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, roughness: 0.9 }));
    flag.position.set(x, H - sag - 0.16, 0);
    g.add(flag);
  }
  // The string, as short segments following the sag.
  for (let i = 0; i < 16; i++) {
    const t0 = i / 16, t1 = (i + 1) / 16;
    const a = new THREE.Vector3(-len / 2 + t0 * len, H - Math.sin(t0 * Math.PI) * 0.14, 0);
    const b = new THREE.Vector3(-len / 2 + t1 * len, H - Math.sin(t1 * Math.PI) * 0.14, 0);
    const seg = mesh(new THREE.CylinderGeometry(0.006, 0.006, a.distanceTo(b), 5), mat('paper'), 0, 0, 0, { cast: false });
    seg.position.copy(a).add(b).multiplyScalar(0.5);
    seg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    g.add(seg);
  }
  return g;
}

// A rolling frosted glass divider: panels on wheeled feet.
function partition(width) {
  const g = new THREE.Group();
  const frost = new THREE.MeshStandardMaterial({ color: color('paper'), transparent: true, opacity: 0.3, roughness: 0.25, depthWrite: false });
  const H = 1.85;
  const panes = Math.max(2, Math.round(width / 1.1));
  const pw = width / panes;
  for (let i = 0; i < panes; i++) {
    const x = -width / 2 + pw * (i + 0.5);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(pw - 0.06, H - 0.2, 0.02), frost);
    pane.position.set(x, H / 2 + 0.06, 0);
    pane.renderOrder = 2;
    g.add(pane);
    g.add(mesh(roundedBox(pw - 0.02, 0.05, 0.05, 0.015), mat('metal_soft'), x, H - 0.03, 0));
  }
  for (let i = 0; i <= panes; i++) {
    const x = -width / 2 + pw * i;
    g.add(mesh(roundedBox(0.05, H, 0.05, 0.015), mat('metal_soft'), x, H / 2 + 0.06, 0));
    g.add(mesh(roundedBox(0.06, 0.04, 0.4, 0.012), mat('metal_dark'), x, 0.05, 0));
    for (const sz of [-1, 1]) g.add(mesh(new THREE.SphereGeometry(0.03, 8, 6), mat('plastic_charcoal'), x, 0.03, sz * 0.17));
  }
  return g;
}

export function createIncentives({ office, recs, walkTo, emote, parent, caricature, setDim, setAccent, setPictureLight, getYaw, rig = null, fx = null }) {
  let balloons = null;          // { obj, deskId }
  let frame = null;
  let party = null;

  function deskOf(r) {
    return r?.seat ? office.deskById(r.seat) : null;
  }

  function putBalloons(r) {
    if (balloons) balloons.obj.removeFromParent();
    const d = deskOf(r);
    if (!d) { balloons = null; return; }
    const obj = getModel('balloons');
    // Back corner of the desk top, in the desk set's own frame.
    obj.position.set(0.34, 0.57, -0.5);
    d.obj.add(obj);
    balloons = { obj, deskId: d.id };
  }

  function hangCaricature(r) {
    const canvas = caricature(r.staff);
    const cur = office.current;
    if (!canvas || !cur) return;
    if (frame) frame.removeFromParent();
    const L = cur.L;
    const gap = wallGap(L, 'z');
    if (!gap || gap[1] - gap[0] < 1.3) return;
    const x = (gap[0] + gap[1]) / 2;
    const zw = -L.D / 2;
    const y = 1.78;           // high enough to clear boards and shelves in front of the wall
    const g = new THREE.Group();
    g.add(mesh(roundedBox(1.0, 1.12, 0.05, 0.015), mat('gold'), x, y, zw + 0.03));
    g.add(mesh(roundedBox(0.88, 1.0, 0.01, 0.004), mat('paper'), x, y, zw + 0.058, { cast: false }));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.84), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9 }));
    pic.position.set(x, y + 0.05, zw + 0.066);
    g.add(pic);
    g.add(mesh(roundedBox(0.34, 0.06, 0.014, 0.004), mat('gold'), x, y - 0.46, zw + 0.064, { cast: false }));
    cur.root.add(g);
    frame = g;
    frame.userData.at = { x, y, z: zw };
    setPictureLight({ x, y: 2.5, z: zw + 1.4 }, { x, y, z: zw }, 2.2);
  }

  // The most open patch of floor (farthest from anything blocked), for a party with no table.
  function openSpot(L) {
    const nav = office.nav();
    const { nx, nz, cell, blocked } = nav;
    let best = null, bestScore = -1;
    const R = Math.ceil(2.6 / cell);
    for (let i = R; i < nx - R; i += 2) {
      for (let k = R; k < nz - R; k += 2) {
        if (blocked[i + k * nx]) continue;
        let clear = R;
        for (let di = -R; di <= R && clear > 0; di++) {
          for (let dk = -R; dk <= R; dk++) {
            if (blocked[i + di + (k + dk) * nx]) { clear = Math.min(clear, Math.hypot(di, dk)); }
          }
        }
        const x = -L.W / 2 + (i + 0.5) * cell, z = -L.D / 2 + (k + 0.5) * cell;
        const score = clear - Math.hypot(x, z) * 0.02;
        if (score > bestScore) { bestScore = score; best = { x, z }; }
      }
    }
    return best ?? { x: 0, z: 0 };
  }

  // Party layout around the meeting table (or the coffee corner): the winner sits on the far side
  // of the table facing the camera; the cart is at one end; the partition and watchers are on the
  // other, across the screen, so the watchers are seen in profile looking through the glass.
  function venue() {
    const Z = office.current.zones;
    const L = office.current.L;
    const yaw = getYaw();
    const cam = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    let center, rotY, tl, td;
    if (Z.meeting) { center = { x: Z.meeting.x, z: Z.meeting.z }; rotY = Z.meeting.rotY; tl = Z.meeting.L; td = Z.meeting.D; }
    else {
      // No meeting table: the cart is the table. It parks with its front to the camera and the
      // winner stands behind it, eating off the top.
      center = openSpot(L); rotY = 0; tl = 1.2; td = 0.8;
    }
    const c = Math.cos(rotY), s = Math.sin(rotY);
    const w = (lx, lz) => ({ x: center.x + c * lx + s * lz, z: center.z - s * lx + c * lz });
    // Far side: the long side whose outward normal points away from the camera.
    const nz = (s * cam.x + c * cam.z) > 0 ? -1 : 1;
    const seatL = w(0, nz * (td / 2 + 0.33));
    const seat = { ...seatL, yaw: Math.atan2(center.x - seatL.x, center.z - seatL.z) };
    const plate = w(0, nz * (td / 2 - 0.22));
    // The partition stands beyond the winner (camera, table, winner, glass, watchers), so the
    // watchers are seen through the frosted glass and spread across the screen. If that side has
    // no room, it moves to a screen side instead.
    const inside = (p) => Math.abs(p.x) < L.W / 2 - 0.5 && Math.abs(p.z) < L.D / 2 - 0.5;
    const at = (dir, d) => ({ x: center.x + dir.x * d, z: center.z + dir.z * d });
    const back = { x: -cam.x, z: -cam.z };
    let dir = back, spread = right;
    if (!inside(at(back, 2.5))) {
      dir = inside(at(right, 3)) ? right : { x: -right.x, z: -right.z };
      spread = { x: -dir.z, z: dir.x };
    }
    const cartDir = dir === back ? right : { x: -dir.x, z: -dir.z };
    if (!Z.meeting) {
      // The winner stands beside the cart (screen right), turned a little toward it, facing us.
      const stand = { x: center.x + right.x * 0.8 - cam.x * 0.1, z: center.z + right.z * 0.8 - cam.z * 0.1 };
      return {
        center, seat: { ...stand, yaw: Math.atan2(cam.x, cam.z) - 0.5 }, plate: { x: center.x - cam.x * 0.08, z: center.z - cam.z * 0.08 }, plateY: 0.82 * 1.3 + 0.02,
        sit: false, tableLen: 1.4, rotY, yaw, bannerAt: at(dir, 1.05),
        cart: center, cartYaw: yaw,
        glass: at(dir, 1.75), glassYaw: Math.atan2(dir.x, dir.z),
        watch: (i) => { const p = at(dir, 2.3); return { x: p.x + spread.x * (i - 1) * 0.65, z: p.z + spread.z * (i - 1) * 0.65 }; },
      };
    }
    return {
      center, seat, plate, plateY: 0.69, sit: true, tableLen: tl, rotY, yaw, bannerAt: at(dir, 0.95),
      cart: at(cartDir, tl / 2 + 0.9), cartYaw: seat.yaw + Math.PI / 2,
      glass: at(dir, 1.75), glassYaw: Math.atan2(dir.x, dir.z),
      watch: (i) => { const p = at(dir, 2.3); return { x: p.x + spread.x * (i - 1) * 0.65, z: p.z + spread.z * (i - 1) * 0.65 }; },
    };
  }

  // A slow camera ease toward the party, then back, unless the player is steering the camera.
  const HANDS_OFF_MS = 4000;
  let ease = null;
  function easeIn(v) {
    if (!rig || performance.now() - rig.lastInput < HANDS_OFF_MS) return;
    ease = { goal: rig.goal, zoom: rig.zoomGoal, at: performance.now() };
    rig.focus({ x: v.center.x, y: 0.6, z: v.center.z }, Math.max(rig.zoomGoal, 1.6), 1.6);
  }
  function easeOut() {
    if (!ease) return;
    if (rig.lastInput < ease.at) rig.focus(ease.goal, ease.zoom, 1.6);
    ease = null;
  }

  // Everyone gets into place within a few seconds (weeks are short); far walkers jog.
  function hurry(r, seconds) {
    let len = 0, px = r.pos.x, pz = r.pos.z;
    for (const q of r.path) { len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
    const need = len / seconds;
    if (need > r.speed) { r.speed = need; r.walkAnim = need > 2 ? 'run' : 'walk'; }
  }

  function startParty(r) {
    if (!office.current || party) return;
    const v = venue();
    const props = new THREE.Group();
    parent.add(props);
    const cart = getModel('waffle_station');
    cart.scale.setScalar(1.3);
    const door = office.current.zones.door;
    cart.position.set(door.x, 0, door.z);
    props.add(cart);
    const stack = waffleStack();
    stack.position.set(v.plate.x, v.plateY, v.plate.z);
    stack.scale.setScalar(0.001);
    props.add(stack);
    const banner = bunting('WAFFLE PARTY', Math.max(2.6, v.tableLen + 1.2));
    // The bunting hangs square to the camera between the winner and the glass, so it reads.
    banner.position.set(v.bannerAt.x, 0, v.bannerAt.z);
    banner.rotation.y = v.yaw;
    props.add(banner);
    const glass = partition(2.4);
    glass.position.set(v.glass.x, 0, v.glass.z);
    glass.rotation.y = v.glassYaw;
    props.add(glass);
    const chairBalloons = getModel('balloons');
    const back = { x: v.seat.x - Math.sin(v.seat.yaw) * 0.35, z: v.seat.z - Math.cos(v.seat.yaw) * 0.35 };
    chairBalloons.position.set(back.x + 0.2, 0, back.z);
    props.add(chairBalloons);
    const grow = [[banner, 1], [glass, 1], [chairBalloons, 1.6]];
    for (const [o] of grow) o.scale.setScalar(0.001);
    // The winner walks to the lone seat; three colleagues press up to the glass.
    const seat = { x: v.seat.x, z: v.seat.z, yaw: v.seat.yaw, anim: 'idle' };
    r.temp = { anim: v.sit ? 'sit' : 'sip', t: PARTY_S, goal: seat, back: true, party: true };
    easeIn(v);
    walkTo(r, seat);
    hurry(r, 3);
    const others = [...recs.values()].filter((o) => o !== r && !o.hidden && o.mode === 'placed' && !o.temp)
      .sort(() => Math.random() - 0.5).slice(0, 3);
    const watchers = others.map((o, i) => {
      const spot = v.watch(i);
      spot.yaw = Math.atan2(v.center.x - spot.x, v.center.z - spot.z);
      spot.anim = 'idle';
      o.temp = { anim: 'idle', t: PARTY_S - 1, goal: spot, back: true, party: true };
      walkTo(o, spot);
      hurry(o, 3.5);
      return o;
    });
    party = { r, v, props, cart, stack, grow, watchers, t: 0 };
  }

  function endParty() {
    const p = party;
    party = null;
    setDim(0);
    setAccent(null);
    p.props.removeFromParent();
    easeOut();
    if (recs.has(p.r.id)) hangCaricature(p.r);
  }

  function update(dt) {
    if (!party) return;
    const p = party;
    p.t += dt;
    const k = Math.min(1, p.t / ROLL_S);
    const e = 1 - (1 - k) ** 3;
    const door = office.current.zones.door;
    p.cart.position.set(door.x + (p.v.cart.x - door.x) * e, 0, door.z + (p.v.cart.z - door.z) * e);
    p.cart.rotation.y = p.v.cartYaw;
    // Props pop in once the cart arrives; lights drop to one warm pool, then come back at the end.
    const pop = Math.min(1, Math.max(0, (p.t - ROLL_S * 0.5) / 0.35));
    for (const [o, s] of p.grow) o.scale.setScalar(s * Math.max(0.001, pop));
    const fade = Math.min(1, p.t / 1.5) * Math.min(1, (PARTY_S + 1 - p.t) / 1.5);
    setDim(DIM * fade);
    setAccent({ x: p.v.plate.x, y: 1.8, z: p.v.plate.z }, POOL * fade);
    if (p.t > ROLL_S + 0.8) p.stack.scale.setScalar(Math.min(1, (p.t - ROLL_S - 0.8) / 0.3));
    // Watchers react while they look on, taking turns: a whisper to a neighbour, a point, hands
    // on the glass, a slow shake of the head.
    if (p.t > ROLL_S + 1) {
      const slot = Math.floor((p.t - ROLL_S - 1) / 2.4);
      p.watchers.forEach((w, i) => {
        if (!recs.has(w.id) || w.path.length || !w.temp?.party) return;
        const kind = REACTIONS[(slot + i) % REACTIONS.length];
        w.temp.anim = (slot + i) % 2 ? 'idle' : kind;
        if (w.temp.anim === 'whisper') {
          const n = p.watchers[i + 1] ?? p.watchers[i - 1];
          if (n) w.face = { yaw: Math.atan2(n.pos.x - w.pos.x, n.pos.z - w.pos.z), t: 1.2 };
        }
      });
    }
    if (p.t > ROLL_S + 2 && !p.cheered) {
      p.cheered = true;
      emote(p.r, 'sparkle', 3);
      for (const w of p.watchers) if (recs.has(w.id)) emote(w, Math.random() < 0.5 ? 'sweat' : 'storm', rnd(2.5, 4));
    }
    if (p.t >= PARTY_S + 1) endParty();
  }

  // Minor rewards (finger traps, melon bar, music night): a quick cheer, a sparkle, a puff of confetti.
  const SMALL_REWARDS = new Set(['finger_traps', 'melon_bar', 'music_night']);
  function smallBeat(r) {
    if (!r.temp) r.temp = { anim: 'celebrate', t: 1.4, keepPos: true };
    emote(r, 'sparkle', 1.8);
    fx?.confetti(r.pos.x, 1.2, r.pos.z, { spread: 0.35, power: 0.45 });
  }

  function handle(e) {
    const r = recs.get(e.staffId);
    if (!r || r.hidden) return;
    if (e.reward === 'balloons') putBalloons(r);
    else if (e.reward === 'caricature') hangCaricature(r);
    else if (e.reward === 'waffle_party') { putBalloons(r); startParty(r); }
    else if (SMALL_REWARDS.has(e.reward)) smallBeat(r);
  }

  function reset() {
    balloons = null;
    frame = null;
    setPictureLight(null);
    if (party) { party.props.removeFromParent(); party = null; setDim(0); setAccent(null); ease = null; }
  }

  return { handle, update, reset, get party() { return party ? { t: party.t } : null; }, get frameAt() { return frame?.userData.at ?? null; } };
}
