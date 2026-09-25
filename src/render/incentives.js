import * as THREE from 'three';
import { getModel } from './models.js';
import { mat, color } from './materials.js';
import { roundedBox, roundedCylinder, mesh } from './prims.js';
import { PALETTE as P } from './palette.js';
import { wallGap } from './office.js';
import { loadRig } from './rig.js';

// Incentive rewards. { type: 'incentive', staffId, reward } where reward is 'balloons' (on the
// winner's desk until the next award), 'caricature' (a framed big-head portrait on the wall), or
// 'waffle_party' (a staged scene: the cart rolls in, the room goes dark around one warm pool of
// light, the winner eats a towering stack alone under bunting, and colleagues crowd in on the camera
// side to watch; the caricature goes up afterwards).

const PARTY_S = 15;
// Music night: a dance break. The winner fully commits to the genre's dance, the next two bob along,
// the fourth shuffles stiffly (then bob and shuffle alternate); a speaker cart rolls in and the room
// dims under a pool of the genre's colour that pulses on the beat. bar is the seconds per four beats.
const DANCE_S = 15;             // without a track length from audio (hitl:musicTrack)
const GENRES = {
  motivational_polka: { lead: 'dance_polka', bar: 1.6, light: P.gold },
  corporate_synthwave: { lead: 'dance_robot', bar: 2.0, light: P.role_designer },
  aggressive_bossa_nova: { lead: 'dance_bossa', bar: 2.4, light: P.marker_orange },
  sad_lofi: { lead: 'dance_lofi', bar: 2.8, light: P.marker_blue },
};
const BOB_BAR = 2.0;            // dance_bob's authored bar (chibi_rig.py)
const STIFF_BAR = 4.0;          // dance_stiff covers two bars
const DANCE_POOL = 7;
const CROWD_REACTIONS = ['point', 'whisper', 'wave', 'shake'];
const REACTIONS = ['whisper', 'point', 'wave', 'shake'];
const ROLL_S = 2.2;
const DIM = 1.9;            // how far the room lights drop (see lighting.setSkeleton)
const POOL = 5.5;             // warm light over the table

function rnd(a, b) { return a + Math.random() * (b - a); }
const TAU = Math.PI * 2;

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

