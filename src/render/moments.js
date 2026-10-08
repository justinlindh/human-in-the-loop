import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { pickSpot, spotDebug } from './spots.js';
import { PALETTE as P } from './palette.js';
import { createCharacter } from './character.js';
import { wardrobeEra } from './wardrobe.js';
import { printerModel, visitorChairModel, QUIET_JAM_S } from './props.js';
import { MOMENT_KINDS } from './spotlight-kinds.js';
import { between, draw } from './rand.js';
import { createY2kMoment } from './y2k.js';
import { createLeaderScreen, SCREEN_W, SCREEN_H } from './leader-screen.js';

// Staff moments around staged props (#284): brief reactions by idle people to what a decision put
// in the office. Render only; they borrow the perk visit mechanism (r.temp), so walking goes through
// the walking grid and people return to their seat afterwards.
//
// createMoments({ office, recs, walkTo, emote, getProps, note, isBusy, low }) -> { update(dt), reset() }
// note(id, what, detail) records a refusal (a moment that could not start) in the ownership trace.
//   getProps() -> props.js handle (current(), overlay) or null
//   isBusy()   -> true while a standup or party owns the room: no moments start then
//   low()      -> Low quality: moments shrink to an emote, nobody walks
//
// Moments:
//   pizza  pizza_boxes up: two or three idle people gather round the box and eat, then go back.
//   screen a screen takeover: people at their desks recoil from their monitors with an exclamation.
//   hammer the sledgehammer (open plan): an all-hands screen on the back wall drones at a deadpan office while
//          the subject waits across the room with the hammer; on the choice they run in, spin and throw it
//          through the screen (a white flash and shards, skipped on Low) and the office looks shocked; then
//          they swing at the wall if it comes down, else carry the hammer back. With no room for the
//          screen, they hold it by the wall and only swing.
//   letter the envelope on a desk: its sitter sighs over it now and then.
//   visitor the visitor chair (first user test): a visitor sits in it while someone hovers, sweating.
//   fumes  smoke or a hot rack: someone comes over and fans it away.
//   carrier the pet carrier: the requester bends over it and peers in; an adopted pet steps out of
//          it (pets.js).

// Who a moment picks, where its ring starts and how long it runs come from the seeded stream.
const rnd = (a, b) => between(a, b, 'moments');

// How willing someone is to wander off for a moment, by what they are assigned to.
const IDLE_W = { idle: 4, maintenance: 1, support: 0.8, sales: 0.8, marketing: 0.8, security: 0.6, project: 0.5, mentor: 0.4, oversight: 0.3, hardProblem: 0.2 };
const BODY_R = 0.22;
// The moments this module plays, for checks that need to know what exists (blender/checks/stage.mjs).
const KINDS = ['pet', 'robot', 'pizza', 'screen', 'hammer', 'carrier', 'printer', 'visitor', 'letter', 'fumes', 'growth', 'company_party', 'respond', 'y2k', 'deal', 'fired', 'click', 'music', 'ai_interview'];
const READ_S = 2.2, SLUMP_S = 2.0;   // the letter moment: reading it, then the reaction
const CHAIR_ROLL = 0.5;      // how far a chair rolls back when someone gets up from it
const SIDE_OUT = 0.62;       // how far sideways someone steps out of their chair
const SIDE_SQUEEZE = 0.5;    // in a row of desks side by side: out between their chair and the next
const STAND_BACK = 0.8;      // then how far back into the aisle, clear of the chair
const TAKE_IT_OUT = 0;       // printer_jam's 'Take it out back' choice index
const CARRY_SPEED = [0.5, 3];  // metres a second: the printer carry takes the cue's verse, within these
const PAIR_CLEAR = 0.7;      // metres a printer carry keeps from furniture, either side of its way
const GRIP_OUT = 0.2;        // how far each carrier stands out from the printer's side
const WALL_STEP_OUT = 0.9;   // a printer against a wall is first carried this far straight out from it
const BAT_BEHIND = 0.9;      // the one with the bat follows this far behind the printer
const BAT_ASIDE = 0.5;       // and, before it has gone that far, stands this far out past a carrier
const LIFT_STEP_S = 0.4;     // seconds the carriers take to settle onto their grips as they lift
const COLUMN_SCREEN_R = 0.45;  // a column's half-width on screen for staging: its corner-on width plus a body's
const WATCH_AT = 1.05, WATCH_S = 1;   // where the carriers watch from (metres off the printer), and how long they take to get there
// Room for a sledgehammer at the wall: furniture between lowY and highY within m metres of the spot
// is in the swing's way; the search starts startM toward the camera's side of the hammer.
// carryClear: the clearances its carrier's route tries to keep from furniture, widest first.
const HAMMER_ROOM = { lowY: 0.35, highY: 1.4, m: 0.65, startM: 1.2, carryClear: [0.55, 0.45, 0.4, 0.3, 0.25] };
const FAN_SIDE = 1.8;        // radians off the camera line to either side where a fanner stands
const FAN_TURN = 1.0;        // radians a fanner faces off the source, toward the camera
const CHEAT_TURN = 0.5;      // radians the consultants' scene turns off face-to-face toward the camera
const OFF_DOOR_NEAR = 2.5;   // metres from the door within which a staged interview moves in off its path
const FAR_TURN = 0.44;       // radians a ring spot's facing may turn off its centre toward the camera
const SWING_AT = 0.9;        // and swings from this far off it
const JAM_SCALE = 1.2;       // the jammed printer's scale as staged (props.js)
const BAT_SHOULDER = [Math.PI, 0, -0.4];   // the bat's turn in the hand, resting back over the shoulder
const HAMMER_SHOULDER = [2.8, 0, 0.43];   // the sledgehammer's, carried the same way, its head out past the shoulder, where it still shows over a walker coming toward the camera
const SHOULDER_UP_S = 0.3;  // seconds of walking before the hammer goes up on the shoulder, once the arm is there
const CHAIR_CLEAR = 0.65;   // metres from a desk seat a carrier keeps: the chair reaches about 0.36 from it, plus a body
const TWIST_STEP = 0.1, END_ON_HOLD = 0.8, TWIST_EASE = 0.3;   // metres: turn samples, how far an end-on stretch reaches, and its easing
const SETTLE_S = 0.5;        // the visitor's cast waits this long before setting off
const SEAT_LOCAL_Z = 0.2;     // a desk seat's distance in front of the desk's centre, in the desk's frame
const BEHIND_RAD = 2.1;       // how far off a seated visitor's facing counts as behind their back
const SEAT_BACK = 0.75;       // how far someone backs out of a desk seat before walking off
const EXPLAIN_CLEAR = 0.32;  // room round the spot beside the visitor where a founder leans in to explain
const REACT_S = 6;           // how long the visitors stay once the choice is in, for the reaction
const VISITOR_EXPECT_S = REACT_S + 10;   // the visitors' play once they sit, then the reaction
const PRINTER_GATHER_S = 8;  // the carriers walking to the printer and lifting it, before its cue
const FLINCH_S = 0.9;        // the founders' flinch on 'Watch in silence'
const SWING_HIT = 0.605;     // seconds from the start of the 'batswing' pose to its blow (character.js)
const KNOCK_DOWN = 0;        // open_plan_office's 'Knock them down' choice index
// The all-hands screen on its floor stand: its centre's height and its distance out from the wall (metres).
const SCREEN_Y = 1.62, SCREEN_OUT = 0.35;
// The throw: metres off the wall spot where the run ends, and further back from there where the
// subject waits (each tried in order, at these sideways offsets), the spin and flight seconds, the
// flight's rise and tumble, furniture taller than tallY and columns nearer than columnR in its way,
// how long the room reacts, and who stares (up to `watchers` people within stareR metres of the
// screen; seated ones turned further than seatedTurn from it stand up standBack behind the chair,
// the rest swivel up to `swivel`). The post-throw swing keeps besideM of wall clear of the
// screen's edge and is at most swingNear metres off (else it lands on the wreck), and the hammer's
// head swaps sides once the camera is flipSide off square.
const THROW = { from: [2.4, 2.0, 2.8, 3.2], poise: [2.2, 1.8, 2.6, 1.4, 3.0], side: [0, 0.6, -0.6, 1.2, -1.2], spinS: 0.85, flightS: 0.5, arc: 0.5, tumble: Math.PI * 2.5, tallY: 1.5, columnR: 0.45, react: 1.6, watchers: 8, stareR: 9, seatedTurn: 1.6, swivel: 0.6, standBack: 0.75, besideM: 0.6, swingNear: 3.5, flipSide: 0.25 };
// Where the thrown hammer comes to rest (`out` metres from the wall spot into the room, in front of
// the stand's foot) and where it is picked up from (`pick` metres out).
const HAMMER_LAND = { out: 0.05, pick: 0.6 };
const WRECK_S = 8;          // seconds the broken screen stays on the wall after the moment
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
// The hearing summons held up instead of a sheet: the official-red envelope itself, face out, with
// its white address label and gold seal (the same design as the one on the desk, props.js).
const SUMMONS_GEO = new THREE.PlaneGeometry(0.44, 0.3);
let summonsMatCache = null;
function summonsMat() {
  if (summonsMatCache) return summonsMatCache;
  const c = document.createElement('canvas'); c.width = 170; c.height = 115;
  const x = c.getContext('2d');
  x.fillStyle = P.summons_red; x.fillRect(0, 0, 170, 115);
  x.strokeStyle = P.summons_red_dark; x.lineWidth = 4; x.beginPath(); x.moveTo(0, 0); x.lineTo(85, 63); x.lineTo(170, 0); x.stroke();
  x.fillStyle = P.paper; x.fillRect(20, 67, 78, 34);
  x.fillStyle = P.ink; for (let i = 0; i < 3; i++) x.fillRect(26, 73 + i * 9, 60 - i * 10, 5);
  x.fillRect(112, 72, 40, 9);
  x.fillStyle = P.gold; x.beginPath(); x.arc(85, 63, 13, 0, Math.PI * 2); x.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  summonsMatCache = new THREE.MeshStandardMaterial({ map: t, side: THREE.DoubleSide, roughness: 0.8 });
  return summonsMatCache;
}

// A visitor's look varies from visit to visit, from everyday colours (see visitorLook).
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

