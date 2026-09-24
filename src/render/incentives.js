import * as THREE from 'three';
import { getModel } from './models.js';
import { mat } from './materials.js';
import { roundedBox, mesh } from './prims.js';
import { PALETTE as P } from './palette.js';
import { wallGap } from './office.js';

// Incentive rewards. { type: 'incentive', staffId, reward } where reward is 'balloons' (on the
// winner's desk until the next award), 'caricature' (a framed big-head portrait on the wall), or
// 'waffle_party' (a staged scene: the station rolls in, the lights go dim and warm, the winner eats
// alone at the table while a few colleagues watch from a distance; a caricature goes up afterwards).

const PARTY_S = 14;
const ROLL_S = 2.2;

function rnd(a, b) { return a + Math.random() * (b - a); }

export function createIncentives({ office, recs, walkTo, emote, parent, caricature, setDim, setAccent }) {
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
    obj.position.set(0.34, 0.62, -0.5);
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
    if (!gap) return;
    const x = Math.min(gap[1] - 0.45, (gap[0] + gap[1]) / 2 + (gap[1] - gap[0] > 2.6 ? 0.9 : 0));
    const zw = -L.D / 2;
    const g = new THREE.Group();
    g.add(mesh(roundedBox(0.7, 0.8, 0.04, 0.012), mat('gold'), x, 1.55, zw + 0.03));
    g.add(mesh(roundedBox(0.6, 0.7, 0.01, 0.004), mat('paper'), x, 1.55, zw + 0.052, { cast: false }));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const pic = new THREE.Mesh(new THREE.PlaneGeometry(0.54, 0.54), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.9 }));
    pic.position.set(x, 1.58, zw + 0.06);
    g.add(pic);
    // A little brass plaque under the picture.
    g.add(mesh(roundedBox(0.26, 0.05, 0.012, 0.004), mat('gold'), x, 1.24, zw + 0.058, { cast: false }));
    cur.root.add(g);
    frame = g;
  }

  // Where the party happens: the meeting table when there is one, else by the coffee corner or
  // on open floor. Returns the table (or spot) centre, a facing, and the winner's seat.
  function venue() {
    const Z = office.current.zones;
    if (Z.meeting) {
      const M = Z.meeting;
      const c = Math.cos(M.rotY), s = Math.sin(M.rotY);
      const w = (lx, lz) => ({ x: M.x + c * lx + s * lz, z: M.z - s * lx + c * lz });
      const seat = w(-M.L / 2 + 0.45, M.D / 2 + 0.33);
      return { center: { x: M.x, z: M.z }, seat: { ...seat, yaw: M.rotY + Math.PI, sit: true }, cart: w(M.L / 2 + 0.75, 0), plate: w(-M.L / 2 + 0.45, M.D / 2 - 0.2), plateY: 0.7 };
    }
    const base = Z.coffee ?? (Z.wander?.[0] ?? Z.door);
    return { center: base, seat: { x: base.x, z: base.z + 0.4, yaw: Math.PI, sit: false }, cart: { x: base.x + 0.9, z: base.z }, plate: null };
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
    const cart = getModel('waffle_station');
    const door = office.current.zones.door;
    cart.position.set(door.x, 0, door.z);
    parent.add(cart);
    let plate = null;
    if (v.plate) {
      plate = new THREE.Group();
      plate.add(mesh(roundedBox(0.2, 0.012, 0.2, 0.006), mat('paper'), 0, 0, 0));
      for (let k = 0; k < 3; k++) plate.add(mesh(roundedBox(0.15, 0.022, 0.15, 0.006), mat('wood_honey'), 0, 0.02 + k * 0.024, 0));
      plate.position.set(v.plate.x, v.plateY, v.plate.z);
      plate.scale.setScalar(0.001);
      parent.add(plate);
    }
    // The winner walks to the lone seat; a few colleagues gather at a distance to watch.
    const seat = { x: v.seat.x, z: v.seat.z, yaw: v.seat.yaw, anim: 'idle' };
    r.temp = { anim: v.seat.sit ? 'sit' : 'sip', t: PARTY_S, goal: seat, back: true, party: true };
    walkTo(r, seat);
    hurry(r, 3);
    const others = [...recs.values()].filter((o) => o !== r && !o.hidden && o.mode === 'placed' && !o.temp)
      .sort(() => Math.random() - 0.5).slice(0, 3);
    const watchers = others.map((o, i) => {
      const ang = Math.PI / 4 + (i - 1) * 0.35;
      const spot = { x: v.center.x + Math.sin(ang) * 4.4, z: v.center.z + Math.cos(ang) * 4.4 };
      spot.yaw = Math.atan2(v.center.x - spot.x, v.center.z - spot.z);
      spot.anim = 'idle';
      o.temp = { anim: 'idle', t: PARTY_S - 1, goal: spot, back: true, party: true };
      walkTo(o, spot);
      hurry(o, 3.5);
      return o;
    });
    party = { r, v, cart, plate, watchers, t: 0 };
  }

  function endParty() {
    const p = party;
    party = null;
    setDim(0);
    p.cart.removeFromParent();
    setAccent(null);
    p.plate?.removeFromParent();
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
    p.cart.rotation.y = Math.atan2(p.v.cart.x - door.x, p.v.cart.z - door.z) * (1 - e) + (p.v.seat.yaw + Math.PI / 2) * e;
    // Lights ease down to a warm, slightly eerie glow, then come back at the end.
    const fade = Math.min(1, p.t / 1.5) * Math.min(1, (PARTY_S + 1 - p.t) / 1.5);
    setDim(1.0 * fade);
    setAccent({ x: p.v.center.x, y: 1.7, z: p.v.center.z }, 3.5 * fade);
    if (p.plate && p.t > ROLL_S + 1) p.plate.scale.setScalar(Math.min(1, (p.t - ROLL_S - 1) / 0.3));
    if (p.t > ROLL_S + 2 && !p.cheered) {
      p.cheered = true;
      emote(p.r, 'sparkle', 2.5);
      for (const w of p.watchers) if (recs.has(w.id)) emote(w, Math.random() < 0.5 ? 'sweat' : 'storm', rnd(2, 3.5));
    }
    if (p.t >= PARTY_S + 1) endParty();
  }

  function handle(e) {
    const r = recs.get(e.staffId);
    if (!r || r.hidden) return;
    if (e.reward === 'balloons') putBalloons(r);
    else if (e.reward === 'caricature') hangCaricature(r);
    else if (e.reward === 'waffle_party') { putBalloons(r); startParty(r); }
  }

  function reset() {
    balloons = null;
    frame = null;
    if (party) { party.cart.removeFromParent(); setAccent(null); party.plate?.removeFromParent(); party = null; setDim(0); }
  }

  return { handle, update, reset, get party() { return party ? { t: party.t } : null; } };
}