export function createIncentives({ office, recs, walkTo, emote, parent, caricature, setDim, setAccent, setPictureLight, getYaw, rig = null, fx = null, momentCam = null, spotlights = null }) {
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

  // Party layout around the meeting table (or an open spot): the winner sits on the far side of the
  // table facing the camera, the cart is at one end, the bunting hangs behind the winner, and the
  // watchers crowd in on the camera side, clear of the camera's line to the winner.
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
    // The bunting and cart use the far side of the table (away from the camera), or a screen side
    // when the far side has no room.
    const inside = (p) => Math.abs(p.x) < L.W / 2 - 0.5 && Math.abs(p.z) < L.D / 2 - 0.5;
    const at = (dir, d) => ({ x: center.x + dir.x * d, z: center.z + dir.z * d });
    const back = { x: -cam.x, z: -cam.z };
    let dir = back;
    if (!inside(at(back, 2.5))) dir = inside(at(right, 3)) ? right : { x: -right.x, z: -right.z };
    const cartDir = dir === back ? right : { x: -dir.x, z: -dir.z };
    // Watchers crowd in on the camera side, in an arc that leaves the camera's line to the winner
    // open: two to the left, one to the right, a step closer to the camera than the table.
    const ARC = [[-1.9, 1.1], [-1.25, 1.75], [1.8, 1.25]];
    const frontArc = (i) => {
      const [u, v] = ARC[i % ARC.length];
      const p = { x: center.x + right.x * u + cam.x * v, z: center.z + right.z * u + cam.z * v };
      return inside(p) ? p : { x: center.x + right.x * u * 0.7 + cam.x * v * 0.7, z: center.z + right.z * u * 0.7 + cam.z * v * 0.7 };
    };
    if (!Z.meeting) {
      // The winner stands beside the cart (screen right), turned a little toward it, facing us.
      const stand = { x: center.x + right.x * 0.8 - cam.x * 0.1, z: center.z + right.z * 0.8 - cam.z * 0.1 };
      return {
        center, seat: { ...stand, yaw: Math.atan2(cam.x, cam.z) - 0.5 }, plate: { x: center.x - cam.x * 0.08, z: center.z - cam.z * 0.08 }, plateY: 0.82 * 1.3 + 0.02,
        sit: false, tableLen: 1.4, rotY, yaw, bannerAt: at(dir, 1.05),
        cart: center, cartYaw: yaw,
        watch: frontArc,
      };
    }
    return {
      center, seat, plate, plateY: 0.69, sit: true, tableLen: tl, rotY, yaw, bannerAt: at(dir, 0.95),
      cart: at(cartDir, tl / 2 + 0.9), cartYaw: seat.yaw + Math.PI / 2,
      watch: frontArc,
    };
  }

  // The camera eases toward the party and back (momentcam.js: not while the player steers it, and
  // not with the moment camera setting off).
  function easeIn(v) { momentCam?.hold('party', { x: v.center.x, z: v.center.z }, { zoom: 1.6 }); }
  function easeOut() { momentCam?.release('party'); }

  // Everyone gets into place within a few seconds (weeks are short); far walkers jog.
  function hurry(r, seconds) {
    let len = 0, px = r.pos.x, pz = r.pos.z;
    for (const q of r.path) { len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
    const need = len / seconds;
    if (need > r.speed) { r.speed = need; r.walkAnim = need > 2 ? 'run' : 'walk'; }
  }

  function startParty(r) {
    if (!office.current || party || dance) return;
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
    // The bunting hangs square to the camera behind the winner, so it reads.
    banner.position.set(v.bannerAt.x, 0, v.bannerAt.z);
    banner.rotation.y = v.yaw;
    props.add(banner);
    const chairBalloons = getModel('balloons');
    const back = { x: v.seat.x - Math.sin(v.seat.yaw) * 0.35, z: v.seat.z - Math.cos(v.seat.yaw) * 0.35 };
    chairBalloons.position.set(back.x + 0.2, 0, back.z);
    props.add(chairBalloons);
    const grow = [[banner, 1], [chairBalloons, 1.6]];
    for (const [o] of grow) o.scale.setScalar(0.001);
    // The winner walks to the lone seat; three colleagues gather to watch.
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
    party.spot = spotlights?.begin('waffle_party', () => { endParty(); sendBack(); });
  }

  function endParty() {
    const p = party;
    party = null;
    setDim(0);
    setAccent(null);
    p.props.removeFromParent();
    easeOut();
    spotlights?.end(p.spot);
    if (recs.has(p.r.id)) hangCaricature(p.r);
  }
  // A party or dance cut short (the Skip control): everyone in it heads back now.
  function sendBack() { for (const r of recs.values()) if (r.temp?.party) r.temp.t = 0.01; }

  function update(dt) {
    if (track) track.age += dt;
    if (dance) updateDance(dt);
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
    // Watchers react while they look on, taking turns: a whisper to a neighbour, a point, a wave,
    // a slow shake of the head.
    if (p.t > ROLL_S + 1) {
      const slot = Math.floor((p.t - ROLL_S - 1) / 2.4);
      p.watchers.forEach((w, i) => {
        if (!recs.has(w.id) || w.path.length || !w.temp?.party) return;
        // Every other beat is idle; the reaction beats cycle through the whole list.
        const kind = REACTIONS[Math.floor((slot + i) / 2) % REACTIONS.length];
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

  // A trolley with two speakers and a little lamp on top; the lamp glows in the genre's colour.
  function speakerCart(hex) {
    const g = new THREE.Group();
    g.add(mesh(roundedBox(0.72, 0.06, 0.46, 0.02), mat('metal_dark'), 0, 0.2, 0));
    g.add(mesh(roundedBox(0.72, 0.04, 0.46, 0.015), mat('metal_dark'), 0, 0.05, 0));
    for (const [x, z] of [[-0.3, -0.18], [0.3, -0.18], [-0.3, 0.18], [0.3, 0.18]]) {
      g.add(mesh(roundedBox(0.03, 0.2, 0.03, 0.01), mat('metal_soft'), x, 0.12, z));
      g.add(mesh(roundedCylinder(0.035, 0.035, 0.03, 0.01, 10), mat('plastic_charcoal'), x, 0.0, z).rotateZ(Math.PI / 2));
    }
    for (const x of [-0.19, 0.19]) {
      g.add(mesh(roundedBox(0.28, 0.44, 0.26, 0.03), mat('wood_dark'), x, 0.45, 0));
      for (const [y, r] of [[0.53, 0.08], [0.34, 0.05]]) {
        const cone = mesh(roundedCylinder(r, r * 0.8, 0.03, 0.01, 16), mat('plastic_charcoal'), x, y, 0.13);
        cone.rotation.x = Math.PI / 2;
        g.add(cone);
      }
    }
    const lampMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), emissive: new THREE.Color(hex), emissiveIntensity: 1.2, roughness: 0.4 });
    const lamp = mesh(new THREE.SphereGeometry(0.07, 16, 12), lampMat, 0, 0.74, 0);
    g.add(mesh(roundedCylinder(0.05, 0.06, 0.04, 0.01, 12), mat('metal_dark'), 0, 0.69, 0));
    g.add(lamp);
    return { group: g, lampMat };
  }

  // Audio announces the track it plays for a music night: { genre, seconds, startsIn }. The dance
  // then lasts until the track ends (startsIn + seconds from the announcement). The announcement
  // may come just before or after the dance starts, so it is kept for a moment when early.
  let track = null;
  if (typeof addEventListener === 'function') {
    addEventListener('hitl:musicTrack', (ev) => {
      const t = ev.detail ?? {};
      if (!(t.seconds > 0)) return;
      track = { seconds: t.seconds, startsIn: Math.max(0, t.startsIn ?? 0), genre: t.genre, age: 0 };
      if (dance) fitToTrack(dance);
    });
  }
  // A dance with a track ends when the music does: its length is the time already danced plus
  // what is left of the track.
  function fitToTrack(d) {
    if (!track || d.fitted || (track.genre && d.genreId && track.genre !== d.genreId)) return;
    d.fitted = true;
    d.dur = d.t + track.startsIn + track.seconds - track.age;
    track = null;
    const left = d.dur - d.t;
    for (const r of d.dancers) if (r.temp?.party) r.temp.t = left;
    for (const r of d.crowd) if (r.temp?.party) r.temp.t = Math.max(0.5, left - 1);
  }

  let dance = null;
  function startDance(winner, ev) {
    if (!office.current || party || dance) return;
    const genre = GENRES[ev.genre] ?? GENRES.corporate_synthwave;
    loadRig();
    const L = office.current.L;
    const center = openSpot(L);
    const yaw = getYaw();
    const cam = { x: Math.sin(yaw), z: Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    const at = (u, v) => ({ x: center.x + right.x * u + cam.x * v, z: center.z + right.z * u + cam.z * v });
    const faceCam = Math.atan2(cam.x, cam.z);
    const SPOTS = [[0, 0.35], [-0.85, 0], [0.85, 0], [-0.45, -0.75], [0.45, -0.75], [0, -0.95], [-1.3, -0.5], [1.3, -0.5]];
    const others = (ev.dancers ?? []).map((id) => recs.get(id))
      .filter((o) => o && o !== winner && !o.hidden && o.mode === 'placed' && !o.temp?.moment);
    const dancers = [winner, ...others].slice(0, SPOTS.length);
    const moves = dancers.map((r, i) => {
      if (i === 0) return { anim: genre.lead, rate: 1 };
      return (i % 3 === 0) ? { anim: 'dance_stiff', rate: STIFF_BAR / (2 * genre.bar) } : { anim: 'dance_bob', rate: BOB_BAR / genre.bar };
    });
    dancers.forEach((r, i) => {
      const p = at(...SPOTS[i]);
      const spot = { x: p.x, z: p.z, yaw: faceCam, anim: 'idle' };
      r.temp = { anim: moves[i].anim, t: DANCE_S, goal: spot, back: true, party: true };
      r.char.setAnimRate(moves[i].rate);
      walkTo(r, spot);
      hurry(r, 3);
    });
    const taken = new Set(dancers);
    const crowd = [...recs.values()].filter((o) => !taken.has(o) && !o.hidden && o.mode === 'placed' && !o.temp)
      .sort(() => Math.random() - 0.5).slice(0, 3).map((o, i) => {
        // Onlookers stand to the sides and back, never between the camera and the dancers.
        const p = at(...[[-2.2, 0.2], [2.2, 0.2], [1.8, -1.5]][i]);
        const spot = { x: p.x, z: p.z, yaw: Math.atan2(center.x - p.x, center.z - p.z), anim: 'idle' };
        o.temp = { anim: 'idle', t: DANCE_S - 1, goal: spot, back: true, party: true };
        walkTo(o, spot);
        hurry(o, 3.5);
        return o;
      });
    const props = new THREE.Group();
    parent.add(props);
    const cart = speakerCart(genre.light);
    const door = office.current.zones.door;
    cart.group.position.set(door.x, 0, door.z);
    props.add(cart.group);
    const cartAt = at(0, -1.7);
    easeIn({ center });
    dance = { genre, genreId: ev.genre, dancers, crowd, props, cart, cartAt, center, yaw: faceCam, t: 0, dur: DANCE_S };
    dance.spot = spotlights?.begin('music_night', () => { endDance(); sendBack(); });
    if (track && track.age < 5) fitToTrack(dance);
  }

  function endDance() {
    const d = dance;
    dance = null;
    setDim(0);
    setAccent(null);
    d.props.removeFromParent();
    for (const r of d.dancers) r.char.setAnimRate(1);
    easeOut();
    spotlights?.end(d.spot);
  }

  function updateDance(dt) {
    const d = dance;
    d.t += dt;
    const k = Math.min(1, d.t / ROLL_S);
    const e = 1 - (1 - k) ** 3;
    const door = office.current.zones.door;
    d.cart.group.position.set(door.x + (d.cartAt.x - door.x) * e, 0, door.z + (d.cartAt.z - door.z) * e);
    d.cart.group.rotation.y = d.yaw;
    const beat = d.genre.bar / 4;
    const pulse = Math.max(0, Math.cos((TAU * d.t) / beat)) ** 4;
    const fade = Math.min(1, d.t / 1.5) * Math.min(1, (d.dur + 1 - d.t) / 1.5);
    setDim(DIM * fade);
    setAccent({ x: d.center.x, y: 2.1, z: d.center.z }, DANCE_POOL * fade * (0.75 + 0.25 * pulse), d.genre.light);
    d.cart.lampMat.emissiveIntensity = 0.8 + 1.4 * pulse;
    // Onlookers take turns reacting, as at the waffle party.
    if (d.t > ROLL_S + 1) {
      const slot = Math.floor((d.t - ROLL_S - 1) / 2.4);
      d.crowd.forEach((w, i) => {
        if (!recs.has(w.id) || w.path.length || !w.temp?.party) return;
        w.temp.anim = (slot + i) % 2 ? 'idle' : CROWD_REACTIONS[Math.floor((slot + i) / 2) % CROWD_REACTIONS.length];
      });
    }
    if (d.t > ROLL_S + 1.5 && !d.cheered) {
      d.cheered = true;
      emote(d.dancers[0], 'music', 3);
      for (const w of d.crowd) if (recs.has(w.id)) emote(w, Math.random() < 0.5 ? 'sparkle' : 'heart', rnd(2, 3.5));
    }
    if (d.t >= d.dur + 1) endDance();
  }

  // Minor rewards (finger traps, melon bar): a quick cheer, a sparkle, a puff of confetti.
  const SMALL_REWARDS = new Set(['finger_traps', 'melon_bar']);
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
    else if (e.reward === 'music_night') startDance(r, e);
    else if (SMALL_REWARDS.has(e.reward)) smallBeat(r);
  }

  function reset() {
    balloons = null;
    frame = null;
    setPictureLight(null);
    if (party) { party.props.removeFromParent(); party = null; setDim(0); setAccent(null); ease = null; }
    if (dance) { dance.props.removeFromParent(); for (const r of dance.dancers) r.char.setAnimRate(1); dance = null; setDim(0); setAccent(null); ease = null; }
  }

  return { handle, update, reset, get party() { return party ? { t: party.t, center: party.v.center, yaw: party.v.yaw, watchers: party.watchers.map((w) => w.id), winner: party.r.id } : null; }, get dance() { return dance ? { t: dance.t, dur: dance.dur, dancers: dance.dancers.map((r) => r.id), crowd: dance.crowd.map((r) => r.id) } : null; }, get frameAt() { return frame?.userData.at ?? null; } };
}
