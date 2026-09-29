import * as THREE from 'three';
import { getTemplate } from './models.js';
import { emoteMaterial } from './emotes.js';
import { pickSpot, spotDebug } from './spots.js';
import { robotResentment } from '../sim/robot.js';
import { SLAP_AT } from './character.js';
import { between, draw, shuffled } from './rand.js';

// The office robot (shop item office_robot). The placed item is its charging dock; the robot itself
// is built here from robot.glb's parts and roams: coffee rounds to people at their desks, plant
// watering from level 2, back to the dock to charge. state.robot drives how it looks: a breakdown
// shows its cause (spinning, stuck on a chair, waiting at an empty desk, a traffic cone, serving
// decaf, unplugged), a sticky note while people grumble about it, googly eyes once chosen.

const SPEED = 0.85;
export const NECK_Y = 0.5;
const EMOTE_SIZE = 0.42;
// Metres out from the dock's front edge where the robot turns in to park.
const DOCK_OUT = 0.45;
// How far from a desk's seat the robot may stop to serve (nearest first), and the clearance it
// needs there: the tray may reach over a desk's edge, so the body alone needs clearing.
const SERVE_RADII = [0.6, 0.75, 0.9, 1.05];
const SERVE_R = 0.22;
// Farther rings for when nothing near a seat is clear on the chair's side.
const SERVE_FAR = [1.2, 1.4, 1.6];
// Floor clearance of the robot's body and head from any furniture mesh taller than a floor plate:
// the walk grid is coarser than a desk's edge, and a stop it allows can put the head in a desktop.
const BODY_R = 0.24;
const PLATE_H = 0.15;
const PATH_CLEAR = 0.2;
// Stuck on a chair: its nose right up to the chair's back.
const STUCK_R = 0.2;
// How near a walker's centre may come to the robot's.
const KEEP_OFF_R = 0.42;
// Longest it waits for someone in its way before going on.
const YIELD_S = 3;
// Furthest it turns from the camera at a party post (radians), so its face still shows, and how
// long it waits after a party before heading home, while the others start back.
const PARTY_TURN = 1.75;
const LEAVE_HOLD_S = 1.5;
// Floor clearance round the robot, tray included, and the height and radius of its dock's pad.
const ROBOT_R = 0.3;
const PAD_Y = 0.03;
const PAD_R = 0.3;
const EYE = { ok: '#5fe0d0', broken: '#ffb238', off: '#1e2333' };
// The fix: how far from the robot the fixer stands to slap it (a chibi arm reaches about 0.2 m past
// the body), how far they turn so its head sits a little to their right where the hand sweeps, how
// long the robot waits for them before it recovers on its own, how long it shakes after the slap
// before heading home, from how far away the fixer jogs over, and how long they square up first.
export const SLAP = { radii: [0.47, 0.51, 0.55], waitS: 20, afterS: 1.4, runFromM: 5, aside: 0.12, turnS: 0.4, clearM: 0.9, holdS: 6, cringe: 0.22 };

