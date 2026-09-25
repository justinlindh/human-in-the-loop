import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { createCharacter } from './character.js';
import { printerModel } from './props.js';

// Staff moments around staged props (#284): brief reactions by idle people to what a decision put
// in the office. Render only; they borrow the perk visit mechanism (r.temp), so walking goes through
// the walking grid and people return to their seat afterwards.
//
// createMoments({ office, recs, walkTo, emote, getProps, isBusy, low }) -> { update(dt), reset() }
//   getProps() -> props.js handle (current(), overlay) or null
//   isBusy()   -> true while a standup or party owns the room: no moments start then
//   low()      -> Low quality: moments shrink to an emote, nobody walks
//
// Moments:
//   pizza  pizza_boxes up: two or three idle people gather round the box and eat, then go back.
//   screen a screen takeover: people at their desks recoil from their monitors with an exclamation.
//   hammer the sledgehammer (open plan): the subject shoulders it and sizes up the back wall; if the
//          walls come down (decisionResolved) they swing and dust flies.
//   letter the envelope on a desk: its sitter sighs over it now and then.
//   visitor the visitor chair (first user test): a visitor sits in it while someone hovers, sweating.
//   fumes  smoke or a hot rack: someone comes over and fans it away.
//   carrier the pet carrier: the requester bends over it and peers in; an adopted pet steps out of
//          it (pets.js).

function rnd(a, b) { return a + Math.random() * (b - a); }

// How willing someone is to wander off for a moment, by what they are assigned to.
const IDLE_W = { idle: 4, maintenance: 1, support: 0.8, sales: 0.8, marketing: 0.8, security: 0.6, project: 0.5, mentor: 0.4, oversight: 0.3, hardProblem: 0.2 };
const BODY_R = 0.22;
// The moments this module plays, for checks that need to know what exists (blender/checks/stage.mjs).
const KINDS = ['pizza', 'screen', 'hammer', 'carrier', 'printer'];
const READ_S = 2.2, SLUMP_S = 2.0;   // the letter moment: reading it, then the reaction
const CHAIR_ROLL = 0.5;      // how far a chair rolls back when someone gets up from it
const SIDE_OUT = 0.62;       // how far sideways someone steps out of their chair
const STAND_BACK = 0.8;      // then how far back into the aisle, clear of the chair
const TAKE_IT_OUT = 0;       // printer_jam's 'Take it out back' choice index
const CARRY_SPEED = [0.5, 3];  // metres a second: the printer carry takes the cue's verse, within these
const PAIR_CLEAR = 0.7;      // metres a printer carry keeps from furniture, either side of its way
const GRIP_OUT = 0.2;        // how far each carrier stands out from the printer's side
const BAT_BEHIND = 0.9;      // the one with the bat follows this far behind the printer
const COLUMN_SCREEN_R = 0.45;  // a column's half-width on screen for staging: its corner-on width plus a body's
const WATCH_AT = 1.05, WATCH_S = 1;   // where the carriers watch from (metres off the printer), and how long they take to get there
const SWING_AT = 0.9;        // and swings from this far off it
const JAM_SCALE = 1.2;       // the jammed printer's scale as staged (props.js)
const BAT_SHOULDER = [Math.PI, 0, -0.4];   // the bat's turn in the hand, resting back over the shoulder
const CHAIR_CLEAR = 0.65;   // metres from a desk seat a carrier keeps: the chair reaches about 0.36 from it, plus a body
const TWIST_STEP = 0.1, END_ON_HOLD = 0.8, TWIST_EASE = 0.3;   // metres: turn samples, how far an end-on stretch reaches, and its easing
const SWING_HIT = 0.605;     // seconds from the start of the 'batswing' pose to its blow (character.js)
const KNOCK_DOWN = 0;        // open_plan_office's 'Knock them down' choice index
// The letter sheet: paper with lines of text and a big red stamp, both faces (the camera sees its back).
const SHEET_GEO = new THREE.PlaneGeometry(0.26, 0.32);
let sheetMatCache = null;
function sheetMat() {
  if (sheetMatCache) return sheetMatCache;
  const c = document.createElement('canvas'); c.width = 128; c.height = 160;
  const x = c.getContext('2d');
  x.fillStyle = P.paper; x.fillRect(0, 0, 128, 160);
  x.fillStyle = P.metal_soft; for (let i = 0; i < 8; i++) x.fillRect(16, 18 + i * 12, 96 - (i % 3) * 18, 5);
  x.strokeStyle = P.alarm_red; x.lineWidth = 8; x.beginPath(); x.arc(64, 124, 24, 0, Math.PI * 2); x.stroke();
  x.fillStyle = P.alarm_red; x.fillRect(59, 108, 10, 20); x.fillRect(59, 133, 10, 8);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  sheetMatCache = new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.9 });
  return sheetMatCache;
}

// A visitor's look is random each visit, from everyday colours (render only: Math.random is fine here).
const VISITOR_HAIR = ['#2a2630', '#4a3222', '#6b4a2e', '#b5562b', '#d9b36a', '#8a8a8a'];
const VISITOR_SHIRT = ['#9aa3b5', '#d9a441', '#6f8fc0', '#9ab58a', '#c78a8a', '#e8e2d6'];
const VISITOR_PANTS = ['#2e3440', '#3b4a6b', '#5b4a3a', '#6b6b6b'];

// Dust knocked off a wall: a few soft puffs burst out from the point hit and fall away.
let dustTex = null;
function dustTexture() {
  if (dustTex) return dustTex;
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(32, 32, 2, 32, 32, 30);
  g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  dustTex = new THREE.CanvasTexture(c);
  return dustTex;
}
const HANDLE_MAT = new THREE.MeshStandardMaterial({ color: P.wood_light, roughness: 0.8 });
const HEAD_MAT = new THREE.MeshStandardMaterial({ color: P.metal_dark, roughness: 0.5, metalness: 0.3 });
const PIZZA = { first: [2, 4], every: [26, 36], people: [2, 3], dur: [4.5, 6.5], ring: 0.95 };
const SCREEN = { first: [0.3, 1.2], every: [7, 11], share: 0.5, dur: [1.8, 2.6] };