// A small deterministic random stream from a string (FNV-1a hash seeding mulberry32).
function seededRand(key) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619) >>> 0;
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function createMoments({ office, recs, walkTo, emote, getProps, note = () => {}, fx = null, parent = null, getYaw = () => Math.PI / 4, getCamera = null, spotlights = null, isBusy = () => false, low = () => false }) {
  const debug = spotDebug(office);
  const choose = (at, moment, search, options) => pickSpot(at, {
    debug, moment, search,
    checks: {
      clear: (q) => !office.nav().isBlocked(q.x, q.z, BODY_R),
      chairClear: (q) => [...office.placed.values()].every((e) => !e.desk?.seat || Math.hypot(e.desk.seat.x - q.x, e.desk.seat.z - q.z) >= CHAIR_CLEAR),
      inView: (q) => inView(q),
      noColumn: (q) => !columnInFront(q),
      bothViews: (q) => inView(q) && inView(q, { turn: Math.PI / 2 }),
      ...options.checks,
    },
    ...Object.fromEntries(Object.entries(options).filter(([k]) => k !== 'checks')),
  });
  const timers = new Map();   // moment key -> seconds until it may start again
  let full = false;           // checks: run full moments even at Low quality
  const lite = () => !full && low();

  // People who could take part: in the office, standing still or seated, not already doing something.
  // Who a moment may take: placed, in view, standing still, and doing nothing that matters. A party
  // or celebration pose counts as nothing: it would hold everyone through a decision freeze (which
  // stops it running out), and the moment would find nobody.
  const posing = (t) => !t.moment && t.anim === 'celebrate';
  function free() {
    return [...recs.values()].filter((r) => r.mode === 'placed' && !r.hidden && (!r.temp || posing(r.temp)) && !r.path.length && r.staff.mood !== 'away');
  }
  // near: a point; people closer to it are much likelier, so moments start without a long walk.
  function pickIdle(n, near = null) {
    const pool = free();
    const out = [];
    while (out.length < n && pool.length) {
      const w = pool.map((r) => (IDLE_W[r.staff.assignment?.type ?? 'idle'] ?? 0.5) / (near ? 1 + Math.hypot(r.pos.x - near.x, r.pos.z - near.z) ** 2 / 4 : 1));
      let k = draw('moments') * w.reduce((a, b) => a + b, 0), i = 0;
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
  // Spots on a ring round `at`, each facing it. With `far`, the side away from the camera comes first
  // (in plain view), so whoever faces `at` faces the camera too.
  // `strict` stages only spots the current camera sees whole: the ring widens until enough are in
  // view, spots also seen after a quarter turn either way come first, and nobody stands in front of
  // another's spot.
  function ringSpots(at, radius, n, { far = false, strict = false, moment = 'ring', search = 'ring' } = {}) {
    const start = draw('moments') * Math.PI * 2;
    const yaw = getYaw(), cx = Math.sin(yaw), cz = Math.cos(yaw);
    const ring = (base) => {
      const cands = [];
      for (let i = 0; i < 24; i++) {
        const a = start + (i * Math.PI * 2) / 12 + (i >= 12 ? Math.PI / 12 : 0);
        const rr = base + (i >= 12 ? 0.3 : 0);
        cands.push({ x: at.x + Math.cos(a) * rr, z: at.z + Math.sin(a) * rr, i });
      }
      return cands;
    };
    // Far side first. The near side (between the camera and `at`) is left out: nobody there can face
    // both.
    const side = (q) => ((q.x - at.x) * cx + (q.z - at.z) * cz) / Math.hypot(q.x - at.x, q.z - at.z);
    // `a` stands between `b` and the camera, close enough to hide a body there.
    const hides = (a, b) => {
      const dx = a.x - b.x, dz = a.z - b.z, along = dx * cx + dz * cz;
      return along > 0 && along < 2.5 && Math.abs(dx * cz - dz * cx) < 0.75;
    };
    const collect = (candidates, name, needs, checks = {}) => {
      const accepted = [];
      choose(at, moment, name, { candidates, needs, checks, score: (q) => { accepted.push(q); return 0; } });
      return accepted;
    };
    const place = (list) => {
      const out = [];
      for (let i = 0; i < n; i++) {
        const spot = choose(at, moment, `${search}:${i}`, { candidates: list, needs: strict ? ['clear', 'apart', 'unhidden'] : ['clear', 'apart'], checks: {
          apart: (q) => out.every((s) => Math.hypot(s.x - q.x, s.z - q.z) >= 0.55),
          unhidden: (q) => out.every((s) => !hides(s, q) && !hides(q, s)),
        } });
        if (!spot) break;
        const { x, z } = spot;
        let yaw = Math.atan2(at.x - x, at.z - z);
        // Standing off to one side: turned a little toward the camera, still on `at`.
        if (far) { const d = Math.atan2(Math.sin(getYaw() - yaw), Math.cos(getYaw() - yaw)); yaw += Math.sign(d) * Math.min(Math.abs(d), FAR_TURN); }
        out.push({ x, z, yaw });
      }
      return out;
    };
    if (!far) return place(ring(radius));
    const view = (q, turn = 0) => inView(q, { body: true, walls: true, turn });
    if (!strict) {
      const open = collect(ring(radius), `${search}:open`, ['farSide', 'clear'], { farSide: (q) => side(q) < 0.35 });
      const seen = collect(open, `${search}:view`, ['inView'], { inView: (q) => view(q) });
      return place((seen.length >= Math.min(2, n) ? seen : open).sort((a, b) => side(a) - side(b) || a.i - b.i));
    }
    // Wider rings join the candidates until everyone has a spot of their own.
    const seen = [], turned = new Map();
    let best = [];
    for (let k = 0; k < 4 && best.length < n; k++) {
      const suffix = k ? `+${k}` : '';
      const open = collect(ring(radius + k * 0.3), `${search}:open${suffix}`, ['farSide', 'clear'], { farSide: (q) => side(q) < 0.35 });
      for (const q of collect(open, `${search}:view${suffix}`, ['inView'], { inView: (q) => view(q) })) {
        seen.push(q);
        turned.set(q, (view(q, Math.PI / 2) ? 1 : 0) + (view(q, -Math.PI / 2) ? 1 : 0));
      }
      const out = place(seen.slice().sort((a, b) => turned.get(b) - turned.get(a) || side(a) - side(b) || a.i - b.i));
      if (out.length > best.length) best = out;
    }
    // Hemmed in on the far side: anyone the camera sees, on any side; failing that, the open far
    // side as before, so the pizza is never left uneaten.
    if (!best.length) {
      const all = [0, 1, 2, 3].flatMap((k) => ring(radius + k * 0.3));
      const open = collect(all, `${search}:anySide`, ['clear', 'inView'], { inView: (q) => view(q) });
      best = place(open.sort((a, b) => side(a) - side(b) || a.i - b.i));
      if (!best.length) best = place(collect(ring(radius), `${search}:blind`, ['farSide', 'clear'], { farSide: (q) => side(q) < 0.35 }).sort((a, b) => side(a) - side(b) || a.i - b.i));
    }
    return best;
  }

  const spotlighted = new WeakSet();
  let screenSpotlight = null;
  // A lingering prop gets one spotlight, even when its ambient animation repeats.
  function spotlightActors(kind, source, actors) {
    if (!actors.length || spotlighted.has(source)) return;
    spotlighted.add(source);
    const live = () => actors.filter((r) => recs.has(r.id) && r.temp?.moment === kind);
    const at = () => {
      const people = live();
      if (!people.length) return actors[0].pos;
      return { x: people.reduce((v, r) => v + r.pos.x, 0) / people.length, z: people.reduce((v, r) => v + r.pos.z, 0) / people.length };
    };
    spotlights?.begin(kind, () => {
      for (const r of live()) {
        if (kind === 'letter') releaseLetter(r);
        else { r.temp = null; if (r.goal) walkTo(r, r.goal); }
      }
    }, MOMENT_KINDS[kind]?.seconds, at, () => live().length > 0);
  }

  function pizza(p, dt) {
    if (!due(`pizza|${p.obj.uuid}`, dt, PIZZA.first, PIZZA.every)) return;
    new THREE.Box3().setFromObject(p.obj).getCenter(center);
    const people = pickIdle(Math.round(rnd(...PIZZA.people)), center);
    if (lite()) { for (const r of people) emote(r, 'heart', 2); return; }
    const spots = ringSpots(center, PIZZA.ring, people.length, { far: true, strict: true, moment: 'pizza' });
    people.slice(0, spots.length).forEach((r, i) => {
      r.temp = { anim: 'eat', t: rnd(...PIZZA.dur), goal: spots[i], back: true, moment: 'pizza', stage: { beat: 'eat', target: p.obj } };
      walkTo(r, spots[i]);
      if (draw('moments', r.id) < 0.5) emote(r, 'heart', 1.8);
    });
    spotlightActors('pizza', p.obj, people.filter((r) => r.temp?.moment === 'pizza'));
  }

  function screens(kind, dt) {
    if (!due(`screen|${kind}`, dt, SCREEN.first, SCREEN.every)) return;
    const seated = free().filter((r) => r.goal?.seated && r.char.seated);
    for (const r of seated) {
      if (draw('screen', r.id) > SCREEN.share) continue;
      emote(r, 'exclamation', 2);
      if (!lite()) r.temp = { anim: 'recoil', t: rnd(...SCREEN.dur), keepPos: true, delay: rnd(0, 0.8), moment: 'screen', stage: { beat: 'recoil' } };
    }
    screenSpotlight ??= {};
    spotlightActors('screen', screenSpotlight, seated.filter((r) => r.temp?.moment === 'screen'));
  }

  // Sledgehammer. One run per decision: fetch it, carry it to the back wall, hold it there; swing
  // once the walls come down, else carry nothing back (the prop goes with the decision).
  let hammer = null;      // { r, phase, wall, obj, held }
  let hammerDone = null;  // the staged hammer whose throw or swing has played
  const wrecks = [];      // broken screens left on the wall a while: { screen, t }
  function updateWrecks(dt) {
    for (let i = wrecks.length - 1; i >= 0; i--) {
      const w = wrecks[i];
      w.screen.update(dt);
      w.t -= dt;
      if (w.t <= 0) { w.screen.dispose(); wrecks.splice(i, 1); }
    }
  }
  const angleLerp = (a, b, k) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * k;
  function hammerHead() {
    const g = new THREE.Group();
    // The shaft runs through both palms, with the head beyond the supporting hand.
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.034, 0.6, 8), HANDLE_MAT);
    handle.position.y = -0.24;
    handle.name = 'hammer-handle';
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.12, 0.26, 2, 0.012), HEAD_MAT);
    head.position.y = -0.5;
    head.name = 'hammer-head';
    g.add(handle, head);
    g.userData.handSpan = true;
    g.name = 'sledgehammer';
    return g;
  }
  // A clear spot facing a wall, nearest the hammer, on the far side from the camera (the near walls
  // are cut away, and whoever stood at one would be hidden behind its stub). { x, z, yaw, n } where
  // n is the wall's outward normal.
  function wallSpot(from, { screen = false, avoid = null } = {}) {
    const L = office.current.L, yaw = getYaw?.() ?? Math.PI / 4;
    const cam = [Math.sin(yaw), Math.cos(yaw)];
    const furniture = [...office.placed.values()].map((e) => new THREE.Box3().setFromObject(e.obj));
    const roomForLoad = (x, z) => furniture.every((b) => b.max.y < HAMMER_ROOM.lowY || b.min.y > HAMMER_ROOM.highY || x < b.min.x - HAMMER_ROOM.m || x > b.max.x + HAMMER_ROOM.m || z < b.min.z - HAMMER_ROOM.m || z > b.max.z + HAMMER_ROOM.m);
    const walls = [[-1, 0], [0, -1], [1, 0], [0, 1]].filter(([nx, nz]) => nx * cam[0] + nz * cam[1] < -0.2);
    function* candidates() {
      for (const [nx, nz] of walls.sort((a, b) => (a[0] * cam[0] + a[1] * cam[1]) - (b[0] * cam[0] + b[1] * cam[1]))) {
        const along = nx === 0, half = along ? L.W / 2 : L.D / 2, fixed = (along ? nz * L.D / 2 : nx * L.W / 2) - (along ? nz : nx) * 0.7;
        // Leave room beside the pickup for the two-handed load and its approach.
        const start = (along ? from.x : from.z) - Math.sign(along ? cam[0] : cam[1]) * HAMMER_ROOM.startM;
        for (let d = 0; d < 2 * half; d += 0.35) for (const s of [1, -1]) {
          const u = start + s * d;
          if (Math.abs(u) > half - 0.6) continue;
          const x = along ? u : fixed, z = along ? fixed : u;
          yield { x, z, yaw: Math.atan2(nx, nz), n: [nx, nz] };
        }
      }
    }
    return choose(from, 'hammer', screen ? 'screenWall' : 'wall', {
      candidates: candidates(), needs: screen ? ['standRoom', 'throwRoom'] : ['loadClear', 'clear', 'approachClear', ...(avoid ? ['offScreen'] : [])],
      checks: {
        standRoom,
        offScreen: (q) => Math.hypot(q.x + q.n[0] * 0.7 - avoid.x, q.z + q.n[1] * 0.7 - avoid.z) > SCREEN_W / 2 + THROW.besideM,
        loadClear: (q) => roomForLoad(q.x, q.z),
        approachClear: (q) => !office.nav().isBlocked(q.x - q.n[0] * 0.8, q.z - q.n[1] * 0.8, BODY_R),
        throwRoom: (q) => !!(q.plan = throwPlan(q)),
      },
    });
  }
  // The all-hands screen's centre: on its floor stand in front of the wall at wall spot w.
  const screenAt = (w) => new THREE.Vector3(w.x + w.n[0] * (0.7 - SCREEN_OUT), SCREEN_Y, w.z + w.n[1] * (0.7 - SCREEN_OUT));
  // Whether the stand fits there: under the ceiling, its footprint and the screen's width clear of
  // furniture (windows behind it don't matter).
  function standRoom(w) {
    const L = office.current.L, n = w.n, at = screenAt(w), side = [-n[1], n[0]];
    if (SCREEN_Y + SCREEN_H / 2 + 0.1 > L.wallH) return false;
    const half = SCREEN_W / 2 + 0.1;
    const box = new THREE.Box3(
      new THREE.Vector3(at.x - Math.abs(side[0]) * half - Math.abs(n[0]) * 0.3, 0.02, at.z - Math.abs(side[1]) * half - Math.abs(n[1]) * 0.3),
      new THREE.Vector3(at.x + Math.abs(side[0]) * half + Math.abs(n[0]) * 0.3, SCREEN_Y + SCREEN_H / 2, at.z + Math.abs(side[1]) * half + Math.abs(n[1]) * 0.3));
    return [...office.placed.values()].every((e) => !new THREE.Box3().setFromObject(e.obj).intersectsBox(box))
      && (office.current.columns ?? []).every((c) => Math.abs((c.x - at.x) * side[0] + (c.z - at.z) * side[1]) > half + 0.3 || Math.abs((c.x - at.x) * n[0] + (c.z - at.z) * n[1]) > 0.6);
  }
  // The throw at the screen over wall spot w: where the run ends in the spin (from) and where the
  // subject waits with the hammer (poise). null when no spot in view has a clear flight to it.
  function throwPlan(w) {
    const nav = office.nav(), n = w.n, side = [-n[1], n[0]], screen = screenAt(w);
    const columns = office.current.columns ?? [];
    const tall = [...office.placed.values()].map((e) => new THREE.Box3().setFromObject(e.obj)).filter((b) => b.max.y > THROW.tallY);
    const lineClear = (a, b, step, ok) => {
      const l = Math.hypot(b.x - a.x, b.z - a.z);
      for (let k = 0; k <= l; k += step) { const t = l ? k / l : 0; if (!ok(a.x + (b.x - a.x) * t, a.z + (b.z - a.z) * t)) return false; }
      return true;
    };
    const flies = (x, z) => columns.every((c) => Math.hypot(c.x - x, c.z - z) > THROW.columnR) && tall.every((b) => x < b.min.x - 0.1 || x > b.max.x + 0.1 || z < b.min.z - 0.1 || z > b.max.z + 0.1);
    const runs = (x, z) => !nav.isBlocked(x, z, BODY_R);
    const at = (d, s) => ({ x: w.x - n[0] * d + side[0] * s, z: w.z - n[1] * d + side[1] * s });
    const facing = (q) => ({ ...q, yaw: Math.atan2(screen.x - q.x, screen.z - q.z) });
    // Where the spin and the throw happen: clear, in view, with nothing tall in the hammer's way.
    let from = null;
    for (const d of THROW.from) for (const s of THROW.side) {
      const q = at(d, s);
      if (runs(q.x, q.z) && lineClear(q, at(0.3, 0), 0.2, flies) && inView(q, { body: true })) { from = q; break; }
      if (from) break;
    }
    if (!from) return null;
    // Where they wait with it while the card is up: further back behind the throw spot, else there.
    const back = Math.hypot(from.x - w.x, from.z - w.z);
    let poise = from;
    for (const d of THROW.poise) for (const s of THROW.side) {
      const q = at(back + d, s);
      if (runs(q.x, q.z) && inView(q, { body: true })) { poise = q; break; }
      if (poise !== from) break;
    }
    return { screen, poise: facing(poise), from: facing(from) };
  }
  // People in the room turn to the screen, deadpan, while it drones; the shatter shocks them.
  function stare(h) {
    const pic = h.screen.picture;
    for (const o of free()) {
      if (o === h.r || h.watchers.length >= THROW.watchers) continue;
      if (Math.hypot(o.pos.x - h.plan.screen.x, o.pos.z - h.plan.screen.z) > THROW.stareR) continue;
      const seated = !!(o.goal?.seated && o.char.seated);
      const toScreen = () => Math.atan2(h.plan.screen.x - o.pos.x, h.plan.screen.z - o.pos.z);
      // Someone seated with their back to it stands up behind the chair and turns round to watch.
      if (seated && Math.abs(Math.atan2(Math.sin(toScreen() - o.yaw), Math.cos(toScreen() - o.yaw))) > THROW.seatedTurn) {
        const spot = { x: o.pos.x - Math.sin(o.yaw) * THROW.standBack, z: o.pos.z - Math.cos(o.yaw) * THROW.standBack };
        if (office.nav().isBlocked(spot.x, spot.z, BODY_R) || !inView(spot, { body: true })) continue;
        // Never between the camera and the thrower's spots.
        const cx = Math.sin(getYaw()), cz = Math.cos(getYaw());
        const hides = (q) => { const dx = spot.x - q.x, dz = spot.z - q.z, along = dx * cx + dz * cz; return along > 0 && along < 4 && Math.abs(dx * cz - dz * cx) < 0.9; };
        if (hides(h.plan.poise) || hides(h.plan.from)) continue;
        spot.yaw = Math.atan2(h.plan.screen.x - spot.x, h.plan.screen.z - spot.z);
        o.temp = { anim: 'idle', t: 1e6, goal: spot, moment: 'hammer', stage: { beat: 'stare', role: 'watcher', target: pic } };
        walkTo(o, spot);
        o.char.lookAt(pic, { hold: 1e6 });
        o.char.express('flat', { hold: Infinity, blend: 0.4 });
        h.watchers.push(o);
        continue;
      }
      // Seated, they swivel only a little in the chair; the head does the rest.
      const seatYaw = o.yaw, aim = () => {
        if (!seated) return toScreen();
        const d = Math.atan2(Math.sin(toScreen() - seatYaw), Math.cos(toScreen() - seatYaw));
        return seatYaw + Math.max(-THROW.swivel, Math.min(THROW.swivel, d));
      };
      o.temp = {
        anim: seated ? 'sit' : 'idle', t: 1e6, keepPos: true, moment: 'hammer', seated, seatYaw, stage: { beat: 'stare', role: 'watcher', target: pic },
        tick: (rr, d) => { rr.yaw = angleLerp(rr.yaw, aim(), 1 - Math.exp(-d * 5)); return false; },
      };
      o.char.lookAt(pic, { hold: 1e6 });
      o.char.express('flat', { hold: Infinity, blend: 0.4 });
      h.watchers.push(o);
    }
  }
  function shock(h) {
    for (const o of h.watchers) {
      if (o.temp?.moment !== 'hammer') continue;
      o.temp.stage.beat = 'shock';
      o.temp.anim = o.temp.seated ? 'recoil' : 'flinch';
      o.char.express('shocked', { hold: THROW.react + 0.4, blend: 0.08 });
      emote(o, 'exclamation', 1.6);
    }
  }
  function releaseWatchers(h) {
    for (const o of h.watchers) {
      o.char.lookAt(null);
      o.char.express(null);
      if (o.temp?.moment !== 'hammer') continue;
      const seated = o.temp.seated;
      if (seated) o.yaw = o.temp.seatYaw;
      o.temp = null;
      if (!seated && o.goal) walkTo(o, o.goal);
    }
    h.watchers = [];
  }
  // Which hand leads and which way the chest faces at the wall: the head toward the wall, the chest
  // to the open aisle.
  function wallFacing(h, w) {
    const yaw = getYaw?.() ?? Math.PI / 4;
    const leftSide = w.n[1] * Math.sin(yaw) - w.n[0] * Math.cos(yaw);
    h.primary = leftSide >= 0 ? 1 : 0;
    h.facing = Math.atan2(w.n[1], -w.n[0]) + (leftSide >= 0 ? 0 : Math.PI);
  }
  const wallTarget = (w) => new THREE.Vector3(w.x + w.n[0] * 0.7, 1.2, w.z + w.n[1] * 0.7);
  function swingAtWall(h) {
    const r = h.r;
    h.phase = 'swing';
    h.held.userData.primaryHand = h.primary;
    h.held.rotation.set(0, 0, 0);
    r.temp = { anim: 'swing', t: 3.3, goal: { ...h.wall, yaw: h.facing }, moment: 'hammer', back: true, stage: { role: 'thrower', beat: 'swing', held: h.held, target: wallTarget(h.wall) } };
    h.swingT = 0;
  }
  // Walking with the hammer held out in front: the route keeps a wider berth of furniture corners.
  function carryTo(r, goal, run = false) {
    walkTo(r, goal, run);
    const nav = office.nav();
    let p = null;
    // From a pocket narrower than the clearance, the path starts at the nearest roomy cell, which can
    // lie across the desks; such a way is refused for the soft one, which starts where they stand.
    const ends = (q) => nav.roomAlong(q[0], q[1]) > 0 && nav.roomAlong(q.at(-2), q.at(-1)) > 0;
    for (const c of HAMMER_ROOM.carryClear) if ((p = nav.path(r.pos, goal, c)) && (p.length < 2 || ends(p))) break; else p = null;
    p ??= nav.path(r.pos, goal, HAMMER_ROOM.carryClear[0], { soft: true }) ?? [];
    if (p.length > 1) r.path = [...p.slice(1, -1), { x: goal.x, z: goal.z }];
  }
  function holdAgain(h) {
    h.held.userData.primaryHand = h.primary;
    h.r.char.setHeld(h.held);
  }
  function hammerTick(p, state, dt) {
    if (!hammer) {
      if (!p) { timers.delete('hammer'); hammerDone = null; return; }
      // The prop lingers after the choice so the throw can finish; once it has, leave it be.
      if (hammerDone === p.obj) return;
      const subject = stagedBy(state, 'sledgehammer')?.subjectId;
      const r = (subject && recs.get(subject) && free().includes(recs.get(subject))) ? recs.get(subject) : pickIdle(1)[0];
      if (!r) return;
      const at = p.obj.position;
      const nav = office.nav();
      // A spot beside the hammer to pick it up from: the nearest free ring round it, widening when
      // it stands among desks or against a wall, else the nearest walkable point.
      let pick = null;
      for (const d of [0.7, 0.9, 1.1, 1.4, 1.8]) for (let i = 0; i < 16 && !pick; i++) {
        const a = (i / 16) * Math.PI * 2, x = at.x + Math.cos(a) * d, z = at.z + Math.sin(a) * d;
        if (!nav.isBlocked(x, z, BODY_R)) pick = { x, z, yaw: Math.atan2(at.x - x, at.z - z) };
      }
      if (!pick) { const q = nav.freePoint(at.x, at.z); pick = { x: q.x, z: q.z, yaw: Math.atan2(at.x - q.x, at.z - q.z) }; }
      // The wall it goes to, with the all-hands screen over it when the room allows a throw.
      const w = wallSpot(at, { screen: !!parent }) ?? wallSpot(at);
      if (!w) { hammerDone = p.obj; return; }
      hammer = { r, phase: 'fetch', obj: p.obj, held: null, wall: w, plan: w.plan ?? null, pick, watchers: [], choice: undefined };
      wallFacing(hammer, w);
      if (hammer.plan) {
        const s = createLeaderScreen({ low: lite, height: SCREEN_Y });
        s.group.position.copy(hammer.plan.screen);
        s.group.rotation.y = Math.atan2(-w.n[0], -w.n[1]);
        parent.add(s.group);
        hammer.screen = s;
        stare(hammer);
      }
      // The caption belongs to the fetch; the throw (or the swing) is the spotlight.
      hammer.mid = dispatch('start', 'open_plan_office');
      if (hammer.screen && hammer.mid) dispatch('beat', 'open_plan_office', hammer.mid, { beat: 'screen' });
      r.temp = { anim: 'peer', t: 1.2, goal: pick, moment: 'hammer', stage: { role: 'thrower', beat: 'fetch', target: p.obj } };
      walkTo(r, pick);
      return;
    }
    const h = hammer, r = h.r;
    if (!recs.has(r.id)) { stopHammer(); return; }
    if (resolved.has('open_plan_office')) h.choice ??= resolved.get('open_plan_office');
    h.screen?.update(dt);
    const pickedUp = r.temp?.moment === 'hammer' && !r.path.length && r.temp.t < 0.3;
    if (h.phase === 'fetch' && pickedUp) {
      // Picked up: the prop hides and the person carries a hammer of their own.
      h.obj.visible = false;
      h.held = hammerHead();
      h.held.userData.primaryHand = h.primary;
      r.char.setHeld(h.held);
      h.phase = 'carry';
      const w = h.wall, goal = h.plan?.poise ?? w;
      r.temp = { anim: 'shoulder', t: 1e6, goal, moment: 'hammer', stage: { role: 'thrower', beat: 'carry', held: h.held, target: h.plan?.screen ?? wallTarget(w) } };
      carryTo(r, goal);
      // To the wall itself: approach from the aisle, keeping the head away from wall-side furniture.
      const nav = office.nav(), approach = { x: w.x - w.n[0] * 0.8, z: w.z - w.n[1] * 0.8 };
      if (!h.plan && !nav.isBlocked(approach.x, approach.z, BODY_R)) {
        r.path = [...nav.path(r.pos, approach, 0.35, { soft: true }).slice(1), { x: w.x, z: w.z }];
      }
    } else if (h.phase === 'carry' && !r.path.length) {
      h.phase = 'hold';
      if (r.temp?.stage) r.temp.stage.beat = 'hold';
      // At the wall, face the aisle so both palms and the shaft stay visible; out in the room, turn
      // three-quarters to the camera, still on the screen.
      r.temp.goal = h.plan ? { ...h.plan.poise, yaw: towardCamera(h.plan.poise, h.plan.screen) } : { ...h.wall, yaw: h.facing };
      emote(r, 'lightbulb', 2);
    }
    // Waiting out in the room, the hammer's head goes on the side the camera sees.
    if (h.plan && h.held && h.phase === 'hold') {
      const cam = getYaw(), side = Math.sin(r.yaw) * Math.cos(cam) - Math.cos(r.yaw) * Math.sin(cam);
      if (Math.abs(side) > THROW.flipSide) h.held.userData.primaryHand = side > 0 ? 1 : 0;
    }
    // Walking with it, the hammer rests back over the shoulder, clear of the desks either side of an
    // aisle; it comes down across both palms whenever they stop, and for the run in.
    if (h.held) {
      const moving = !!r.path.length && r.temp?.moment === 'hammer' && ['carry', 'return', 'toWall'].includes(h.phase);
      // The arm eases up to the shoulder under 'shoulderwalk' while both palms still hold the shaft, so
      // the hammer never swings over the shoulder of an arm that is still down.
      h.walkT = moving ? (h.walkT ?? 0) + dt : 0;
      const walking = moving && h.walkT >= SHOULDER_UP_S;
      if (moving) r.walkAnim = 'shoulderwalk';
      if (walking !== !h.held.userData.handSpan) {
        h.held.userData.handSpan = !walking;
        // The two-hand grip moves the hammer to the palms; on the shoulder it sits at the hand again.
        if (walking) { h.held.position.set(0, 0, 0); h.held.rotation.set(...HAMMER_SHOULDER); }
        else h.held.rotation.set(0, 0, 0);
      }
    }
    if ((h.phase === 'hold' || h.phase === 'carry') && h.choice !== undefined && h.plan) {
      // The run in, from wherever they have got to with it.
      h.phase = 'run';
      if (h.mid) dispatch('beat', 'open_plan_office', h.mid, { beat: 'run' });
      r.temp = { anim: 'shoulder', t: 1e6, goal: h.plan.from, moment: 'hammer', stage: { role: 'thrower', beat: 'run', held: h.held, target: h.plan.screen } };
      carryTo(r, h.plan.from, true);
      h.spot = spotlights?.begin('open_plan_office', () => stopHammer(true), MOMENT_KINDS.open_plan_office.seconds, () => ({ x: (r.pos.x + h.plan.screen.x) / 2, z: (r.pos.z + h.plan.screen.z) / 2 }));
    } else if (h.phase === 'hold' && h.choice === KNOCK_DOWN && !h.plan) {
      swingAtWall(h);
      h.spot = spotlights?.begin('open_plan_office', () => stopHammer(true), 3.3, () => h.wall);
    } else if (h.phase === 'run' && !r.path.length) {
      // One accelerating turn on the spot, ending square to the screen.
      h.phase = 'spin';
      h.spinT = 0;
      const aim = Math.atan2(h.plan.screen.x - r.pos.x, h.plan.screen.z - r.pos.z);
      r.temp = {
        anim: 'hurlspin', t: 1e6, keepPos: true, moment: 'hammer', stage: { role: 'thrower', beat: 'spin', held: h.held, target: h.plan.screen },
        tick: (rr) => { rr.yaw = aim - Math.PI * 2 * (1 - (Math.min(1, h.spinT / THROW.spinS)) ** 2); return false; },
      };
    } else if (h.phase === 'spin') {
      h.spinT += dt;
      if (h.spinT >= THROW.spinS) hurl(h);
    } else if (h.phase === 'flight') {
      h.flyT += dt;
      const k = Math.min(1, h.flyT / THROW.flightS);
      h.held.position.lerpVectors(h.from, h.to, k);
      h.held.position.y += 4 * THROW.arc * k * (1 - k);
      h.held.quaternion.setFromAxisAngle(h.tumble, k * THROW.tumble).multiply(h.fromQ);
      if (k >= 1) impact(h);
    } else if (h.phase === 'react') {
      h.reactT -= dt;
      if (h.reactT <= 0) {
        // Back for the hammer, under the broken screen; the wall then takes its blows beside it.
        releaseWatchers(h);
        h.phase = 'pickup';
        const w = h.wall, nav = office.nav();
        const p0 = { x: w.x - w.n[0] * HAMMER_LAND.pick, z: w.z - w.n[1] * HAMMER_LAND.pick };
        const q = nav.isBlocked(p0.x, p0.z, BODY_R) ? nav.freePoint(p0.x, p0.z) : p0;
        const land = { x: w.x - w.n[0] * HAMMER_LAND.out, z: w.z - w.n[1] * HAMMER_LAND.out };
        const spot = { x: q.x, z: q.z, yaw: Math.atan2(land.x - q.x, land.z - q.z) };
        r.temp = { anim: 'peer', t: 0.8, goal: spot, moment: 'hammer', stage: { role: 'thrower', beat: 'pickup', target: h.held } };
        walkTo(r, spot);
      }
    } else if (h.phase === 'pickup' && pickedUp) {
      holdAgain(h);
      // The walls come down: on to a stretch of wall clear of the screen and of furniture.
      const sw = h.choice === KNOCK_DOWN ? wallSpot(r.pos, { avoid: h.plan.screen }) : null;
      // Too far to walk with the room watching: they lay into the wrecked screen where they stand.
      if (h.choice === KNOCK_DOWN && (!sw || Math.hypot(sw.x - r.pos.x, sw.z - r.pos.z) > THROW.swingNear)) {
        const here = { x: r.pos.x, z: r.pos.z, yaw: h.wall.yaw, n: h.wall.n };
        h.wall = here;
        wallFacing(h, here);
        swingAtWall(h);
      } else if (sw) {
        h.wall = sw;
        wallFacing(h, sw);
        h.held.userData.primaryHand = h.primary;
        h.phase = 'toWall';
        r.temp = { anim: 'shoulder', t: 1e6, goal: sw, moment: 'hammer', stage: { role: 'thrower', beat: 'carry', held: h.held, target: wallTarget(sw) } };
        walkTo(r, sw);
        const nav = office.nav(), approach = { x: sw.x - sw.n[0] * 0.8, z: sw.z - sw.n[1] * 0.8 };
        if (!nav.isBlocked(approach.x, approach.z, BODY_R)) r.path = [...nav.path(r.pos, approach, 0.35, { soft: true }).slice(1), { x: sw.x, z: sw.z }];
      } else {
        // The walls stay: the hammer goes back where it came from.
        h.phase = 'return';
        r.temp = { anim: 'shoulder', t: 1e6, goal: h.pick, moment: 'hammer', stage: { role: 'thrower', beat: 'return', held: h.held, target: h.obj } };
        carryTo(r, h.pick);
      }
    } else if (h.phase === 'toWall' && !r.path.length) {
      swingAtWall(h);
    } else if (h.phase === 'return' && !r.path.length) {
      h.putBack = true;
      stopHammer(true);
      return;
    }
    if (h.phase === 'swing') {
      h.swingT += dt;
      const hit = Math.floor((h.swingT - 0.6) / 1.1);
      if (hit >= 0 && hit !== h.lastHit && !lite()) { h.lastHit = hit; wallDust(h.wall.x + h.wall.n[0] * 0.62 - h.wall.n[1] * 0.35, 1.0, h.wall.z + h.wall.n[1] * 0.62 + h.wall.n[0] * 0.35); }
      if (!r.temp) { stopHammer(); return; }
    }
    // The card went away before anything was thrown: put it down and go back to work.
    if (!p && (h.phase === 'fetch' || h.phase === 'carry' || h.phase === 'hold')) stopHammer(true);
  }
  // Let go at the end of the spin: the hammer leaves the hands and flies, tumbling, into the screen.
  function hurl(h) {
    const r = h.r;
    h.held.updateMatrixWorld(true);
    r.char.setHeld(null);
    parent.attach(h.held);
    h.thrown = true;
    h.phase = 'flight';
    h.flyT = 0;
    h.from = h.held.position.clone();
    h.fromQ = h.held.quaternion.clone();
    h.to = parent.worldToLocal(h.plan.screen.clone().addScaledVector(new THREE.Vector3(-h.wall.n[0], 0, -h.wall.n[1]), 0.08));
    h.tumble = new THREE.Vector3(h.wall.n[1], 0, -h.wall.n[0]);
    r.yaw = Math.atan2(h.plan.screen.x - r.pos.x, h.plan.screen.z - r.pos.z);
    if (h.mid) dispatch('beat', 'open_plan_office', h.mid, { beat: 'throw' });
    r.temp = { anim: 'hurlthrow', t: 1e6, keepPos: true, moment: 'hammer', stage: { role: 'thrower', beat: 'throw', target: h.plan.screen } };
  }
  function impact(h) {
    const r = h.r, w = h.wall;
    h.screen.shatter();
    if (h.mid) dispatch('hit', 'open_plan_office', h.mid, { hit: 'screen' });
    if (!lite()) wallDust(h.plan.screen.x - w.n[0] * 0.1, h.plan.screen.y, h.plan.screen.z - w.n[1] * 0.1);
    // It drops to the floor under the screen, lying along the wall.
    h.held.position.copy(parent.worldToLocal(new THREE.Vector3(w.x - w.n[0] * HAMMER_LAND.out, 0.07, w.z - w.n[1] * HAMMER_LAND.out)));
    h.held.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(w.n[1], 0, -w.n[0]));
    shock(h);
    r.char.express('delighted', { hold: THROW.react + 0.6 });
    h.phase = 'react';
    h.reactT = THROW.react;
    if (r.temp?.stage) r.temp.stage.beat = 'shatter';
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
    hammer.held?.removeFromParent();
    hammer.held?.traverse((o) => o.geometry?.dispose());
    releaseWatchers(hammer);
    r.char.express(null);
    if (hammer.screen) wrecks.push({ screen: hammer.screen, t: hammer.screen.broken ? WRECK_S : 0 });
    if (hammer.thrown || hammer.phase === 'swing') hammerDone = hammer.obj;
    if (hammer.obj) hammer.obj.visible = hammer.putBack || (!hammer.thrown && hammer.phase !== 'swing');
    if (r.temp?.moment === 'hammer') { r.temp = null; if (walkBack && r.goal) walkTo(r, r.goal); }
    if (hammer.mid) dispatch('end', 'open_plan_office', hammer.mid);
    spotlights?.end(hammer.spot);
    hammer = null;
  }

  // Choices made, by event id, from decisionResolved ({ eventId, choice }; choice indexes the event's
  // choices). Kept briefly: the moments that act on a choice read it within a few frames.
  const resolved = new Map(), resolvedT = new Map();
  // Decisions in the order they came in, so a moment reacts only to a choice made after it began.
  let decisionSeq = 0;
  const decidedAt = new Map();
  function decided(e) {
    decidedAt.set(e.eventId, ++decisionSeq);
    resolved.set(e.eventId, e.choice ?? null);
    resolvedT.set(e.eventId, 20);
    // Resolved with no card (quietEvent), the jammed printer is staged first and goes after a beat.
    if (e.eventId === 'printer_jam' && e.choice === TAKE_IT_OUT) printerDue = 3 + (e.quiet ? QUIET_JAM_S : 0);
  }

  // The open decision or Yak prompt that stages `prop`: { eventId, subjectId }, or null. A prompt
  // delivering an event carries the event id as its kind.
  function stagedBy(state, prop) {
    const d = state?.pendingDecision;
    if (d?.stage?.prop === prop) return { eventId: d.eventId, subjectId: d.subjectId ?? null };
    const c = (state?.chatPrompts ?? []).find((x) => !x.resolved && x.stage?.prop === prop);
    return c ? { eventId: c.kind, subjectId: c.subjectId ?? null } : null;
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
  const ray = new THREE.Raycaster(), rayFrom = new THREE.Vector3();
  // With `body`, the whole standing body: shoulders and head too, and both sides of it.
  function inView(at, { body = false, turn = 0, walls = false } = {}) {
    const cam = getCamera?.();
    if (!cam || !office.current) return !columnInFront(at, getYaw() + turn);
    ray.camera = cam;
    const dir = new THREE.Vector3();
    cam.getWorldDirection(dir).negate();
    if (turn) dir.applyAxisAngle(new THREE.Vector3(0, 1, 0), turn);
    const ys = body ? [0.25, 0.5, 0.85, 1.1] : [0.25, 0.5, 0.85];
    const across = body ? [-0.13, 0, 0.13] : [0];
    const sx = dir.z, sz = -dir.x, sl = Math.hypot(sx, sz) || 1;
    const { targets, drawn } = office.sightBlockers({ shell: walls });
    ray.far = 12;
    for (const y of ys) for (const a of across) {
      ray.set(rayFrom.set(at.x + (sx / sl) * a, y, at.z + (sz / sl) * a), dir);
      if (ray.intersectObjects(targets, true).some((hit) => hit.object.isMesh && drawn(hit.object)
        && ![].concat(hit.object.material).every((m) => m?.transparent && m.opacity < 0.5))) return false;
    }
    if (body && personInFront(at, getYaw() + turn)) return false;
    return !columnInFront(at, getYaw() + turn);
  }
  // Someone standing or sitting between `at` and the camera, close enough to hide a body there.
  function personInFront(at, yaw = getYaw()) {
    const cx = Math.sin(yaw), cz = Math.cos(yaw);
    for (const r of recs.values()) {
      if (r.hidden) continue;
      const dx = r.pos.x - at.x, dz = r.pos.z - at.z;
      const along = dx * cx + dz * cz, across = Math.abs(dx * cz - dz * cx);
      if (along > 0.2 && along < 2.2 && across < 0.4) return true;
    }
    return false;
  }
  // True when a column stands between the camera and a spot: someone there would be half hidden
  // behind the column (drawn faded over them), so a moment staged there would not read.
  function columnInFront(at, yaw = getYaw()) {
    const cx = Math.sin(yaw), cz = Math.cos(yaw);
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
    const desk = office.placed.get(deskId);
    // The person the stage names (whose desk it is), else whoever sits at the desk it landed on.
    const r = (p.staffId && recs.get(p.staffId)) || [...recs.values()].find((x) => x.seat === deskId);
    // The named reader is always castable: whatever pose, standup or walk the decision's freeze
    // caught them in gives way, and they go to their seat (claim). Someone the sim has out of the
    // office, or already in another moment, isn't taken.
    if (r && p.staffId === r.id && !r.temp?.claim && !(free().includes(r) && r.char.seated)) claim(r, deskId, p.obj);
    // Ambient readers can still be sliding toward the chair in a seated animation.
    // Wait for the anchor; named claims own their arrival during a decision freeze.
    const seatedAtDesk = r && desk?.desk && Math.hypot(r.pos.x - desk.desk.seat.x, r.pos.z - desk.desk.seat.z) < 0.06;
    const ready = r && (r.temp?.claim ? !r.path.length && r.char.seated : seatedAtDesk && free().includes(r) && r.char.seated);
    // Not at their desk right now: look again shortly rather than after the full interval.
    if (!ready) {
      note(r?.id ?? null, 'refuse', { by: 'letter', why: !r ? `nobody sits at ${deskId}` : r.hidden ? 'out of the office' : !free().includes(r) ? `busy (${r.temp?.moment ?? r.temp?.anim ?? (r.path.length ? 'walking' : r.mode)})` : 'not seated' });
      timers.set(`letter|${p.obj.uuid}`, 1);
      return;
    }
    // At Low: just the bad-news emote at the desk. Otherwise the emote comes after reading it.
    if (lite()) { emote(r, 'storm', 2.8); if (r.temp?.claim) r.temp = null; return; }
    // Out of the chair sideways (on the camera's side when both are clear), then back into the aisle
    // to read it; the chair's back and the desk row are in the way of any straight route. They come
    // back the same way.
    const ry = desk?.obj.rotation.y ?? 0, nav = office.nav(), yaw = getYaw();
    const ax = [Math.cos(ry), -Math.sin(ry)], back = [Math.sin(ry), Math.cos(ry)];
    const seat = { x: r.pos.x, z: r.pos.z };
    // A clear side first; where desks stand side by side there is none, so they squeeze out between
    // their chair and the next one and straight back to the aisle.
    const at = (u) => ({ x: seat.x + ax[0] * u + back[0] * 0.2, z: seat.z + ax[1] * u + back[1] * 0.2 });
    const camFirst = (a, b) => (b.x * Math.sin(yaw) + b.z * Math.cos(yaw)) - (a.x * Math.sin(yaw) + a.z * Math.cos(yaw));
    const wide = [1, -1].map((sg) => ({ ...at(SIDE_OUT * sg), wide: true })).sort(camFirst);
    const narrow = [1, -1].map((sg) => at(SIDE_SQUEEZE * sg)).sort(camFirst);
    const standing = (q) => ({ x: q.x + back[0] * STAND_BACK, z: q.z + back[1] * STAND_BACK });
    const side = choose(seat, 'letter', 'side', { candidates: [...wide, ...narrow], needs: ['exitClear', 'clear', 'noColumn'], checks: {
      exitClear: (q) => !q.wide || !nav.isBlocked(q.x, q.z),
      clear: (q) => { const s = standing(q); return !nav.isBlocked(s.x, s.z, BODY_R); },
      noColumn: (q) => !columnInFront(standing(q)),
    } });
    // No way out sideways (a tight row of desks): they stand up behind their chair, or at the
    // nearest free floor.
    let spot;
    if (side) spot = { x: side.x + back[0] * STAND_BACK, z: side.z + back[1] * STAND_BACK };
    else {
      spot = choose(seat, 'letter', 'behind', { candidates: [1.0, 1.3, 1.6].map((d) => ({ x: seat.x + back[0] * d, z: seat.z + back[1] * d })), needs: ['clear'], fallback: () => nav.freePoint(seat.x + back[0], seat.z + back[1]) });
      note(r.id, 'fallback', { by: 'letter', why: 'no clear spot beside the chair: reads behind it' });
    }
    spot.yaw = towardCamera(spot, p.obj.position);
    // Push the chair back to get up; it rolls in again as they sit back down.
    const chair = office.freeChair?.(deskId, true);
    // The step out beside the chair is straight; from there on they keep to the walk grid, so a
    // reading spot across the room (the fallback) is walked round what stands between.
    const grid = (a, b) => nav.path({ x: a.x, z: a.z }, { x: b.x, z: b.z }).slice(1);
    const route = side ? [{ x: side.x, z: side.z }, ...grid(side, spot)] : grid(seat, spot);
    if (chair) rolls.push({ r, deskId, chair, z0: chair.position.z, k: 0, seat, sat: 0, route });
    // Read, then react: the letter goes up in front of their face for a beat, then down on the desk
    // and they slump over the news.
    const env = p.obj;
    r.temp = {
      anim: 'readpaper', t: READ_S + SLUMP_S, goal: spot, back: false, moment: 'letter', envelope: env, el: 0, stage: { beat: 'getup', target: env },
      side: Math.sign(Math.sin(spot.yaw - getYaw()) || 1), readYaw: getYaw() + Math.PI / 6 * Math.sign(Math.sin(spot.yaw - getYaw()) || 1), slumpYaw: spot.yaw,
      tick: (rr, d, tp) => {
        tp.el += d;
        if (!tp.sheet && tp.el < READ_S) { tp.sheet = letterSheet(p.prop === 'envelope_thick'); rr.char.root.add(tp.sheet); env.visible = false; }
        if (tp.el >= READ_S && tp.sheet) {
          tp.sheet.removeFromParent(); tp.sheet = null; env.visible = true;
          emote(rr, 'storm', 2.4);
        }
        if (tp.t <= d * 1.5) {
          if (tp.sheet) { tp.sheet.removeFromParent(); tp.sheet = null; env.visible = true; }
          // Back the way they came: to the side of the chair, then in.
          rr.temp = { anim: 'typing', t: 0.1, goal: rr.goal, moment: 'letter', envelope: env, stage: { beat: 'return' } };
          rr.path = side ? [...grid(rr.pos, side), { x: seat.x, z: seat.z }] : grid(rr.pos, seat);
          return true;
        }
        rr.char.setAnim(tp.el < READ_S ? 'readpaper' : 'slump');
        tp.stage = tp.el < READ_S ? { beat: 'read', held: tp.sheet, target: tp.sheet } : { beat: 'slump', target: env };
        // Read turned a third of the way off the camera, so the face shows over the sheet; then turn to
        // the camera to take it in.
        tp.goal.yaw = tp.el < READ_S ? tp.readYaw : tp.slumpYaw;
        return true;
      },
    };
    // They wait in the chair until it has rolled back (updateRolls), then step out.
    if (chair) r.temp.delay = 99; else r.path = route;
    spotlightActors('letter', p.obj, [r]);
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

  // The letter in hand: a sheet held low and tipped up square to the reader's line of sight, below
  // the face as the camera sees it, a red stamp showing through it.
  // Takes the letter's named reader for it: out of any pose, standup or walk, to their own seat,
  // where the letter finds them. A moment actor, so they move through the decision's freeze.
  function claim(r, deskId, envelope) {
    if (r.hidden || r.goal?.hidden || r.staff.mood === 'away' || (r.temp?.moment && !r.temp.claim)) {
      note(r.id, 'refuse', { by: 'letter', why: r.hidden || r.goal?.hidden || r.staff.mood === 'away' ? 'out of the office' : `in moment ${r.temp.moment}` });
      return;
    }
    const d = office.deskById?.(deskId) ?? (r.seat != null ? office.deskById?.(r.seat) : null);
    if (!d?.seat) { note(r.id, 'refuse', { by: 'letter', why: 'no seat to go to' }); return; }
    const goal = { x: d.seat.x, z: d.seat.z, yaw: d.seat.rotY, anim: 'typing', seated: true };
    note(r.id, 'claim', { by: 'letter', from: r.temp?.anim ?? (r.path.length ? 'walking' : 'idle') });
    r.temp = { anim: 'typing', t: Infinity, goal, moment: 'letter', claim: true, envelope, stage: { beat: 'wait', target: envelope } };
    walkTo(r, goal);
  }
  function releaseLetter(r) {
    const tp = r.temp;
    tp.sheet?.removeFromParent();
    if (tp.envelope) tp.envelope.visible = true;
    r.temp = null;
    for (const q of rolls) if (q.r === r) q.route = null;
    if (r.goal) walkTo(r, r.goal);
  }
  // Ownership follows the prop, even when the clock is paused or another moment holds the room.
  function releaseLetters() {
    const cur = getProps()?.current() ?? [];
    for (const r of recs.values()) {
      const tp = r.temp;
      if (tp?.moment !== 'letter') continue;
      if (r.staff.mood === 'away' || r.goal?.hidden || (tp.claim && !cur.some((p) => p.obj === tp.envelope))) releaseLetter(r);
    }
  }
  function letterSheet(summons = false) {
    const g = summons ? new THREE.Mesh(SUMMONS_GEO, summonsMat()) : new THREE.Mesh(SHEET_GEO, sheetMat());
    g.position.set(0, 0.65, 0.40);
    g.rotation.x = 0.44;
    g.userData.noAO = true;
    return g;
  }

  // The visitor chair, staged by two decisions:
  // - first_user_test: a stranger sits at the chair trying the product, and the two founders hide
  //   nearby, crouched out of the stranger's sight but in the camera's, peeking. On "Watch in silence"
  //   they flinch together; on "Explain everything" one bursts out to point at the screen over the
  //   stranger's shoulder; on "Skip it" they get up and go back.
  // - efficiency_consultants: two consultants in suits, one seated interviewing, one standing with a
  //   clipboard, and a nervous colleague in front of them.
  // The visitors stay REACT_S after the choice so the reaction plays; the moment camera holds on them
  // and hitl:moment carries the decision's id for the caption. At Low quality, just a nervous emote.
  let visitor = null;     // { event, obj, at, yaw, chars: [], cast: [recs], resolved, left, mid, ... }
  // A visitor's look comes from the game, the week and the event (never from the game's random
  // stream), so it is the same every time that moment plays; a staged decision may pin it
  // (stage.look), for checks that need a particular look. Visitors are never the smallest build: at a
  // desk seen from the far side, too little of that one shows over the furniture.
  function visitorLook(event, rand, pinned = null) {
    const pick = (a) => a[Math.floor(rand() * a.length)];
    const look = event === 'efficiency_consultants'
      ? { skin: Math.floor(rand() * 6), hair: 1, hairColor: '#4a3222', shirt: '#3b4a6b', pants: '#2e3440', build: 1, accessory: 'glasses' }
      : { skin: Math.floor(rand() * 6), hair: Math.floor(rand() * 8), hairColor: pick(VISITOR_HAIR), shirt: pick(VISITOR_SHIRT), pants: pick(VISITOR_PANTS), build: 1 + Math.floor(rand() * 2), accessory: pick(['none', 'none', 'glasses', 'cap', 'beanie']) };
    return pinned ? { ...look, ...pinned } : look;
  }
  function makeVisitor(event, anim, rand, key, pinned = null, wardrobe = null) {
    const c = createCharacter(visitorLook(event, rand, pinned), P.metal_soft, { seed: `visitor-${key}`, wardrobe });
    c.setRingScale(0.0001);
    c.pickProxy.visible = false;
    c.setAnim(anim);
    parent.add(c.root);
    return c;
  }
  // Two spots side by side, 1.6 to 3.6 m from the chair, for the founders to crouch at. Best is out of
  // the visitor's sight (something opaque between the visitor's eyes and a crouched head), then facing
  // the camera while watching the visitor (so their faces read), then nothing in front on screen.
  const _eye = new THREE.Vector3(), _to = new THREE.Vector3();
  // seat: a visitor sat at a desk. They are absorbed in the screen, so well behind their back is out
  // of sight too; and founders peeking over the desk should not have it in front of them on screen.
  function hideSpots(at, seat = null) {
    const desk = seat && { x: at.x + Math.sin(seat.rotY) * 0.5, z: at.z + Math.cos(seat.rotY) * 0.5 };
    const behind = (q) => { if (!seat) return false; const a = Math.atan2(q.x - at.x, q.z - at.z) - seat.rotY; return Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) > BEHIND_RAD; };
    const nav = office.nav(), sight = office.sightBlockers({ shell: true }), cam = getYaw();
    _eye.set(at.x, 0.9, at.z);
    const hidden = (q) => {
      if (behind(q)) return true;
      _to.set(q.x - at.x, 0.45 - 0.9, q.z - at.z);
      const far = _to.length();
      ray.set(_eye, _to.normalize());
      ray.far = far - 0.3;
      return ray.intersectObjects(sight.targets, true).some((h) => h.distance > 0.35 && h.object.isMesh && sight.drawn(h.object) && !h.object.userData.propId);
    };
    const toward = (q) => Math.atan2(at.x - q.x, at.z - q.z);
    const costs = new Map(), views = new Map();
    const key = (q) => `${q.x},${q.z}`;
    const visible = (q) => { const k = key(q); if (!views.has(k)) views.set(k, inView(q)); return views.get(k); };
    const cost = (q) => {
      const k = key(q);
      if (costs.has(k)) return costs.get(k);
      const off = Math.abs(Math.atan2(Math.sin(toward(q) - cam), Math.cos(toward(q) - cam))) / Math.PI;
      // The visitor on screen in front of a founder hides them from the player: that costs too.
      const covered = (screenBlocked(q, [{ x: at.x, z: at.z, r: 0.35, top: 1.1 }]) ? 1.5 : 0) + (desk && screenBlocked(q, [{ ...desk, r: 0.85, top: 0.8 }]) ? 2 : 0);
      const value = (hidden(q) ? 0 : 2) + off * 3 + (columnInFront(q) ? 1 : 0) + covered;
      costs.set(k, value);
      return value;
    };
    function* candidates() {
      for (const radius of [2.2, 1.6, 2.8, 3.6]) for (let i = 0; i < 24; i++) {
        const a = (i / 24) * Math.PI * 2;
        const q = { x: at.x + Math.cos(a) * radius, z: at.z + Math.sin(a) * radius };
        for (const gap of [0.55, 0.75]) for (const k of [1, -1]) {
          const partner = { x: q.x + Math.cos(a + Math.PI / 2) * gap * k, z: q.z + Math.sin(a + Math.PI / 2) * gap * k };
          yield { ...q, partner };
        }
      }
    }
    const best = choose(at, 'visitor', 'hide', { candidates: candidates(), needs: ['clear', 'inView', 'partnerClear', 'partnerInView'], checks: {
      inView: visible,
      partnerClear: (q) => !nav.isBlocked(q.partner.x, q.partner.z, BODY_R),
      partnerInView: (q) => visible(q.partner),
    }, score: (q) => cost(q) + cost(q.partner) + (screenBlocked(q.partner, [{ ...q, r: 0.3, top: 1.1, either: true }]) ? 1.5 : 0),
    fallback: { x: at.x + 2, z: at.z, partner: { x: at.x + 2, z: at.z + 0.55 }, fallback: true } });
    return [best, best.partner].map((q) => ({ x: q.x, z: q.z, yaw: best.fallback ? -Math.PI / 2 : toward(q) }));
  }

  function visitorStart(p, state) {
    if (spotlighted.has(p.obj)) return;
    const event = stagedBy(state, 'visitor_chair')?.eventId ?? 'first_user_test';
    const o = p.obj;
    const v = visitor = { event, obj: o, at: { x: o.position.x, z: o.position.z }, yaw: o.rotation.y, chars: [], cast: [], resolved: null, t: 0, since: decisionSeq };
    // The user test happens at the desk: the stranger takes its seat, at the monitor, once whoever
    // sits there has got up to hide (the spare chair stays out of the way). The screen faces the
    // camera over their shoulder at a desk seen from behind.
    // The chair's own desk, or (staged on the floor, the event naming nobody) the desk nearest it.
    const nearest = () => [...office.placed.values()].filter((e) => e.desk?.seat).sort((a, b) => Math.hypot(a.desk.seat.x - o.position.x, a.desk.seat.z - o.position.z) - Math.hypot(b.desk.seat.x - o.position.x, b.desk.seat.z - o.position.z))[0]?.desk ?? null;
    const desk = event === 'first_user_test' ? office.deskById?.(o.userData.follow?.deskId) ?? nearest() : null;
    v.desk = desk;
    if (desk?.seat) {
      v.seat = desk.seat; v.at = { x: desk.seat.x, z: desk.seat.z }; v.yaw = desk.seat.rotY;
      // The spare chair, hidden, moves into the seat: as a floor prop it blocks the walking grid
      // there, so nobody walks through the chair the stranger sits in.
      const f = o.userData.follow;
      if (f) { f.lx = 0; f.lz = SEAT_LOCAL_Z; } else o.position.set(v.at.x, 0, v.at.z);
    }
    const key = `${state?.seed ?? 0}|${state?.week ?? 0}|${event}`;
    const rand = seededRand(key);
    const staged = state?.pendingDecision?.stage?.prop === 'visitor_chair' ? state.pendingDecision.stage : (state?.chatPrompts ?? []).find((x) => !x.resolved && x.stage?.prop === 'visitor_chair')?.stage;
    const pinned = staged?.look ?? null;
    v.chars.push(makeVisitor(event, v.seat ? 'typing' : 'sit', rand, `${key}|0`, pinned, wardrobeEra(state)));
    // The consultants' chair is staged at the door; their interview sets up a few metres in and to
    // one side, off the path everyone walks in and out by.
    if (event === 'efficiency_consultants') { const q = offDoor(v.at); if (q) v.at = q; }
    // Off a desk, the stranger sits in a chair of the moment's own, where the staged one stands (or
    // where the interview moved to): the staged chair leaves with the choice, and nobody may be left
    // sitting on air.
    if (!v.seat) {
      v.chair = visitorChairModel();
      v.chair.position.set(v.at.x, o.position.y, v.at.z); v.chair.rotation.y = o.rotation.y; v.chair.scale.setScalar(o.scale.x > 0.5 ? o.scale.x : 1);
      v.chars[0].root.parent.add(v.chair);
      v.chair.updateMatrixWorld(true);
      getProps()?.pin?.(v.chair);
    }
    const fwd = [Math.sin(v.yaw), Math.cos(v.yaw)], side = [Math.cos(v.yaw), -Math.sin(v.yaw)];
    if (event === 'efficiency_consultants') {
      // A nervous colleague is interviewed across from the seated consultant, the second consultant
      // behind with a clipboard. Face to face across the camera's view line, each turned three-quarters
      // to the camera, so all three faces read. Arms out low in front, the clipboard tipped up to be read.
      const rob = makeVisitor(event, 'carryhold', rand, `${key}|1`, null, wardrobeEra(state));
      rob.root.add(clipboard());
      v.chars.push(rob);
      const yaw = getYaw(), cam = [Math.sin(yaw), Math.cos(yaw)], across = [Math.cos(yaw), -Math.sin(yaw)];
      // The interviewee's side of the chair: whichever side has room and is in plain view.
      const candidates = [];
      for (const d of [1.3, 1.1, 1.5]) for (const sgn of [1, -1]) for (const back of [0.2, 0.05, 0.35]) {
        candidates.push({ x: v.at.x + across[0] * sgn * d - cam[0] * back, z: v.at.z + across[1] * sgn * d - cam[1] * back });
      }
      const spot = choose(v.at, 'visitor', 'interview', { candidates, needs: ['clear', 'inView'], checks: { inView: (q) => inView(q, { body: true, walls: true }) },
        fallback: () => choose(v.at, 'visitor', 'interviewFallback', { candidates: [1, -1].map((sgn) => ({ x: v.at.x + across[0] * sgn * 1.1, z: v.at.z + across[1] * sgn * 1.1 })), needs: ['clear'] }),
      });
      const toward = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
      const cheat = (y, k = CHEAT_TURN) => { const d = Math.atan2(Math.sin(yaw - y), Math.cos(yaw - y)); return y + Math.sign(d) * Math.min(Math.abs(d), k); };
      if (spot) {
        v.yaw = cheat(toward(v.at, spot));
        // The nervous one plays a little more to the room.
        spot.yaw = cheat(toward(spot, v.at), CHEAT_TURN * 1.1);
      }
      // The clipboard consultant stands at the seated one's shoulder, on the side away from the
      // interviewee and a little behind, clear of the chair so the camera sees all of them.
      const side = spot ? Math.sign((spot.x - v.at.x) * across[0] + (spot.z - v.at.z) * across[1]) || 1 : 1;
      v.robAt = { x: v.at.x - cam[0] * 0.3 - across[0] * side * 0.7, z: v.at.z - cam[1] * 0.3 - across[1] * side * 0.7 };
      v.robYaw = spot ? cheat(toward(v.robAt, spot)) : yaw;
      if (v.chair) v.chair.rotation.y = v.yaw;
      const r = spot && (pickIdle(1, spot)[0] ?? free().sort((a, b) => Math.hypot(a.pos.x - spot.x, a.pos.z - spot.z) - Math.hypot(b.pos.x - spot.x, b.pos.z - spot.z))[0]);
      if (r) {
        r.temp = { anim: 'fidget', t: 1e6, goal: spot, moment: 'visitor', emoteT: 1, stage: { beat: 'interview', role: 'interviewee', target: v.chars[0].root },
          tick: (rr, d, tp) => { tp.emoteT -= d; if (tp.emoteT <= 0) { tp.emoteT = rnd(2.5, 3.5); emote(rr, 'sweat', 2); } return false; } };
        (v.walks ??= []).push([r, spot]);
        v.cast.push(r);
        v.interviewee = r;
      } else note(null, 'refuse', { by: 'consultants', why: spot ? 'nobody free to interview' : 'no room beside the chair' });
    } else {
      // The founders, or failing that whoever is free, crouch out of sight and peek.
      const founders = free().filter((r) => r.staff.founder);
      const hiders = [...founders, ...pickIdle(2, v.at).filter((r) => !founders.includes(r))].slice(0, 2);
      const spots = hideSpots(v.at, v.seat ?? null);
      hiders.forEach((r, i) => {
        r.temp = { anim: 'hide', t: 1e6, goal: spots[i], moment: 'visitor', stage: { beat: 'hide', role: 'founder', target: v.chars[0].root } };
        (v.walks ??= []).push([r, spots[i]]);
        v.cast.push(r);
      });
    }
    v.mid = dispatch('start', event);
    v.spot = spotlights?.begin(event, () => { spotlighted.add(p.obj); endVisitor(); }, VISITOR_EXPECT_S, () => v.at);
  }
  // A spot in from the door and to one side of its path, with room across the view for a person
  // either side of a chair, that the camera sees; null when `at` isn't by the door or nothing fits.
  function offDoor(at) {
    const L = office.current?.L, d = L?.doorWorld;
    if (!d || Math.hypot(at.x - d.x, at.z - d.z) > OFF_DOOR_NEAR) return null;
    const l = Math.hypot(d.x, d.z) || 1, inx = -d.x / l, inz = -d.z / l;
    const nav = office.nav(), yaw = getYaw(), across = [Math.cos(yaw), -Math.sin(yaw)];
    function* candidates() {
      for (const along of [2.4, 3, 3.6]) for (const s of [1.6, -1.6, 2.2, -2.2]) {
        yield { x: d.x + inx * along - inz * s, z: d.z + inz * along + inx * s };
      }
    }
    return choose(at, 'visitor', 'offDoor', { candidates: candidates(), needs: ['interviewRoom', 'inView'], checks: {
      interviewRoom: (q) => [[0, 0], [across[0] * 1.3, across[1] * 1.3], [-across[0] * 1.3, -across[1] * 1.3]].every(([ax, az]) => !nav.isBlocked(q.x + ax, q.z + az, BODY_R)),
      inView: (q) => inView(q, { body: true, walls: true }),
    } });
  }

  // Someone right by the visitor's chair (sat at that desk) first steps to a free point nearby whose
  // straight line from them keeps clear of the chair, the one farthest from it; the way on is planned
  // from there. The walking grid's own start would be the nearest free cell, which can lie past the
  // chair that just appeared beside them.
  // seat: when `at` is a desk seat, whoever sits in it first backs out of it, away from the desk.
  function stepBackFrom(r, at, seat = null) {
    if (!r.path.length || Math.hypot(r.pos.x - at.x, r.pos.z - at.z) > 1.2) return;
    const nav = office.nav(), dest = r.path[r.path.length - 1];
    if (seat && Math.hypot(r.pos.x - at.x, r.pos.z - at.z) < 0.35) {
      const b = { x: at.x - Math.sin(seat.rotY) * SEAT_BACK, z: at.z - Math.cos(seat.rotY) * SEAT_BACK };
      if (choose(r.pos, 'visitor', 'seatBack', { candidates: [b], needs: ['clear'], checks: { clear: (q) => !nav.isBlocked(q.x, q.z) } })) { r.path = [b, ...nav.path(b, dest).slice(1)]; return; }
    }
    const clearOfChair = (b) => {
      // Distance from the chair's centre to the segment from the person to b.
      const dx = b.x - r.pos.x, dz = b.z - r.pos.z, l2 = dx * dx + dz * dz || 1;
      const k = Math.max(0, Math.min(1, ((at.x - r.pos.x) * dx + (at.z - r.pos.z) * dz) / l2));
      return Math.hypot(r.pos.x + dx * k - at.x, r.pos.z + dz * k - at.z) > 0.6;
    };
    const best = choose(r.pos, 'visitor', 'stepBack', { ring: { radii: [0.4, 0.6, 0.8, 1.0, 1.2], count: 16 }, needs: ['clear', 'chairClear'], checks: {
      clear: (q) => !nav.isBlocked(q.x, q.z), chairClear: clearOfChair,
    }, score: (q) => -Math.hypot(q.x - at.x, q.z - at.z) });
    if (best) r.path = [best, ...nav.path(best, dest).slice(1)];
  }
  function clipboard() {
    const board = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.015, 0.16), HANDLE_MAT);
    board.position.set(0, 0.5, 0.3);
    board.rotation.x = -0.5;
    return board;
  }
  // The choice is in: each cast member's reaction, then the visitors stay REACT_S.
  function visitorReact(v, choice) {
    v.resolved = choice;
    v.t = 0;
    if (v.event !== 'first_user_test') return;
    const [a, b] = v.cast;
    if (choice === 0) {
      // Watch in silence: each flinches as soon as they are in hiding (together, if both are), then
      // keeps hiding.
      for (const r of v.cast) r.temp.flinch = FLINCH_S;
    } else if (choice === 1 && a) {
      // Explain everything: the first bursts out to the stranger's side, leans in and points at the
      // screen.
      // The side of the visitor the camera sees, facing the screen in front of them.
      const back = [-Math.sin(v.yaw), -Math.cos(v.yaw)], side = [Math.cos(v.yaw), -Math.sin(v.yaw)];
      const screen = new THREE.Vector3(v.at.x - back[0] * 0.7, 0.9, v.at.z - back[1] * 0.7);
      const nav = office.nav(), fwd = [-back[0], -back[1]];
      const around = [];
      // At a desk seat, over the visitor's shoulder (behind them, the screen past them); at a spare
      // chair, beside it.
      const degs = v.seat ? [150, -150, 130, -130, 170, -170] : [90, -90, 60, -60, 120, -120, 30, -30, 150, -150];
      for (const d of [0.75, 0.9, 1.1, 1.3]) for (const deg of degs) {
        const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a);
        // deg off the visitor's facing: 0 ahead (the screen), 180 behind.
        around.push({ x: v.at.x + (fwd[0] * c + side[0] * sn) * d, z: v.at.z + (fwd[1] * c + side[1] * sn) * d });
      }
      const cols = (office.current.columns ?? []).map((col) => ({ x: col.x, z: col.z, r: COLUMN_SCREEN_R, top: col.h }));
      const spot = choose(v.at, 'visitor', 'explain', { candidates: around, needs: ['clear'], checks: {
        clear: (q) => !nav.isBlocked(q.x, q.z, EXPLAIN_CLEAR),
      }, score: (q) => !inView(q) || screenBlocked(q, cols) ? 2 : screenBlocked(q, [...cols, { x: v.at.x, z: v.at.z, r: 0.3, top: 1.1 }]) ? 1 : 0, fallback: around[0] });
      spot.yaw = Math.atan2(screen.x - spot.x, screen.z - spot.z);
      a.temp = { anim: 'pointscreen', t: 1e6, goal: spot, moment: 'visitor', run: true, stage: { beat: 'explain', role: 'founder', target: screen } };
      walkTo(a, spot, true);
      emote(a, 'lightbulb', 2);
      if (b) emote(b, 'sweat', 2.5);
    } else {
      releaseCast(v);
    }
  }
  function releaseCast(v) {
    for (const r of v.cast) if (r.temp?.moment === 'visitor') { r.temp = null; if (r.goal) walkTo(r, r.goal); }
    v.cast = [];
  }
  function visitorTick(p, dt, state) {
    if (lite() || !parent) {
      endVisitor();
      // Low quality: no visitor, just a nervous colleague now and then.
      if (p && due('visitor-lite', dt, [1, 2], [12, 18])) { const r = pickIdle(1, p.obj.position)[0]; if (r) emote(r, 'sweat', 2.2); }
      return;
    }
    if (p && (!visitor || (visitor.obj !== p.obj && visitor.resolved === null))) { endVisitor(); visitorStart(p, state); }
    const v = visitor;
    if (!v) return;
    v.t += dt;
    // The cast set off once the chair is on the walking grid (props join it the frame after they appear).
    if (v.walks && v.t >= SETTLE_S) {
      for (const [r, spot] of v.walks) if (r.temp?.moment === 'visitor') { walkTo(r, spot, r.temp.anim === 'hide'); stepBackFrom(r, v.at, v.seat); }
      v.walks = null;
    }
    const choice = (decidedAt.get(v.event) ?? 0) > v.since ? resolved.get(v.event) : undefined;
    if (v.resolved === null && choice !== undefined) visitorReact(v, choice ?? 2);
    // The chair went without a choice (the decision closed some other way): end now.
    if (!p && v.resolved === null) { endVisitor(); return; }
    for (const r of v.cast) {
      const tp = r.temp;
      if (tp?.moment !== 'visitor' || !(tp.flinch > 0) || r.path.length) continue;
      if (tp.anim !== 'flinch') { tp.anim = 'flinch'; tp.stage.beat = 'flinch'; emote(r, 'sweat', 2); }
      if ((tp.flinch -= dt) <= 0) { tp.anim = 'hide'; tp.stage.beat = 'hide'; }
    }
    if (v.resolved !== null && v.t >= REACT_S) { endVisitor(); return; }
    // The visitors keep their places (the prop may already be gone).
    const [sitter, rob] = v.chars;
    sitter.root.position.set(v.at.x, 0, v.at.z);
    sitter.root.rotation.y = v.yaw;
    if (v.seat) {
      // At the desk: the spare chair hides, and the stranger sits down once the seat is free.
      if (p) p.obj.visible = false;
      v.seated ||= ![...recs.values()].some((r) => !r.hidden && Math.hypot(r.pos.x - v.at.x, r.pos.z - v.at.z) < 0.45);
      sitter.root.visible = v.seated;
    } else {
      // Once the staged chair has popped in, the moment's own takes its place until the end.
      v.shown ||= !p || (p.obj.visible && p.obj.scale.x > 0.5);
      if (p && v.shown) p.obj.visible = false;
      sitter.root.visible = v.chair.visible = v.shown;
    }
    if (rob) {
      rob.root.position.set(v.robAt.x, 0, v.robAt.z);
      rob.root.rotation.y = v.robYaw ?? Math.atan2(v.at.x - v.robAt.x, v.at.z - v.robAt.z) + 0.6;
      rob.root.visible = sitter.root.visible;
    }
    for (const c of v.chars) { c.setWardrobe(wardrobeEra(state)); c.update(dt); }
    // Everyone cast gone (resigned, left): nothing to watch.
    if (v.cast.some((r) => !recs.has(r.id))) v.cast = v.cast.filter((r) => recs.has(r.id));
  }
  function endVisitor() {
    const v = visitor;
    if (!v) return;
    visitor = null;
    releaseCast(v);
    for (const c of v.chars) { c.root.removeFromParent(); c.dispose(); }
    if (v.chair) { v.chair.removeFromParent(); getProps()?.unpin?.(v.chair); }
    if (v.mid) dispatch('end', v.event, v.mid);
    spotlights?.end(v.spot);
  }

  // Smoke or a hot rack: someone comes over and fans it away.
  function fumes(p, dt) {
    if (!due(`fumes|${p.obj.uuid}`, dt, [2, 4], [16, 24])) return;
    // The item the fumes come from (the rack, the espresso machine): the placed item nearest the
    // effect. The effect's own box is no use; its smoke drifts a metre or more out into the room.
    new THREE.Box3().setFromObject(p.obj).getCenter(center);
    let item = null, best = Infinity;
    for (const e of office.placed.values()) { const d = Math.hypot(e.target.x - center.x, e.target.z - center.z); if (d < best) { best = d; item = e; } }
    // A prop that brought its own rack (rack_hot with none placed) is the source itself.
    const solid = p.obj.userData.blockPart;
    const box = new THREE.Box3().setFromObject(solid ?? item?.obj ?? p.obj);
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
    for (let k = 0; k < 5 && !cands.some((q) => inView(q, { body: true, walls: true })); k++) cands = ringSpots(center, Math.max(size.x, size.z) / 2 + 0.55 + k * 0.3, 12, { moment: 'fumes', search: `ring${k}` });
    const want = [Math.sin(yaw + FAN_SIDE), Math.cos(yaw + FAN_SIDE)], want2 = [Math.sin(yaw - FAN_SIDE), Math.cos(yaw - FAN_SIDE)];
    const score = (s) => { const dx = s.x - center.x, dz = s.z - center.z, l = Math.hypot(dx, dz) || 1; return Math.max((dx * want[0] + dz * want[1]) / l, (dx * want2[0] + dz * want2[1]) / l); };
    const spot = choose(center, 'fumes', 'visible', { candidates: cands, needs: ['inView'], checks: { inView: (q) => inView(q, { body: true, walls: true }) }, score: (q) => -score(q), fallback: () => choose(center, 'fumes', 'fallback', { candidates: cands, score: (q) => -score(q) }) });
    if (!spot) return;
    // Facing the room, three-quarters to the camera, waving the fumes off behind them.
    const toSource = Math.atan2(center.x - spot.x, center.z - spot.z);
    const toCamera = Math.atan2(Math.sin(yaw - toSource), Math.cos(yaw - toSource));
    spot.yaw = toSource + Math.sign(toCamera || 1) * FAN_TURN;
    r.face = null;
    r.temp = {
      anim: 'fanfrantic', t: rnd(3.5, 4.5), goal: spot, back: true, moment: 'fumes', emoteT: 0.2, stage: { beat: 'fan', target: new THREE.Vector3(center.x, box.max.y, center.z), source: p.obj },
      tick: (rr, d, tp) => { tp.stage.beat = Math.abs(Math.atan2(Math.sin(rr.yaw - tp.goal.yaw), Math.cos(rr.yaw - tp.goal.yaw))) < 0.1 ? 'fan' : 'turn'; tp.emoteT -= d; if (tp.emoteT <= 0) { tp.emoteT = 1.4; emote(rr, rr.char.emote === 'exclamation' ? 'sweat' : 'exclamation', 1.3); } return false; },
    };
    walkTo(r, spot);
    spotlightActors('fumes', p.obj, [r]);
  }

  // Pet carrier: the requester bends over it and peers in, now and then while it is down.
  function carrier(p, state, dt) {
    if (!due(`carrier|${p.obj.uuid}`, dt, [1, 2.5], [9, 14])) return;
    const subject = stagedBy(state, 'pet_carrier')?.subjectId;
    const r = (subject && free().includes(recs.get(subject))) ? recs.get(subject) : pickIdle(1, p.obj.position)[0];
    if (!r) return;
    if (lite()) { emote(r, 'heart', 2); return; }
    // Crouched on the carrier's far side, peering in over it toward the camera, so the face reads.
    const at = p.obj.getWorldPosition(new THREE.Vector3());
    const spot = ringSpots(at, 0.75, 1, { far: true, moment: 'carrier' })[0] ?? ringSpots(at, 0.75, 1, { moment: 'carrier', search: 'fallback' })[0];
    if (!spot) return;
    r.temp = { anim: 'peer', t: rnd(3.5, 5), goal: spot, back: true, moment: 'carrier', stage: { beat: 'peer', target: p.obj } };
    walkTo(r, spot);
    emote(r, 'heart', 2.2);
    spotlightActors('carrier', p.obj, [r]);
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
    const route = printerRoute(at, wreck.position, at.out);
    const pm = printer = {
      phase: 'gather', obj, people: near, bat: null, route, len: routeLength(route), s: 0, t: 0, cue: 0,
      clear: routeClear, side: size.x / 2 + GRIP_OUT, h: size.y, clearR: Math.hypot(size.x, size.z) / 2 + BODY_R, wreck, scale1: wreck.children[0]?.scale.x ?? JAM_SCALE, hit: 0, swung: -1,
    };
    // Gathering and the lift, then the cue from the carry to the walk-off.
    pm.spot = spotlights?.begin('printer_jam', printerEnd, PRINTER_GATHER_S + CUE.end, () => pm.obj.visible ? pm.obj.getWorldPosition(new THREE.Vector3()) : pm.end);
    pm.twists = twists(pm);
    const c = along(route, 0), ba = Math.atan2(c.dir[0], c.dir[1]) + Math.PI / 2, aside = pm.side + BAT_ASIDE;
    const nav = office.nav();
    pm.batAside = [
      { x: Math.sin(ba) * aside, z: Math.cos(ba) * aside }, { x: -Math.sin(ba) * aside, z: -Math.cos(ba) * aside },
      { x: -c.dir[0] * BAT_BEHIND, z: -c.dir[1] * BAT_BEHIND },
    ].find((o) => !nav.isBlocked(c.x + o.x, c.z + o.z, BODY_R)) ?? null;
    const spots = carrySpots(pm, c);
    obj.rotation.y = carryYaw(pm);
    if (near[2]) {
      pm.bat = batHeld();
      pm.bat.rotation.set(...BAT_SHOULDER);
      near[2].char.setHeld(pm.bat);
    }
    near.forEach((r, i) => {
      const goal = gatherSpot(spots[i], obj.position, pm.clearR);
      r.temp = { anim: 'idle', t: 1e6, goal, moment: 'printer', stage: { beat: 'gather', role: i < 2 ? 'carrier' : 'bat', target: obj, held: i < 2 ? obj : pm.bat } };
      walkTo(r, goal);
      r.path = aroundPrinter(r.pos, r.path, obj.position, pm.clearR);
    });
    return true;
  }
  // Where someone waits to pick the printer up: their grip, or, where the walk grid blocks it (a printer
  // wedged against a wall), the open floor on the printer's clearance circle (radius R about c) nearest
  // the grip's side. The grid doesn't know the printer, so the nearest open point to a blocked grip
  // could be inside it. The lift brings them in to the grip.
  function gatherSpot(spot, c, R) {
    const nav = office.nav();
    if (!nav.isBlocked(spot.x, spot.z, BODY_R)) return spot;
    const a0 = Math.atan2(spot.x - c.x, spot.z - c.z);
    for (let k = 0; k <= 12; k++) for (const sgn of k ? [1, -1] : [1]) {
      const a = a0 + sgn * k * Math.PI / 12, x = c.x + Math.sin(a) * R, z = c.z + Math.cos(a) * R;
      if (!nav.isBlocked(x, z, BODY_R)) return { ...spot, x, z };
    }
    return spot;
  }
  // The walk grid doesn't know the carried printer: a walk to a grip that would cross it goes round
  // its clearance circle (radius R about c) instead, from where it first meets the circle to the
  // grip's side, then in to the grip.
  function aroundPrinter(from, path, c, R) {
    if (!path.length) return path;
    const pts = [{ x: from.x, z: from.z }, ...path];
    for (let i = 1; i < pts.length; i++) {
      const p = pts[i - 1], q = pts[i], dx = q.x - p.x, dz = q.z - p.z, l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((c.x - p.x) * dx + (c.z - p.z) * dz) / l2));
      if (Math.hypot(p.x + dx * t - c.x, p.z + dz * t - c.z) >= R) continue;
      // Where this leg enters the circle (or its start, if it starts inside).
      let e = 0;
      for (let k = 0; k <= 20; k++) if (Math.hypot(p.x + dx * k / 20 - c.x, p.z + dz * k / 20 - c.z) < R) { e = Math.max(0, (k - 1) / 20); break; }
      const goal = path.at(-1);
      const a0 = Math.atan2(p.x + dx * e - c.x, p.z + dz * e - c.z), a1 = Math.atan2(goal.x - c.x, goal.z - c.z);
      // The short way round, else the long way, whichever stays on open floor.
      const short = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0)), nav = office.nav();
      for (const da of [short, short - Math.sign(short || 1) * 2 * Math.PI]) {
        const n = Math.max(1, Math.ceil(Math.abs(da) / 0.35)), arc = [];
        for (let k = 0; k <= n; k++) { const a = a0 + da * k / n; arc.push({ x: c.x + Math.sin(a) * R, z: c.z + Math.cos(a) * R }); }
        if (arc.every((q) => !nav.isBlocked(q.x, q.z))) return [...pts.slice(1, i), ...arc, goal];
      }
      return path;
    }
    return path;
  }
  // From the printer's spot to the wreck's.
  let routeClear = 0;
  // out: for a printer with its back to a wall, the way into the room. The carry starts straight out
  // along it, so the pair lifts it standing either side along the wall rather than one in the wall.
  function printerRoute(at, end, out = null) {
    const to = end;
    const pts = [{ x: at.x, y: 0, z: at.z }];
    let from = at;
    if (out) {
      from = { x: at.x + out[0] * WALL_STEP_OUT, z: at.z + out[1] * WALL_STEP_OUT };
      pts.push({ x: from.x, y: 0, z: from.z });
    }
    // As wide a way as there is for the pair: the printer's half-width plus a carrier either side.
    const nav = office.nav();
    let way = null;
    for (const clear of [PAIR_CLEAR, PAIR_CLEAR * 0.7]) if ((way = nav.path({ x: from.x, z: from.z }, { x: to.x, z: to.z }, clear))) { routeClear = clear; break; }
    // Through a narrow aisle: as far from its sides as it can keep.
    if (!way) { way = nav.path({ x: from.x, z: from.z }, { x: to.x, z: to.z }, 0.35, { soft: true }); routeClear = -0.35; }
    for (const q of way ?? []) pts.push({ x: q.x, y: 0, z: q.z });
    pts.push({ x: end.x, y: 0, z: end.z });
    return pts.filter((q, i) => i === 0 || Math.hypot(q.x - pts[i - 1].x, q.z - pts[i - 1].z) > 0.05);
  }
  // Where each of them stands for a printer at route point c: the carriers either side of it facing
  // in, the third behind it facing along the way.
  function carrySpots(pm, c) {
    const a = carryYaw(pm) + Math.PI / 2, perp = [Math.sin(a), Math.cos(a)];
    const out = [1, -1].map((k) => ({ x: c.x + perp[0] * pm.side * k, y: c.y, z: c.z + perp[1] * pm.side * k, yaw: Math.atan2(-perp[0] * k, -perp[1] * k) }));
    const b = along(pm.route, Math.max(0, pm.s - BAT_BEHIND));
    // Until the printer is a bat's length out, the bat stands on open floor beside or behind where it
    // started (batAside) rather than in it, closing onto the way behind it as it goes.
    const k = Math.max(0, 1 - pm.s / BAT_BEHIND), off = pm.batAside ?? { x: 0, z: 0 };
    out.push({ x: b.x + off.x * k, y: b.y, z: b.z + off.z * k, yaw: Math.atan2(b.dir[0], b.dir[1]) });
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
    for (const search of Object.keys(debug.spots.printer ?? {})) if (search.startsWith('carry:')) delete debug.spots.printer[search];
    // Desk chairs stand out past their cells on the nav grid; a carrier keeps clear of each seat.
    const chairs = [...office.placed.values()].filter((e) => e.desk?.seat).map((e) => e.desk.seat);
    const nav = office.nav();
    const clear = (x, z) => !nav.isBlocked(x, z, BODY_R) && chairs.every((c) => Math.hypot(c.x - x, c.z - z) > CHAIR_CLEAR);
    const raw = [], keepAcross = [];
    for (let s = 0; s <= pm.len + 1e-6; s += TWIST_STEP) {
      const c = along(pm.route, s), a = Math.atan2(c.dir[0], c.dir[1]) + Math.PI / 2;
      const q = { x: c.x + Math.sin(a) * pm.side, z: c.z + Math.cos(a) * pm.side,
        partner: { x: c.x - Math.sin(a) * pm.side, z: c.z - Math.cos(a) * pm.side } };
      const wide = choose(c, 'printer', `carry:${raw.length}`, { candidates: [q], needs: ['clear', 'partnerClear'], checks: {
        clear: (p) => clear(p.x, p.z), partnerClear: (p) => clear(p.partner.x, p.partner.z),
      }, fallback: { x: c.x, z: c.z, endOn: true } });
      raw.push(wide.endOn ? 1 : 0);
      // End on, the carriers stand on the way itself only where it runs on past each of them. Within a
      // carrier's reach of either end one stands off it (at the start, often in the wall the printer
      // backs onto), so there the pair stays across unless the end-on spots are clear themselves.
      const onWay = s >= pm.side && s <= pm.len - pm.side;
      const endClear = clear(c.x + c.dir[0] * pm.side, c.z + c.dir[1] * pm.side) && clear(c.x - c.dir[0] * pm.side, c.z - c.dir[1] * pm.side);
      keepAcross.push(!onWay && !endClear);
    }
    const win = (arr, n, f) => arr.map((_, i) => f(arr.slice(Math.max(0, i - n), i + n + 1)));
    const endOn = win(raw, Math.round(END_ON_HOLD / TWIST_STEP), (xs) => Math.max(...xs)).map((v, i) => (keepAcross[i] ? 0 : v));
    return win(endOn, Math.round(TWIST_EASE / TWIST_STEP), (xs) => (xs.reduce((a, x) => a + x, 0) / xs.length) * Math.PI / 2);
  }
  function batHeld() {
    const g = new THREE.Group();
    // Hangs from the hand: the handle in the fist, the barrel beyond it.
    const bat = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.042, 0.78, 10), HANDLE_MAT);
    bat.position.y = -0.33;
    g.add(bat);
    return g;
  }
  function norm(x, z) { const l = Math.hypot(x, z) || 1; return [x / l, z / l]; }
  // How far roundPrinter's step from `from` to `to` goes, in metres.
  function arcLength(from, to, c, clearR) {
    let n = 0, p = from;
    for (let k = 1; k <= 12; k++) { const q = roundPrinter(from, to, c, clearR, k / 12); n += Math.hypot(q.x - p.x, q.z - p.z); p = q; }
    return n;
  }
  // A step from `from` to `to` round the printer at `c` rather than through it: the angle about it
  // eases from one to the other the short way, and the distance from it bulges out to `clearR` (its
  // half diagonal and a body) at the middle of the step, at e (0 to 1) of the way.
  function roundPrinter(from, to, c, clearR, e) {
    const r0 = Math.hypot(from.x - c.x, from.z - c.z), r1 = Math.hypot(to.x - c.x, to.z - c.z);
    const a0 = Math.atan2(from.x - c.x, from.z - c.z), a1 = Math.atan2(to.x - c.x, to.z - c.z);
    const da = Math.atan2(Math.sin(a1 - a0), Math.cos(a1 - a0));
    const bump = Math.max(0, clearR - Math.min(r0, r1)) * Math.sin(Math.PI * e);
    const r = r0 + (r1 - r0) * e + bump, a = a0 + da * e;
    return { x: c.x + Math.sin(a) * r, z: c.z + Math.cos(a) * r };
  }
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
        pm.liftFrom = pm.people.map((r) => ({ x: r.pos.x, z: r.pos.z }));
        // Each steps onto their grip over at least LIFT_STEP_S, and slowly enough that the step's top
        // speed (1.5 times its average, since it eases in and out) is their walking speed.
        const grips = carrySpots(pm, along(pm.route, 0));
        pm.liftS = pm.people.map((r, i) => Math.max(LIFT_STEP_S, 1.5 * arcLength(pm.liftFrom[i], grips[i], pm.obj.position, pm.clearR) / (r.speed || 1)));
        pm.liftEnd = Math.max(...pm.liftS);
        pm.people.forEach((r, i) => { r.temp.keepPos = true; r.temp.stage.beat = 'lift'; setAnim(r, pm.liftS[i] > LIFT_STEP_S ? 'walk' : i < 2 ? 'carryhold' : 'shoulder'); });
      }
      return;
    }
    if (pm.phase === 'lift') {
      // A walk that ended short of its spot (the grid keeps a body off a wall) closes the gap; the
      // printer comes up as the last of them arrives.
      carrySpots(pm, along(pm.route, 0)).forEach((q, i) => {
        const r = pm.people[i];
        if (!r) return;
        const k = Math.min(1, pm.t / pm.liftS[i]), e = k * k * (3 - 2 * k);
        place(r, { ...q, ...roundPrinter(pm.liftFrom[i], q, pm.obj.position, pm.clearR, e) });
        if (k >= 1 && r.temp.anim === 'walk') setAnim(r, i < 2 ? 'carryhold' : 'shoulder');
      });
      pm.obj.position.y = Math.min(1, Math.max(0, pm.t - (pm.liftEnd - LIFT_STEP_S)) / 0.5) * gripY(pm);
      if (pm.t >= pm.liftEnd + 0.2) {
        pm.phase = 'carry'; pm.t = 0;
        pm.speed = Math.min(CARRY_SPEED[1], Math.max(CARRY_SPEED[0], pm.len / CUE.down));
        pm.people.forEach((r, i) => { r.temp.stage.beat = 'carry'; setAnim(r, i < 2 ? 'carry' : 'shoulderwalk'); });
        pm.mid = dispatch('start', 'printer_jam');
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
        const at = roundPrinter(pm.from[i], to, c, pm.clearR, ew);
        r.pos.x = at.x; r.pos.z = at.z;
        if (r.temp.anim !== (kw < 1 ? 'walk' : 'idle')) setAnim(r, kw < 1 ? 'walk' : 'idle');
        if (kw >= 1) r.temp.stage.beat = 'watch';
      });
      if (bat) {
        const to = pm.swingSpot;
        bat.pos.x = pm.from[2].x + (to.x - pm.from[2].x) * e; bat.pos.z = pm.from[2].z + (to.z - pm.from[2].z) * e;
        const aim = pm.aim ?? c;
        bat.yaw = Math.atan2(aim.x - bat.pos.x, aim.z - bat.pos.z);
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
        if (pm.mid) dispatch('hit', 'printer_jam', pm.mid, { hit: pm.hit });
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
    return (q) => {
      if (!wreckBox.containsPoint(_q.set(q.x, 0.1, q.z)) && nav.isBlocked(q.x, q.z, BODY_R)) return 'clear';
      if (chairs.some((h) => Math.hypot(h.x - q.x, h.z - q.z) < CHAIR_CLEAR)) return 'chairClear';
      return true;
    };
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
      cands.push(q);
    }
    function* pairs() {
      for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) yield { ...cands[i], partner: cands[j] };
    }
    const picked = choose(c, 'printer', 'watch', { candidates: pairs(), minScore: 0, needs: ['standClear', 'partnerClear', 'apart'], checks: {
      standClear: ok, partnerClear: (q) => ok(q.partner), apart: (q) => Math.hypot(q.x - q.partner.x, q.z - q.partner.z) >= 0.8,
    }, score: (q) => cost(q) + cost(q.partner) + (screenBlocked(q, [{ ...q.partner, r: 0.3, top: 1.1, either: true }]) ? 1 : 0) });
    if (!picked) return null;
    const best = [picked, picked.partner];
    // Each carrier to the nearer spot.
    const [p, q] = best, [a, b] = pm.from;
    const cross = Math.hypot(a.x - p.x, a.z - p.z) + Math.hypot(b.x - q.x, b.z - q.z) > Math.hypot(a.x - q.x, a.z - q.z) + Math.hypot(b.x - p.x, b.z - p.z);
    return cross ? [q, p] : [p, q];
  }
  // The batter's spot round the printer's middle once it is set down at full size (its pivot is off
  // centre, so a spot round the pivot would sit nearer or further depending on how it was turned).
  function swingSpot(pm, end) {
    const mid = new THREE.Box3().setFromObject(pm.obj).getCenter(new THREE.Vector3());
    const k = pm.scale1 / (pm.obj.scale.x || 1);
    const c = { ...end, x: end.x + (mid.x - end.x) * k, z: end.z + (mid.z - end.z) * k };
    pm.aim = c;
    const away = getYaw() + Math.PI;
    const ang = carryYaw(pm) + Math.PI / 2, perp = [Math.sin(ang), Math.cos(ang)];
    const carriers = pm.watch ?? [1, -1].map((k) => ({ x: c.x + perp[0] * (pm.side + 0.45) * k, z: c.z + perp[1] * (pm.side + 0.45) * k }));
    const ok = standTest(pm);
    // Anything in the way on screen costs 2 (a column, the printer, or out of view), sharing a screen
    // strip with a carrier costs 1; the first spot with the least cost wins.
    const cols = (office.current.columns ?? []).map((col) => ({ x: col.x, z: col.z, r: COLUMN_SCREEN_R, top: col.h }));
    const strips = carriers.map((p) => ({ ...p, r: 0.3, top: 1.1, either: true }));
    const candidates = [1.3, -1.3, 1, -1, 1.7, -1.7, 0.6, -0.6, 2.2, -2.2, 0, Math.PI].map((d) => ({ x: c.x + Math.sin(away + d) * SWING_AT, z: c.z + Math.cos(away + d) * SWING_AT }));
    return choose(c, 'printer', 'swing', { candidates, minScore: 0, needs: ['standClear', 'carrierClear'], checks: {
      standClear: ok, carrierClear: (q) => carriers.every((p) => Math.hypot(p.x - q.x, p.z - q.z) >= 0.6),
    }, score: (q) => (inView(q) ? 0 : 2) + (screenBlocked(q, [...cols, { x: c.x, z: c.z, r: 0.35, top: 0.55 }]) ? 2 : 0) + (screenBlocked(q, strips) ? 1 : 0),
    fallback: { x: c.x - c.dir[0] * SWING_AT, z: c.z - c.dir[1] * SWING_AT } });
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
  // Everyone back to what they were doing, pleased with themselves.
  function release(pm) {
    pm.people.forEach((r, i) => {
      if (r === pm.people[2]) r.char.setHeld(null);
      r.temp = null;
      emote(r, 'heart', 2.5 + i * 0.3);
      if (r.goal) walkTo(r, r.goal);
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
    if (pm.mid) dispatch('end', 'printer_jam', pm.mid);
    spotlights?.end(pm.spot);
  }
  // Moment captions (ui): hitl:moment { phase, id, key }. A start makes the moment's id and returns it;
  // its end passes the same id back.
  let momentSeq = 0;
  // hitl:moment { phase: 'start' | 'end' | 'hit' | 'beat', id, key, ...extra }; 'hit' marks a beat
  // inside a moment as it lands (the printer's blows: { hit: 0.. }, the hammer into the all-hands
  // screen: { hit: 'screen' }); 'beat' names a stretch as it begins ({ beat: 'screen' } when the
  // all-hands screen appears, { beat: 'run' }).
  function dispatch(phase, key, id = null, extra = null) {
    if (phase === 'start') id = `${key}-${++momentSeq}`;
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('hitl:moment', { detail: { phase, id, key, ...extra } }));
    return id;
  }

  const y2k = createY2kMoment({ recs, office, parent, getProps, ringSpots, walkTo, low: lite, spotlights, dispatch });

  function update(dt, state) {
    y2k.update(dt, state);
    printerTick(dt);
    if (printerDue > 0) { printerDue -= dt; if (printerStart()) printerDue = 0; }
    for (const [k, t] of resolvedT) { if (t - dt <= 0) { resolvedT.delete(k); resolved.delete(k); } else resolvedT.set(k, t - dt); }
    updateBursts(dt);
    updateRolls(dt);
    updateWrecks(dt);
    const props = getProps();
    if (!props || !office.current) return;
    const cur = props.current();
    hammerTick(cur.find((p) => p.prop === 'sledgehammer') ?? null, state, dt);
    visitorTick(cur.find((p) => p.prop === 'visitor_chair') ?? null, dt, state);
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
    else { screenSpotlight = null; for (const k of [...timers.keys()]) if (k.startsWith('screen|')) timers.delete(k); }
  }

  function reset() { y2k.reset(); printerEnd(); printerDue = 0; rolls.length = 0; stopHammer(); for (const w of wrecks.splice(0)) w.screen.dispose(); hammerDone = null; endVisitor(); timers.clear(); resolved.clear(); resolvedT.clear(); }

  // What a moment says about someone now, for the staging probe (probe.js): the moment, its beat
  // ('walk' while they are on the way), the target they deal with, what they hold, the effect source.
  // The moment's own actors that are not staff (the visitors), with their stage records, for the
  // staging probe and checks: [{ id: 'visitor:0', char, stage: { moment, beat, role, target } }].
  function extras() {
    const v = visitor;
    if (!v) return [];
    const [sitter, rob] = v.chars;
    const consult = v.event === 'efficiency_consultants';
    const at = consult ? v.interviewee?.char.root ?? null : v.desk?.screen ?? null;
    const out = [];
    // The interview starts once the colleague has sat down across from them.
    const arrived = consult && v.interviewee && !v.interviewee.path.length;
    if (sitter?.root.visible) out.push({ id: 'visitor:0', char: sitter, stage: { moment: 'visitor', beat: consult ? (arrived ? 'interview' : 'wait') : 'test', role: consult ? 'consultant' : 'visitor', target: at, held: null, source: null } });
    if (rob?.root.visible) out.push({ id: 'visitor:1', char: rob, stage: { moment: 'visitor', beat: arrived ? 'interview' : 'wait', role: 'clipboard', target: at, held: null, source: null } });
    return out;
  }
  // The moment a temp stages: its own moment, or for a beat run elsewhere (a music night) the
  // stage record's.
  const stagedAs = (tp) => tp?.moment ?? tp?.stage?.moment ?? null;
  function staging(id) {
    if (typeof id === 'string' && id.startsWith('visitor:')) return extras().find((e) => e.id === id)?.stage ?? null;
    const r = recs.get(id), tp = r?.temp;
    if (!stagedAs(tp)) return null;
    const st = tp.stage ?? {};
    return { moment: stagedAs(tp), beat: r.path.length ? 'walk' : tp.delay > 0 ? 'wait' : st.beat ?? null, role: st.role ?? null, target: st.target ?? null, held: st.held ?? null, source: st.source ?? null };
  }

  function growthSpot(r) {
    return choose(r.pos, 'growth', 'honoree', {
      ring: { radii: [0.7, 1.1, 1.5, 2, 2.5], count: 16 },
      needs: ['clear', 'chairClear', 'inView'],
      checks: { inView: (q) => inView(q, { body: true, walls: true }) },
    });
  }
  return { growthSpot, inView, update, releaseLetters, reset, decided, staging, extras, kinds: KINDS, get visitorState() { return visitor; }, get printerState() { return printer; }, get printer() { return printer && { phase: printer.phase, cue: +printer.cue.toFixed(2), s: +printer.s.toFixed(2), len: +printer.len.toFixed(2), hit: printer.hit, ids: printer.people.map((r) => r.id), at: printer.people.map((r) => [+r.pos.x.toFixed(2), +r.pos.y.toFixed(2), +r.pos.z.toFixed(2)]) }; }, get hammer() { return hammer && { id: hammer.r.id, phase: hammer.phase, watchers: hammer.watchers.map((r) => r.id), path: hammer.r.path.length, temp: hammer.r.temp && { anim: hammer.r.temp.anim, t: +hammer.r.temp.t.toFixed(2), moment: hammer.r.temp.moment } }; }, set full(on) { full = !!on; }, get active() { return [...recs.values()].filter((r) => stagedAs(r.temp)).map((r) => [r.id, stagedAs(r.temp)]); } };
}
