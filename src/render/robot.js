import * as THREE from 'three';
import { getTemplate } from './models.js';
import { emoteMaterial } from './emotes.js';
import { pickSpot, spotDebug } from './spots.js';
import { robotResentment } from '../sim/robot.js';
import { SLAP_AT } from './character.js';

// The office robot (shop item office_robot). The placed item is its charging dock; the robot itself
// is built here from robot.glb's parts and roams: coffee rounds to people at their desks, plant
// watering from level 2, back to the dock to charge. state.robot drives how it looks: a breakdown
// shows its cause (spinning, stuck on a chair, waiting at an empty desk, a traffic cone, serving
// decaf, unplugged), a sticky note while people grumble about it, googly eyes once chosen.

const SPEED = 0.85;
const NECK_Y = 0.5;
const EMOTE_SIZE = 0.42;
// Metres out from the dock's front edge where the robot turns in to park.
const DOCK_OUT = 0.45;
// How far from a desk's seat the robot may stop to serve (nearest first), and the clearance it
// needs there: the tray may reach over a desk's edge, so the body alone needs clearing.
const SERVE_RADII = [0.6, 0.75, 0.9, 1.05];
const SERVE_R = 0.22;
// Floor clearance round the robot, tray included, and the height and radius of its dock's pad.
const ROBOT_R = 0.3;
const PAD_Y = 0.03;
const PAD_R = 0.3;
const EYE = { ok: '#5fe0d0', broken: '#ffb238', off: '#1e2333' };
// The fix: how far from the robot the fixer stands to slap it (a chibi arm reaches about 0.2 m past
// the body), how far they turn so its head sits a little to their right where the hand sweeps, how
// long the robot waits for them before it recovers on its own, how long it shakes after the slap
// before heading home, from how far away the fixer jogs over, and how long they square up first.
const SLAP = { radii: [0.47, 0.51, 0.55], waitS: 20, afterS: 1.4, runFromM: 5, aside: 0.12, turnS: 0.4 };