export function createMoments({ office, recs, walkTo, emote, getProps, fx = null, parent = null, getYaw = () => Math.PI / 4, getCamera = null, isBusy = () => false, low = () => false }) {
  const timers = new Map();   // moment key -> seconds until it may start again
  let full = false;           // checks: run full moments even at Low quality
  const lite = () => !full && low();

  // People who could take part: in the office, standing still or seated, not already doing something.
  function free() {
    return [...recs.values()].filter((r) => r.mode === 'placed' && !r.hidden && !r.temp && !r.path.length && r.staff.mood !== 'away');
  }
  // near: a point; people closer to it are much likelier, so moments start without a long walk.
  function pickIdle(n, near = null) {
    const pool = free();
    const out = [];
    while (out.length < n && pool.length) {
      const w = pool.map((r) => (IDLE_W[r.staff.assignment?.type ?? 'idle'] ?? 0.5) / (near ? 1 + Math.hypot(r.pos.x - near.x, r.pos.z - near.z) ** 2 / 4 : 1));
      let k = Math.random() * w.reduce((a, b) => a + b, 0), i = 0;
      for (; i < pool.length - 1; i++) { k -= w[i]; if (k <= 0) break; }
      out.push(pool.splice(i, 1)[0]);
    }
    return out;
  }
  function due(key, dt, first, every) {
    if (!timers.has(key)) timers.set(key, rnd(...first));
    const t = timers.get(key) - dt;
    timers.set(key, t);
    if (t > 0) return false;
    timers.set(key, rnd(...every));
    return true;
  }

  // Spots round a point, clear of furniture and props, each facing the point.
  const center = new THREE.Vector3();
  function ringSpots(at, radius, n) {
    const nav = office.nav();
    const out = [];
    const start = Math.random() * Math.PI * 2;
    for (let i = 0; i < 24 && out.length < n; i++) {
      const a = start + (i * Math.PI * 2) / 12 + (i >= 12 ? Math.PI / 12 : 0);
      const rr = radius + (i >= 12 ? 0.3 : 0);
      const x = at.x + Math.cos(a) * rr, z = at.z + Math.sin(a) * rr;
      if (nav.isBlocked(x, z, BODY_R) || out.some((s) => Math.hypot(s.x - x, s.z - z) < 0.55)) continue;
      out.push({ x, z, yaw: Math.atan2(at.x - x, at.z - z) });
    }
    return out;
  }

  function pizza(p, dt) {
    if (!due(`pizza|${p.obj.uuid}`, dt, PIZZA.first, PIZZA.every)) return;
    new THREE.Box3().setFromObject(p.obj).getCenter(center);
    const people = pickIdle(Math.round(rnd(...PIZZA.people)), center);
    if (lite()) { for (const r of people) emote(r, 'heart', 2); return; }
    const spots = ringSpots(center, PIZZA.ring, people.length);
    people.slice(0, spots.length).forEach((r, i) => {
      r.temp = { anim: 'eat', t: rnd(...PIZZA.dur), goal: spots[i], back: true, moment: 'pizza', stage: { beat: 'eat', target: p.obj } };
      walkTo(r, spots[i]);
      if (Math.random() < 0.5) emote(r, 'heart', 1.8);
    });
  }

  function screens(kind, dt) {
    if (!due(`screen|${kind}`, dt, SCREEN.first, SCREEN.every)) return;
    const seated = free().filter((r) => r.goal?.seated && r.char.seated);
    for (const r of seated) {
      if (Math.random() > SCREEN.share) continue;
      emote(r, 'exclamation', 2);
      if (!lite()) r.temp = { anim: 'recoil', t: rnd(...SCREEN.dur), keepPos: true, delay: rnd(0, 0.8), moment: 'screen', stage: { beat: 'recoil' } };
    }
  }

  // Sledgehammer. One run per decision: fetch it, carry it to the back wall, hold it there; swing
  // once the walls come down, else carry nothing back (the prop goes with the decision).
  let hammer = null;      // { r, phase, wall, obj, held }
  function hammerHead() {
    const g = new THREE.Group();
    // Hangs from the hand: carried at the side the head just clears the floor.
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.46, 8), HANDLE_MAT);
    handle.position.y = -0.17;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.12, 0.26), HEAD_MAT);
    head.position.y = -0.4;
    g.add(handle, head);
    return g;
  }
  // A clear spot facing a wall, nearest the hammer, on the far side from the camera (the near walls
  // are cut away, and whoever stood at one would be hidden behind its stub). { x, z, yaw, n } where
  // n is the wall's outward normal.
  function wallSpot(from) {
    const L = office.current.L, nav = office.nav(), yaw = getYaw?.() ?? Math.PI / 4;
    const cam = [Math.sin(yaw), Math.cos(yaw)];
    const walls = [[-1, 0], [0, -1], [1, 0], [0, 1]].filter(([nx, nz]) => nx * cam[0] + nz * cam[1] < -0.2);
    for (const [nx, nz] of walls.sort((a, b) => (a[0] * cam[0] + a[1] * cam[1]) - (b[0] * cam[0] + b[1] * cam[1]))) {
      const along = nx === 0, half = along ? L.W / 2 : L.D / 2, fixed = (along ? nz * L.D / 2 : nx * L.W / 2) - (along ? nz : nx) * 0.7;
      const start = along ? from.x : from.z;
      for (let d = 0; d < 2 * half; d += 0.35) for (const s of [1, -1]) {
        const u = start + s * d;
        if (Math.abs(u) > half - 0.6) continue;
        const x = along ? u : fixed, z = along ? fixed : u;
        if (!nav.isBlocked(x, z, BODY_R)) return { x, z, yaw: Math.atan2(nx, nz), n: [nx, nz] };
      }
    }
    return null;
  }
  function hammerTick(p, state) {
    // The walls came down: decisionResolved chose KNOCK_DOWN of open_plan_office.
    const knocked = resolved.get('open_plan_office') === KNOCK_DOWN;
    if (!hammer) {
      if (!p) { timers.delete('hammer'); return; }
      if (lite()) { if (!timers.has('hammer')) { timers.set('hammer', 1); const who = pickIdle(1)[0]; if (who) emote(who, 'exclamation', 2); } return; }
      const subject = state?.pendingDecision?.subjectId;
      const r = (subject && recs.get(subject) && free().includes(recs.get(subject))) ? recs.get(subject) : pickIdle(1)[0];
      if (!r) return;
      const at = p.obj.position;
      const nav = office.nav();
      let pick = null;
      for (let i = 0; i < 12 && !pick; i++) { const a = (i / 12) * Math.PI * 2; const x = at.x + Math.cos(a) * 0.7, z = at.z + Math.sin(a) * 0.7; if (!nav.isBlocked(x, z, BODY_R)) pick = { x, z, yaw: Math.atan2(at.x - x, at.z - z) }; }
      if (!pick) return;
      hammer = { r, phase: 'fetch', obj: p.obj, held: null };
      r.temp = { anim: 'peer', t: 1.2, goal: pick, moment: 'hammer', stage: { beat: 'fetch', target: p.obj } };
      walkTo(r, pick);
      return;
    }
    const h = hammer, r = h.r;
    if (!recs.has(r.id)) { stopHammer(); return; }
    if (h.phase === 'fetch' && r.temp?.moment === 'hammer' && !r.path.length && r.temp.t < 0.3) {
      // Picked up: the prop hides and the person carries a hammer of their own to the wall.
      h.obj.visible = false;
      h.held = hammerHead();
      r.char.setHeld(h.held);
      const w = wallSpot(r.pos);
      if (!w) { stopHammer(); return; }
      h.phase = 'carry';
      r.temp = { anim: 'shoulder', t: 1e6, goal: w, moment: 'hammer', stage: { beat: 'carry', held: h.held, target: new THREE.Vector3(w.x + w.n[0] * 0.7, 1.2, w.z + w.n[1] * 0.7) } };
      walkTo(r, w);
      h.wall = w;
    } else if (h.phase === 'carry' && !r.path.length) {
      h.phase = 'hold';
      if (r.temp?.stage) r.temp.stage.beat = 'hold';
      // On the shoulder: the handle across it and the head down behind the back.
      h.held.rotation.set(2.7, 0, 0.45);
      emote(r, 'lightbulb', 2);
    }
    if (knocked && h.phase === 'hold') {
      h.phase = 'swing';
      h.held.rotation.set(0, 0, 0);
      r.temp = { anim: 'swing', t: 3.3, goal: h.wall, moment: 'hammer', back: true, stage: { beat: 'swing', held: h.held, target: new THREE.Vector3(h.wall.x + h.wall.n[0] * 0.7, 1.2, h.wall.z + h.wall.n[1] * 0.7) } };
      h.swingT = 0;
    }
    if (h.phase === 'swing') {
      h.swingT += 1 / 30;
      const hit = Math.floor((h.swingT - 0.6) / 1.1);
      if (hit >= 0 && hit !== h.lastHit) { h.lastHit = hit; wallDust(h.wall.x + h.wall.n[0] * 0.62 - h.wall.n[1] * 0.35, 1.0, h.wall.z + h.wall.n[1] * 0.62 + h.wall.n[0] * 0.35); }
      if (!r.temp) { stopHammer(); return; }
    }
    // The decision went the other way: put it down and go back to work.
    if (!p && h.phase !== 'swing') { stopHammer(true); }
  }
  // Wall dust bursts: pooled sprite sets, each puff flying out from the wall and settling.
  const bursts = [];
  function wallDust(x, y, z) {
    if (!parent) return;
    let b = bursts.find((q) => q.t >= 1);
    if (!b) {
      const m = new THREE.SpriteMaterial({ map: dustTexture(), color: new THREE.Color(P.floor_concrete_dark), transparent: true, depthWrite: false });
      const parts = Array.from({ length: 7 }, () => { const s = new THREE.Sprite(m); s.userData.noAO = true; return s; });
      b = { m, parts, t: 1, v: parts.map(() => new THREE.Vector3()), group: new THREE.Group() };
      b.group.add(...parts);
      parent.add(b.group);
      bursts.push(b);
    }
    b.t = 0; b.at = new THREE.Vector3(x, y, z);
    b.parts.forEach((s, i) => { const a = (i / 7) * Math.PI * 2; b.v[i].set(Math.cos(a) * 1.1 + 0.5, 0.5 + Math.sin(a) * 0.7, 0.7 + (i % 3) * 0.3); s.position.copy(b.at); });
    b.group.visible = true;
  }
  function updateBursts(dt) {
    for (const b of bursts) {
      if (b.t >= 1) { b.group.visible = false; continue; }
      b.t = Math.min(1, b.t + dt / 0.9);
      const k = b.t;
      b.parts.forEach((s, i) => {
        s.position.set(b.at.x + b.v[i].x * k * 0.8, b.at.y + b.v[i].y * k * 0.7 - k * k * 0.6, b.at.z + b.v[i].z * k * 0.8);
        s.scale.setScalar(0.3 + k * 0.6);
      });
      b.m.opacity = 0.95 * (1 - k * k);
    }
  }

  function stopHammer(walkBack = false) {
    if (!hammer) return;
    const r = hammer.r;
    r.char.setHeld(null);
    hammer.held?.traverse((o) => o.geometry?.dispose());
    if (hammer.obj) hammer.obj.visible = true;
    if (r.temp?.moment === 'hammer') { r.temp = null; if (walkBack && r.goal) walkTo(r, r.goal); }
    hammer = null;
  }

  // Choices made, by event id, from decisionResolved ({ eventId, choice }; choice indexes the event's
  // choices). Kept briefly: the moments that act on a choice read it within a few frames.
  const resolved = new Map(), resolvedT = new Map();
  function decided(e) {
    resolved.set(e.eventId, e.choice ?? null);
    resolvedT.set(e.eventId, 20);
    if (e.eventId === 'printer_jam' && e.choice === TAKE_IT_OUT) printerDue = 3;
  }

  // A yaw that faces the camera three-quarters, turned toward a point so it still reads as about it.
  function towardCamera(from, at) {
    const cam = getYaw();
    const toAt = Math.atan2(at.x - from.x, at.z - from.z);
    const d = Math.atan2(Math.sin(toAt - cam), Math.cos(toAt - cam));
    return cam + Math.sign(d || 1) * 0.6;
  }
  // True when the camera sees a spot clearly: nothing placed (a desk's monitor, a beanbag) and no
  // column between a standing person there (legs, chest, head) and the camera.
  const ray = new THREE.Raycaster();
  function inView(at) {
    const cam = getCamera?.();
    if (!cam || !office.current) return !columnInFront(at);
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir).negate();
    for (const y of [0.25, 0.5, 0.85]) {
      ray.set(new THREE.Vector3(at.x, y, at.z), dir);
      ray.far = 12;
      if (ray.intersectObject(office.current.furniture, true).length) return false;
    }
    return !columnInFront(at);
  }
  // True when a column stands between the camera and a spot: someone there would be half hidden
  // behind the column (drawn faded over them), so a moment staged there would not read.
  function columnInFront(at) {
    const yaw = getYaw(), cx = Math.sin(yaw), cz = Math.cos(yaw);
    for (const col of office.current?.columns ?? []) {
      const dx = col.x - at.x, dz = col.z - at.z;
      const along = dx * cx + dz * cz;               // toward the camera
      const across = Math.abs(dx * cz - dz * cx);
      if (along > 0 && along < 3 && across < 0.55) return true;
    }
    return false;
  }


  // Envelope on a desk: whoever sits there gets up beside the desk, turns to the room and holds their
  // head over it (a seated sigh faces the monitor, away from the camera), then sits back down. At Low,
  // a sweat emote at the desk.
  function letter(p, dt) {
    if (!due(`letter|${p.obj.uuid}`, dt, [2, 4], [12, 18])) return;
    const deskId = p.obj.userData.follow?.deskId;
    const r = [...recs.values()].find((x) => x.seat === deskId);
    // Not at their desk right now: look again shortly rather than after the full interval.
    if (!r || !free().includes(r) || !r.char.seated) { timers.set(`letter|${p.obj.uuid}`, 1); return; }
    // At Low: just the bad-news emote at the desk. Otherwise the emote comes after reading it.
    if (lite()) { emote(r, 'storm', 2.8); return; }
    // Out of the chair sideways (on the camera's side when both are clear), then back into the aisle
    // to read it; the chair's back and the desk row are in the way of any straight route. They come
    // back the same way.
    const desk = office.placed.get(deskId);
    const ry = desk?.obj.rotation.y ?? 0, nav = office.nav(), yaw = getYaw();
    const ax = [Math.cos(ry), -Math.sin(ry)], back = [Math.sin(ry), Math.cos(ry)];
    const seat = { x: r.pos.x, z: r.pos.z };
    const sides = [1, -1].map((sg) => ({ x: seat.x + ax[0] * SIDE_OUT * sg + back[0] * 0.2, z: seat.z + ax[1] * SIDE_OUT * sg + back[1] * 0.2 }))
      .filter((q) => !nav.isBlocked(q.x, q.z))
      .sort((a, b) => (b.x * Math.sin(yaw) + b.z * Math.cos(yaw)) - (a.x * Math.sin(yaw) + a.z * Math.cos(yaw)));
    const side = sides[0];
    if (!side) return;
    const spot = { x: side.x + back[0] * STAND_BACK, z: side.z + back[1] * STAND_BACK };
    if (nav.isBlocked(spot.x, spot.z, BODY_R) || columnInFront(spot)) return;
    spot.yaw = towardCamera(spot, p.obj.position);
    // Push the chair back to get up; it rolls in again as they sit back down.
    const chair = office.freeChair?.(deskId, true);
    const route = [{ x: side.x, z: side.z }, { x: spot.x, z: spot.z }];
    if (chair) rolls.push({ r, deskId, chair, z0: chair.position.z, k: 0, seat, sat: 0, route });
    // Read, then react: the letter goes up in front of their face for a beat, then down on the desk
    // and they slump over the news.
    const env = p.obj;
    r.temp = {
      anim: 'readpaper', t: READ_S + SLUMP_S, goal: spot, back: false, moment: 'letter', el: 0,
      side: Math.sign(Math.sin(spot.yaw - getYaw()) || 1), readYaw: getYaw() + Math.PI / 2 * Math.sign(Math.sin(spot.yaw - getYaw()) || 1), slumpYaw: spot.yaw,
      tick: (rr, d, tp) => {
        tp.el += d;
        // The sheet is angled halfway toward the camera, so it shows beside the reader's profile.
        if (!tp.sheet && tp.el < READ_S) { tp.sheet = letterSheet(); tp.sheet.rotation.y = -tp.side * Math.PI / 4; rr.char.root.add(tp.sheet); env.visible = false; }
        if (tp.el >= READ_S && tp.sheet) {
          tp.sheet.removeFromParent(); tp.sheet = null; env.visible = true;
          emote(rr, 'storm', 2.4);
        }
        if (tp.t <= d * 1.5) {
          if (tp.sheet) { tp.sheet.removeFromParent(); tp.sheet = null; env.visible = true; }
          // Back the way they came: to the side of the chair, then in.
          rr.temp = null;
          rr.path = [{ x: side.x, z: side.z }, { x: seat.x, z: seat.z }];
          return true;
        }
        rr.char.setAnim(tp.el < READ_S ? 'readpaper' : 'slump');
        // Read in profile, the sheet in front of the face; then turn toward the camera to take it in.
        tp.goal.yaw = tp.el < READ_S ? tp.readYaw : tp.slumpYaw;
        return true;
      },
    };
    // They wait in the chair until it has rolled back (updateRolls), then step out.
    if (chair) r.temp.delay = 99; else r.path = route;
  }
  // Chairs pushed back for a moment: out while the sitter is up, in once they have sat down again,
  // then merged into the desk.
  const rolls = [];
  function updateRolls(dt) {
    for (let i = rolls.length - 1; i >= 0; i--) {
      const q = rolls[i], r = q.r;
      if (!recs.has(r.id)) { office.freeChair?.(q.deskId, false); rolls.splice(i, 1); continue; }
      // Out while they wait to get up and all the time they are up; in only once they sit again, so
      // it never rolls under someone still standing.
      const want = q.route || r.temp || !r.char.seated ? 1 : 0;
      q.k += (want - q.k) * (1 - Math.exp(-dt * 9));
      q.chair.position.z = q.z0 + q.k * CHAIR_ROLL;
      if (q.route && q.k > 0.9 && r.temp?.moment === 'letter') { r.temp.delay = 0; r.path = q.route; q.route = null; }
      if (r.char.seated && !r.temp && q.k < 0.02) {
        q.sat += dt;
        if (q.sat > 0.4) { office.freeChair?.(q.deskId, false); rolls.splice(i, 1); }
      } else q.sat = 0;
    }
  }

  // The letter in hand: a sheet held up in front of the face, a red stamp showing through it.
  function letterSheet() {
    const g = new THREE.Mesh(SHEET_GEO, sheetMat());
    g.position.set(0, 0.86, 0.33);
    g.rotation.x = -0.05;
    g.userData.noAO = true;
    return g;
  }

  // Visitor chair: a visitor sits in it for as long as it is there; someone hovers nearby.
  let visitor = null;     // { obj (the prop), char, host }
  function visitorTick(p, dt) {
    if (!p) { endVisitor(); return; }
    if (lite() || !parent) {
      // Low quality: no visitor, just a nervous colleague now and then.
      if (due('visitor-lite', dt, [1, 2], [12, 18])) { const r = pickIdle(1, p.obj.position)[0]; if (r) emote(r, 'sweat', 2.2); }
      return;
    }
    if (!visitor || visitor.obj !== p.obj) {
      endVisitor();
      const pick = (a) => a[Math.floor(Math.random() * a.length)];
      const look = { skin: Math.floor(Math.random() * 6), hair: Math.floor(Math.random() * 8), hairColor: pick(VISITOR_HAIR), shirt: pick(VISITOR_SHIRT), pants: pick(VISITOR_PANTS), build: Math.floor(Math.random() * 3), accessory: pick(['none', 'none', 'glasses', 'cap', 'beanie']) };
      const c = createCharacter(look, P.metal_soft, { seed: `visitor-${Math.random()}` });
      c.setRingScale(0.0001);
      c.pickProxy.visible = false;
      c.setAnim('sit');
      parent.add(c.root);
      visitor = { obj: p.obj, char: c, host: null, hostT: 0 };
    }
    const v = visitor, o = p.obj;
    v.char.root.position.set(o.position.x, 0, o.position.z);
    v.char.root.rotation.y = o.rotation.y;
    v.char.root.visible = o.visible && o.scale.x > 0.5;
    v.char.update(dt);
    v.hostT -= dt;
    if (v.host && v.host.temp?.moment !== 'visitor') v.host = null;
    if (!v.host && v.hostT <= 0) {
      v.hostT = rnd(14, 20);
      const r = pickIdle(1, o.position)[0];
      const spots = r && ringSpots(o.position, 1.0, 1);
      if (spots?.length) {
        v.host = r;
        r.temp = { anim: 'idle', t: rnd(6, 9), goal: spots[0], back: true, moment: 'visitor', emoteT: 0.5, tick: (rr, d, tp) => { tp.emoteT -= d; if (tp.emoteT <= 0) { tp.emoteT = rnd(2.5, 3.5); emote(rr, 'sweat', 2); } return false; } };
        walkTo(r, spots[0]);
      }
    }
  }
  function endVisitor() {
    if (!visitor) return;
    visitor.char.root.removeFromParent();
    visitor.char.dispose();
    visitor = null;
  }

  // Smoke or a hot rack: someone comes over and fans it away.
  function fumes(p, dt) {
    if (!due(`fumes|${p.obj.uuid}`, dt, [2, 4], [16, 24])) return;
    // The item the fumes come from (the rack, the espresso machine): the placed item nearest the
    // effect. The effect's own box is no use; its smoke drifts a metre or more out into the room.
    new THREE.Box3().setFromObject(p.obj).getCenter(center);
    let item = null, best = Infinity;
    for (const e of office.placed.values()) { const d = Math.hypot(e.target.x - center.x, e.target.z - center.z); if (d < best) { best = d; item = e; } }
    const box = item ? new THREE.Box3().setFromObject(item.obj) : new THREE.Box3().setFromObject(p.obj);
    box.getCenter(center);
    center.y = 0;
    // Whoever is nearest notices first.
    const r = free().sort((a, b) => Math.hypot(a.pos.x - center.x, a.pos.z - center.z) - Math.hypot(b.pos.x - center.x, b.pos.z - center.z))[0];
    if (!r) return;
    if (lite()) { emote(r, 'sweat', 2); return; }
    const size = box.getSize(new THREE.Vector3());
    // On the camera's side of the fumes, a little off the view line.
    const yaw = getYaw();
    // Nearest ring round the item with a spot the camera sees clearly (not behind a desk's monitor).
    let cands = [];
    for (let k = 0; k < 5 && !cands.some(inView); k++) cands = ringSpots(center, Math.max(size.x, size.z) / 2 + 0.55 + k * 0.3, 12);
    const want = [Math.sin(yaw + 0.95), Math.cos(yaw + 0.95)], want2 = [Math.sin(yaw - 0.95), Math.cos(yaw - 0.95)];
    const score = (s) => { const dx = s.x - center.x, dz = s.z - center.z, l = Math.hypot(dx, dz) || 1; return Math.max((dx * want[0] + dz * want[1]) / l, (dx * want2[0] + dz * want2[1]) / l); };
    const spot = cands.filter(inView).sort((a, b) => score(b) - score(a))[0] ?? cands.sort((a, b) => score(b) - score(a))[0];
    if (!spot) return;
    // Facing the room, three-quarters to the camera, waving the fumes off behind them.
    spot.yaw = towardCamera(spot, center);
    r.temp = {
      anim: 'fanfrantic', t: rnd(3.5, 4.5), goal: spot, back: true, moment: 'fumes', emoteT: 0.2,
      tick: (rr, d, tp) => { tp.emoteT -= d; if (tp.emoteT <= 0) { tp.emoteT = 1.4; emote(rr, rr.char.emote === 'exclamation' ? 'sweat' : 'exclamation', 1.3); } return false; },
    };
    walkTo(r, spot);
  }

  // Pet carrier: the requester bends over it and peers in, now and then while it is down.
  function carrier(p, state, dt) {
    if (!due(`carrier|${p.obj.uuid}`, dt, [1, 2.5], [9, 14])) return;
    const subject = state?.pendingDecision?.subjectId;
    const r = (subject && free().includes(recs.get(subject))) ? recs.get(subject) : pickIdle(1, p.obj.position)[0];
    if (!r) return;
    if (lite()) { emote(r, 'heart', 2); return; }
    const at = p.obj.position, nav = office.nav();
    // Stand in front of the carrier's door (its local +x), else anywhere round it.
    const q = p.obj.quaternion ? new THREE.Vector3(1, 0, 0).applyQuaternion(p.obj.getWorldQuaternion(new THREE.Quaternion())) : new THREE.Vector3(1, 0, 0);
    const tries = [0, 0.6, -0.6, 1.2, -1.2, Math.PI];
    for (const da of tries) {
      const a = Math.atan2(q.z, q.x) + da;
      const x = at.x + Math.cos(a) * 0.75, z = at.z + Math.sin(a) * 0.75;
      if (nav.isBlocked(x, z, BODY_R)) continue;
      const spot = { x, z, yaw: Math.atan2(at.x - x, at.z - z) };
      r.temp = { anim: 'peer', t: rnd(3.5, 5), goal: spot, back: true, moment: 'carrier', stage: { beat: 'peer', target: p.obj } };
      walkTo(r, spot);
      emote(r, 'heart', 2.2);
      return;
    }
  }

  // "Take it out back" (printer_jam), staged to its music cue (public/audio/moments/printer_smash.ogg).
  // CUE times are seconds from the cue's start, which is the first step of the carry. Two people carry
  // the printer low between them to where the wreck will lie, a third following with a bat on the
  // shoulder. They set it down at the end of the verse, the bat winds up in the gap before the hook
  // and lands on each shouted word, the last blow leaves the wreck, and everyone walks off before the
  // cue ends. The moment carries its own printer, since the staged one goes as soon as the decision
  // is made.
  const CUE = { down: 8.13, wind: 9.14, hits: [10.46, 11.24, 12.98, 13.94], off: 14.4, end: 15.69 };
  let printer = null;
  let printerDue = 0;   // seconds left to find the printer and people after the decision
  const wreckObj = () => getProps?.()?.current().find((p) => p.prop === 'printer_wrecked')?.obj ?? null;
  function printerStart() {
    const at = getProps?.()?.goneAt?.('printer_jammed', 10);
    const wreck = wreckObj();
    const L = office.current?.L;
    if (!at || !wreck || !L || printer || lite() || !parent) return false;
    const near = free().sort((a, b) => Math.hypot(a.pos.x - at.x, a.pos.z - at.z) - Math.hypot(b.pos.x - at.x, b.pos.z - at.z)).slice(0, 3);
    if (near.length < 2) return false;
    const obj = printerModel();
    obj.scale.setScalar(JAM_SCALE);
    parent.add(obj);
    const size = new THREE.Box3().setFromObject(obj).getSize(new THREE.Vector3());
    obj.position.set(at.x, 0, at.z);
    const route = printerRoute(at, wreck.position, L);
    const pm = printer = {
      phase: 'gather', obj, people: near, bat: null, route, len: routeLength(route), s: 0, t: 0, cue: 0,
      side: size.x / 2 + GRIP_OUT, h: size.y, wreck, scale1: wreck.children[0]?.scale.x ?? JAM_SCALE, hit: 0, swung: -1,
    };
    pm.twists = twists(pm);
    const c = along(route, 0);
    const spots = carrySpots(pm, c);
    obj.rotation.y = carryYaw(pm);
    if (near[2]) {
      pm.bat = batHeld();
      pm.bat.rotation.set(...BAT_SHOULDER);
      near[2].char.setHeld(pm.bat);
    }
    near.forEach((r, i) => {
      r.temp = { anim: 'idle', t: 1e6, goal: spots[i], moment: 'printer', stage: { beat: 'gather', role: i < 2 ? 'carrier' : 'bat', target: obj, held: i < 2 ? obj : pm.bat } };
      walkTo(r, spots[i]);
    });
    return true;
  }
  // From the printer's spot to the wreck's: through the door first when the wreck lies outside.
  function printerRoute(at, end, L) {
    const outside = end.y < -0.05;
    const door = L.doorWorld;
    const to = outside ? door : end;
    const pts = [{ x: at.x, y: 0, z: at.z }];
    // As wide a way as there is for the pair: the printer's half-width plus a carrier either side.
    const nav = office.nav();
    let way = null;
    for (const clear of [PAIR_CLEAR, PAIR_CLEAR * 0.7, 0.35, 0]) if ((way = nav.path({ x: at.x, z: at.z }, { x: to.x, z: to.z }, clear))) break;
    for (const q of way ?? []) pts.push({ x: q.x, y: 0, z: q.z });
    if (outside) pts.push({ x: door.x, y: 0, z: door.z });
    pts.push({ x: end.x, y: end.y, z: end.z });
    return pts.filter((q, i) => i === 0 || Math.hypot(q.x - pts[i - 1].x, q.z - pts[i - 1].z) > 0.05);
  }
  // Where each of them stands for a printer at route point c: the carriers either side of it facing
  // in, the third behind it facing along the way.
  function carrySpots(pm, c) {
    const a = carryYaw(pm) + Math.PI / 2, perp = [Math.sin(a), Math.cos(a)];
    const out = [1, -1].map((k) => ({ x: c.x + perp[0] * pm.side * k, y: c.y, z: c.z + perp[1] * pm.side * k, yaw: Math.atan2(-perp[0] * k, -perp[1] * k) }));
    const b = along(pm.route, Math.max(0, pm.s - BAT_BEHIND));
    out.push({ x: b.x, y: b.y, z: b.z, yaw: Math.atan2(b.dir[0], b.dir[1]) });
    return out;
  }
  // The printer's heading at distance s: along the way (read over a stretch of it, so corners turn
  // smoothly), turned by the twist there.
  function carryYaw(pm, s = pm.s) {
    const a = along(pm.route, Math.max(0, s - 0.4)), b = along(pm.route, Math.min(pm.len, s + 0.4));
    const base = Math.hypot(b.x - a.x, b.z - a.z) > 0.05 ? Math.atan2(b.x - a.x, b.z - a.z) : Math.atan2(b.dir[0], b.dir[1]);
    return base + (pm.twists?.[Math.min(pm.twists.length - 1, Math.round(s / TWIST_STEP))] ?? 0);
  }
  // Straight across the way where both carriers fit. Near anywhere they don't, the pair carries it end
  // on instead (both then walk the way itself, which is clear), turning over a short stretch where
  // across still fits.
  function twists(pm) {
    // Desk chairs stand out past their cells on the nav grid; a carrier keeps clear of each seat.
    const chairs = [...office.placed.values()].filter((e) => e.desk?.seat).map((e) => e.desk.seat);
    const nav = office.nav();
    const clear = (x, z) => !nav.isBlocked(x, z, BODY_R) && chairs.every((c) => Math.hypot(c.x - x, c.z - z) > CHAIR_CLEAR);
    const raw = [];
    for (let s = 0; s <= pm.len + 1e-6; s += TWIST_STEP) {
      const c = along(pm.route, s), a = Math.atan2(c.dir[0], c.dir[1]) + Math.PI / 2;
      raw.push([1, -1].every((k) => clear(c.x + Math.sin(a) * pm.side * k, c.z + Math.cos(a) * pm.side * k)) ? 0 : 1);
    }
    const win = (arr, n, f) => arr.map((_, i) => f(arr.slice(Math.max(0, i - n), i + n + 1)));
    const endOn = win(raw, Math.round(END_ON_HOLD / TWIST_STEP), (xs) => Math.max(...xs));
    return win(endOn, Math.round(TWIST_EASE / TWIST_STEP), (xs) => (xs.reduce((a, x) => a + x, 0) / xs.length) * Math.PI / 2);
  }
  function batHeld() {
    const g = new THREE.Group();
    // Hangs from the hand like the sledgehammer: the handle in the fist, the barrel beyond it.
    const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.042, 0.78, 10), HANDLE_MAT);
    bat.position.y = -0.33;
    g.add(bat);
    return g;
  }
  function norm(x, z) { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; }
  // Where along the route a distance s lands: { x, y, z, dir }.
  function along(route, s) {
    for (let i = 1; i < route.length; i++) {
      const a = route[i - 1], b = route[i], len = Math.hypot(b.x - a.x, b.z - a.z);
      if (s <= len || i === route.length - 1) {
        const k = Math.max(0, Math.min(1, s / (len || 1)));
        return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k, dir: norm(b.x - a.x, b.z - a.z) };
      }
      s -= len;
    }
    return { ...route[0], dir: [0, 1] };
  }
  function routeLength(route) { let n = 0; for (let i = 1; i < route.length; i++) n += Math.hypot(route[i].x - route[i - 1].x, route[i].z - route[i - 1].z); return n; }
  // The printer's base height with its middle at the carriers' hands.
  function gripY(pm) {
    let y = 0;
    for (const r of pm.people.slice(0, 2)) for (const h of r.char.hands()) y += h.y - r.pos.y;
    return Math.max(0, y / 4 - pm.h * 0.5);
  }
  function place(r, q) { r.pos.set(q.x, q.y ?? 0, q.z); if (q.yaw != null) r.yaw = q.yaw; }
  function setAnim(r, name, restart = false) {
    if (restart) r.char.setAnim('idle');
    r.temp.anim = name;
    r.char.setAnim(name);
  }

  function printerTick(dt) {
    const pm = printer;
    if (!pm) return;
    pm.t += dt;
    if (!pm.smashed) pm.wreck.visible = false;
    if (pm.phase === 'off') { if (pm.cue + dt >= CUE.end) printerEnd(); else pm.cue += dt; return; }
    if (pm.people.some((r) => !recs.has(r.id) || r.temp?.moment !== 'printer')) { printerEnd(); return; }
    const [a, b, bat] = pm.people;
    if (pm.phase === 'gather') {
      if (pm.people.every((r) => !r.path.length) || pm.t > 12) {
        pm.phase = 'lift'; pm.t = 0;
        pm.people.forEach((r, i) => { r.temp.keepPos = true; r.temp.stage.beat = 'lift'; setAnim(r, i < 2 ? 'carryhold' : 'shoulder'); });
      }
      return;
    }
    if (pm.phase === 'lift') {
      carrySpots(pm, along(pm.route, 0)).forEach((q, i) => pm.people[i] && place(pm.people[i], q));
      pm.obj.position.y = Math.min(1, pm.t / 0.5) * gripY(pm);
      if (pm.t >= 0.6) {
        pm.phase = 'carry'; pm.t = 0;
        pm.speed = Math.min(CARRY_SPEED[1], Math.max(CARRY_SPEED[0], pm.len / CUE.down));
        pm.people.forEach((r, i) => { r.temp.stage.beat = 'carry'; setAnim(r, i < 2 ? 'carry' : 'shoulderwalk'); });
        dispatch('start', 'printer_jam');
      }
      return;
    }
    pm.cue += dt;
    const t = pm.cue;
    if (pm.phase === 'carry') {
      pm.s = Math.min(pm.len, pm.s + pm.speed * dt);
      const c = along(pm.route, pm.s);
      carrySpots(pm, c).forEach((q, i) => pm.people[i] && place(pm.people[i], q));
      pm.obj.position.set(c.x, c.y + gripY(pm), c.z);
      pm.obj.rotation.y = carryYaw(pm);
      if (pm.s >= pm.len && t >= CUE.down - 0.5) {
        // Set it down, step back from it, and the bat comes up to its spot.
        pm.phase = 'down'; pm.t = 0; pm.end = c;
        pm.from = pm.people.map((r) => ({ x: r.pos.x, z: r.pos.z }));
        pm.watch = watchSpots(pm, c);
        pm.swingSpot = swingSpot(pm, c);
        a.temp.stage.beat = b.temp.stage.beat = 'set';
        setAnim(a, 'idle'); setAnim(b, 'idle');
        if (bat) { setAnim(bat, 'shoulderwalk'); bat.temp.stage = { beat: 'ready', role: 'bat', held: pm.bat, target: pm.obj }; }
      }
      return;
    }
    if (pm.phase === 'down') {
      const k = Math.min(1, pm.t / 0.6), e = k * k * (3 - 2 * k);
      const c = pm.end;
      pm.obj.position.y = c.y + gripY(pm) * (1 - e);
      pm.obj.scale.setScalar(JAM_SCALE + (pm.scale1 - JAM_SCALE) * e);
      const ang = carryYaw(pm) + Math.PI / 2, perp = [Math.sin(ang), Math.cos(ang)];
      // The carriers step round behind it, as the camera sees it, to watch.
      const kw = Math.min(1, pm.t / WATCH_S), ew = kw * kw * (3 - 2 * kw);
      [a, b].forEach((r, i) => {
        const to = pm.watch?.[i] ?? { x: pm.from[i].x + perp[0] * 0.45 * (i ? -1 : 1), z: pm.from[i].z + perp[1] * 0.45 * (i ? -1 : 1) };
        r.pos.x = pm.from[i].x + (to.x - pm.from[i].x) * ew; r.pos.z = pm.from[i].z + (to.z - pm.from[i].z) * ew;
        if (r.temp.anim !== (kw < 1 ? 'walk' : 'idle')) setAnim(r, kw < 1 ? 'walk' : 'idle');
        if (kw >= 1) r.temp.stage.beat = 'watch';
      });
      if (bat) {
        const to = pm.swingSpot;
        bat.pos.x = pm.from[2].x + (to.x - pm.from[2].x) * e; bat.pos.z = pm.from[2].z + (to.z - pm.from[2].z) * e;
        bat.yaw = Math.atan2(c.x - bat.pos.x, c.z - bat.pos.z);
        if (k >= 1 && bat.temp.anim !== 'shoulder') setAnim(bat, 'shoulder');
      }
      // Both carriers turn to watch it get what it deserves.
      [a, b].forEach((r) => { r.yaw = angleTo(r, c); });
      if (k >= 1 && pm.t >= WATCH_S && t >= CUE.wind) { pm.phase = 'smash'; pm.t = 0; if (bat) bat.temp.stage.beat = 'smash'; }
      return;
    }
    if (pm.phase === 'smash') {
      const next = CUE.hits[pm.hit];
      // Each blow: the swing starts so its downstroke lands on the word; between blows, back on the shoulder.
      if (bat && next != null && pm.swung < pm.hit && t >= next - SWING_HIT) { pm.swung = pm.hit; pm.bat.rotation.set(0, 0, 0); setAnim(bat, 'batswing', true); }
      if (next != null && t >= next) {
        pm.hit++;
        const c = pm.end;
        wallDust(c.x, c.y + 0.25, c.z);
        pm.squash = 1;
        [a, b].forEach((r) => setAnim(r, 'celebrate', true));
        if (pm.hit === CUE.hits.length) {
          // The last blow: what is left is the wreck.
          pm.smashed = true;
          pm.wreck.visible = true;
          pm.obj.visible = false;
          wallDust(c.x + 0.2, c.y + 0.15, c.z - 0.2);
        }
      }
      const after = CUE.hits[pm.hit - 1];
      if (bat && after != null && pm.swung === pm.hit - 1 && t >= after + 0.2 && (CUE.hits[pm.hit] ?? Infinity) - SWING_HIT > t + 0.1 && bat.temp.anim !== 'shoulder') {
        pm.bat.rotation.set(...BAT_SHOULDER);
        setAnim(bat, 'shoulder');
      }
      if (pm.squash > 0) { pm.squash = Math.max(0, pm.squash - dt / 0.25); pm.obj.scale.y = pm.scale1 * (1 - 0.25 * Math.sin(pm.squash * Math.PI)); }
      if (t >= CUE.off) { pm.phase = 'off'; pm.t = 0; release(pm); }
      return;
    }
  }
  // Where the bat swings from: beside the printer as the camera sees it, so the swing shows in
  // profile over it, nothing stands in front, and it is clear of furniture, chairs and the carriers.
  // Whether someone can stand at q round the set-down printer at c.
  function standTest(pm) {
    const nav = office.nav();
    const chairs = [...office.placed.values()].filter((e) => e.desk?.seat).map((e) => e.desk.seat);
    // The wreck (hidden until the last blow) blocks the nav grid round its spot, and the prop is
    // placed with room clear around it, so inside its footprint only chairs are tested.
    const wreckBox = new THREE.Box3().setFromObject(pm.wreck).expandByScalar(0.35);
    return (q) => !((!wreckBox.containsPoint(_q.set(q.x, 0.1, q.z)) && nav.isBlocked(q.x, q.z, BODY_R)) || chairs.some((h) => Math.hypot(h.x - q.x, h.z - q.z) < CHAIR_CLEAR));
  }
  // Two spots for the carriers to watch from: behind the printer as the camera sees it where there is
  // room, clear, in view, with nothing in front on screen and apart from each other. Null when there
  // are no two such spots.
  function watchSpots(pm, c) {
    const ok = standTest(pm), away = getYaw() + Math.PI;
    const front = [...(office.current.columns ?? []).map((col) => ({ x: col.x, z: col.z, r: COLUMN_SCREEN_R, top: col.h })), { x: c.x, z: c.z, r: 0.35, top: 0.55 }];
    // Out of view or behind something on screen costs 2 each; the pair with the least cost wins.
    const cost = (q) => (inView(q) ? 0 : 2) + (screenBlocked(q, front) ? 2 : 0);
    const cands = [];
    for (const r of [WATCH_AT, WATCH_AT + 0.3]) for (const d of [0.7, -0.7, 0.45, -0.45, 1, -1, 1.3, -1.3, 0.2, -0.2, 1.7, -1.7]) {
      const q = { x: c.x + Math.sin(away + d) * r, z: c.z + Math.cos(away + d) * r };
      if (ok(q)) cands.push({ q, cost: cost(q) });
    }
    let best = null, bestCost = Infinity;
    for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
      const [p, q] = [cands[i].q, cands[j].q];
      if (Math.hypot(p.x - q.x, p.z - q.z) < 0.8) continue;
      const total = cands[i].cost + cands[j].cost + (screenBlocked(p, [{ ...q, r: 0.3, top: 1.1, either: true }]) ? 1 : 0);
      if (total < bestCost) { best = [p, q]; bestCost = total; }
      if (!total) break;
    }
    if (!best) return null;
    // Each carrier to the nearer spot.
    const [p, q] = best, [a, b] = pm.from;
    const cross = Math.hypot(a.x - p.x, a.z - p.z) + Math.hypot(b.x - q.x, b.z - q.z) > Math.hypot(a.x - q.x, a.z - q.z) + Math.hypot(b.x - p.x, b.z - p.z);
    return cross ? [q, p] : [p, q];
  }
  function swingSpot(pm, c) {
    const away = getYaw() + Math.PI;
    const ang = carryYaw(pm) + Math.PI / 2, perp = [Math.sin(ang), Math.cos(ang)];
    const carriers = pm.watch ?? [1, -1].map((k) => ({ x: c.x + perp[0] * (pm.side + 0.45) * k, z: c.z + perp[1] * (pm.side + 0.45) * k }));
    const ok = standTest(pm), blocked = (q) => !ok(q);
    // Anything in the way on screen costs 2 (a column, the printer, or out of view), sharing a screen
    // strip with a carrier costs 1; the first spot with the least cost wins.
    const cols = (office.current.columns ?? []).map((col) => ({ x: col.x, z: col.z, r: COLUMN_SCREEN_R, top: col.h }));
    const strips = carriers.map((p) => ({ ...p, r: 0.3, top: 1.1, either: true }));
    let best = null, bestCost = Infinity;
    for (const d of [1.3, -1.3, 1, -1, 1.7, -1.7, 0.6, -0.6, 2.2, -2.2, 0, Math.PI]) {
      const q = { x: c.x + Math.sin(away + d) * SWING_AT, z: c.z + Math.cos(away + d) * SWING_AT };
      if (blocked(q) || carriers.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < 0.6)) continue;
      const cost = (inView(q) ? 0 : 2) + (screenBlocked(q, [...cols, { x: c.x, z: c.z, r: 0.35, top: 0.55 }]) ? 2 : 0) + (screenBlocked(q, strips) ? 1 : 0);
      if (cost < bestCost) { best = q; bestCost = cost; }
      if (!cost) break;
    }
    return best ?? { x: c.x - c.dir[0] * SWING_AT, z: c.z - c.dir[1] * SWING_AT };
  }
  // Whether anything in blockers ({ x, z, r, top }) stands in front of a person at q on screen: the
  // same test the office uses to fade a column over someone. `either` blockers also count from behind
  // (two people in one screen strip read as a tangle whichever is in front).
  const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _p = new THREE.Vector3(), _q = new THREE.Vector3();
  function screenBlocked(q, blockers) {
    const cam = getCamera?.();
    if (!cam) return columnInFront(q);
    _q.set(q.x, 0.5, q.z);
    const dq = cam.position.distanceTo(_q);
    _p.copy(_q).project(cam);
    return blockers.some((b) => {
      _a.set(b.x, 0, b.z).project(cam);
      _b.set(b.x, b.top, b.z).project(cam);
      const half = (b.r * Math.abs(_b.y - _a.y)) / b.top + 0.02;
      if (Math.abs(_p.x - _a.x) > half + 0.03 || _p.y < _a.y - 0.02 || _p.y > _b.y + 0.02) return false;
      return b.either || cam.position.distanceTo(_q.set(b.x, 0.5, b.z)) < dq;
    });
  }
  function angleTo(r, c) { return Math.atan2(c.x - r.pos.x, c.z - r.pos.z); }
  // Everyone back to what they were doing, pleased with themselves; from outside, in through the door.
  function release(pm) {
    const door = office.current.L.doorWorld;
    pm.people.forEach((r, i) => {
      if (r === pm.people[2]) r.char.setHeld(null);
      r.temp = null;
      emote(r, 'heart', 2.5 + i * 0.3);
      const outside = r.pos.y < -0.05;
      if (outside) r.pos.y = 0;
      if (r.goal) walkTo(r, r.goal);
      if (outside) r.path.unshift({ x: door.x, z: door.z });
    });
  }
  function printerEnd() {
    if (!printer) return;
    const pm = printer;
    printer = null;
    pm.wreck.visible = true;
    pm.obj.removeFromParent();
    pm.bat?.traverse((o) => o.geometry?.dispose());
    for (const r of pm.people) {
      if (r.temp?.moment !== 'printer') continue;
      if (r === pm.people[2]) r.char.setHeld(null);
      r.temp = null;
      r.pos.y = 0;
      if (r.goal) walkTo(r, r.goal);
    }
    dispatch('end', 'printer_jam');
  }
  // Moment captions (ui): hitl:moment { phase, id, key }.
  let momentSeq = 0, momentId = null;
  function dispatch(phase, key) {
    if (typeof window === 'undefined') return;
    if (phase === 'start') momentId = `${key}-${++momentSeq}`;
    window.dispatchEvent(new CustomEvent('hitl:moment', { detail: { phase, id: momentId, key } }));
  }

  function update(dt, state) {
    printerTick(dt);
    if (printerDue > 0) { printerDue -= dt; if (printerStart()) printerDue = 0; }
    for (const [k, t] of resolvedT) { if (t - dt <= 0) { resolvedT.delete(k); resolved.delete(k); } else resolvedT.set(k, t - dt); }
    updateBursts(dt);
    updateRolls(dt);
    const props = getProps();
    if (!props || !office.current) return;
    const cur = props.current();
    hammerTick(cur.find((p) => p.prop === 'sledgehammer') ?? null, state);
    visitorTick(cur.find((p) => p.prop === 'visitor_chair') ?? null, dt);
    // The carrier went (the pet came out, or the answer was no): nobody keeps peering at the floor,
    // even while a standup or party holds the room.
    if (!cur.some((p) => p.prop === 'pet_carrier')) {
      for (const r of recs.values()) if (r.temp?.moment === 'carrier') { r.temp = null; if (r.goal) walkTo(r, r.goal); }
    }
    if (isBusy()) return;
    for (const p of cur) if (p.prop === 'pet_carrier') carrier(p, state, dt);
    for (const p of cur) if (p.prop === 'envelope' || p.prop === 'envelope_thick') letter(p, dt);
    for (const p of cur) if (p.prop === 'smoke_puff' || p.prop === 'rack_hot') fumes(p, dt);
    for (const p of props.current()) if (p.prop === 'pizza_boxes') pizza(p, dt);
    if (props.overlay) screens(props.overlay, dt);
    else for (const k of [...timers.keys()]) if (k.startsWith('screen|')) timers.delete(k);
  }

  function reset() { printerEnd(); printerDue = 0; rolls.length = 0; stopHammer(); endVisitor(); timers.clear(); resolved.clear(); resolvedT.clear(); }

  // What a moment says about someone now, for the staging probe (probe.js): the moment, its beat
  // ('walk' while they are on the way), the target they deal with, what they hold, the effect source.
  function staging(id) {
    const r = recs.get(id), tp = r?.temp;
    if (!tp?.moment) return null;
    const st = tp.stage ?? {};
    return { moment: tp.moment, beat: r.path.length ? 'walk' : tp.delay > 0 ? 'wait' : st.beat ?? null, role: st.role ?? null, target: st.target ?? null, held: st.held ?? null, source: st.source ?? null };
  }

  return { update, reset, decided, staging, kinds: KINDS, get printerState() { return printer; }, get printer() { return printer && { phase: printer.phase, cue: +printer.cue.toFixed(2), s: +printer.s.toFixed(2), len: +printer.len.toFixed(2), hit: printer.hit, ids: printer.people.map((r) => r.id), at: printer.people.map((r) => [+r.pos.x.toFixed(2), +r.pos.y.toFixed(2), +r.pos.z.toFixed(2)]) }; }, get hammer() { return hammer && { id: hammer.r.id, phase: hammer.phase, path: hammer.r.path.length, temp: hammer.r.temp && { anim: hammer.r.temp.anim, t: +hammer.r.temp.t.toFixed(2), moment: hammer.r.temp.moment } }; }, set full(on) { full = !!on; }, get active() { return [...recs.values()].filter((r) => r.temp?.moment).map((r) => [r.id, r.temp.moment]); } };
}
