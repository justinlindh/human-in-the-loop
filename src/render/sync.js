import { B } from '../sim/balance.js';
import { GROWTH } from './growth-tune.js';
import { createMomentSpeech } from './moment-speech.js';
import { createSpeechBudget } from './speech-budget.js';
import { createStandupSpeech, standupContext, standupRevision, standupText } from './standup-speech.js';
import * as THREE from 'three';
import { createCharacter } from './character.js';
import { PALETTE as P, ROLE_COLORS } from './palette.js';
import { glow } from './materials.js';
import { nocLook } from './noc.js';
import { createPerks } from './perks.js';
import { createPets } from './pets.js';
import { createRobot } from './robot.js';
import { createIncentives } from './incentives.js';
import { createMoments } from './moments.js';
import { createMomentCamera } from './momentcam.js';
import { createSpotlights } from './spotlight.js';
import { createGrowthMoments } from './growth-moments.js';
import { createOfficeGrowth, promotionWeek } from './growth-office.js';
import { MOMENT_KINDS } from './spotlight-kinds.js';
import { holdSeconds } from './reading.js';
import { pickSpot, spotDebug, spotRing } from './spots.js';
import { between, draw, fixed } from './rand.js';

// Keeps one character per staff member in step with state, and plays event effects.
// Characters are keyed by staff id; removed staff walk out and are disposed.

const WALK = 1.25;
const CHAIR_BACK_M = 0.55;
const BODY_R = 0.2;            // a standing person's footprint radius     // where a sitter stops behind their chair before sliding onto it
const CELEBRATE_ROOM = 0.25;   // clear floor around someone who stops to celebrate
const CELEBRATE_APART = 0.5;   // and nobody else nearer than this
const GLIDE_M = 0.8;           // further than this from their spot (beyond a seat's last step), people walk to it
const REWALK_S = 3;            // seconds between tries for someone left short of a spot they can't reach
const DOOR_SPREAD = 0.45;      // how far apart people leaving by the door head for
const ENTER_S = 0.7;           // sliding from the front of a couch or chair onto the spot
const LIE_ANIMS = new Set(['nap', 'lie', 'sprawl']);
const RUN = 2.8;
const SEATED_ANIM = { ok: 'typing', coasting: 'slumped', burnout: 'burnout' };
const TIRED_STAMINA = 25;           // below this a person shows the exhaustion warning signs
const isTired = (s) => s.mood !== 'burnout' && s.mood !== 'away' && Number.isFinite(s.stamina) && s.stamina < TIRED_STAMINA;
const STAT_TONES = new Set(['features', 'polish', 'reliability', 'novelty']);
const QUIET_R = 4;          // metres round a spotlight moment where only its own lines are spoken
const STANDUP_QUIET_M = 1.5;  // beyond the standup ring, how far other speech stays quiet
// Choosing who facepalms at a backfired post: someone in the camera's line within nearM to farM in
// front and acrossM to the side hides them; the weights favour clear, standing and idle people; a
// standing facepalmer turns this far off square to the camera.
const PALM_PICK = { nearM: 0.1, farM: 2.5, acrossM: 0.8, clear: 8, standing: 4, idle: 2, turn: 0.35 };
const POST_REACT_S = 2.2;
const PALM_SWIVEL = 1.4;       // radians a seated facepalmer swings round toward the camera
const SWIVEL = 0.9;            // radians a seated person turns in their chair, either way
// A standing person's bounds (metres) for screen tests, with room for a lean or a reaching arm:
// half-width and height.
const BODY_BOX = { r: 0.45, h: 1.3 };
// Incident responders stand at least `apart` metres from each other. Without named responders the
// nearest few run over for a moment: an arc `ring` metres from the rack (then `ringStep` wider),
// tried `turn` radians either side of the way each comes from. Named responders
// (state.outage.responderIds) hold their place until the all-clear: off every chair by
// `seatClear`, never within `hideAcross` of the line to the camera from a seated lead or another
// responder closer than `hideAlong`, nearest the hub and then (weighted by `sideWeight`) nearest
// where they come from, a place behind a column costing `columnCost` metres more. They work the
// rack or watch the lead's screen in turn with `anims` or `huddleAnims`; `cheer` is the
// all-clear's short celebration. One with nowhere in sight to stand keeps working at their own
// place and tries again `retry` seconds later.
// Rings searched round each kind of hub (metres): the rack's middle, the lead's chair.
const SPOT_RADII = { rack: [0.9, 1.1, 1.4, 1.8], desk: [0.6, 0.9, 1.2, 1.6] };
const RESPOND = { ring: 1.1, ringStep: 0.5, apart: 0.6, turn: 0.45, tries: 21, anims: ['rackfix', 'point', 'rackfix'], huddleAnims: ['pointscreen', 'idle', 'idle'], cheer: 1.4, seatClear: 0.5, sideWeight: 0.3, hideAcross: 0.4, hideAlong: 2.2, columnCost: 2, retry: 2 };
const NEAR_M = 1.8;            // closer than this, a conversation needs no walk
const WALK_MAX_S = 1.0;        // a walk-over longer than this is skipped; the opener talks from where they are
const FAST_HOLD = 0.9;         // at 4x, a line waits this long for a reply before showing