function rnd(a, b) { return a + Math.random() * (b - a); }
function angleLerp(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

function buildRig() {
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

  // The pad the robot parks on, and the floor point in front of it where it turns in, in world space.
  function dockSpots(e) {
    const t = e.target, c = Math.cos(t.rotY), s = Math.sin(t.rotY);
    const p = e.obj.userData.dock ?? { x: 0, z: 0 };
    const pad = { x: t.x + c * p.x + s * p.z, z: t.z - s * p.x + c * p.z, yaw: t.rotY };
    // Straight out from the dock, or the nearest open floor to that when furniture stands there.
    const out = 0.5 + DOCK_OUT;
    const front = office.nav().freePoint(t.x + s * out, t.z + c * out);
    return { pad, front: { x: front.x, z: front.z } };
  }

  function walkTo(r, x, z) {
    const nav = office.nav();
    r.path = nav.path({ x: r.pos.x, z: r.pos.z }, { x, z });
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
    const { pad } = dockSpots(e);
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
    out.sort(() => Math.random() - 0.5);
    return out.slice(0, n);
  }

  // Open floor as near a desk's seat as the robot fits, in view, facing the sitter. The chair's side
  // of the seat comes first: on the desk's side the robot's head sits level with the desktop and
  // reads as poking through it.
  function besideSeat(desk) {
    const c = desk.seat, fx = Math.sin(c.rotY ?? 0), fz = Math.cos(c.rotY ?? 0);
    const score = (p) => Math.hypot(p.x - c.x, p.z - c.z);
    const side = (p) => (p.x - c.x) * fx + (p.z - c.z) * fz <= 0.05 || 'desk side';
    const q = openSpot(c, 'serve', { radii: SERVE_RADII, clearR: SERVE_R, score, side })
      ?? openSpot(c, 'serve', { radii: SERVE_RADII, clearR: SERVE_R, score });
    return q ? { x: q.x, z: q.z, face: { x: c.x, z: c.z } } : null;
  }

  // Open floor near a point, clear for the robot (and a second point along with it, when given),
  // and in view: the first ring candidate that passes, else null.
  function openSpot(center, search, { radii = [0.4, 0.7, 1.0, 1.4, 1.8, 2.4], partner = null, clearR = 0.28, score = null, side = null } = {}) {
    const nav = office.nav();
    const clear = (x, z) => !nav.isBlocked(x, z, clearR);
    return pickSpot(center, {
      ring: { radii, count: 12 },
      needs: side ? ['side', 'clear', 'inView'] : ['clear', 'inView'],
      checks: {
        side,
        clear: (q) => (clear(q.x, q.z) && (!partner || (q.partner = partner(q)) && clear(q.partner.x, q.partner.z))) || 'blocked',
        inView: (q) => inView(q) || 'out of view',
      },
      score, debug: spotDebug(office), moment: 'robot', search,
    });
  }

  function plantStop() {
    const plants = [...office.placed.values()].filter((e) => e.itemId === 'plant_wall' || e.obj.userData.kind === 'plant');
    if (!plants.length) return null;
    const e = plants[Math.floor(Math.random() * plants.length)];
    const nav = office.nav();
    const t = e.target, out = 0.5 + 0.45;
    const p = nav.freePoint(t.x + Math.sin(t.rotY) * out, t.z + Math.cos(t.rotY) * out);
    return { x: p.x, z: p.z, face: { x: t.x, z: t.z }, water: true };
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

  // A desk chair to get stuck on, an empty desk's first: the robot noses into its back from the aisle.
  function chairStop() {
    const taken = new Set([...recs.values()].map((w) => w.seat).filter((x) => x != null));
    const desks = [...(office.current?.desks ?? [])].sort((a, b) => taken.has(a.id) - taken.has(b.id));
    const nav = office.nav();
    for (const d of desks) {
      const f = d.seat.rotY;
      for (const back of [0.55, 0.65, 0.75]) {
        const x = d.seat.x - Math.sin(f) * back, z = d.seat.z - Math.cos(f) * back;
        if (!nav.isBlocked(x, z, 0.18) && inView({ x, z })) return { x, z, face: { x: d.seat.x, z: d.seat.z } };
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
    const { pad, front } = dockSpots(e);
    r.plan = plan; r.stop = null; r.arrived = false; r.spin = false; r.bump = false;
    const g = r.rig;
    g.cone.removeFromParent();
    g.cable.visible = false;
    g.can.visible = false;
    g.tray.visible = true;
    g.cup.visible = true;
    setEyes('ok');
    const undock = () => { if (r.docked) { r.docked = false; r.path = [front]; } else r.path = []; };
    switch (plan) {
      case 'home':
        if (r.docked) { r.plan = 'dock'; r.t = rnd(6, 12); return; }
        walkTo(r, front.x, front.z); r.path.push(pad); r.t = 0; return;
      case 'rounds':
        undock();
        r.stops = deskStops(1 + Math.floor(Math.random() * 3)).map((s) => ({ ...besideSeat(s.desk), who: s.who })).filter((s) => s.x != null);
        if (r.level >= 2 && Math.random() < 0.35) { const p = plantStop(); if (p) r.stops.push(p); }
        nextStop(); return;
      case 'broken:spin': {
        const p = spinStop(front);
        undock(); r.stops = [p ?? { x: front.x, z: front.z }]; nextStop(); setEyes('broken'); return;
      }
      case 'broken:stuck': {
        const s = chairStop();
        undock(); r.stops = s ? [s] : [{ x: front.x, z: front.z }]; nextStop(); setEyes('broken'); return;
      }
      case 'broken:emptyDesk': {
        const s = emptyDeskStop();
        undock(); r.stops = s ? [s] : [{ x: front.x, z: front.z }]; nextStop(); return;
      }
      case 'broken:cone': {
        const q = coneStop(front);
        undock();
        if (q) { g.cone.position.set(q.cone.x, 0, q.cone.z); parent.add(g.cone); r.stops = [q]; } else r.stops = [{ x: front.x, z: front.z }];
        nextStop(); setEyes('broken'); return;
      }
      case 'broken:decaf':
        // Business as usual, as far as the robot knows.
        startPlan('rounds'); r.plan = 'broken:decaf'; return;
      case 'broken:unplug':
        walkTo(r, front.x, front.z); r.path.push(pad);
        if (r.docked) r.path = [];
        g.cable.visible = true; setEyes('off'); r.t = 0; return;
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
      const nav = office.nav();
      const leg = nav.path({ x: from.x, z: from.z }, { x: r.stop.x, z: r.stop.z });
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
    const { pad, front } = dockSpots(e);
    const from = r.path.length ? r.path[r.path.length - 1] : r.pos;
    const leg = office.nav().path({ x: from.x, z: from.z }, front);
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
    } else if (r.path.length) {
      const tgt = r.path[0];
      dir.set(tgt.x - r.pos.x, 0, tgt.z - r.pos.z);
      const d = dir.length(), step = SPEED * dt;
      moving = true;
      if (d <= step) { r.pos.set(tgt.x, 0, tgt.z); r.path.shift(); } else {
        dir.multiplyScalar(1 / d);
        r.pos.addScaledVector(dir, step);
        r.yaw = angleLerp(r.yaw, Math.atan2(dir.x, dir.z), 1 - Math.exp(-dt * 8));
      }
    } else if (r.plan === 'dock') {
      r.docked = true;
      const e = dockEntry();
      if (e) r.yaw = angleLerp(r.yaw, dockSpots(e).pad.yaw, 1 - Math.exp(-dt * 4));
      if ((r.t -= dt) <= 0) startPlan('rounds');
    } else if (r.plan === 'return' || r.plan === 'broken:unplug' || (r.plan === 'broken:decaf' && !r.stop)) {
      r.docked = true;
      if (r.plan === 'broken:unplug') {
        const e = dockEntry();
        if (e) r.yaw = angleLerp(r.yaw, dockSpots(e).pad.yaw, 1 - Math.exp(-dt * 4));
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
    const pad = e && dockSpots(e).pad;
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
    else if (r.arrived && r.stop?.who) { tray = 0.03 + Math.sin(t * 6) * 0.01; headX = -0.1; sway = Math.sin(t * 3) * 0.05; }
    else headZ = Math.sin(t * 1.1) * 0.05;
    if (r.jolt > 0) {
      // The slap: a sharp tilt and shake that dies away.
      r.jolt = Math.max(0, r.jolt - dt * 1.4);
      const j = r.jolt * r.jolt;
      headZ += Math.sin(t * 38) * 0.35 * j + 0.3 * j;
      lean -= 0.12 * j;
    }
    if (!r.bump) g.body.position.z *= 1 - k;
    g.body.position.y += (bob - g.body.position.y) * k;
    g.torso.rotation.x += (lean - g.torso.rotation.x) * k;
    g.torso.rotation.y += (sway - g.torso.rotation.y) * k;
    g.head.rotation.x += (headX - g.head.rotation.x) * k;
    g.head.rotation.z += (headZ - g.head.rotation.z) * k;
    g.tray.position.y = g.cup.position.y = tray;
    g.can.rotation.x = r.watering ? 0.7 + Math.sin(t * 3) * 0.1 : 0;
    // The antenna light blinks while it works, and slowly while it charges.
    if (g.led.visible) g.led.scale.setScalar(r.plan === 'dock' ? 0.8 + 0.2 * Math.sin(t * 2) : Math.sin(t * 6) > 0 ? 1.1 : 0.9);
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
    const spot = free && openSpot(r.pos, 'slap', { radii: SLAP.radii, clearR: 0.2,
      score: (q) => Math.abs((q.x - r.pos.x) * vx + (q.z - r.pos.z) * vz) / Math.hypot(q.x - r.pos.x, q.z - r.pos.z) });
    if (!spot) { r.fix = { t: 0, slapped: true, after: SLAP.afterS }; recover(); return; }
    const toRobot = Math.atan2(r.pos.x - spot.x, r.pos.z - spot.z);
    const yaw = toRobot - SLAP.aside;
    // The robot turns an ear to them, keeping its tray out of their way.
    r.fixYaw = toRobot + Math.PI / 2;
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
    sync, update, event, reset,
    // Read-only snapshot for scripts.
    peek() {
      if (!rec) return null;
      const last = rec.path.length ? rec.path[rec.path.length - 1] : null;
      return { plan: rec.plan, cause: rec.cause ?? null, docked: !!rec.docked, pos: [+rec.pos.x.toFixed(2), +rec.pos.z.toFixed(2)], yaw: +rec.yaw.toFixed(2), path: rec.path.length,
        target: last && { x: +last.x.toFixed(2), z: +last.z.toFixed(2) }, stop: rec.stop && { x: +rec.stop.x.toFixed(2), z: +rec.stop.z.toFixed(2), who: rec.stop.who?.id ?? null },
        eyes: rec.eyes, fix: rec.fix && { fixer: rec.fix.who?.id ?? null, slapped: rec.fix.slapped }, cone: !!rec.rig.cone.parent, note: rec.rig.note.visible, googly: rec.rig.googly.visible };
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
  };
}