const rnd = (a, b) => between(a, b, 'robot');
function angleLerp(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// The slap's part of the robot's pose at clock t (seconds), added to the head's side tilt and the
// torso's lean. Waiting for the slap, it cringes: head tipped away from the fixer (cringeSide 1 or
// -1, 0 when nobody is coming), so a big head of hair squaring up beside it doesn't meet its head.
// jolt (1 at the slap, easing to 0 at JOLT_DECAY per second) is a sharp tilt and shake that dies away.
export const JOLT_DECAY = 1.4;
export function slapPose(t, { cringeSide = 0, jolt = 0 } = {}) {
  const j = jolt * jolt;
  return { headZ: SLAP.cringe * cringeSide + Math.sin(t * 38) * 0.35 * j + 0.3 * j, lean: -0.12 * j };
}

export function buildRig() {
  const tpl = getTemplate('robot');
  const part = (name) => {
    const src = tpl?.getObjectByName(name);
    const o = src ? src.clone(true) : new THREE.Group();
    o.position.set(0, 0, 0);
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    return o;
  };
  const root = new THREE.Group();
  root.name = 'robot';
  const body = new THREE.Group();
  root.add(body);
  body.add(part('robot_base'));
  const torso = new THREE.Group();
  body.add(torso);
  torso.add(part('robot_body'));
  const tray = part('robot_tray'), cup = part('robot_cup'), can = part('robot_can'), note = part('robot_note');
  torso.add(tray, cup, can, note);
  const head = new THREE.Group();
  head.position.y = NECK_Y;
  torso.add(head);
  const eyes = part('robot_eyes'), led = part('robot_led'), googly = part('robot_googly');
  head.add(part('robot_head'), eyes, led, googly);
  // Eyes and antenna light get materials of their own, so recolouring them touches nothing else.
  const own = (o) => { let m = null; o.traverse((x) => { if (x.isMesh) { x.material = x.material.clone(); m = x.material; } }); return m; };
  const eyeMat = own(eyes), ledMat = own(led);
  const cable = part('robot_cable');
  body.add(cable);
  const emote = new THREE.Sprite(emoteMaterial('heart'));
  emote.position.y = 0.95;
  emote.center.set(0.5, 0.1);
  emote.scale.setScalar(EMOTE_SIZE);
  emote.visible = false;
  emote.renderOrder = 10;
  root.add(emote);
  const cone = part('traffic_cone');
  return { root, body, torso, head, eyes, led, eyeMat, ledMat, tray, cup, can, note, googly, cable, emote, cone };
}

export function createRobot({ office, recs, emote: staffEmote, parent, walkTo: walkStaff, inView = () => true, camYaw = () => Math.PI / 4 }) {
  let rec = null;          // the robot, while a dock stands
  let lastState = null;
  let breakdown = null;    // the latest robot/breakdown event: { cause, deskStaffId }
  let clock = 0;

  function dockEntry() {
    for (const e of office.placed.values()) if (e.itemId === 'office_robot') return e;
    return null;
  }

  // The pad the robot parks on, in world space.
  function padOf(e) {
    const t = e.target, c = Math.cos(t.rotY), s = Math.sin(t.rotY);
    const p = e.obj.userData.dock ?? { x: 0, z: 0 };
    return { x: t.x + c * p.x + s * p.z, z: t.z - s * p.x + c * p.z, yaw: t.rotY };
  }

  // The floor point it drives out to from the pad and turns in from: straight out from the dock, or
  // the open floor nearest that round the pad. The point and the straight drive to it both clear
  // every piece of furniture; with no such point (a dock boxed in by furniture) it is null and the
  // robot stays on its pad. Found once per walk grid.
  const frontMemo = { nav: null, id: null, front: null };
  function frontOf(e) {
    const nav = office.nav();
    if (frontMemo.nav === nav && frontMemo.id === e.id) return frontMemo.front;
    const t = e.target, pad = padOf(e), out = 0.5 + DOCK_OUT;
    const want = { x: t.x + Math.sin(t.rotY) * out, z: t.z + Math.cos(t.rotY) * out };
    const boxes = furnitureBoxes();
    const leg = (q) => {
      const n = Math.ceil(Math.hypot(q.x - pad.x, q.z - pad.z) / 0.1);
      for (let i = 1; i <= n; i++) if (!clearOf({ x: pad.x + ((q.x - pad.x) * i) / n, z: pad.z + ((q.z - pad.z) * i) / n }, boxes)) return false;
      return true;
    };
    const ok = (q) => !nav.isBlocked(q.x, q.z, SERVE_R) && leg(q) && reached(q);
    const front = ok(want) ? want : pickSpot(pad, {
      ring: { radii: [0.8, 1.0, 1.25, 1.5, 2.0], count: 16 },
      needs: ['clear'],
      checks: { clear: (q) => ok(q) || 'furniture' },
      score: (q) => Math.hypot(q.x - want.x, q.z - want.z),
      debug: spotDebug(office), moment: 'robot', search: 'front',
    });
    Object.assign(frontMemo, { nav, id: e.id, front: front && { x: front.x, z: front.z } });
    return frontMemo.front;
  }

  // Where a robot already off its pad heads to get back on: the front, or the open floor nearest the
  // pad when there is none (the furniture moved round it meanwhile).
  function wayHome(e) {
    const pad = padOf(e);
    return frontOf(e) ?? office.nav().freePoint(pad.x, pad.z);
  }

  // Whether the robot's ways reach a point: from a pocket (by a wall, between furniture) no way out
  // keeps PATH_CLEAR. Measured as a way to the office door.
  function reached(q) {
    const door = office.current?.zones?.door;
    return !door || !!office.nav().path(q, door, PATH_CLEAR);
  }

  // The robot is wider than a walker's corner-cutting allows: a way that keeps PATH_CLEAR from
  // anything blocked, or null when there is none (a gap narrower than the robot). Only the way home
  // falls back to the way that keeps as far off as it can.
  function route(a, b, { home = false } = {}) {
    const nav = office.nav();
    return nav.path(a, b, PATH_CLEAR) ?? (home ? nav.path(a, b, PATH_CLEAR, { soft: true }) : null);
  }

  // A person standing or walking within KEEP_OFF_R of the robot, ahead of it on its way.
  function blockedBy(r) {
    const tgt = r.path[0];
    const hx = tgt.x - r.pos.x, hz = tgt.z - r.pos.z, hl = Math.hypot(hx, hz) || 1;
    for (const w of recs.values()) {
      if (w.hidden || w.mode === 'hidden' || tgt.around === w) continue;
      const dx = w.pos.x - r.pos.x, dz = w.pos.z - r.pos.z, d = Math.hypot(dx, dz);
      if (d < KEEP_OFF_R + 0.08 && (dx * hx + dz * hz) / hl > 0.05) return w;
    }
    return null;
  }

  // Whether the straight line from a to b keeps PATH_CLEAR from anything blocked.
  function navLeg(a, b) {
    const nav = office.nav();
    const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
    for (let k = 1; k <= n; k++) if (nav.isBlocked(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n, PATH_CLEAR)) return false;
    return true;
  }

  // Someone standing still in its way (at a party, chatting): a point beside them it can go by,
  // on the side where the way there and on is clear of furniture and of everyone else, or null.
  const SIDESTEP_M = [0.65, 0.85];
  function sidestep(r, w) {
    const nav = office.nav(), tgt = r.path[0];
    const hx = tgt.x - r.pos.x, hz = tgt.z - r.pos.z, hl = Math.hypot(hx, hz) || 1;
    const px = -hz / hl, pz = hx / hl;
    // It may not come nearer the one it goes round than it is now.
    const room = Math.min(SIDESTEP_M[0] - 0.05, Math.hypot(w.pos.x - r.pos.x, w.pos.z - r.pos.z) - 0.02);
    const clear = (x, z) => !nav.isBlocked(x, z, PATH_CLEAR) && [...recs.values()].every((o) => o.hidden || Math.hypot(o.pos.x - x, o.pos.z - z) >= (o === w ? room : KEEP_OFF_R));
    const leg = (a, b) => {
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.1));
      for (let k = 1; k <= n; k++) if (!clear(a.x + (b.x - a.x) * k / n, a.z + (b.z - a.z) * k / n)) return false;
      return true;
    };
    // Beside them, or when the way on from there still passes too near, beside them and then past.
    for (const d of SIDESTEP_M) for (const s of [1, -1]) {
      const q = { x: w.pos.x + px * s * d, z: w.pos.z + pz * s * d, around: w };
      if (!clear(q.x, q.z) || !leg(r.pos, q)) continue;
      if (leg(q, tgt)) return [q];
      const q2 = { x: q.x + (hx / hl) * d, z: q.z + (hz / hl) * d, around: w };
      if (clear(q2.x, q2.z) && leg(q, q2) && leg(q2, tgt)) return [q, q2];
    }
    return null;
  }

  // Whether it waits: someone is in its way, and when they stand still it goes round them if it can.
  function waits(r) {
    const w = blockedBy(r);
    if (!w) return false;
    if (w.path.length || r.path[0].around) return true;
    // A turn of its way that falls where they stand is dropped: it goes round them to the next one.
    // Only when the straight way to the turn after it keeps clear of furniture.
    const near = (p) => Math.hypot(p.x - w.pos.x, p.z - w.pos.z) < KEEP_OFF_R + 0.08;
    const skip = r.path.length > 1 && near(r.path[0]) && navLeg(r.pos, r.path[1]) ? r.path.shift() : null;
    if (skip && blockedBy(r) !== w) return !!blockedBy(r);
    const q = sidestep(r, w);
    if (!q) { if (skip) r.path.unshift(skip); return true; }
    r.path.unshift(...q);
    return !!blockedBy(r);
  }

  function walkTo(r, x, z) {
    r.path = route({ x: r.pos.x, z: r.pos.z }, { x, z }, { home: true });
    r.path.shift();
    if (!r.path.length && Math.hypot(x - r.pos.x, z - r.pos.z) > 0.05) r.path = [{ x, z }];
  }

  function sayEmote(kind, s = 2) {
    const g = rec.rig;
    g.emote.material = emoteMaterial(kind);
    g.emote.visible = true;
    rec.emoteT = s;
    rec.emoteAge = 0;
  }

  function spawn(e) {
    const rig = buildRig();
    parent.add(rig.root);
    const pad = padOf(e);
    rec = { rig, dockId: e.id, pos: new THREE.Vector3(pad.x, 0, pad.z), yaw: pad.yaw, path: [], plan: 'dock', t: rnd(3, 6), stops: [], emoteT: 0, docked: true, level: e.level ?? 1 };
  }

  function despawn() {
    if (!rec) return;
    rec.rig.root.removeFromParent();
    rec.rig.cone.removeFromParent();
    rec = null;
  }

  function sync(state) {
    lastState = state;
    const e = office.current ? dockEntry() : null;
    if (!e) { despawn(); return; }
    if (rec && rec.dockId !== e.id) despawn();
    if (!rec) spawn(e);
    rec.level = e.level ?? 1;
    const r = state.robot;
    const cause = r?.status === 'broken' ? r.cause : null;
    if (cause !== rec.cause && !rec.fix) {
      rec.cause = cause;
      startPlan(cause ? `broken:${cause}` : 'home');
    }
    const g = rec.rig;
    g.googly.visible = !!r?.googly;
    g.note.visible = robotResentment(state) !== 'fond';
  }

  // Seated people at their desks, nearest the robot first, a few at a time.
  function deskStops(n) {
    const out = [];
    for (const who of recs.values()) {
      if (who.hidden || who.mode !== 'placed' || who.seat == null || who.path.length || who.temp) continue;
      const d = office.deskById(who.seat);
      if (!d) continue;
      out.push({ who, desk: d });
    }
    return shuffled(out, 'robot').slice(0, n);
  }

  // Open floor as near a desk's seat as the robot fits, in view, facing the sitter. The chair's side
  // of the seat comes first: on the desk's side the robot's head sits level with the desktop and
  // reads as poking through it.
  // Nothing beside it on the chair's side: farther out, still on that side, or no stop at all.
  function besideSeat(desk) {
    const c = desk.seat, fx = Math.sin(c.rotY ?? 0), fz = Math.cos(c.rotY ?? 0);
    const score = (p) => Math.hypot(p.x - c.x, p.z - c.z);
    const boxes = furnitureBoxes();
    const side = (p) => ((p.x - c.x) * fx + (p.z - c.z) * fz > 0.05 ? 'desk side' : clearOf(p, boxes) || 'furniture');
    const q = openSpot(c, 'serve', { radii: SERVE_RADII, clearR: SERVE_R, score, side })
      ?? openSpot(c, 'serveFar', { radii: SERVE_FAR, clearR: SERVE_R, score, side });
    return q ? { x: q.x, z: q.z, face: { x: c.x, z: c.z } } : null;
  }

  // World boxes of every furniture mesh standing above a floor plate, the robot's own dock aside.
  function furnitureBoxes() {
    const out = [];
    for (const e of office.placed.values()) {
      if (e.itemId === 'office_robot' || !e.obj.parent) continue;
      e.obj.updateMatrixWorld(true);
      e.obj.traverse((m) => {
        if (!m.isMesh || m.isSprite || !m.geometry?.attributes?.position) return;
        if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
        const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
        if (b.max.y > PLATE_H) out.push(b);
      });
    }
    return out;
  }
  function clearOf(p, boxes, r = BODY_R) {
    return boxes.every((b) => p.x < b.min.x - r || p.x > b.max.x + r || p.z < b.min.z - r || p.z > b.max.z + r);
  }

  // Open floor near a point, clear for the robot (and a second point along with it, when given),
  // and in view: the first ring candidate that passes, else null.
  // A robot stop also clears every piece of furniture by BODY_R (robot: false for a person's spot).
  // `avoid`: more boxes to keep ROBOT_R clear of (a party's cart, where people will stand).
  // `way`: a check on the candidate that runs last (the route there).
  function openSpot(center, search, { radii = [0.4, 0.7, 1.0, 1.4, 1.8, 2.4], partner = null, clearR = 0.28, score = null, side = null, robot = true, avoid = [], centerFirst = false, way = null } = {}) {
    const nav = office.nav(), boxes = robot ? furnitureBoxes() : [];
    const clear = (x, z) => !nav.isBlocked(x, z, clearR) && clearOf({ x, z }, boxes) && clearOf({ x, z }, avoid, ROBOT_R) && (!robot || reached({ x, z }));
    return pickSpot(center, {
      ring: { radii, count: 12, centerFirst },
      needs: [...(side ? ['side'] : []), 'clear', 'inView', ...(way ? ['way'] : [])],
      checks: {
        side,
        clear: (q) => (clear(q.x, q.z) && (!partner || (q.partner = partner(q)) && clear(q.partner.x, q.partner.z))) || 'blocked',
        inView: (q) => inView(q) || 'out of view',
        way,
      },
      score, debug: spotDebug(office), moment: 'robot', search,
    });
  }

  function plantStop() {
    const plants = [...office.placed.values()].filter((e) => e.itemId === 'plant_wall' || e.obj.userData.kind === 'plant');
    if (!plants.length) return null;
    const e = plants[Math.floor(draw('robot') * plants.length)];
    const t = e.target, out = 0.5 + 0.45;
    const p = openSpot({ x: t.x + Math.sin(t.rotY) * out, z: t.z + Math.cos(t.rotY) * out }, 'plant', { radii: [0.2, 0.4, 0.6, 0.9], clearR: SERVE_R });
    return p ? { x: p.x, z: p.z, face: { x: t.x, z: t.z }, water: true } : null;
  }

  // The away person's desk from the breakdown event; else anyone away's, else any desk nobody sits at.
  function emptyDeskStop() {
    const s = lastState;
    const id = breakdown?.deskStaffId ?? s?.staff?.find((p) => p.mood === 'away' && p.deskId)?.id;
    const p = s?.staff?.find((x) => x.id === id);
    let d = p?.deskId != null ? office.deskById(p.deskId) : null;
    if (!d) {
      const taken = new Set([...recs.values()].map((w) => w.seat).filter((x) => x != null));
      d = (office.current?.desks ?? []).find((x) => !taken.has(x.id)) ?? null;
    }
    return d ? besideSeat(d) : null;
  }

  // An empty desk's chair to get stuck on: the robot noses up to its back from the aisle.
  function chairStop() {
    const taken = new Set([...recs.values()].map((w) => w.seat).filter((x) => x != null));
    // Only a chair nobody sits in: a sitter stands up backwards, straight into whatever is behind it.
    const desks = (office.current?.desks ?? []).filter((d) => !taken.has(d.id));
    const nav = office.nav(), boxes = furnitureBoxes();
    for (const d of desks) {
      const f = d.seat.rotY;
      for (const back of [0.55, 0.65, 0.75, 0.85]) {
        const x = d.seat.x - Math.sin(f) * back, z = d.seat.z - Math.cos(f) * back;
        // Up against the chair back, never into it.
        if (!nav.isBlocked(x, z, 0.18) && clearOf({ x, z }, boxes, STUCK_R) && inView({ x, z }) && reached({ x, z })) return { x, z, face: { x: d.seat.x, z: d.seat.z }, desk: d.id };
      }
    }
    return null;
  }

  function spinStop(front) {
    const z = office.current.zones.coffee ?? front;
    const p = openSpot(z, 'spin', { clearR: ROBOT_R + 0.05 });
    return p ? { x: p.x, z: p.z } : null;
  }

  // The cone in open floor near the dock, the robot a step before it, facing it.
  function coneStop(front) {
    const q = openSpot(front, 'cone', { radii: [0.9, 1.3, 1.8, 2.4, 3], clearR: ROBOT_R,
      partner: (c) => { const d = Math.hypot(c.x - front.x, c.z - front.z) || 1; return { x: c.x - (c.x - front.x) / d * 0.45, z: c.z - (c.z - front.z) / d * 0.45 }; } });
    return q ? { cone: { x: q.x, z: q.z }, x: q.partner.x, z: q.partner.z, face: { x: q.x, z: q.z } } : null;
  }

  function startPlan(plan) {
    const r = rec;
    const e = dockEntry();
    if (!e) return;
    const pad = padOf(e);
    // Boxed in on its pad: rounds become a rest, and a breakdown plays out where it stands.
    const boxed = r.docked && !frontOf(e);
    const front = boxed ? pad : wayHome(e);
    if (boxed && (plan === 'rounds' || plan === 'broken:decaf')) {
      r.plan = plan === 'rounds' ? 'dock' : plan; r.t = rnd(6, 12); r.path = []; r.stop = null;
      if (plan === 'broken:decaf') r.decafRest = true;
      return;
    }
    r.plan = plan; r.stop = null; r.arrived = false; r.spin = false; r.bump = false;
    if (!plan.startsWith('party:')) { r.party = null; r.speedK = 1; }
    r.holdT = 0;
    const g = r.rig;
    if (g.ledMat) {
      r.led0 ??= { color: g.ledMat.color.clone(), emissive: g.ledMat.emissive?.clone() };
      g.ledMat.color.copy(r.led0.color);
      if (r.led0.emissive) g.ledMat.emissive.copy(r.led0.emissive);
    }
    g.cone.removeFromParent();
    g.cable.visible = false;
    g.can.visible = false;
    g.tray.visible = true;
    g.cup.visible = true;
    setEyes('ok');
    const undock = () => { if (boxed) r.path = []; else if (r.docked) { r.docked = false; r.path = [front]; } else r.path = []; };
    const stopsOr = (list) => (boxed ? [] : list);
    switch (plan) {
      case 'home':
        if (r.docked) { r.plan = 'dock'; r.t = rnd(6, 12); return; }
        walkTo(r, front.x, front.z); r.path.push(pad); r.t = 0; return;
      case 'rounds':
        undock();
        r.stops = deskStops(1 + Math.floor(draw('robot') * 3)).map((s) => ({ ...besideSeat(s.desk), who: s.who })).filter((s) => s.x != null);
        if (r.level >= 2 && draw('robot') < 0.35) { const p = plantStop(); if (p) r.stops.push(p); }
        nextStop(); return;
      case 'broken:spin': {
        const p = !boxed && spinStop(front);
        undock(); r.stops = stopsOr([p || { x: front.x, z: front.z }]); nextStop(); setEyes('broken'); return;
      }
      case 'broken:stuck': {
        const s = !boxed && chairStop();
        undock(); r.stops = stopsOr([s || { x: front.x, z: front.z }]); nextStop(); setEyes('broken'); return;
      }
      case 'broken:emptyDesk': {
        const s = !boxed && emptyDeskStop();
        undock(); r.stops = stopsOr([s || { x: front.x, z: front.z }]); nextStop(); return;
      }
      case 'broken:cone': {
        const q = !boxed && coneStop(front);
        undock();
        if (q) { g.cone.position.set(q.cone.x, 0, q.cone.z); parent.add(g.cone); r.stops = [q]; } else r.stops = stopsOr([{ x: front.x, z: front.z }]);
        nextStop(); setEyes('broken'); return;
      }
      case 'broken:decaf':
        // Business as usual, as far as the robot knows.
        startPlan('rounds'); r.plan = 'broken:decaf'; return;
      case 'broken:unplug':
        walkTo(r, front.x, front.z); r.path.push(pad);
        if (r.docked) r.path = [];
        g.cable.visible = true; setEyes('off'); r.t = 0; return;
      case 'party:serve':
      case 'party:dj': {
        undock();
        r.stops = [r.party.spot];
        nextStop();
        // Late to a party that has started: it hurries, up to a jog.
        let len = 0, p = r.pos;
        for (const q of r.path) { len += Math.hypot(q.x - p.x, q.z - p.z); p = q; }
        r.speedK = Math.min(2.5, Math.max(1, len / (r.party.hurry * SPEED)));
        if (plan === 'party:dj') {
          g.tray.visible = g.cup.visible = false;
          if (r.party.color) { g.ledMat?.color.set(r.party.color); g.ledMat?.emissive?.set(r.party.color); }
        }
        return;
      }
      default:
        r.plan = 'dock'; r.t = rnd(6, 12);
    }
  }

  function nextStop() {
    const r = rec;
    r.stop = r.stops.shift() ?? null;
    r.arrived = false;
    if (r.stop) {
      const from = r.path.length ? r.path[r.path.length - 1] : r.pos;
      const leg = route({ x: from.x, z: from.z }, { x: r.stop.x, z: r.stop.z });
      // No way there the robot fits through: on to the next stop.
      if (!leg) return nextStop();
      leg.shift();
      r.path.push(...leg);
      if (!leg.length) r.path.push({ x: r.stop.x, z: r.stop.z });
      r.rig.can.visible = !!r.stop.water;
      r.rig.tray.visible = r.rig.cup.visible = !r.stop.water;
      return;
    }
    if (r.plan.startsWith('broken:') && r.plan !== 'broken:decaf') return;
    // Rounds done: back to the dock.
    const e = dockEntry();
    const pad = padOf(e), front = wayHome(e);
    const from = r.path.length ? r.path[r.path.length - 1] : r.pos;
    const leg = route({ x: from.x, z: from.z }, front, { home: true });
    leg.shift();
    r.path.push(...leg, pad);
    r.plan = r.plan === 'broken:decaf' ? 'broken:decaf' : 'return';
  }

  function setEyes(kind) {
    const g = rec.rig;
    g.eyeMat?.color.set(EYE[kind]);
    g.eyeMat?.emissive?.set(EYE[kind]);
    g.eyes.visible = kind !== 'off';
    g.led.visible = kind !== 'off';
    rec.eyes = kind;
  }

  // At a stop: serve, water, or act out the breakdown.
  function arrive(r) {
    if (r.arrived) return;
    r.arrived = true;
    const s = r.stop;
    if (s?.face) r.faceYaw = Math.atan2(s.face.x - r.pos.x, s.face.z - r.pos.z);
    if (r.plan === 'broken:spin') { r.spin = true; sayEmote('sweat', 3); r.t = Infinity; return; }
    if (r.plan === 'broken:stuck' || r.plan === 'broken:cone') { r.bump = true; sayEmote('sweat', 3); r.t = Infinity; return; }
    if (r.plan === 'broken:emptyDesk') { r.t = Infinity; r.wait = 0; return; }
    // At its post for the party: it stays until leave(). Turned to what it faces, but never so far
    // that the camera sees only its back.
    if (r.party) {
      r.t = Infinity; r.speedK = 1;
      if (r.faceYaw != null) {
        const cy = camYaw(), d = Math.atan2(Math.sin(r.faceYaw - cy), Math.cos(r.faceYaw - cy));
        if (Math.abs(d) > PARTY_TURN) r.faceYaw = cy + Math.sign(d) * PARTY_TURN;
      }
      sayEmote(r.party.role === 'dj' ? 'music' : 'heart', 2.4);
      return;
    }
    if (s?.water) { r.t = 3; r.watering = true; return; }
    if (s?.who) {
      r.t = 2.6;
      const who = s.who;
      const decaf = r.plan === 'broken:decaf';
      if (recs.get(who.id) === who && !who.hidden && !who.char.emote) staffEmote(who, decaf ? 'storm' : 'heart', 2);
      if (!decaf) r.rig.cup.visible = false;
      return;
    }
    r.t = 0;
  }

  const dir = new THREE.Vector3();
  function update(dt) {
    if (!rec || !office.current) return;
    clock += dt;
    const r = rec, g = r.rig;
    if (r.emoteT > 0) {
      r.emoteT -= dt;
      r.emoteAge += dt;
      const q = Math.min(1, r.emoteAge / 0.2);
      g.emote.scale.setScalar(EMOTE_SIZE * (q < 0.7 ? (q / 0.7) * 1.15 : 1.15 - ((q - 0.7) / 0.3) * 0.15));
      if (r.emoteT <= 0) g.emote.visible = false;
    }
    let moving = false;
    if (r.fix) {
      stepFix(dt);
      if (r.faceYaw != null) r.yaw = angleLerp(r.yaw, r.faceYaw, 1 - Math.exp(-dt * 6));
      if (r.spin) r.yaw += dt * 7;
    } else if (r.path.length && r.holdT > 0) {
      // Holding back while people walk to (or away from) a party.
      r.holdT -= dt;
    } else if (r.path.length && waits(r) && (r.yieldT = (r.yieldT ?? 0) + dt) < YIELD_S) {
      // Someone right ahead: it waits for them to pass.
    } else if (r.path.length) {
      r.yieldT = 0;
      const tgt = r.path[0];
      dir.set(tgt.x - r.pos.x, 0, tgt.z - r.pos.z);
      const d = dir.length(), step = SPEED * (r.speedK ?? 1) * dt;
      moving = true;
      if (d <= step) { r.pos.set(tgt.x, 0, tgt.z); r.path.shift(); } else {
        dir.multiplyScalar(1 / d);
        r.pos.addScaledVector(dir, step);
        r.yaw = angleLerp(r.yaw, Math.atan2(dir.x, dir.z), 1 - Math.exp(-dt * 8));
      }
    } else if (r.plan === 'dock') {
      r.docked = true;
      const e = dockEntry();
      if (e) r.yaw = angleLerp(r.yaw, padOf(e).yaw, 1 - Math.exp(-dt * 4));
      if ((r.t -= dt) <= 0) startPlan('rounds');
    } else if (r.plan === 'return' || r.plan === 'broken:unplug' || (r.plan === 'broken:decaf' && !r.stop)) {
      r.docked = true;
      if (r.plan === 'broken:unplug') {
        const e = dockEntry();
        if (e) r.yaw = angleLerp(r.yaw, padOf(e).yaw, 1 - Math.exp(-dt * 4));
      } else if (r.plan === 'broken:decaf') { r.plan = 'broken:decaf'; r.t = rnd(6, 10); r.decafRest = true; }
      else { r.plan = 'dock'; r.t = rnd(8, 14); g.cup.visible = true; }
    } else {
      arrive(r);
      if (r.faceYaw != null && !r.spin) r.yaw = angleLerp(r.yaw, r.faceYaw, 1 - Math.exp(-dt * 6));
      if (r.spin) r.yaw += dt * 7;
      if (r.plan === 'broken:emptyDesk' && (r.wait -= dt) <= 0) { r.wait = rnd(5, 8); sayEmote('exclamation', 1.5); }
      if ((r.t -= dt) <= 0) { r.watering = false; r.faceYaw = null; nextStop(); }
    }
    if (r.decafRest && r.plan === 'broken:decaf' && !r.path.length && (r.t -= dt) <= 0) { r.decafRest = false; startPlan('rounds'); r.plan = 'broken:decaf'; }
    pose(r, dt, moving);
    // Up on the dock's pad when parked on it.
    const e = dockEntry();
    const pad = e && padOf(e);
    const onPad = pad && Math.hypot(r.pos.x - pad.x, r.pos.z - pad.z) < PAD_R ? PAD_Y : 0;
    r.y = (r.y ?? 0) + (onPad - (r.y ?? 0)) * (1 - Math.exp(-dt * 12));
    g.root.position.set(r.pos.x, r.y, r.pos.z);
    g.root.rotation.y = r.yaw;
  }

  function pose(r, dt, moving) {
    const g = r.rig, t = clock, k = 1 - Math.exp(-dt * 10);
    let bob = 0, lean = 0, headX = 0, headZ = 0, tray = 0, sway = 0;
    if (moving) { bob = Math.abs(Math.sin(t * 9)) * 0.008; lean = 0.06; headZ = Math.sin(t * 4.5) * 0.04; }
    else if (r.bump) {
      // Nosing into the obstacle, backing off, trying again.
      const p = (t * 1.3) % 1;
      const push = p < 0.35 ? p / 0.35 : Math.max(0, 1 - (p - 0.35) / 0.25);
      g.body.position.z = push * 0.06 - 0.03;
      headZ = Math.sin(t * 13) * 0.12 * push;
      lean = 0.1 * push;
    } else if (r.spin) { headZ = Math.sin(t * 5) * 0.25; bob = Math.abs(Math.sin(t * 14)) * 0.01; }
    else if (r.plan === 'broken:unplug') { headX = 0.45; lean = 0.12; }
    else if (r.plan === 'broken:emptyDesk') { headX = 0.08; headZ = Math.sin(t * 0.9) * 0.18; tray = 0.02; }
    else if (r.watering) { lean = 0.28; headX = 0.2; }
    else if (r.arrived && r.party?.role === 'dj') {
      // Nodding on the beat, swaying over two bars, the antenna light flashing on each beat.
      const ph = ((r.party.clock?.() ?? t) / r.party.beat) * Math.PI * 2;
      const nod = Math.max(0, Math.cos(ph)) ** 2;
      headX = 0.2 * nod; bob = 0.015 * nod; headZ = Math.sin(ph / 4) * 0.14; sway = Math.sin(ph / 8) * 0.22;
    } else if (r.arrived && r.party) { tray = 0.03 + Math.sin(t * 6) * 0.01; headX = -0.1; headZ = Math.sin(t * 1.3) * 0.08; }
    else if (r.arrived && r.stop?.who) { tray = 0.03 + Math.sin(t * 6) * 0.01; headX = -0.1; sway = Math.sin(t * 3) * 0.05; }
    else headZ = Math.sin(t * 1.1) * 0.05;
    // The slap's cringe and jolt (slapPose) take over the head's tilt.
    if (r.fix && !r.fix.slapped && r.fixSide) headZ = 0;
    if (r.jolt > 0) r.jolt = Math.max(0, r.jolt - dt * JOLT_DECAY);
    const s = slapPose(t, { cringeSide: r.fix && !r.fix.slapped ? r.fixSide ?? 0 : 0, jolt: r.jolt ?? 0 });
    headZ += s.headZ;
    lean += s.lean;
    if (!r.bump) g.body.position.z *= 1 - k;
    g.body.position.y += (bob - g.body.position.y) * k;
    g.torso.rotation.x += (lean - g.torso.rotation.x) * k;
    g.torso.rotation.y += (sway - g.torso.rotation.y) * k;
    g.head.rotation.x += (headX - g.head.rotation.x) * k;
    g.head.rotation.z += (headZ - g.head.rotation.z) * k;
    g.tray.position.y = g.cup.position.y = tray;
    g.can.rotation.x = r.watering ? 0.7 + Math.sin(t * 3) * 0.1 : 0;
    // The antenna light blinks while it works, and slowly while it charges.
    if (g.led.visible) {
      const dj = r.arrived && r.party?.role === 'dj';
      const beat = dj && Math.max(0, Math.cos(((r.party.clock?.() ?? t) / r.party.beat) * Math.PI * 2)) ** 4;
      g.led.scale.setScalar(dj ? 0.9 + 0.5 * beat : r.plan === 'dock' ? 0.8 + 0.2 * Math.sin(t * 2) : Math.sin(t * 6) > 0 ? 1.1 : 0.9);
    }
  }

  // A waffle party or a music night: it goes to a clear spot near `near` (clear of the `avoid`
  // boxes and of the `crowd`, the points where people will stand), turns to `face`, and serves ('serve') or plays DJ ('dj', nodding every `beat`
  // seconds of `clock()`, its antenna light in `color`) until leave(). It sets off after `settle`
  // seconds and hurries to arrive within `hurry` seconds of that. `score` ranks clear spots (lower wins; nearest `near` by default). Not while
  // it is broken or being fixed; false when it can't go.
  function join({ role, near, face, avoid = [], crowd = [], settle = 0, hurry = 3, beat = 0.5, clock: beatClock = null, color = null, score = null }) {
    const r = rec;
    if (!r || r.fix || r.cause || !office.current) return false;
    // The spot leaves room round where the `crowd` will stand, and the way there keeps clear of the
    // `avoid` boxes (a cart the walk grid doesn't know about) and of the crowd: someone standing in
    // a gap between desks can't be gone round.
    const e = dockEntry();
    const from = r.docked && e ? wayHome(e) : r.pos;
    const cy = camYaw(), cam = { x: Math.sin(cy), z: Math.cos(cy) };
    // In line with someone as the camera looks (within a body's width to the side, a few steps nearer
    // or farther): one of them hides the other.
    const inLine = (q, c) => { const dx = q.x - c.x, dz = q.z - c.z; return Math.abs(dx * cam.x + dz * cam.z) < 1.6 && Math.abs(dx * cam.z - dz * cam.x) < 0.5; };
    const way = (q) => {
      if (!crowd.every((c) => Math.hypot(c.x - q.x, c.z - q.z) >= KEEP_OFF_R + 0.15)) return 'crowded';
      if (crowd.some((c) => inLine(q, c))) return 'in line with the crowd';
      const pts = route({ x: from.x, z: from.z }, { x: q.x, z: q.z });
      if (!pts) return 'no way there';
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.15);
        for (let k = 0; k <= n; k++) {
          const p = { x: a.x + (b.x - a.x) * k / n, z: a.z + (b.z - a.z) * k / n };
          if (!clearOf(p, avoid, ROBOT_R)) return 'through the cart';
          if (crowd.some((c) => Math.hypot(c.x - p.x, c.z - p.z) < KEEP_OFF_R + 0.08)) return 'through the crowd';
        }
      }
      return true;
    };
    const spot = openSpot({ x: near.x, z: near.z }, `party:${role}`, { radii: [0.3, 0.55, 0.8, 1.1, 1.5, 2], avoid, centerFirst: true, way,
      score: score ?? ((q) => Math.hypot(q.x - near.x, q.z - near.z)) });
    if (!spot) return false;
    r.party = { role, hurry, beat, clock: beatClock, color, spot: { x: spot.x, z: spot.z, face } };
    startPlan(`party:${role}`);
    if (!r.stop) r.party = null;
    // It sets off once the others have walked to their places, so it only has people standing
    // still to go round, and no one walks into it on their way.
    r.holdT = settle;
    return !!r.party;
  }

  // The party is over: home to the dock, once the others have started back.
  function leave() {
    if (!rec?.party) return;
    rec.party = null;
    if (rec.cause || rec.fix) return;
    startPlan('home');
    rec.holdT = LEAVE_HOLD_S;
  }

  // Someone slaps it back to life: they walk up beside it and slap its head; it jolts, its eyes
  // come back, and it heads home. With nobody able to get there, it just comes back on its own.
  function startFix(fixerId) {
    const r = rec;
    if (!r || r.fix) return;
    r.path = [];
    const who = recs.get(fixerId);
    const free = who && !who.hidden && who.mode === 'placed' && !who.temp;
    // Side-on to the camera, so the swing reads across the screen and neither hides the other.
    const cy = camYaw(), vx = Math.sin(cy), vz = Math.cos(cy);
    const spot = free && openSpot(r.pos, 'slap', { radii: SLAP.radii, clearR: 0.2, robot: false,
      score: (q) => Math.abs((q.x - r.pos.x) * vx + (q.z - r.pos.z) * vz) / Math.hypot(q.x - r.pos.x, q.z - r.pos.z) });
    if (!spot) { r.fix = { t: 0, slapped: true, after: SLAP.afterS }; recover(); return; }
    const toRobot = Math.atan2(r.pos.x - spot.x, r.pos.z - spot.z);
    const yaw = toRobot - SLAP.aside;
    // The robot turns an ear to them, keeping its tray out of their way.
    r.fixYaw = toRobot + Math.PI / 2;
    // Which side of its head (local +x or -x, once turned to fixYaw) faces the fixer.
    r.fixSide = Math.sign((spot.x - r.pos.x) * Math.cos(r.fixYaw) - (spot.z - r.pos.z) * Math.sin(r.fixYaw)) || 1;
    const temp = { anim: 'slap', t: SLAP.turnS + SLAP_AT + 1.1, goal: { x: spot.x, z: spot.z, yaw }, back: true, moment: 'robot',
      stage: { beat: 'turn', role: 'fixer', target: r.rig.head },
      // Square up to the robot standing, then the slap; slapAge counts from the anim's start.
      tick(w, dt, tp) {
        tp.age = (tp.age ?? 0) + dt;
        tp.slapAge = tp.age - SLAP.turnS;
        tp.stage.beat = tp.slapAge < 0 ? 'turn' : tp.slapAge < SLAP_AT ? 'windup' : 'slap';
        if (tp.slapAge >= 0) return false;
        w.char.setAnim('idle');
        return true;
      } };
    who.temp = temp;
    who.face = null;
    walkStaff(who, temp.goal, who.pos.distanceTo(r.pos) > SLAP.runFromM);
    r.fix = { who, temp, t: 0, slapped: false, after: SLAP.afterS };
  }

  function recover() {
    const r = rec;
    r.spin = false; r.bump = false;
    setEyes('ok');
    r.jolt = 1;
    sayEmote('sparkle', 1.6);
  }

  function stepFix(dt) {
    const r = rec, f = r.fix;
    f.t += dt;
    if (!f.slapped) {
      const w = f.who;
      if (w?.temp === f.temp && w.path.length < 2 && r.fixYaw != null) { r.faceYaw = r.fixYaw; r.spin = false; r.bump = false; }
      if (w?.temp === f.temp && (f.temp.slapAge ?? -1) >= SLAP_AT) { f.slapped = true; recover(); }
      else if (w?.temp !== f.temp || f.t > SLAP.waitS) { f.slapped = true; recover(); }
      return;
    }
    if ((f.after -= dt) > 0) return;
    // It drives off once the fixer has stepped away, so it never rolls through them.
    const w = f.who;
    if (w && !w.hidden && Math.hypot(w.pos.x - r.pos.x, w.pos.z - r.pos.z) < SLAP.clearM && (f.held = (f.held ?? 0) + dt) < SLAP.holdS) return;
    r.fix = null;
    r.faceYaw = null;
    const cause = lastState?.robot?.status === 'broken' ? lastState.robot.cause : null;
    r.cause = cause;
    startPlan(cause ? `broken:${cause}` : 'home');
  }

  function event(e) {
    if (e.type !== 'robot') return;
    if (e.kind === 'breakdown') breakdown = { cause: e.cause, deskStaffId: e.deskStaffId ?? null };
    if (e.kind === 'fixed') startFix(e.fixerId);
  }

  function reset() {
    const f = rec?.fix;
    if (f?.who && f.who.temp === f.temp) f.who.temp = null;
    despawn();
    breakdown = null;
  }

  return {
    sync, update, event, reset, join, leave,
    // Read-only snapshot for scripts.
    peek() {
      if (!rec) return null;
      const last = rec.path.length ? rec.path[rec.path.length - 1] : null;
      return { plan: rec.plan, cause: rec.cause ?? null, docked: !!rec.docked, pos: [+rec.pos.x.toFixed(2), +rec.pos.z.toFixed(2)], yaw: +rec.yaw.toFixed(2), path: rec.path.length,
        target: last && { x: +last.x.toFixed(2), z: +last.z.toFixed(2) }, stop: rec.stop && { x: +rec.stop.x.toFixed(2), z: +rec.stop.z.toFixed(2), who: rec.stop.who?.id ?? null, desk: rec.stop.desk ?? null },
        party: rec.party?.role ?? null, settled: !!rec.arrived && !rec.path.length && (rec.faceYaw == null || Math.abs(Math.atan2(Math.sin(rec.yaw - rec.faceYaw), Math.cos(rec.yaw - rec.faceYaw))) < 0.15), partyFace: rec.party?.spot.face ? { x: rec.party.spot.face.x, z: rec.party.spot.face.z } : null, eyes: rec.eyes, fix: rec.fix && { fixer: rec.fix.who?.id ?? null, slapped: rec.fix.slapped }, cone: !!rec.rig.cone.parent, note: rec.rig.note.visible, googly: rec.rig.googly.visible };
    },
    // Test hook: start a plan now ('rounds', 'home', or 'broken:<cause>').
    force(plan) { if (!rec) return false; startPlan(plan); return true; },
    // Test hook: skip the walk to the end of the current path (the next stop, or the dock).
    arriveNow() {
      if (!rec?.path.length) return false;
      const p = rec.path[rec.path.length - 1];
      const q = rec.path.length > 1 ? rec.path[rec.path.length - 2] : rec.pos;
      rec.pos.set(p.x, 0, p.z);
      rec.yaw = Math.atan2(p.x - q.x, p.z - q.z);
      rec.path = [];
      return true;
    },
    get root() { return rec?.rig.root ?? null; },
    // The floor circle walkers keep out of: the robot's body plus a walker's, off its dock only.
    blocker() { return rec && !rec.docked ? { x: rec.pos.x, z: rec.pos.z, r: KEEP_OFF_R } : null; },
  };
}