const jitter = (a, b) => between(a, b, 'fx');
function angleLerp(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export function createStaffSync({ office, parent, labels, fx, rig, caricature = () => null, setDim = () => {}, setAccent = () => {}, setPictureLight = () => {}, getProps = () => null, low = () => false }) {
  const speech = createSpeechBudget();
  const momentSpeech = createMomentSpeech();
  function speak(text, r, e = {}, checked = false) {
    if (!r || r.hidden || !text || (!checked && quieted(e, r))) return 0;
    if (standup && !e.standup && !e.moment && (nearStandup(r) || nearStandup(e.toId && recs.get(e.toId)))) return 0;
    const seconds = holdSeconds(text, speed);
    if (!speech.admit(r.id, seconds, labels.speechCount?.() ?? 0, e)) return 0;
    labels.say(text, r.char.root, seconds, 1.45, { moment: !!e.moment });
    return seconds;
  }
  function clearForSpotlight(r) {
    // A priority scene may remove a bubble before its reading hold has elapsed.
    if (standup?.speech.current?.staffId === r.id && labels.speaking(r.char.root)) standup.speech.interrupt();
    labels.clearFor(r.char.root);
  }
  const group = new THREE.Group();
  group.name = 'staff';
  parent.add(group);
  const recs = new Map();       // staff id -> record
  const leavers = [];
  const hired = new Set();
  const leaving = new Map();    // staff id -> { fired }
  let stageSeen = -1;
  let lastL = null;
  let lastStage = -1;
  let firstSync = true;
  let lastState = null;
  const ledMats = {
    green: glow('led_green', 4), dim: glow('led_green', 0.5, 'dim'), amber: glow('led_amber', 4),
    red: glow('led_red', 5), redDim: glow('led_red', 1.2, 'dim'),
  };
  let ledClock = 0;

  let charShadows = true;
  function setCharacterShadows(on) {
    charShadows = on;
    for (const r of recs.values()) r.char.setShadows(on);
    for (const r of leavers) r.char.setShadows(on);
  }

  // Moment ownership trace, for checks (dump.mjs --trace, loop.mjs, clip.mjs): who sets each
  // person's temp (the pose or errand that overrides their goal), and when it starts, ends, is cut
  // short or replaced, with the function that did it; refusals and the decision freeze too. Off
  // unless a check turns it on.
  const trace = { on: false, t: 0, lines: [], max: 600, seq: 0 };
  // A refusal repeated for the same person within REFUSE_FOLD_S (a moment retrying every second) is
  // counted on the first line rather than logged again.
  const REFUSE_FOLD_S = 5;
  const lastRefuse = new Map();
  function traceLine(id, what, detail = {}) {
    if (!trace.on) return;
    if (what === 'refuse') {
      const k = `${id}|${detail.by}|${detail.why}`, prev = lastRefuse.get(id);
      if (prev?.k === k && trace.t - prev.at < REFUSE_FOLD_S) { prev.line.repeats = (prev.line.repeats ?? 1) + 1; prev.at = trace.t; return; }
      const line = { seq: trace.seq++, t: +trace.t.toFixed(2), id, what, ...detail };
      lastRefuse.set(id, { k, at: trace.t, line });
      trace.lines.push(line);
      if (trace.lines.length > trace.max) trace.lines.splice(0, trace.lines.length - trace.max);
      return;
    }
    trace.lines.push({ seq: trace.seq++, t: +trace.t.toFixed(2), id, what, ...detail });
    if (trace.lines.length > trace.max) trace.lines.splice(0, trace.lines.length - trace.max);
  }
  // The function that called into the temp setter: the first stack frame outside the tracer.
  function callerName() {
    for (const l of (new Error().stack ?? '').split('\n').slice(1)) {
      if (/callerName|traceTemp|\bset \[as temp\]|Object\.set\b/.test(l)) continue;
      const m = /at (?:Object\.|new )?([\w$.<>]+) \(.*?([\w.-]+\.js)/.exec(l) ?? /at .*?([\w.-]+\.js):(\d+)/.exec(l);
      if (m) return m[2] && !/^\d+$/.test(m[2]) ? `${m[1]} (${m[2]})` : `${m[1]}:${m[2]}`;
    }
    return '?';
  }
  const tempLabel = (t) => (t ? t.moment ?? t.perkKey ?? (t.standup ? 'standup' : null) ?? t.anim ?? 'temp' : null);
  function traceTemp(r, old, v) {
    const by = callerName();
    if (v) r.tempBy = by;
    if (!trace.on) return;
    const what = !old ? 'start' : !v ? (old.t <= 0.05 ? 'end' : 'interrupt') : 'replace';
    traceLine(r.id, what, { from: tempLabel(old), to: tempLabel(v), by });
  }

  function makeRec(s) {
    const char = createCharacter(s.appearance, ROLE_COLORS[s.role], { role: s.role, seed: s.id });
    if (!charShadows) char.setShadows(false);
    char.pickProxy.userData.staffId = s.id;
    group.add(char.root);
    const r = {
      id: s.id, char, pos: new THREE.Vector3(), yaw: 0, path: [], speed: WALK,
      goal: null, goalKey: '', seat: null, mode: 'placed', hidden: false,
      temp: null, emoteT: 0, moodEmoteT: between(6, 14, 'mood', s.id), staff: s, walkAnim: 'walk', tempBy: null,
    };
    if (trace.on) traceRec(r);
    return r;
  }
  // While the trace is on, temp becomes a property that reports each change; the game never pays
  // for it otherwise.
  function traceRec(r) {
    if (r.traced) return;
    r.traced = true;
    let temp = r.temp;
    Object.defineProperty(r, 'temp', { enumerable: true, get: () => temp, set: (v) => { if (trace.on && v !== temp) traceTemp(r, temp, v); temp = v; } });
  }

  function disposeRec(r) {
    labels.clearFor(r.char.root);
    r.char.dispose();
  }

  // Seats follow the sim's staff.deskId (null: no desk). Without the field, staff[i] takes the
  // i-th desk in office.placed.
  function assignSeats(list, state) {
    const deskIds = (state.office?.placed ?? []).filter((p) => office.deskById(p.id)).map((p) => p.id);
    let k = 0;
    for (const s of list) {
      const r = recs.get(s.id);
      if ('deskId' in s) r.seat = s.deskId && office.deskById(s.deskId) ? s.deskId : null;
      else r.seat = deskIds[k++] ?? null;
    }
  }

  function openSpot() {
    const W = office.current.zones.wander ?? [];
    return W.length ? W[W.length - 1] : office.current.zones.door;
  }

  // Where someone should be and what they should be doing, from assignment and mood.
  function goalFor(s, r, roleIndex) {
    const cur = office.current;
    const Z = cur.zones;
    const type = s.assignment?.type ?? 'idle';
    // Out the door. Each person heads for their own spot around it, so two leaving together do not
    // walk into each other there.
    if (s.mood === 'away' || s.remote || type === 'sabbatical') {
      let h = 0;
      for (const ch of String(r.id)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
      // Their own angle around the door, turned on until the whole body is clear there.
      const nav = office.nav();
      let at = null;
      for (let i = 0; i < 12 && !at; i++) {
        const a = (h % 360) * Math.PI / 180 + i * Math.PI / 6, x = Z.door.x + Math.cos(a) * DOOR_SPREAD, z = Z.door.z + Math.sin(a) * DOOR_SPREAD;
        if (!nav.isBlocked(x, z, BODY_R)) at = { x, z };
      }
      at ??= nav.freePoint(Z.door.x, Z.door.z);
      return { hidden: true, x: at.x, z: at.z, yaw: 0, anim: 'idle', key: 'away' };
    }
    const desk = r.seat !== null ? office.deskById(r.seat) : null;
    const seated = (d) => ({ x: d.seat.x, z: d.seat.z, yaw: d.seat.rotY, anim: isTired(s) ? 'tired' : SEATED_ANIM[s.mood] ?? 'typing', seated: true });
    if (type === 'oversight') {
      const wall = [...office.placed.values()].find((it) => it.itemId === 'monitoring_wall');
      if (wall) {
        const o = wall.obj.position, ry = wall.obj.rotation.y;
        const off = (roleIndex.oversight % 3 - 1) * 0.6;
        return { x: o.x + Math.sin(ry) * 1.1 + Math.cos(ry) * off, z: o.z + Math.cos(ry) * 1.1 - Math.sin(ry) * off, yaw: ry + Math.PI, anim: 'idle', key: `ov-item-${off}` };
      }
      // No monitoring wall: overseers watch the racks, or stand by the door with a laptop.
      const rack = cur.dyn.racks[roleIndex.oversight % Math.max(1, cur.dyn.racks.length)];
      const k = roleIndex.oversight;
      if (rack) {
        const ry = rack.rotation.y, o = rack.position;
        const off = (k % 3 - 1) * 0.55;
        return { x: o.x + Math.sin(ry) * 1.2 + Math.cos(ry) * off, z: o.z + Math.cos(ry) * 1.2 - Math.sin(ry) * off, yaw: ry + Math.PI, anim: 'idle', key: `ov-rack-${k}` };
      }
      const p = openSpot();
      return { x: p.x + (k % 3) * 0.6, z: p.z + Math.floor(k / 3) * 0.6, yaw: Math.PI, anim: 'idle', key: `ov-${k}` };
    }
    // The NOC crew (security assignment) sits at the NOC while humans watch it: up on their feet during an
    // alert, and in a quiet stretch the first of them dozes off. Anyone past the seats stands behind.
    const noc = cur.dyn.noc;
    if (type === 'security' && noc && roleIndex.noc.mode === 'humans') {
      const k = roleIndex.security, { alert, quiet } = roleIndex.noc;
      const seat = !alert && noc.seats[k];
      if (seat) {
        const anim = quiet && k === 0 ? 'desknap' : noc.level === 1 ? 'sit' : 'typing';
        return { x: seat.x, z: seat.z, yaw: seat.yaw, anim, seated: true, dozing: anim === 'desknap', uses: noc.id, key: `noc-seat-${k}-${noc.id}-${anim}` };
      }
      const st = noc.stands[(alert ? k : k - noc.seats.length) % noc.stands.length];
      return { x: st.x, z: st.z, yaw: st.yaw, anim: 'idle', key: `noc-stand-${k}-${noc.id}-${alert ? 'a' : ''}` };
    }
    if (type === 'hardProblem') {
      const w = Z.whiteboard ?? { ...openSpot(), yaw: Math.PI };
      const k = roleIndex.hard;
      const rx = Math.cos(w.yaw), rz = -Math.sin(w.yaw);
      const off = (k % 3 - 1) * 0.6, back = Math.floor(k / 3) * 0.5;
      return { x: w.x + rx * off - Math.sin(w.yaw) * back, z: w.z + rz * off - Math.cos(w.yaw) * back, yaw: w.yaw, anim: 'idle', key: `hp-${k}-${w.x.toFixed(1)},${w.z.toFixed(1)}`, thinking: true };
    }
    if (type === 'mentor' && s.assignment.targetId) {
      const mentee = recs.get(s.assignment.targetId);
      const md = mentee?.seat != null ? office.deskById(mentee.seat) : null;
      if (md && mentee.staff.mood !== 'away') {
        const f = md.seat.rotY;
        const rx = Math.cos(f), rz = -Math.sin(f);
        return { x: md.seat.x - rx * 0.55 - Math.sin(f) * 0.15, z: md.seat.z - rz * 0.55 - Math.cos(f) * 0.15, yaw: f + 0.7, anim: 'idle', key: `mentor-${mentee.id}-${md.seat.x.toFixed(2)},${md.seat.z.toFixed(2)}`, mentoring: true };
      }
    }
    if (desk) return { ...seated(desk), key: `desk-${desk.seat.x.toFixed(2)},${desk.seat.z.toFixed(2)},${desk.seat.rotY.toFixed(2)}-${s.mood}-${isTired(s) ? 't' : ''}` };
    const W = Z.wander?.length ? Z.wander : [Z.door];
    const w = W[r.id.length % W.length];
    return { x: w.x + fixed('nodesk-x', s.id) - 0.5, z: w.z + fixed('nodesk-z', s.id) - 0.5, yaw: fixed('nodesk-yaw', s.id) * 6.28, anim: 'idle', key: 'nodesk' };
  }

  function walkTo(r, goal, run = false, from = r.goal) {
    const nav = office.nav();
    // A standing goal that falls inside furniture moves to the nearest walkable point.
    if (!goal.seated && !goal.onItem && nav.isBlocked(goal.x, goal.z)) Object.assign(goal, nav.freePoint(goal.x, goal.z));
    // A seat is reached from behind its chair; the last step onto it happens once they arrive.
    let to = goal;
    if (goal.seated) to = { x: goal.x - Math.sin(goal.yaw) * CHAIR_BACK_M, z: goal.z - Math.cos(goal.yaw) * CHAIR_BACK_M };
    r.path = nav.path({ x: r.pos.x, z: r.pos.z }, { x: to.x, z: to.z });
    r.path.shift();
    // Leaving a seat at an item (the NOC) the way they came: back out behind the chair first, the item
    // still theirs until they're clear of it, as at a desk.
    if (from && from !== goal && from.seated && from.uses && Math.hypot(r.pos.x - from.x, r.pos.z - from.z) < 0.3) {
      const back = { x: from.x - Math.sin(from.yaw) * CHAIR_BACK_M, z: from.z - Math.cos(from.yaw) * CHAIR_BACK_M };
      r.path = [back, ...nav.path(back, { x: to.x, z: to.z }).slice(1)];
      r.exitFrom = from.uses;
      r.exitSide = back;
    }
    // Starting inside furniture (an item placed where they stood) finds no path: out to the nearest
    // clear point first, then on from there.
    if (!r.path.length && nav.isBlocked(r.pos.x, r.pos.z, BODY_R)) {
      const p = clearOf(r, nav);
      r.path = [p, ...nav.path(p, { x: to.x, z: to.z }).slice(1)];
    }
    r.speed = run ? RUN : isTired(r.staff) ? WALK * 0.7 : WALK;
    r.walkAnim = run ? 'run' : 'walk';
  }

  function teleport(r, goal) {
    // A standing spot inside furniture moves to the nearest walkable point, as walkTo does.
    const nav = office.nav();
    if (!goal.seated && !goal.onItem && !goal.hidden && nav.isBlocked(goal.x, goal.z)) Object.assign(goal, nav.freePoint(goal.x, goal.z));
    r.pos.set(goal.x, 0, goal.z);
    r.yaw = goal.yaw;
    r.path = [];
  }

  function emote(r, kind, seconds = 2.5) {
    r.char.setEmote(kind);
    r.emoteT = seconds;
  }

  function sync(state) {
    lastState = state;
    growth.sync(state);
    officeGrowth.sync(state);
    const cur = office.current;
    if (!cur) return;
    const key = cur.key ?? cur.stage;
    const stageChanged = key !== stageSeen;
    // An HQ expansion grows the floor, so its centre (the world origin) moves: everyone keeps their
    // tile by shifting with it.
    if (stageChanged && lastL && cur.stage === lastStage) {
      const dx = (lastL.W - cur.L.W) / 2, dz = (lastL.D - cur.L.D) / 2;
      for (const r of [...recs.values(), ...leavers]) {
        r.pos.x += dx; r.pos.z += dz;
        for (const q of r.path) { q.x += dx; q.z += dz; }
      }
    }
    stageSeen = key;
    lastL = cur.L;
    lastStage = cur.stage;
    const list = state.staff ?? [];
    const ids = new Set(list.map((s) => s.id));

    // Removed staff walk out (or vanish quietly on a stage rebuild).
    for (const [id, r] of recs) {
      if (ids.has(id)) continue;
      recs.delete(id);
      const info = leaving.get(id);
      leaving.delete(id);
      if (r.hidden || stageChanged) { disposeRec(r); continue; }
      r.mode = 'leave';
      r.leaveT = 0;
      r.fired = !!info?.fired;
      r.char.setAnim('wave');
      emote(r, r.fired ? 'storm' : 'heart', 2.2);
      r.char.setRingScale(1);
      leavers.push(r);
    }

    for (const s of list) {
      let r = recs.get(s.id);
      if (!r) {
        r = makeRec(s);
        recs.set(s.id, r);
        r.isNew = true;
      }
      r.staff = s;
    }
    if (stageChanged) { for (const r of recs.values()) r.seat = null; momentSpeech.clear(); perks.reset(); pets.reset(); robot.reset(); incentives.reset(); moments.reset(); spotlights.clear(); }
    assignSeats(list, state);

    const roleIndex = { oversight: 0, hard: 0, security: 0 };
    const look = nocLook(state);
    const occupied = new Map();
    for (const s of list) {
      const r = recs.get(s.id);
      const idx = { oversight: roleIndex.oversight, hard: roleIndex.hard, security: roleIndex.security, noc: look };
      if (s.assignment?.type === 'security' && s.mood !== 'away' && !s.remote) roleIndex.security++;
      if (s.assignment?.type === 'oversight') roleIndex.oversight++;
      if (s.assignment?.type === 'hardProblem') roleIndex.hard++;
      const g = goalFor(s, r, idx);
      if (r.char.mood !== s.mood && s.mood !== 'away') r.char.setMood(s.mood);
      r.char.setTired(isTired(s));
      r.char.setLegend(!!s.legend);
      if (r.seat !== null) occupied.set(r.seat, s);

      if (r.isNew) {
        r.isNew = false;
        r.goal = g; r.goalKey = g.key;
        if (hired.has(s.id) && !firstSync && !g.hidden) {
          hired.delete(s.id);
          const d = cur.zones.door;
          r.pos.set(d.x, 0, d.z);
          r.yaw = Math.PI / 2;
          r.mode = 'enter';
          emote(r, 'sparkle', 2.5);
          walkTo(r, g);
        } else {
          teleport(r, g);
          r.hidden = !!g.hidden;
          r.char.root.visible = !r.hidden;
        }
        continue;
      }
      if (stageChanged) {
        r.goal = g; r.goalKey = g.key; r.temp = null;
        teleport(r, g);
        r.hidden = !!g.hidden;
        r.char.root.visible = !r.hidden;
        continue;
      }
      if (g.key !== r.goalKey) {
        const was = r.goal;
        r.goalKey = g.key;
        r.goal = g;
        if (g.hidden && !r.hidden) {
          walkTo(r, g, false, was);           // head for the door, then disappear
        } else if (!g.hidden && r.hidden) {
          const d = cur.zones.door;
          r.pos.set(d.x, 0, d.z);
          r.hidden = false;
          r.char.root.visible = true;
          walkTo(r, g);
        } else if (!r.temp) {
          // Mood-only changes at the same desk need no walk, and a walk still heading for the old
          // goal (the door, for a goal that went hidden and came back) stops where they are.
          if (Math.hypot(r.pos.x - g.x, r.pos.z - g.z) > 0.2) walkTo(r, g, false, was);
          else r.path = [];
        }
      }
    }
    firstSync = false;
    pets.sync(state);
    robot.sync(state);

    // Desk screens and sabbatical signs.
    const outage = !!state.outage;
    for (const d of cur.desks) {
      const s = occupied.get(d.id);
      const away = s && (s.mood === 'away' || s.assignment?.type === 'sabbatical');
      office.setDeskSign(d.id, !!away);
      const kind = outage ? 'red' : !s || away ? 'off' : s.mood === 'coasting' || s.mood === 'burnout' ? 'gray' : 'work';
      office.setDeskScreen(d.id, kind);
      office.setDeskRole(d.id, s && !away ? s.role : null);
    }
  }

  function recByName(name) {
    for (const r of recs.values()) if (r.staff.name === name) return r;
    return null;
  }

  function handleEvents(events, state) {
    const cur = office.current;
    if (state?.pendingDecision?.stage && events?.some(e => e.type === 'decision')) {
      // Old ambient bubbles would otherwise remain frozen behind the decision card.
      for (const r of recs.values()) if (onScreen(r) || r.temp?.moment) clearForSpotlight(r);
    }
    for (const e of events ?? []) {
      switch (e.type) {
        case 'hire': if (e.staffId) hired.add(e.staffId); break;
        case 'decisionResolved': momentSpeech.clear(e.eventId); moments.decided(e); break;
        case 'chatPromptResolved': {
          // A prompt that delivered an event resolves it as its card would have.
          const c = state?.chatPrompts?.find((x) => x.id === e.promptId);
          if (c?.stage) moments.decided({ eventId: c.kind, choice: e.choice, subjectId: c.subjectId ?? null });
          break;
        }
        case 'resign': leaving.set(e.staffId, { fired: !!e.fired }); break;
        case 'bubble': {
          const r = recs.get(e.staffId);
          if (!r || r.hidden) break;
          if (STAT_TONES.has(e.tone) || e.tone === 'good') labels.stat(e.text, e.tone, r.char.root);
          else if (e.tone === 'bad') emote(r, /z/i.test(e.text) ? 'zzz' : 'storm', 3);
          break;
        }
        case 'chat': {
          // Yak messages are typed, not spoken: a short typing emote, never a bubble.
          const r = (e.fromId && recs.get(e.fromId)) || recByName(e.from);
          if (!r || r.hidden || r.char.emote) break;
          emote(r, 'typing', 1.6);
          break;
        }
        case 'say': {
          if (!e.moment) { sayLine(e); break; }
          const resolved = events.find(x => x.type === 'decisionResolved' && x.eventId === e.moment);
          const prompt = state?.chatPrompts?.find(x => x.kind === e.moment);
          const choice = resolved?.choice ?? prompt?.resolved?.choice;
          const open = state?.pendingDecision?.eventId === e.moment || (prompt && !prompt.resolved);
          momentSpeech.add(e, { open: !!open, choice });
          break;
        }
        case 'celebrate': {
          if (e.staffId && promotionWeek(state.staff.find(p => p.id === e.staffId), state.week)) break;
          if (e.staffId) {
            const r = recs.get(e.staffId);
            if (r && !r.hidden && !r.temp?.standup) celebrate(r, 2.4, true);
          } else {
            companyParty(typeof e.cause === 'string' && e.cause ? e.cause : null);
          }
          break;
        }
        case 'posted': postReaction(e.outcome); break;
        case 'incident': incident(e, state); break;
        case 'standup': if (e.mode === 'daily') startStandup(e, state); break;
        case 'incentive': incentives.handle(e); break;
        case 'robot': robot.event(e); break;
        default: break;
      }
    }
    officeGrowth.events(events ?? [], state);
  }

  // Conversations: a say that answers or addresses someone in the office is staged between the
  // two of them. They turn to each other (a speaker far away walks over), the listener shows a
  // typing "..." until their reply, and at 4x only the last line of an exchange is shown.
  const sayIds = new Map();     // say id -> { root, staffId }
  const fastQ = new Map();      // root id -> { e, t } lines held at 4x
  // While a spotlight moment plays, speech in and round it is about the moment: a line not marked
  // as the moment's own (say.moment) from anyone in a moment or party, near where the spotlight
  // plays or on screen, is dropped, and one addressed to them too. Off screen every other line
  // still shows.
  let farLines = 0, quietKey = null;
  const quietNdc = new THREE.Vector3();
  // In the camera's frame (the moment camera is on the moment, so anyone seen is round it).
  function onScreen(x) {
    const cam = rig?.camera;
    if (!cam) return false;
    quietNdc.set(x.pos.x, 1, x.pos.z).project(cam);
    return Math.abs(quietNdc.x) < 1 && Math.abs(quietNdc.y) < 1;
  }
  function quieted(e, r) {
    const active = spotlights.current();
    if (e.moment) return !!active && e.moment !== active.kind;
    if (!active) return false;
    const at = spotlights.where();
    const near = (x) => x && (x.temp?.moment || x.temp?.party || (at && Math.hypot(x.pos.x - at.x, x.pos.z - at.z) < QUIET_R) || onScreen(x));
    if (near(r) || near(e.toId && recs.get(e.toId))) return true;
    return (farLines++ % 2) === 1;
  }

  function updateMomentSpeech(dt) {
    const active = spotlights.current();
    momentSpeech.step(dt, q => {
      const e = q.event, r = recs.get(e.staffId);
      if (!r || r.hidden) return 'drop';
      const pending = lastState?.pendingDecision?.eventId === e.moment
        || lastState?.chatPrompts?.some(p => p.kind === e.moment && !p.resolved);
      if (q.open && !pending) return 'drop';
      if (q.spot && q.spot !== active?.key) return 'drop';
      // Routine celebration lines wait their turn outside an ordered meeting; a spotlight keeps priority.
      if (standup && !active && !q.open && nearStandup(r)) return 'wait';
      if (active && active.kind !== e.moment) return 'wait';
      if (active) q.spot = active.key;
      if (q.age < B.momentSpeechStartDelay) return 'wait';
      if (e.moment === 'waffle_party' && !incentives.party) return 'wait';
      if (e.moment === 'music_night' && !incentives.dance) return 'wait';
      if (e.moment === 'printer_jam' && q.choice === 0 && !low()) {
        // The relief belongs after the final blow, never over the carry or wind-up.
        if (!moments.printerState?.smashed) return 'wait';
      }
      if (e.moment === 'open_plan_office' && q.choice === 0 && !low()
        && moments.hammer?.phase !== 'swing') return 'wait';
      if (q.open && r.path.length && r.temp?.moment) return 'wait';
      if (labels.speechCount?.() > 0) return 'wait';
      return 'play';
    }, e => {
      // Speaking does not turn or move someone out of the pose the moment owns.
      speak(e.text, recs.get(e.staffId), e);
      return holdSeconds(e.text, speed);
    });
  }

  function sayLine(e) {
    const r = recs.get(e.staffId);
    if (!r || r.hidden || !e.text) return;
    if (quieted(e, r)) return;
    const parent = e.replyTo ? sayIds.get(e.replyTo) : null;
    const root = parent?.root ?? e.id;
    sayIds.set(e.id, { root, staffId: e.staffId });
    if (sayIds.size > 300) sayIds.delete(sayIds.keys().next().value);
    const exchange = !!(e.toId || e.replyTo);
    if (!e.moment && speed >= 4 && exchange) { fastQ.set(root, { e, t: FAST_HOLD }); return; }
    showLine(e, parent, true);
  }

  function showLine(e, parent = e.replyTo ? sayIds.get(e.replyTo) : null, checked = false) {
    const r = recs.get(e.staffId);
    if (!r || r.hidden) return;
    if (!checked && quieted(e, r)) return;
    const otherId = e.toId ?? parent?.staffId ?? null;
    const other = otherId && otherId !== e.staffId ? recs.get(otherId) : null;
    const staged = other && !other.hidden && other.mode === 'placed';
    if (r.char.emote === 'typing') { r.char.setEmote(null); r.emoteT = 0; }
    if (staged) faceToward(other, r);
    // Only the opening line may walk over, and only a short way; its bubble then shows on arrival.
    if (staged && !e.replyTo && !other.temp?.talk && approach(r, other, e.text, e.moment)) return;
    speak(e.text, r, e, true);
    if (!staged) return;
    faceToward(r, other);
    if (speed < 4 && !other.char.emote && !labels.speaking?.(other.char.root)) emote(other, 'typing', 1.5);
  }

  // A Yak post lands in the office. Backfired: someone drops their face into their hand (a gesture
  // over whatever they're doing), the two nearest turn to look, and a couple more sweat. Landed: a
  // couple of people light up. Nobody in a staged moment reacts.
  function postReaction(outcome) {
    const here = [...recs.values()].filter((r) => !r.hidden && r.mode === 'placed' && !r.temp?.moment && (outcome === 'backfired' || !r.path.length));
    if (!here.length) return;
    if (outcome === 'landed') {
      for (let i = 0; i < 2 && here.length; i++) emote(here.splice(Math.floor(draw('post') * here.length), 1)[0], 'sparkle', 2);
      return;
    }
    if (outcome !== 'backfired') return;
    // Prefer a clear standing actor: a seated actor's monitor can hide the temple hand.
    const yaw = rig?.yaw ?? Math.PI / 4, cx = Math.sin(yaw), cz = Math.cos(yaw);
    const hides = (x, r) => { const dx = x.pos.x - r.pos.x, dz = x.pos.z - r.pos.z, along = dx * cx + dz * cz; return along > PALM_PICK.nearM && along < PALM_PICK.farM && Math.abs(dx * cz - dz * cx) < PALM_PICK.acrossM; };
    const pillar = (r) => (office.current?.columns ?? []).some((c) => { const dx = c.x - r.pos.x, dz = c.z - r.pos.z, along = dx * cx + dz * cz; return along > 0 && along < 3 && Math.abs(dx * cz - dz * cx) < 0.55; });
    const clear = (r) => !pillar(r) && !here.some((x) => x !== r && hides(x, r));
    // Clear actors win first, then standing actors, then the most camera-facing heading.
    const facing = (r) => Math.cos(r.yaw - yaw) + (clear(r) ? PALM_PICK.clear : 0) + (!r.char.seated ? PALM_PICK.standing : 0) + (!r.temp ? PALM_PICK.idle : 0);
    here.sort((a, b) => facing(b) - facing(a));
    const palm = here.shift();
    // No emote over the facepalmer: the head bows, and a bubble would sit over the face.
    // Bring the temple hand toward the camera instead of behind the far cheek.
    // Seated, they swing round in the chair further than for a glance, so a desk facing a wall still shows the palm.
    let turnTo = yaw + PALM_PICK.turn;
    const seat = palm.char.seated && palm.goal?.seated ? palm.goal : null;
    if (seat) {
      // Of the headings the chair reaches, the one nearest the camera.
      const steps = [-1, -0.5, 0, 0.5, 1].map((k) => seat.yaw + k * PALM_SWIVEL);
      turnTo = steps.reduce((a, b) => (Math.cos(b - yaw) > Math.cos(a - yaw) ? b : a));
    }
    palm.face = { yaw: turnTo, t: POST_REACT_S, post: true };
    palm.char.setEmote(null);
    palm.emoteT = 0;
    // Whichever hand's cheek the turn leaves facing the camera.
    palm.char.gesture('facepalm', POST_REACT_S, Math.sin(turnTo - yaw) >= 0 ? 1 : -1);
    const near = here.sort((a, b) => a.pos.distanceToSquared(palm.pos) - b.pos.distanceToSquared(palm.pos));
    // The nearest two turn to look. Nobody standing in front of the facepalmer on screen gets a
    // bubble, since it would sit over their face.
    near.slice(0, 2).forEach((r, i) => { faceToward(r, palm); if (!hides(r, palm)) emote(r, i ? 'sweat' : 'exclamation', POST_REACT_S); });
    const rest = near.slice(2).filter((r) => !hides(r, palm));
    for (let i = 0; i < 2 && rest.length; i++) emote(rest.splice(Math.floor(draw('post') * rest.length), 1)[0], 'sweat', POST_REACT_S);
  }

  // Turn toward someone for a few seconds; seated people only swivel so they stay in the chair.
  function faceToward(a, b) {
    if (a.char.anim === 'facepalm' || a.char.anim === 'facepalmsit') return;
    let yaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
    // Seated people (at a desk, or in a meeting chair for a standup) only swivel.
    const seat = a.temp?.seat ? a.temp.goal : a.goal?.seated && !a.path.length && !a.temp ? a.goal : null;
    if (seat) {
      let d = ((yaw - seat.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      yaw = seat.yaw + Math.max(-SWIVEL, Math.min(SWIVEL, d));
    }
    a.face = { yaw, t: 3.6 };
  }

  function approach(r, other, text, moment = null) {
    if (r.temp || r.path.length || r.mode !== 'placed' || r.staff.mood === 'burnout') return false;
    const dx = r.pos.x - other.pos.x, dz = r.pos.z - other.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < NEAR_M || d - 1.0 > WALK * WALK_MAX_S) return false;
    const spot = { x: other.pos.x + (dx / d) * 1.0, z: other.pos.z + (dz / d) * 1.0, yaw: Math.atan2(-dx, -dz), anim: 'idle' };
    r.temp = { anim: 'idle', t: 5, goal: spot, back: true, talk: true, sayText: text, sayMoment: moment };
    walkTo(r, spot);
    return true;
  }

  function updateFast(dt) {
    for (const [root, q] of fastQ) {
      q.t -= dt;
      if (q.t <= 0) { fastQ.delete(root); showLine(q.e); }
    }
  }

  // Someone already taken up: at a standup, or playing a part in a moment (moments.js), which ends
  // if they are called away.
  const taken = (r) => !!(r.temp?.standup || r.temp?.moment);

  // Whether someone can stop right where they are to celebrate: seated, or standing clear of
  // furniture and of everyone else. Otherwise they carry on to where they were going.
  function roomToCelebrate(r) {
    if (r.char.seated) return true;
    if (office.nav().isBlocked(r.pos.x, r.pos.z, CELEBRATE_ROOM)) return false;
    for (const o of recs.values()) if (o !== r && !o.hidden && o.pos.distanceTo(r.pos) < CELEBRATE_APART) return false;
    return true;
  }

  // Their own good news always shows as a sparkle; the pose needs clear floor around them.
  function celebrate(r, seconds, sparkle) {
    if (sparkle) emote(r, 'sparkle', seconds);
    if (r.temp?.moment) { traceLine(r.id, 'refuse', { by: 'celebrate', why: `in moment ${r.temp.moment}` }); return; }
    if (!roomToCelebrate(r)) { traceLine(r.id, 'refuse', { by: 'celebrate', why: 'no room' }); return; }
    r.temp = { anim: 'celebrate', t: seconds, keepPos: true };
  }

  const officeGrowth = createOfficeGrowth({ recs, labels, parent: group, low,
    blocked: () => !!(spotlights.current() || standup || incentives.party || incentives.dance || lastState?.pendingDecision || lastState?.chatPrompts?.some(c => !c.resolved && c.stage)),
    ready: (r, medium) => !growth.has(r.id) && !r.hidden && !r.goal?.hidden && r.char.root.visible && r.mode === 'placed' && !r.temp && !r.path.length && r.staff.mood !== 'away' && r.staff.mood !== 'burnout' && onScreen(r) && (!medium || roomToCelebrate(r)),
    faceToward: (r, star, seconds) => {
      let yaw = star ? Math.atan2(star.pos.x - r.pos.x, star.pos.z - r.pos.z) : (rig?.yaw ?? Math.PI / 4);
      if (r.char.seated && r.goal) {
        let d = Math.atan2(Math.sin(yaw - r.goal.yaw), Math.cos(yaw - r.goal.yaw));
        yaw = r.goal.yaw + Math.max(-GROWTH.turnLimit, Math.min(GROWTH.turnLimit, d));
      }
      r.face = { yaw, t: seconds };
    },
  });
  const growth = createGrowthMoments();
  let growthGlow = null;
  let growthCast = [];
  function startGrowth() {
    if (spotlights.current() || standup || incentives.party || incentives.dance) return;
    let spot;
    const beat = growth.take((id) => {
      const r = recs.get(id);
      return r && !r.hidden && !r.goal?.hidden && !r.temp && !r.path.length && !!(spot = moments.growthSpot(r));
    });
    if (!beat) return;
    if (!growthGlow) {
      growthGlow = new THREE.Mesh(new THREE.CircleGeometry(0.7, 32), new THREE.MeshBasicMaterial({ color: P.gold, transparent: true, opacity: 0.22, depthWrite: false }));
      growthGlow.rotation.x = -Math.PI / 2;
      group.add(growthGlow);
    }
    const star = recs.get(beat.staffId), seconds = MOMENT_KINDS[beat.kind].seconds;
    const crowd = [...recs.values()].filter((r) => r !== star && !r.hidden && !taken(r) && !r.path.length && roomToCelebrate(r) && r.pos.distanceTo(star.pos) < 3).slice(0, 2);
    growthCast = [star, ...crowd];
    star.face = null;
    walkTo(star, spot);
    for (const r of growthCast) {
      const seated = r.char.seated;
      r.temp = {
        anim: 'celebrate', t: seconds, keepPos: true, back: r === star, moment: 'growth',
        stage: { beat: 'cheer', role: r === star ? 'honoree' : 'coworker', target: star.char.root },
        tick: (rr, dt) => {
          if (rr !== star && seated) return false;
          const yaw = rr === star ? rig?.yaw ?? Math.PI / 4 : Math.atan2(star.pos.x - rr.pos.x, star.pos.z - rr.pos.z);
          if (rr === star) growthGlow.visible = !low();
          rr.yaw = angleLerp(rr.yaw, yaw, 1 - Math.exp(-dt * 8));
          return false;
        },
      };
      emote(r, r === star ? 'sparkle' : 'heart', seconds);
    }
    growthGlow.position.set(spot.x, 0.025, spot.z);
    growthGlow.visible = false;
    if (!low()) fx.confetti(star.pos.x, 1.2, star.pos.z, { spread: 0.5, power: 0.5 });
    const cast = [...growthCast];
    spotlights.begin(beat.kind, () => {
      for (const r of cast) if (r.temp?.moment === 'growth') { r.temp = null; if (r === star && r.goal) walkTo(r, r.goal); }
      growthGlow.visible = false;
    }, seconds + 8, () => star.pos, () => cast.some((r) => r.temp?.moment === 'growth'));
  }

  let lastParty = -1e9;
  const partyAt = new THREE.Object3D();
  let partyBanner = false, partyCast = [];
  function showBanner(cause) {
    if (!partyCast.length) return;
    partyAt.position.set(partyCast.reduce((v, r) => v + r.pos.x, 0) / partyCast.length, 0, partyCast.reduce((v, r) => v + r.pos.z, 0) / partyCast.length);
    if (!partyAt.parent) group.add(partyAt);
    labels.banner?.(cause, partyAt);
    partyBanner = true;
  }
  // cause: what the company is celebrating (celebrate.cause: "Product 5 launched", "Product of the
  // Year: Product 5"), shown as a banner over the crowd. No cause, no banner.
  function companyParty(cause = null) {
    const cur = office.current;
    if (!cur) return;
    // Only a company-wide celebrate throws a party (a launch or award on its own doesn't); two in
    // quick succession make one.
    const now = performance.now();
    // A second one's cause still gets its banner.
    if (now - lastParty < 1500) { if (cause && !partyBanner) showBanner(cause); return; }
    lastParty = now;
    partyBanner = false;
    const L = cur.L;
    for (let i = 0; i < 3; i++) fx.confetti(jitter(-L.W / 4, L.W / 4), 1.0, jitter(-L.D / 4, L.D / 4), { spread: 1.4 });
    let k = 0;
    const cast = [];
    for (const r of recs.values()) {
      if (r.hidden || r.mode !== 'placed' || taken(r) || !roomToCelebrate(r)) continue;
      r.temp = { anim: 'celebrate', t: 1.8 + (k++ % 5) * 0.12, keepPos: true, delay: (k % 7) * 0.08, moment: 'company_party', stage: { beat: 'cheer' } };
      cast.push(r);
    }
    partyCast = cast;
    if (cause) showBanner(cause);
    if (cast.length) spotlights.begin('company_party', () => {
      for (const r of cast) if (r.temp?.moment === 'company_party') r.temp = null;
    }, 3, () => ({ x: cast.reduce((v, r) => v + r.pos.x, 0) / cast.length, z: cast.reduce((v, r) => v + r.pos.z, 0) / cast.length }), () => cast.some((r) => r.temp?.moment === 'company_party'));
  }

  // The rack an incident plays at (the first placed one), or null in an office without one.
  const incidentRack = () => office.current?.dyn.racks[0] ?? null;
  // A place on an arc round the rack on the side `r` comes from, apart from `places` and clear of
  // furniture, so nobody crosses the group to reach their place.
  function arcSpot(r, hot, places) {
    const nav = office.nav();
    const toward = Math.atan2(r.pos.x - hot.x, r.pos.z - hot.z);
    for (let k = 0; k < RESPOND.tries; k++) {
      const j = k % 7, ring = RESPOND.ring + Math.floor(k / 7) * RESPOND.ringStep;
      const a = toward + Math.ceil(j / 2) * RESPOND.turn * (j % 2 ? 1 : -1);
      const x = hot.x + Math.sin(a) * ring, z = hot.z + Math.cos(a) * ring;
      if (nav.isBlocked(x, z, BODY_R) || places.some((p) => Math.hypot(p.x - x, p.z - z) < RESPOND.apart)) continue;
      return { x, z, yaw: Math.atan2(hot.x - x, hot.z - z), anim: 'idle' };
    }
    return null;
  }
  // Places already taken round the rack: other responders and anyone whose own goal stands there
  // (an overseer watching the racks).
  function rackPlaces(except) {
    return [...recs.values()].filter((r) => r !== except).flatMap((r) => [r.temp?.incident || r.temp?.respond ? r.temp.goal : null, !r.goal?.seated && !r.goal?.hidden ? r.goal : null]).filter(Boolean);
  }

  function incident(e, state) {
    const cur = office.current;
    if (!cur) return;
    const L = cur.L;
    const hot = incidentRack()?.position ?? new THREE.Vector3(0, 0, 0);
    fx.alarm(new THREE.Vector3(0, 0, 0), Math.min(L.W, L.D) * 0.3, e.caught ? 1.6 : 3.2);
    if (!e.caught) rig?.shake(0.22, 0.4);
    // An outage with named responders: they go to the rack and stay (updateResponders).
    if (!e.caught && state?.outage?.responderIds?.length && (hub = findHub(responderIds(state)))) return;
    // Otherwise the nearest few people run to the servers, then go back. People already responding
    // keep their places.
    const near = [...recs.values()].filter((r) => !r.hidden && r.mode === 'placed' && !taken(r) && !r.temp?.incident)
      .sort((a, b) => a.pos.distanceToSquared(hot) - b.pos.distanceToSquared(hot))
      .slice(0, e.caught ? 1 : 4);
    for (const r of near) {
      emote(r, 'exclamation', 3);
      const spot = arcSpot(r, hot, rackPlaces(r));
      if (!spot) continue;
      r.temp = { anim: 'idle', t: 5.5, goal: spot, back: true, run: true, incident: true };
      walkTo(r, spot, true);
    }
  }

  // Who is responding now: the outage's named responders, then whoever is still writing up the
  // postmortem (flags.postmortem, until its week).
  function responderIds(state) {
    const ids = new Set(state?.outage?.responderIds ?? []);
    const pm = state?.flags?.postmortem;
    if (pm && (state.week ?? 0) < pm.untilWeek) for (const id of pm.staffIds ?? []) ids.add(id);
    return ids;
  }
  // Responders gather where the fix happens (the hub) and stay until they are no longer named: at a
  // rack they work it; without one they crowd round a responder seated at a desk, who types while
  // the rest watch the screen. At the all-clear they cheer briefly and go back
  // to their places. Someone busy (a moment, a standup, a walk in or out) joins once free.
  let outageSeen = false, hub = null;
  // The hub holds for the whole outage while it stays usable: a rack still standing, a lead still
  // named and at the same desk. A rack whose every nearby spot is out of the camera's sight (its
  // front turned away) gives way to a desk.
  function findHub(ids) {
    if (hub?.kind === 'rack' && office.current?.dyn.racks.includes(hub.target)) return hub;
    if (hub?.kind === 'desk' && ids.has(hub.lead.id) && recs.get(hub.lead.id) === hub.lead && office.deskById(hub.lead.seat) === hub.desk) return hub;
    const rack = incidentRack();
    if (rack && [...spotRing(rack.position, { radii: SPOT_RADII.rack, count: 16 })].some((q) => spotFree(q, null, []) && moments.inView(q, { body: true, walls: true }))) return { kind: 'rack', target: rack };
    // The seated responder with the most room round their chair, and no column in front of it, leads;
    // ties go to the first named.
    let best = null, room = 0;
    for (const id of ids) {
      const r = recs.get(id), desk = r && !r.hidden && r.seat != null ? office.deskById(r.seat) : null;
      if (!desk || !r.goal?.seated) continue;
      const n = columnFront(desk.seat) ? 0 : [...spotRing(desk.seat, { radii: SPOT_RADII.desk, count: 16 })].filter((q) => spotFree(q, desk.seat, [])).length;
      if (!best || n > room) { best = { kind: 'desk', lead: r, desk, target: desk.screen ?? desk.obj }; room = n; }
    }
    return best;
  }
  // Whether a column nearer the camera than a person standing at `q` overlaps them on screen (the
  // column would fade over them): their screen rectangles, as the staging probe measures it.
  const colBox = new THREE.Box3(), bodyBox = new THREE.Box3(), corner = new THREE.Vector3();
  function screenRect(box, cam) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      corner.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).project(cam);
      x0 = Math.min(x0, corner.x); x1 = Math.max(x1, corner.x); y0 = Math.min(y0, corner.y); y1 = Math.max(y1, corner.y);
    }
    return { x0, x1, y0, y1 };
  }
  function columnFront(q) {
    const cam = rig?.camera, cols = office.current.columns ?? [];
    if (!cam || !cols.length) return false;
    bodyBox.min.set(q.x - BODY_BOX.r, 0, q.z - BODY_BOX.r);
    bodyBox.max.set(q.x + BODY_BOX.r, BODY_BOX.h, q.z + BODY_BOX.r);
    const b = screenRect(bodyBox, cam), own = cam.position.distanceTo(corner.set(q.x, 0.5, q.z));
    return cols.some((col) => {
      if (cam.position.distanceTo(corner.set(col.x, 0.5, col.z)) >= own) return false;
      colBox.min.set(col.x - 0.3, 0, col.z - 0.3);
      colBox.max.set(col.x + 0.3, col.h, col.z + 0.3);
      const c = screenRect(colBox, cam);
      return c.x0 < b.x1 && c.x1 > b.x0 && c.y0 < b.y1 && c.y1 > b.y0;
    });
  }
  // The tests a standing place passes, by name (for the spot search's diagnostics): clear of
  // furniture, `apart` from `places`, off every chair, and hiding nobody gathered (the seated lead, if
  // any, or anyone at `places`) nor hidden by them.
  function spotTests(lead, places) {
    const yaw = rig?.yaw ?? Math.PI / 4, cx = Math.sin(yaw), cz = Math.cos(yaw);
    const hides = (a, b) => { const dx = a.x - b.x, dz = a.z - b.z, along = dx * cx + dz * cz; return along > 0 && along < RESPOND.hideAlong && Math.abs(dx * cz - dz * cx) < RESPOND.hideAcross; };
    return {
      clear: (q) => !office.nav().isBlocked(q.x, q.z, BODY_R),
      apart: (q) => !places.some((p) => Math.hypot(p.x - q.x, p.z - q.z) < RESPOND.apart),
      seats: (q) => !office.current.desks.some((d) => Math.hypot(d.seat.x - q.x, d.seat.z - q.z) < RESPOND.seatClear),
      unhidden: (q) => !(lead && hides(q, lead)) && !places.some((p) => hides(q, p) || hides(p, q)),
    };
  }
  const SPOT_NEEDS = ['clear', 'apart', 'seats', 'unhidden'];
  function spotFree(q, lead, places) {
    const t = spotTests(lead, places);
    return SPOT_NEEDS.every((k) => t[k](q));
  }
  // A clear place near the hub (spotFree) that the camera sees whole, facing what it works on:
  // nearest the hub first, then nearest the side the person comes from, then clear of any column
  // that would fade over them (a faded column beats leaving someone out).
  const debugSpots = spotDebug(office);
  const rackMiddle = new THREE.Box3(), rackAim = new THREE.Vector3();
  function hubSpot(r, h, places) {
    const c = h.kind === 'rack' ? h.target.position : h.desk.seat;
    const aim = h.kind === 'rack' ? rackMiddle.setFromObject(h.target).getCenter(rackAim) : { x: c.x + Math.sin(c.rotY) * 0.55, z: c.z + Math.cos(c.rotY) * 0.55 };
    const spot = pickSpot(c, {
      ring: { radii: SPOT_RADII[h.kind], count: 16 },
      needs: [...SPOT_NEEDS, 'inView'],
      checks: { ...spotTests(h.kind === 'desk' ? c : null, places), inView: (q) => moments.inView(q, { body: true, walls: true }) },
      score: (q) => Math.hypot(q.x - c.x, q.z - c.z) + RESPOND.sideWeight * Math.hypot(q.x - r.pos.x, q.z - r.pos.z) + (columnFront(q) ? RESPOND.columnCost : 0),
      debug: debugSpots, moment: 'respond', search: h.kind,
    });
    return spot && { x: spot.x, z: spot.z, yaw: Math.atan2(aim.x - spot.x, aim.z - spot.z), anim: 'idle' };
  }

  function updateResponders(state) {
    const all = responderIds(state);
    hub = all.size ? findHub(all) : null;
    const ids = hub ? all : new Set();
    const cleared = outageSeen && !state?.outage;
    outageSeen = !!state?.outage;
    const beat = state?.outage ? 'fix' : 'writeup';
    for (const r of recs.values()) {
      const tp = r.temp;
      const lead = hub?.lead === r;
      if (tp?.respond && (!ids.has(r.id) || (tp.stage.role === 'lead') !== lead || tp.stage.target !== hub.target)) {
        r.temp = null;
        if (cleared && !r.hidden) { emote(r, 'sparkle', 2); r.temp = { anim: tp.stage.role === 'lead' ? 'growthclapsit' : 'celebrate', t: RESPOND.cheer, keepPos: true, back: tp.stage.role !== 'lead' }; }
        else if (r.goal && tp.stage.role !== 'lead') walkTo(r, r.goal);
        continue;
      }
      if (tp?.respond) { tp.stage.beat = beat; continue; }
      if (!ids.has(r.id) || r.hidden || r.mode !== 'placed' || (tp && !tp.incident)) continue;
      if (lead) {
        // The lead stays in their own chair: they join once seated there.
        if (r.path.length || Math.hypot(r.pos.x - r.goal.x, r.pos.z - r.goal.z) > 0.05) continue;
        emote(r, 'exclamation', 3);
        r.temp = { anim: 'typing', t: Infinity, keepPos: true, respond: true, moment: 'respond', stage: { beat, role: 'lead', target: hub.target } };
        continue;
      }
      // A search that found nothing waits a moment before the next: each costs sight tests.
      if ((r.respondRetry ?? 0) > playTime) continue;
      const places = rackPlaces(r);
      const spot = (hub.kind === 'rack' && tp?.incident && tp.goal) || hubSpot(r, hub, places);
      if (!spot) { r.respondRetry = playTime + RESPOND.retry; continue; }
      const k = [...recs.values()].filter((x) => x.temp?.respond && x.temp.stage.role !== 'lead').length;
      spot.anim = (hub.kind === 'rack' ? RESPOND.anims : RESPOND.huddleAnims)[k % 3];
      if (!tp?.incident) emote(r, 'exclamation', 3);
      r.temp = { anim: spot.anim, t: Infinity, goal: spot, run: true, respond: true, moment: 'respond', stage: { beat, role: 'responder', target: hub.target } };
      if (Math.hypot(r.pos.x - spot.x, r.pos.z - spot.z) > 0.05) walkTo(r, spot, true);
    }
  }

  // Perk visits (coffee, nap pod, couch, arcade, shelves, tables) replace plain wandering.
  const perks = createPerks({ office, recs, walkTo, emote, parent: group, isBusy: () => !!standup, low });
  const pets = createPets({ office, recs, emote, parent: group, getProps, resumeWalk: walkTo, low });
  const robot = createRobot({ office, recs, emote, parent: group, walkTo, inView: (q) => moments.inView(q, { body: true, walls: true }), camYaw: () => rig?.yaw ?? Math.PI / 4 });
  const momentCam = createMomentCamera(rig);
  const spotlights = createSpotlights({ camera: momentCam });
  const incentives = createIncentives({ office, recs, walkTo, emote, parent: group, caricature, setDim, setAccent, setPictureLight, getYaw: () => rig?.yaw ?? Math.PI / 4, rig, fx, spotlights, robot });
  // Ambient moments wait out a standup or party; a decision's own moment does not (the game holds
  // still behind its card, so a standup or party under way would never end).
  const moments = createMoments({ office, recs, walkTo, emote, getProps, low, fx, parent: group, note: (id, what, detail) => traceLine(id, what, detail), getYaw: () => rig?.yaw ?? Math.PI / 4, getCamera: () => rig?.camera ?? null, spotlights, isBusy: () => !lastState?.pendingDecision && !lastState?.chatPrompts?.some((c) => !c.resolved && c.stage) && (!!standup || !!incentives.party || !!incentives.dance) });

  const dir = new THREE.Vector3();
  function stepWalker(r, dt, anim) {
    const target = r.path[0];
    dir.set(target.x - r.pos.x, 0, target.z - r.pos.z);
    const d = dir.length();
    const step = r.speed * dt;
    if (d <= step) {
      r.pos.set(target.x, 0, target.z);
      r.path.shift();
    } else {
      dir.multiplyScalar(1 / d);
      r.pos.addScaledVector(dir, step);
      r.yaw = angleLerp(r.yaw, r.temp?.walkYaw ?? Math.atan2(dir.x, dir.z), 1 - Math.exp(-dt * 12));
    }
    keepOffRobot(r, target);
    r.char.setMoveSpeed(r.speed);
    r.char.setAnim(anim);
  }

  // The walk grid doesn't know where the office robot is: a walker whose step lands inside its
  // circle slides round it to the open floor on its edge nearest where they are, favouring the side
  // toward their target. One heading for a point inside the circle walks on.
  const ROUND = [0, 0.5, -0.5, 1, -1, 1.5, -1.5, 2, -2];
  function keepOffRobot(r, target) {
    const b = robot.blocker();
    if (!b) return;
    const dx = r.pos.x - b.x, dz = r.pos.z - b.z;
    if (Math.hypot(dx, dz) >= b.r || Math.hypot(target.x - b.x, target.z - b.z) < b.r) return;
    const a0 = Math.atan2(dz, dx), toward = Math.atan2(target.z - b.z, target.x - b.x);
    const side = Math.sin(toward - a0) >= 0 ? 1 : -1;
    const nav = office.nav();
    for (const k of ROUND) {
      const a = a0 + k * side;
      const x = b.x + Math.cos(a) * b.r, z = b.z + Math.sin(a) * b.r;
      if (!nav.isBlocked(x, z)) { r.pos.set(x, 0, z); return; }
    }
  }

  function updateRec(r, dt) {
    const c = r.char;
    if (r.face) { r.face.t -= dt; if (r.face.t <= 0) r.face = null; }
    if (r.emoteT > 0) { r.emoteT -= dt; if (r.emoteT <= 0) c.setEmote(null); }

    // Mood emotes now and then, so state reads without UI.
    r.moodEmoteT -= dt;
    // Not in the middle of a moment (moments.js): their own emotes carry it.
    if (r.moodEmoteT <= 0 && !r.hidden && !r.temp?.moment && !c.anim.startsWith('facepalm')) {
      // Each person's own stream, so one person's rolls never shift another's.
      const roll = () => draw('mood', r.id);
      r.moodEmoteT = 9 + roll() * 9;
      const m = r.staff.mood;
      if (!c.emote) {
        if (r.goal?.dozing && !r.path.length) { emote(r, 'zzz', 3); r.moodEmoteT = 4 + roll() * 3; }
        else if (m === 'burnout') emote(r, 'zzz', 3);
        else if (isTired(r.staff)) {
          emote(r, 'tired', 2.6);
          // Now and then a tired person nods off at the desk for a few seconds.
          if (r.goal?.seated && !r.temp && !r.path.length && roll() < 0.35) r.temp = { anim: 'desknap', t: 3 + roll() * 2, keepPos: true };
        }
        else if (m === 'coasting' && roll() < 0.6) emote(r, 'sweat', 2.5);
        else if (r.goal?.thinking && roll() < 0.7) emote(r, 'lightbulb', 2.5);
        else if (r.goal?.mentoring && roll() < 0.5) emote(r, 'heart', 2);
        // Nobody hums while the screens are taken over.
        else if (m === 'ok' && !getProps()?.overlay && roll() < 0.12) emote(r, 'music', 2.2);
      }
    }

    // Pause a walking reactor without discarding their route or errand.
    if ((c.anim === 'facepalm' || c.anim === 'facepalmsit') && r.face?.post && !r.temp?.moment) {
      r.yaw = angleLerp(r.yaw, r.face.yaw, 1 - Math.exp(-dt * 8));
    } else if (r.path.length) {
      stepWalker(r, dt, r.walkAnim);
      // Stepping off an item lasts until they reach the side they got on from.
      if (r.exitFrom && !r.path.includes(r.exitSide)) { r.exitFrom = null; r.exitSide = null; }
    } else if (r.temp) {
      const tp = r.temp;
      if (tp.delay > 0) { tp.delay -= dt; }
      else if (tp.enter && tp.enter.t < ENTER_S && tp.goal) {
        // Getting onto the furniture from its side: slide onto the spot seated, turning to the
        // spot's heading; a lying pose lies down once the slide ends, at full height.
        const en = tp.enter;
        en.from ??= { x: r.pos.x, z: r.pos.z };
        en.t = Math.min(ENTER_S, en.t + dt);
        const k = en.t / ENTER_S, e = k * k * (3 - 2 * k);
        r.pos.set(en.from.x + (tp.goal.x - en.from.x) * e, 0, en.from.z + (tp.goal.z - en.from.z) * e);
        r.yaw = angleLerp(r.yaw, tp.goal.yaw, 1 - Math.exp(-dt * 10));
        c.setAnim(LIE_ANIMS.has(tp.anim) ? 'sit' : tp.anim);
      } else {
        if (tp.sayText) { speak(tp.sayText, r, { moment: tp.sayMoment }); tp.sayText = null; }
        tp.t -= dt;
        if (!tp.tick?.(r, dt, tp)) c.setAnim(tp.anim);
        if (tp.goal && !tp.keepPos) r.yaw = angleLerp(r.yaw, r.face?.yaw ?? tp.goal.yaw, 1 - Math.exp(-dt * 6));
        if (tp.t <= 0) {
          r.temp = null;
          if (tp.back && r.goal) walkTo(r, r.goal);
          // Off the furniture the way they got on: back to the side they came from, then onward.
          if (tp.enter?.side) {
            const side = tp.enter.side;
            const rest = r.path.length ? office.nav().path(side, r.path[r.path.length - 1]) : [];
            r.path = [side, ...rest.slice(1)];
            r.exitFrom = tp.enter.item;
            r.exitSide = side;
          }
        }
      }
    } else if (r.goal) {
      if (r.goal.hidden) {
        if (!r.hidden) { r.hidden = true; c.root.visible = false; }
      } else {
        if (r.mode === 'enter') r.mode = 'placed';
        const g = r.goal;
        const d = Math.hypot(r.pos.x - g.x, r.pos.z - g.z);
        // Left away from their spot with no route (a pose that kept them where it caught them, a
        // goal that changed meanwhile): they walk back rather than glide there, once per goal.
        // One that walked and still stands short (no way in from here) tries again now and then
        // rather than gliding the rest of the way through the furniture.
        if (d > GLIDE_M && (r.walkedTo !== g || (!r.path.length && (r.rewalkT = (r.rewalkT ?? 0) - dt) <= 0))) { r.walkedTo = g; r.rewalkT = REWALK_S; walkTo(r, g); }
        if (r.path.length) stepWalker(r, dt, r.walkAnim);
        else {
          if (d > 0.05 && d <= GLIDE_M) r.pos.lerp(dir.set(g.x, 0, g.z), 1 - Math.exp(-dt * 8));
          r.yaw = angleLerp(r.yaw, r.face?.yaw ?? g.yaw, 1 - Math.exp(-dt * 8));
          c.setAnim(g.anim);
        }
      }
    }
    c.setRingScale(c.seated ? 1.4 : 1);
    c.root.position.copy(r.pos);
    // Lying on a nap pod lifts the whole character onto it once they have arrived.
    if (r.temp?.lift && !r.path.length) {
      const en = r.temp.enter;
      // Up onto the item during the first half of the slide.
      const k = en ? Math.min(1, (2 * en.t) / ENTER_S) : 1;
      c.root.position.y = r.temp.lift * k * k * (3 - 2 * k);
    }
    c.root.rotation.y = r.yaw;
    // While a new office lowers in, its people come with it (and are hidden before it appears).
    const sy = office.shellY;
    if (sy === null) c.root.visible = false;
    else if (!r.hidden) { c.root.visible = true; c.root.position.y += sy; }
    c.update(dt);
  }

  function updateLeaver(r, dt) {
    r.leaveT += dt;
    const c = r.char;
    if (r.emoteT > 0) { r.emoteT -= dt; if (r.emoteT <= 0) c.setEmote(null); }
    if (r.leaveT > 1.1 && !r.exitPath) {
      const d = office.current.zones.door;
      r.exitPath = true;
      walkTo(r, { x: d.x, z: d.z });
      r.speed = 1.0;
    }
    if (r.exitPath && r.path.length) stepWalker(r, dt, 'carry');
    else if (r.exitPath) {
      r.fade = (r.fade ?? 1) - dt * 2.5;
      const s = Math.max(0.001, r.fade);
      c.root.scale.setScalar(s);
      if (r.fade <= 0) return false;
    }
    c.root.position.copy(r.pos);
    c.root.rotation.y = r.yaw;
    c.update(dt);
    return true;
  }

  function updateLeds(dt) {
    ledClock += dt;
    if (ledClock < 0.125) return;
    const t = performance.now() / 1000;
    ledClock = 0;
    const leds = office.leds();
    const outage = !!lastState?.outage;
    const products = (lastState?.products ?? []).filter((p) => !p.killed).length;
    const rate = 0.6 + products * 0.45;
    for (const l of leds) {
      if (outage) l.mesh.material = Math.sin(t * 7 + l.phase * 0.2) > 0 ? ledMats.red : ledMats.redDim;
      else {
        const v = Math.sin(t * rate * (1 + (l.phase % 3) * 0.37) + l.phase);
        l.mesh.material = v > 0.55 ? ledMats.dim : v < -0.93 ? ledMats.amber : ledMats.green;
      }
    }
  }

  // Standups: attendees gather in a loose ring (meeting room when the stage has one, otherwise
  // the whiteboard), speak their lines in turn, then return. Timings scale with game speed; at 4x
  // there is no gathering, only a quick emote at the desk.
  const GATHER = 2.2;
  let speed = 1;
  let standup = null;
  // Whether someone stands close enough to the standup ring for their chatter to talk over it.
  const nearStandup = (x) => !!standup && !!x && Math.hypot(x.pos.x - standup.at.x, x.pos.z - standup.at.z) < standup.quietR;
  function setSpeed(k) { speed = k; officeGrowth.setSpeed(k); }

  // Where a standup gathers: around the meeting table, else in front of the whiteboard, else on
  // open floor. Everyone faces the middle of the group.
  // The most open patch of floor: the walkable cell farthest from anything blocked.
  function clearing() {
    const nav = office.nav();
    const L = office.current.L;
    const { nx, nz, cell, blocked } = nav;
    let best = null, bestD = -1;
    for (let i = 1; i < nx - 1; i++) for (let k = 1; k < nz - 1; k++) {
      if (blocked[i + k * nx]) continue;
      let d = 99;
      for (let r = 1; r < 12 && d === 99; r++) {
        for (let di = -r; di <= r && d === 99; di++) for (let dk = -r; dk <= r; dk++) {
          if (Math.max(Math.abs(di), Math.abs(dk)) !== r) continue;
          const a = i + di, b = k + dk;
          if (a < 0 || b < 0 || a >= nx || b >= nz || blocked[a + b * nx]) { d = r; break; }
        }
      }
      if (d > bestD) { bestD = d; best = { x: -L.W / 2 + (i + 0.5) * cell, z: -L.D / 2 + (k + 0.5) * cell }; }
    }
    return best ?? { x: 0, z: 0 };
  }

  // Keeps a gathering indoors: the ring's center moves inward until every spot is inside the walls
  // with a margin. onFloor then moves each spot to the nearest walkable point.
  function indoors(spots) {
    const L = office.current.L;
    const M = 0.6;
    for (let pass = 0; pass < 20; pass++) {
      let dx = 0, dz = 0;
      for (const p of spots) {
        if (p.x < -L.W / 2 + M) dx = Math.max(dx, -L.W / 2 + M - p.x);
        if (p.x > L.W / 2 - M) dx = Math.min(dx, L.W / 2 - M - p.x);
        if (p.z < -L.D / 2 + M) dz = Math.max(dz, -L.D / 2 + M - p.z);
        if (p.z > L.D / 2 - M) dz = Math.min(dz, L.D / 2 - M - p.z);
      }
      if (!dx && !dz) break;
      for (const p of spots) { p.x += dx; p.z += dz; p.cx += dx; p.cz += dz; }
    }
    return spots;
  }
  function onFloor(spots) {
    const nav = office.nav();
    for (const p of spots) Object.assign(p, nav.freePoint(p.x, p.z));
    return spots;
  }

  // Where a standup gathers. A ring whose spots mostly land on furniture (a board with desks in
  // front of it) moves to the most open floor instead.
  function ringSpots(n, out = 0) {
    const nav = office.nav();
    const crowded = (spots) => spots.filter((p) => nav.isBlocked(p.x, p.z, 0.2)).length > spots.length * 0.25;
    let spots = ringSpotsRaw(n, null, out);
    if (crowded(indoors(spots))) spots = indoors(ringSpotsRaw(n, clearing()));
    return onFloor(spots);
  }

  // `out` widens the ring round a meeting table, so standers stay clear of people in its chairs.
  function ringSpotsRaw(n, at = null, out = 0) {
    const Z = office.current.zones;
    const spots = [];
    if (Z.meeting && !at) {
      const M = Z.meeting;
      const a = M.L / 2 + 0.5 + out, b = M.D / 2 + 0.5 + out;
      const c = Math.cos(M.rotY), sn = Math.sin(M.rotY);
      for (let i = 0; i < n; i++) {
        const lap = Math.floor(i / 8);
        const t = ((i % 8) / Math.min(8, n - lap * 8)) * Math.PI * 2 + 0.4 + lap * 0.4;
        const lx = Math.cos(t) * (a + lap * 0.6), lz = Math.sin(t) * (b + lap * 0.6);
        spots.push({ x: M.x + c * lx + sn * lz, z: M.z - sn * lx + c * lz, cx: M.x, cz: M.z });
      }
      return spots;
    }
    const w = at ? null : Z.whiteboard;
    const base = at ?? w ?? clearing();
    const yaw = w?.yaw ?? Math.PI;
    // The ring sits in front of the board so faces and the board stay visible.
    const r = Math.max(0.6, n * 0.17);
    const cx = base.x - Math.sin(yaw) * (w ? r * 0.7 : 0), cz = base.z - Math.cos(yaw) * (w ? r * 0.7 : 0);
    for (let i = 0; i < n; i++) {
      const t = (i / n) * Math.PI * 2 + 2.2;
      spots.push({ x: cx + Math.cos(t) * r, z: cz + Math.sin(t) * r, cx, cz });
    }
    return spots;
  }

  // In-person standups are staged only every few game weeks so the office is not always in a
  // meeting; the other weeks get a quick emote at the desks and one short spoken update.
  const STAGE_GAP_S = 165;          // real seconds of play between staged standups
  let playTime = 0;
  let lastStagedAt = -Infinity;
  let lastStagedWeek = -Infinity;
  let standupCount = 0;

  function deskStandup(lines) {
    for (const l of lines) emote(recs.get(l.staffId), l.text ? 'lightbulb' : 'zzz', 1.4);
    // While a staged standup is still talking, the desk week stays silent so bubbles never overlap.
    if (speed >= 4 || standup) return;
    const said = lines.filter((l) => l.text).sort((a, b) => a.text.length - b.text.length)[0];
    if (said) speak(said.text, recs.get(said.staffId));
  }

  function startStandup(e, state) {
    // A spotlight owns the room's speech. Do not assemble a meeting that must wait silently for it.
    if (!office.current || spotlights.current()) return;
    const week = Number.isFinite(state?.week) ? state.week : standupCount;
    standupCount++;
    if (week < lastStagedWeek) { lastStagedWeek = -Infinity; lastStagedAt = -Infinity; }   // a new or loaded game
    // In person only now and then (by real play time, so speed doesn't change how often); a
    // standup still talking is never cut off, and the weeks between stay at the desks.
    const stage = !standup && speed < 4 && playTime - lastStagedAt >= STAGE_GAP_S;
    const present = (l) => { const r = recs.get(l.staffId); return r && !r.hidden && r.mode === 'placed' && !taken(r); };
    if (!stage) { deskStandup((e.lines ?? []).filter(present)); return; }
    const lines = (e.lines ?? []).filter((l) => { const r = recs.get(l.staffId); return r && !r.hidden && r.mode === 'placed' && !r.temp?.moment; });
    if (!lines.length) return;
    lastStagedWeek = week;
    lastStagedAt = playTime;
    // A speaker can take several turns, but occupies one place in the ring.
    const attendees = [...new Map(lines.map(l => [l.staffId, l])).values()];
    // At a meeting table (not on Low) attendees take its chairs, speakers first and in the chairs
    // facing the camera; anyone left over (everyone, on Low) stands round the table.
    const seats = !low() && office.current.zones.meeting?.seats?.length ? seatOrder(office.current.zones.meeting.seats) : [];
    const speaks = new Set(lines.filter((l) => l.text).map((l) => l.staffId));
    attendees.sort((a, b) => speaks.has(b.staffId) - speaks.has(a.staffId));
    const seated = attendees.slice(0, seats.length);
    const standing = attendees.slice(seats.length);
    const spots = [
      ...seated.map((l, i) => ({ seat: seats[i], x: seats[i].x, z: seats[i].z })),
      ...(standing.length ? (office.current.zones.meeting ? standersNear(office.current.zones.meeting, standing.length, seats.slice(0, seated.length)) : ringSpots(standing.length)) : []),
    ];
    const people = attendees.map((l, i) => {
      const r = recs.get(l.staffId);
      const sp = spots[i];
      labels.clearFor(r.char.root);
      if (sp.seat) {
        const st = sp.seat;
        const spot = { x: st.x, z: st.z, yaw: st.yaw, anim: 'sit' };
        // Reached from behind the chair, then a slide onto the seat (as onto a couch).
        const side = { x: st.x - Math.sin(st.yaw) * CHAIR_BACK_M, z: st.z - Math.cos(st.yaw) * CHAIR_BACK_M };
        r.temp = { anim: 'sit', t: Infinity, goal: spot, standup: true, seat: true, enter: { t: 0, side } };
        walkTo(r, { ...side, yaw: st.yaw });
      } else {
        const spot = { x: sp.x, z: sp.z, yaw: Math.atan2(sp.cx - sp.x, sp.cz - sp.z), anim: 'idle' };
        r.temp = { anim: 'idle', t: Infinity, goal: spot, standup: true };
        walkTo(r, spot);
      }
      // Everyone arrives within GATHER seconds (weeks are short); far walkers jog.
      let len = 0, px = r.pos.x, pz = r.pos.z;
      for (const q of r.path) { len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
      const need = len / (GATHER / (speed >= 2 ? 2 : 1));
      if (need > r.speed) { r.speed = need; r.walkAnim = need > 2 ? 'run' : 'walk'; }
      return { r };
    });
    const at = { x: spots.reduce((v, sp) => v + sp.x, 0) / spots.length, z: spots.reduce((v, sp) => v + sp.z, 0) / spots.length };
    const quietR = Math.max(0, ...spots.map((sp) => Math.hypot(sp.x - at.x, sp.z - at.z))) + STANDUP_QUIET_M;
    standup = { people, phase: 'gather', t: 0, speech: createStandupSpeech(lines), context: standupContext(state, e.lines), spoken: null, at, quietR };
    office.tuckMeetingChairs(true, seats.slice(0, seated.length).map((st) => st.chair));
  }

  // Standing places for those without a chair: free floor on widening rings round the table, clear of
  // the seats and each other, nearest ring first. Too few (a table boxed in by desks) falls back to
  // the usual ring.
  function standersNear(M, n, seats) {
    const nav = office.nav();
    const L = office.current.L;
    const c = Math.cos(M.rotY), sn = Math.sin(M.rotY);
    const yaw = rig?.yaw ?? Math.PI / 4, camX = Math.sin(yaw), camZ = Math.cos(yaw);
    const cands = [];
    for (let k = 0; k < 4; k++) {
      const a = M.L / 2 + 0.85 + k * 0.5, b = M.D / 2 + 0.85 + k * 0.5;
      const steps = 12 + k * 4;
      for (let i = 0; i < steps; i++) {
        const t = (i / steps) * Math.PI * 2 + k * 0.3;
        const lx = Math.cos(t) * a, lz = Math.sin(t) * b;
        const p = { x: M.x + c * lx + sn * lz, z: M.z - sn * lx + c * lz, cx: M.x, cz: M.z };
        if (Math.abs(p.x) > L.W / 2 - 0.6 || Math.abs(p.z) > L.D / 2 - 0.6 || nav.isBlocked(p.x, p.z, 0.25)) continue;
        // Standing between the camera and the table hides the people in its chairs.
        const toCam = ((p.x - M.x) * camX + (p.z - M.z) * camZ) / Math.hypot(p.x - M.x, p.z - M.z);
        cands.push({ p, score: k + Math.max(0, toCam) * 3 });
      }
    }
    cands.sort((u, v) => u.score - v.score);
    const taken = seats.map((st) => ({ x: st.x, z: st.z }));
    const out = [];
    for (const { p } of cands) {
      if (out.length === n) break;
      if (taken.some((q) => Math.hypot(q.x - p.x, q.z - p.z) < 0.6)) continue;
      taken.push(p);
      out.push(p);
    }
    return out.length === n ? out : ringSpots(n, 0.45);
  }

  // Meeting seats, best first: those whose sitter faces the camera most, so faces read.
  function seatOrder(seats) {
    const yaw = rig?.yaw ?? Math.PI / 4;
    return [...seats].sort((a, b) => Math.cos(b.yaw - yaw) - Math.cos(a.yaw - yaw));
  }

  function endStandup() {
    office.tuckMeetingChairs(false);
    for (const { r } of standup.people) {
      if (!recs.has(r.id) || r.temp?.standup !== true) continue;
      const tp = r.temp;
      r.temp = null;
      if (!r.goal || r.goal.hidden) continue;
      walkTo(r, r.goal);
      // Out of a meeting chair the way they got in: back behind it first, then on to their spot.
      if (tp.seat && tp.enter.from && r.path.length) {
        const side = tp.enter.side;
        r.path = [side, ...office.nav().path(side, r.path[r.path.length - 1]).slice(1)];
      }
    }
    standup = null;
  }

  function updateStandup(dt) {
    if (!standup) return;
    const st = standup;
    st.t += dt;
    // An attendee sent away follows the door goal instead of keeping the meeting's idle pose.
    for (const { r } of st.people) if (r.goal?.hidden && r.temp?.standup) { r.temp = null; labels.clearFor(r.char.root); }
    const live = st.people.filter((p) => recs.has(p.r.id) && !p.r.hidden && p.r.temp?.standup);
    if (!live.length) { endStandup(); return; }
    // At 4x and above the meeting is skipped: everyone goes back to what they were doing.
    if (speed >= 4) { if (st.spoken) labels.clearSpeech(st.spoken.root, st.spoken.text); endStandup(); return; }
    if (spotlights.current()) return;
    if (st.phase === 'gather') {
      // Talking starts once most of the ring is in place; stragglers finish walking in.
      const arrived = live.filter((p) => !p.r.path.length).length;
      if (arrived >= Math.ceil(live.length * 0.6) || st.t > GATHER / (speed >= 2 ? 2 : 1)) { st.phase = 'talk'; st.t = 0; }
      return;
    }
    if (st.phase === 'talk') {
      st.speech.step(dt, l => {
        const r = recs.get(l.staffId);
        if (!r || r.hidden || !r.temp?.standup) return 'drop';
        return r.path.length ? 'wait' : 'play';
      }, l => {
        const r = recs.get(l.staffId);
        if (l.text) {
          const text = standupText(l, st.context, lastState);
          const seconds = speak(text, r, { standup: true });
          if (seconds > 0) {
            st.spoken = { root: r.char.root, text };
            // The others in the ring turn to whoever is talking, for as long as the line shows.
            for (const { r: o } of st.people) if (o !== r && o.temp?.standup && !o.path.length) { faceToward(o, r); if (o.face) o.face.t = seconds; }
          }
          return seconds;
        }
        emote(r, r.staff.mood === 'burnout' ? 'zzz' : 'sweat', B.standupSilenceSeconds);
        return B.standupSilenceSeconds;
      });
      if (st.speech.done) { st.phase = 'close'; st.t = 0; }
      return;
    }
    if (st.phase === 'close' && st.t > 0.3) endStandup();
  }

  function refreshStandupContext() {
    if (!standup || !lastState) return;
    const revision = standupRevision(standup.context, lastState);
    if (!revision) return;
    const st = standup;
    if (st.spoken) labels.clearSpeech(st.spoken.root, st.spoken.text);
    const active = st.people.map(p => p.r).filter(r => recs.has(r.id) && !r.hidden && r.temp?.standup &&
      !['away', 'burnout', 'coasting'].includes(r.staff.mood) && !r.staff.remote && r.staff.assignment.type !== 'sabbatical');
    const texts = active.length > 1 ? [revision, 'What do we need to carry forward?', 'The facts, the next step, and who is checking it.'] : [revision];
    st.speech = createStandupSpeech(active.length ? texts.map((text, i) => ({ staffId: active[i % active.length].id, text })) : []);
    st.context = null; st.spoken = null;
    if (st.phase === 'close') { st.phase = 'talk'; st.t = 0; }
  }

  // paused: nothing moves, plans, or times out; people only breathe.
  // Furniture changed: walkers take a fresh path to where they were going, and anyone standing
  // where something now stands steps aside (sitters, people on a perk item, and leavers excepted).
  let navSeen = -1;
  function repath() {
    const nav = office.nav();
    for (const r of recs.values()) {
      if (r.hidden || r.mode !== 'placed' && r.mode !== 'enter') continue;
      if (r.path.length) {
        const end = r.path[r.path.length - 1];
        const goal = r.temp?.goal && !r.temp.enter ? r.temp.goal : r.goal;
        const dest = goal && Math.hypot(goal.x - end.x, goal.z - end.z) < 0.9 ? goal : { x: end.x, z: end.z };
        const speed = r.speed, anim = r.walkAnim;
        // Someone still stepping off an item keeps going out by its side, the item still theirs.
        const exit = r.exitFrom && r.path.includes(r.exitSide) ? { from: r.exitFrom, side: r.exitSide } : null;
        walkTo(r, dest);
        if (exit) {
          const to = r.path[r.path.length - 1] ?? dest;
          r.path = [exit.side, ...nav.path(exit.side, { x: to.x, z: to.z }).slice(1)];
          r.exitFrom = exit.from;
          r.exitSide = exit.side;
        }
        r.speed = speed; r.walkAnim = anim;
        continue;
      }
      if (r.temp?.enter || r.temp?.lift || r.goal?.seated && Math.hypot(r.pos.x - r.goal.x, r.pos.z - r.goal.z) < 0.3) continue;
      if (nav.isBlocked(r.pos.x, r.pos.z, BODY_R)) stepOut(r, nav);
    }
  }

  // The nearest point, in widening rings, where the whole body is clear.
  function clearOf(r, nav) {
    for (let d = 0.3; d < 3; d += 0.2) {
      for (let a = 0; a < 12; a++) {
        const q = { x: r.pos.x + Math.cos((a / 12) * Math.PI * 2) * d, z: r.pos.z + Math.sin((a / 12) * Math.PI * 2) * d };
        if (!nav.isBlocked(q.x, q.z, BODY_R)) return q;
      }
    }
    return nav.freePoint(r.pos.x, r.pos.z);
  }

  // Someone standing where the whole body is not clear walks out to the nearest point where it is.
  function stepOut(r, nav) {
    const p = clearOf(r, nav);
    r.path = [{ x: p.x, z: p.z }];
    if (r.temp) r.temp.goal = { ...r.temp.goal, x: p.x, z: p.z };
    else if (r.goal && !r.goal.seated) Object.assign(r.goal, r.goal && nav.isBlocked(r.goal.x, r.goal.z) ? p : {});
  }

  let frozen = false;
  function update(dt, { paused = false, moments: momentsToo = false } = {}) {
    if (!office.current) return;
    refreshStandupContext();
    moments.releaseLetters();
    spotlights.update();
    if (growthGlow && !growthCast.some((r) => r.temp?.moment === 'growth')) growthGlow.visible = false;
    trace.t += dt;
    if (paused !== frozen) { frozen = paused; traceLine(null, paused ? 'freeze' : 'unfreeze', { decision: lastState?.pendingDecision?.eventId ?? null }); }
    // A spotlight just began: bubbles already up round it go, so only the moment's own lines follow.
    const spot = spotlights.current();
    if (spot && spot.key !== quietKey) {
      const at = spotlights.where();
      for (const r of recs.values()) if (r.temp?.moment || r.temp?.party || (at && Math.hypot(r.pos.x - at.x, r.pos.z - at.z) < QUIET_R) || onScreen(r)) clearForSpotlight(r);
    }
    quietKey = spot?.key ?? null;
    officeGrowth.update(dt, { paused });
    if (paused) {
      // With a decision open (momentsToo), the moment it stages still plays: its actors, its
      // visitors and the moment camera. Everything else holds still.
      const staging = momentsToo && !!lastState?.pendingDecision;
      if (staging) {
        if (incentives.party || incentives.dance) incentives.update(dt);
        moments.update(dt, lastState); momentCam.update(dt);
      }
      // Nothing else advances, but everyone is still drawn where they are (new arrivals included).
      for (const r of [...recs.values(), ...leavers]) {
        if (staging && (r.temp?.moment || r.temp?.party) && recs.has(r.id)) { updateRec(r, dt); continue; }
        r.char.root.position.copy(r.pos);
        if (r.temp?.lift && !r.path.length) r.char.root.position.y = r.temp.lift;
        r.char.root.rotation.y = r.yaw;
        if (!r.hidden) r.char.breathe(dt);
      }
      if (staging) updateMomentSpeech(dt);
      return;
    }
    startGrowth();
    playTime += dt;
    speech.step(dt, lastState?.staff?.length ?? 0);
    if (office.navVersion !== navSeen) { navSeen = office.navVersion; repath(); }
    updateStandup(dt);
    updateFast(dt);
    perks.update(dt, lastState);
    pets.update(dt);
    robot.update(dt);
    incentives.update(dt);
    moments.update(dt, lastState);
    updateResponders(lastState);
    updateMomentSpeech(dt);
    momentCam.update(dt);
    for (const r of recs.values()) updateRec(r, dt);
    for (let i = leavers.length - 1; i >= 0; i--) {
      if (!updateLeaver(leavers[i], dt)) { disposeRec(leavers[i]); leavers.splice(i, 1); }
    }
    updateLeds(dt);
  }

  // Picking: character proxies first, then racks.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(clientX, clientY, camera, canvas) {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const proxies = [...recs.values()].filter((r) => !r.hidden).map((r) => r.char.pickProxy);
    const hit = raycaster.intersectObjects(proxies, false)[0];
    if (hit) return { kind: 'staff', id: hit.object.userData.staffId };
    const racks = office.current?.dyn.racks ?? [];
    const rh = raycaster.intersectObjects(racks, true)[0];
    if (rh) {
      let o = rh.object;
      while (o && !racks.includes(o)) o = o.parent;
      return { kind: 'rack', id: racks.indexOf(o) };
    }
    return { kind: null, id: null };
  }

  function positionOf(id) {
    return recs.get(id)?.pos ?? null;
  }

  function dispose() {
    spotlights.clear();
    officeGrowth.dispose();
    growthGlow?.geometry.dispose(); growthGlow?.material.dispose();
    for (const r of recs.values()) disposeRec(r);
    for (const r of leavers) disposeRec(r);
    recs.clear();
    leavers.length = 0;
  }

  return {
    // A staff member's character (character.js), for the staging probe.
    charOf(id) { return recs.get(id)?.char ?? null; },
    // For checks and the scene dump: where someone is headed and why (read only).
    // The moment ownership trace: trace.on = true starts it; lines(n) are the last n entries.
    trace: {
      get on() { return trace.on; },
      set on(v) { trace.on = !!v; if (v) for (const r of recs.values()) traceRec(r); else trace.lines.length = 0; },
      lines(n = 50) { return trace.lines.slice(-n); },
      // Refusals and other notes from the moments module.
      note(id, what, detail) { traceLine(id, what, detail); },
    },
    walkOf(id) {
      const r = recs.get(id);
      if (!r) return null;
      const pt = (p) => p && { x: p.x, z: p.z, ...(p.yaw != null ? { yaw: p.yaw } : {}) };
      const t = r.temp;
      return {
        mode: r.mode, hidden: !!r.hidden, speed: r.speed ?? null, path: r.path.map(pt),
        goal: r.goal && { ...pt(r.goal), key: r.goal.key ?? null, anim: r.goal.anim ?? null, seated: !!r.goal.seated, hidden: !!r.goal.hidden },
        temp: t && { anim: t.anim ?? null, t: t.t ?? null, delay: t.delay ?? 0, moment: t.moment ?? null, perk: t.perkKey ?? null, back: !!t.back, keepPos: !!t.keepPos, goal: pt(t.goal), by: r.tempBy },
      };
    },
    // Whether someone is in a seated pose (for checks).
    isSeated(id) { return !!recs.get(id)?.char.seated; },
    // Floor positions of everyone visible, for effects that react to where people are.
    positions() { const out = []; for (const r of recs.values()) if (!r.hidden) out.push(r.pos); return out; },
    // Checks: put someone in a temp and optionally set them walking across the office.
    catchFor(id, temp, { walk = false } = {}) {
      const r = recs.get(id);
      if (!r) return false;
      r.temp = temp ? { ...temp } : null;
      // The dilemma pose sweats for as long as it lasts.
      if (temp?.anim === 'dilemma') emote(r, 'sweat', Number.isFinite(temp.t) ? temp.t : 6);
      if (walk) { const d = office.current.zones.door; walkTo(r, office.nav().freePoint(d.x, d.z)); }
      return true;
    },
    endSpotlight() {
      const kind = spotlights.current()?.kind;
      if (kind) {
        momentSpeech.clear(kind);
        for (const r of recs.values()) labels.clearFor(r.char.root);
      }
      return spotlights.cut();
    },
    officeGrowth, sync, handleEvents, update, pick, positionOf, dispose, setSpeed, perks, pets, robot, incentives, moments, spotlights, setCharacterShadows,
    get playTime() { return playTime; },
    // Test hook: stand a person at a floor point, idle, with no errand.
    standAt(id, x, z) {
      const r = recs.get(id);
      if (!r) return false;
      r.temp = { anim: 'idle', t: 30, goal: { x, z, yaw: 0, anim: 'idle' }, back: true };
      r.path = [];
      r.pos.set(x, 0, z);
      return true;
    },
    get standup() { return standup ? { phase: standup.phase, n: standup.people.length, i: standup.speech.index, at: { ...standup.at }, quietR: standup.quietR } : null; },
    get count() { return recs.size; },
    get leaverCount() { return leavers.length; },
  };
}
