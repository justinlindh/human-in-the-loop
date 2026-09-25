import * as THREE from 'three';
import { PALETTE as P } from './palette.js';
import { createCharacter } from './character.js';
import { EVENTS } from '../data/events.js';

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
//          walls come down (the 'Open-plan buzz' modifier appears) they swing and dust flies.
//   letter the envelope on a desk: its sitter sighs over it now and then.
//   visitor the visitor chair (first user test): a visitor sits in it while someone hovers, sweating.
//   fumes  smoke or a hot rack: someone comes over and fans it away.
//   carrier the pet carrier: the requester bends over it and peers in; an adopted pet steps out of
//          it (pets.js).

function rnd(a, b) { return a + Math.random() * (b - a); }

// How willing someone is to wander off for a moment, by what they are assigned to.
const IDLE_W = { idle: 4, maintenance: 1, support: 0.8, sales: 0.8, marketing: 0.8, security: 0.6, project: 0.5, mentor: 0.4, oversight: 0.3, hardProblem: 0.2 };
const BODY_R = 0.22;
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

export function createMoments({ office, recs, walkTo, emote, getProps, fx = null, parent = null, getYaw = () => Math.PI / 4, isBusy = () => false, low = () => false }) {
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
    // The walls came down: the decisionResolved event says so; until sim emits it, the fresh
    // 'Open-plan buzz' modifier is the tell.
    const knocked = resolved.get('open_plan_office') === 'Knock them down'
      || (state?.modifiers ?? []).some((mo) => mo.label === 'Open-plan buzz' && (mo.untilWeek ?? 0) > (state.week ?? 0) + 25);
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

  // Choices made, by event id, from decisionResolved ({ eventId, choice }), choice given as an index
  // or a label. Kept briefly: the moments that act on a choice read it within a few frames.
  const resolved = new Map(), resolvedT = new Map();
  function decided(e) {
    const ch = typeof e.choice === 'number' ? EVENTS[e.eventId]?.choices?.[e.choice]?.label : e.choice?.label ?? e.choice;
    resolved.set(e.eventId, ch ?? null);
    resolvedT.set(e.eventId, 20);
  }

  // Envelope on a desk: whoever sits there sighs over it now and then.
  function letter(p, dt) {
    if (!due(`letter|${p.obj.uuid}`, dt, [2, 4], [10, 15])) return;
    const deskId = p.obj.userData.follow?.deskId;
    const r = [...recs.values()].find((x) => x.seat === deskId);
    if (!r || !free().includes(r) || !r.char.seated) return;
    emote(r, 'sweat', 2.4);
    if (!lite()) r.temp = { anim: 'sigh', t: 3.2, keepPos: true, moment: 'letter' };
  }

  // Visitor chair: a visitor sits in it for as long as it is there; someone hovers nearby.
  let visitor = null;     // { obj (the prop), char, host }
  function visitorTick(p, dt) {
    if (!p) { endVisitor(); return; }
    if (lite() || !parent) return;
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
    const box = new THREE.Box3().setFromObject(p.obj);
    // The rack effect is built round its rack, the smoke above its item: aim at the floor below.
    box.getCenter(center);
    center.y = 0;
    const r = pickIdle(1, center)[0];
    if (!r) return;
    if (lite()) { emote(r, 'sweat', 2); return; }
    const size = box.getSize(new THREE.Vector3());
    // On the camera's side, turned a little off the view line, so the fanning shows in profile.
    const yaw = getYaw();
    const cands = ringSpots(center, Math.max(size.x, size.z) / 2 + 0.55, 12);
    const want = [Math.sin(yaw + 0.95), Math.cos(yaw + 0.95)], want2 = [Math.sin(yaw - 0.95), Math.cos(yaw - 0.95)];
    const score = (s) => { const dx = s.x - center.x, dz = s.z - center.z, l = Math.hypot(dx, dz) || 1; return Math.max((dx * want[0] + dz * want[1]) / l, (dx * want2[0] + dz * want2[1]) / l); };
    const spot = cands.sort((a, b) => score(b) - score(a))[0];
    if (!spot) return;
    r.temp = { anim: 'fan', t: rnd(3.5, 5), goal: spot, back: true, moment: 'fumes' };
    walkTo(r, spot);
    emote(r, 'sweat', 2);
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
    const props = getProps();
    if (!props || !office.current) return;
    const cur = props.current();
    hammerTick(cur.find((p) => p.prop === 'sledgehammer') ?? null, state);
    visitorTick(cur.find((p) => p.prop === 'visitor_chair') ?? null, dt);
    if (isBusy()) return;
    for (const p of cur) if (p.prop === 'pet_carrier') carrier(p, state, dt);
    for (const p of cur) if (p.prop === 'envelope' || p.prop === 'envelope_thick') letter(p, dt);
    for (const p of cur) if (p.prop === 'smoke_puff' || p.prop === 'rack_hot') fumes(p, dt);
    // The carrier went (the pet came out, or the answer was no): nobody keeps peering at the floor.
    if (!cur.some((p) => p.prop === 'pet_carrier')) {
      for (const r of recs.values()) if (r.temp?.moment === 'carrier') { r.temp = null; if (r.goal) walkTo(r, r.goal); }
    }
    for (const p of props.current()) if (p.prop === 'pizza_boxes') pizza(p, dt);
    if (props.overlay) screens(props.overlay, dt);
    else for (const k of [...timers.keys()]) if (k.startsWith('screen|')) timers.delete(k);
  }

  function reset() { stopHammer(); endVisitor(); timers.clear(); resolved.clear(); resolvedT.clear(); }

  return { update, reset, decided, get hammer() { return hammer && { id: hammer.r.id, phase: hammer.phase, path: hammer.r.path.length, temp: hammer.r.temp && { anim: hammer.r.temp.anim, t: +hammer.r.temp.t.toFixed(2), moment: hammer.r.temp.moment } }; }, set full(on) { full = !!on; }, get active() { return [...recs.values()].filter((r) => r.temp?.moment).map((r) => [r.id, r.temp.moment]); } };
}
