import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { createCharacter } from './character.js';

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
const READ_S = 2.2, SLUMP_S = 2.0;   // the letter moment: reading it, then the reaction
const CHAIR_ROLL = 0.5;      // how far a chair rolls back when someone gets up from it
const SIDE_OUT = 0.62;       // how far sideways someone steps out of their chair
const STAND_BACK = 0.8;      // then how far back into the aisle, clear of the chair
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
      r.temp = { anim: 'eat', t: rnd(...PIZZA.dur), goal: spots[i], back: true, moment: 'pizza' };
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
      if (!lite()) r.temp = { anim: 'recoil', t: rnd(...SCREEN.dur), keepPos: true, delay: rnd(0, 0.8), moment: 'screen' };
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
  function wallSpot(from) {
    const L = office.current.L, nav = office.nav();
    // Along the back wall z, nearest the hammer, where a person can stand facing it.
    for (let d = 0; d < L.W; d += 0.35) for (const s of [1, -1]) {
      const x = from.x + s * d, z = -L.D / 2 + 0.7;
      if (Math.abs(x) > L.W / 2 - 0.6) continue;
      if (!nav.isBlocked(x, z, BODY_R)) return { x, z, yaw: Math.PI };
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
      r.temp = { anim: 'peer', t: 1.2, goal: pick, moment: 'hammer' };
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
      r.temp = { anim: 'shoulder', t: 1e6, goal: w, moment: 'hammer' };
      walkTo(r, w);
      h.wall = w;
    } else if (h.phase === 'carry' && !r.path.length) {
      h.phase = 'hold';
      // On the shoulder: the handle across it and the head down behind the back.
      h.held.rotation.set(2.7, 0, 0.45);
      emote(r, 'lightbulb', 2);
    }
    if (knocked && h.phase === 'hold') {
      h.phase = 'swing';
      h.held.rotation.set(0, 0, 0);
      r.temp = { anim: 'swing', t: 3.3, goal: h.wall, moment: 'hammer', back: true };
      h.swingT = 0;
    }
    if (h.phase === 'swing') {
      h.swingT += 1 / 30;
      const hit = Math.floor((h.swingT - 0.6) / 1.1);
      if (hit >= 0 && hit !== h.lastHit) { h.lastHit = hit; wallDust(h.wall.x + 0.35, 1.0, -office.current.L.D / 2 + 0.08); }
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
  // Chairs pushed back for a moment: out while the sitter is up, in as they come back to the seat,
  // merged into the desk again once they have sat down.
  const rolls = [];
  function updateRolls(dt) {
    for (let i = rolls.length - 1; i >= 0; i--) {
      const q = rolls[i], r = q.r;
      if (!recs.has(r.id)) { office.freeChair?.(q.deskId, false); rolls.splice(i, 1); continue; }
      const near = Math.hypot(r.pos.x - q.seat.x, r.pos.z - q.seat.z);
      const returning = !r.temp && r.path.length <= 1;
      const want = r.char.seated && !r.temp ? 0 : returning && near < 0.3 ? 0 : 1;
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
      r.temp = { anim: 'peer', t: rnd(3.5, 5), goal: spot, back: true, moment: 'carrier' };
      walkTo(r, spot);
      emote(r, 'heart', 2.2);
      return;
    }
  }

  function update(dt, state) {
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

  function reset() { rolls.length = 0; stopHammer(); endVisitor(); timers.clear(); resolved.clear(); resolvedT.clear(); }

  return { update, reset, decided, get hammer() { return hammer && { id: hammer.r.id, phase: hammer.phase, path: hammer.r.path.length, temp: hammer.r.temp && { anim: hammer.r.temp.anim, t: +hammer.r.temp.t.toFixed(2), moment: hammer.r.temp.moment } }; }, set full(on) { full = !!on; }, get active() { return [...recs.values()].filter((r) => r.temp?.moment).map((r) => [r.id, r.temp.moment]); } };
}
