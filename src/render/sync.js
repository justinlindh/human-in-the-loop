import * as THREE from 'three';
import { createCharacter } from './character.js';
import { ROLE_COLORS } from './palette.js';
import { glow } from './materials.js';
import { createPerks } from './perks.js';
import { createPets } from './pets.js';
import { createIncentives } from './incentives.js';
import { holdSeconds } from './reading.js';

// Keeps one character per staff member in step with state, and plays event effects.
// Characters are keyed by staff id; removed staff walk out and are disposed.

const WALK = 1.25;
const CHAIR_BACK_M = 0.55;
const BODY_R = 0.2;            // a standing person's footprint radius     // where a sitter stops behind their chair before sliding onto it
const ENTER_S = 0.7;           // sliding from the front of a couch or chair onto the spot
const LIE_ANIMS = new Set(['nap', 'lie', 'sprawl']);
const RUN = 2.8;
const SEATED_ANIM = { ok: 'typing', coasting: 'slumped', burnout: 'burnout' };
const TIRED_STAMINA = 25;           // below this a person shows the exhaustion warning signs
const isTired = (s) => s.mood !== 'burnout' && s.mood !== 'away' && Number.isFinite(s.stamina) && s.stamina < TIRED_STAMINA;
const STAT_TONES = new Set(['features', 'polish', 'reliability', 'novelty']);
const MAX_SPEECH = 6;
const NEAR_M = 1.8;            // closer than this, a conversation needs no walk
const WALK_MAX_S = 1.0;        // a walk-over longer than this is skipped; the opener talks from where they are
const FAST_HOLD = 0.9;         // at 4x, a line waits this long for a reply before showing

function rnd(a, b) { return a + Math.random() * (b - a); }
function angleLerp(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export function createStaffSync({ office, parent, labels, fx, rig, caricature = () => null, setDim = () => {}, setAccent = () => {}, setPictureLight = () => {} }) {
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

  function makeRec(s) {
    const char = createCharacter(s.appearance, ROLE_COLORS[s.role], { role: s.role, seed: s.id });
    if (!charShadows) char.setShadows(false);
    char.pickProxy.userData.staffId = s.id;
    group.add(char.root);
    return {
      id: s.id, char, pos: new THREE.Vector3(), yaw: 0, path: [], speed: WALK,
      goal: null, goalKey: '', seat: null, mode: 'placed', hidden: false,
      temp: null, emoteT: 0, moodEmoteT: rnd(6, 14), staff: s, walkAnim: 'walk',
    };
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
    if (s.mood === 'away' || s.remote || type === 'sabbatical') return { hidden: true, x: Z.door.x, z: Z.door.z, yaw: 0, anim: 'idle', key: 'away' };
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
    return { x: w.x + rnd(-0.5, 0.5), z: w.z + rnd(-0.5, 0.5), yaw: rnd(0, 6.28), anim: 'idle', key: 'nodesk' };
  }

  function walkTo(r, goal, run = false) {
    const nav = office.nav();
    // A standing goal that falls inside furniture moves to the nearest walkable point.
    if (!goal.seated && !goal.onItem && nav.isBlocked(goal.x, goal.z)) Object.assign(goal, nav.freePoint(goal.x, goal.z));
    // A seat is reached from behind its chair; the last step onto it happens once they arrive.
    let to = goal;
    if (goal.seated) to = { x: goal.x - Math.sin(goal.yaw) * CHAIR_BACK_M, z: goal.z - Math.cos(goal.yaw) * CHAIR_BACK_M };
    r.path = nav.path({ x: r.pos.x, z: r.pos.z }, { x: to.x, z: to.z });
    r.path.shift();
    r.speed = run ? RUN : isTired(r.staff) ? WALK * 0.7 : WALK;
    r.walkAnim = run ? 'run' : 'walk';
  }

  function teleport(r, goal) {
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
    if (stageChanged) { for (const r of recs.values()) r.seat = null; perks.reset(); pets.reset(); incentives.reset(); }
    assignSeats(list, state);

    const roleIndex = { oversight: 0, hard: 0 };
    const occupied = new Map();
    for (const s of list) {
      const r = recs.get(s.id);
      const idx = { oversight: roleIndex.oversight, hard: roleIndex.hard };
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
        r.goalKey = g.key;
        r.goal = g;
        if (g.hidden && !r.hidden) {
          walkTo(r, g);           // head for the door, then disappear
        } else if (!g.hidden && r.hidden) {
          const d = cur.zones.door;
          r.pos.set(d.x, 0, d.z);
          r.hidden = false;
          r.char.root.visible = true;
          walkTo(r, g);
        } else if (!r.temp) {
          // Mood-only changes at the same desk need no walk.
          if (Math.hypot(r.pos.x - g.x, r.pos.z - g.z) > 0.2) walkTo(r, g);
        }
      }
    }
    firstSync = false;
    pets.sync(state);

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
    for (const e of events ?? []) {
      switch (e.type) {
        case 'hire': if (e.staffId) hired.add(e.staffId); break;
        case 'resign': leaving.set(e.staffId, { fired: !!e.fired }); break;
        case 'bubble': {
          const r = recs.get(e.staffId);
          if (!r || r.hidden) break;
          if (STAT_TONES.has(e.tone) || e.tone === 'good') labels.stat(e.text, e.tone, r.char.root);
          else if (e.tone === 'bad') emote(r, /z/i.test(e.text) ? 'zzz' : 'storm', 3);
          break;
        }
        case 'chat': {
          // Slackk messages are typed, not spoken: a short typing emote, never a bubble.
          const r = (e.fromId && recs.get(e.fromId)) || recByName(e.from);
          if (!r || r.hidden || r.char.emote) break;
          emote(r, 'typing', 1.6);
          break;
        }
        case 'say': sayLine(e); break;
        case 'celebrate': {
          if (e.staffId) {
            const r = recs.get(e.staffId);
            if (r && !r.hidden && !r.temp?.standup) celebrate(r, 2.4, true);
          } else {
            companyParty();
          }
          break;
        }
        case 'launch': companyParty(); break;
        case 'award': {
          const L = cur?.L;
          if (L) fx.confetti(0, 1.2, 0, { spread: 2.2, power: 1.25 });
          companyParty();
          break;
        }
        case 'incident': incident(e); break;
        case 'standup': if (e.mode === 'daily') startStandup(e, state); break;
        case 'incentive': incentives.handle(e); break;
        default: break;
      }
    }
    void state;
  }

  // Conversations: a say that answers or addresses someone in the office is staged between the
  // two of them. They turn to each other (a speaker far away walks over), the listener shows a
  // typing "..." until their reply, and at 4x only the last line of an exchange is shown.
  const sayIds = new Map();     // say id -> { root, staffId }
  const fastQ = new Map();      // root id -> { e, t } lines held at 4x
  function sayLine(e) {
    const r = recs.get(e.staffId);
    if (!r || r.hidden || !e.text) return;
    const parent = e.replyTo ? sayIds.get(e.replyTo) : null;
    const root = parent?.root ?? e.id;
    sayIds.set(e.id, { root, staffId: e.staffId });
    if (sayIds.size > 300) sayIds.delete(sayIds.keys().next().value);
    const exchange = !!(e.toId || e.replyTo);
    if (speed >= 4 && exchange) { fastQ.set(root, { e, t: FAST_HOLD }); return; }
    showLine(e, parent);
  }

  function showLine(e, parent = e.replyTo ? sayIds.get(e.replyTo) : null) {
    const r = recs.get(e.staffId);
    if (!r || r.hidden) return;
    const otherId = e.toId ?? parent?.staffId ?? null;
    const other = otherId && otherId !== e.staffId ? recs.get(otherId) : null;
    const staged = other && !other.hidden && other.mode === 'placed';
    if (!staged && labels.speechCount?.() >= MAX_SPEECH) return;
    if (r.char.emote === 'typing') { r.char.setEmote(null); r.emoteT = 0; }
    if (staged) faceToward(other, r);
    // Only the opening line may walk over, and only a short way; its bubble then shows on arrival.
    if (staged && !e.replyTo && !other.temp?.talk && approach(r, other, e.text)) return;
    labels.say(e.text, r.char.root, holdSeconds(e.text, speed));
    if (!staged) return;
    faceToward(r, other);
    if (speed < 4 && !other.char.emote && !labels.speaking?.(other.char.root)) emote(other, 'typing', 1.5);
  }

  // Turn toward someone for a few seconds; seated people only swivel so they stay in the chair.
  function faceToward(a, b) {
    let yaw = Math.atan2(b.pos.x - a.pos.x, b.pos.z - a.pos.z);
    if (a.goal?.seated && !a.path.length && !a.temp) {
      let d = ((yaw - a.goal.yaw + Math.PI) % (Math.PI * 2)) - Math.PI;
      if (d < -Math.PI) d += Math.PI * 2;
      yaw = a.goal.yaw + Math.max(-0.9, Math.min(0.9, d));
    }
    a.face = { yaw, t: 3.6 };
  }

  function approach(r, other, text) {
    if (r.temp || r.path.length || r.mode !== 'placed' || r.staff.mood === 'burnout') return false;
    const dx = r.pos.x - other.pos.x, dz = r.pos.z - other.pos.z;
    const d = Math.hypot(dx, dz);
    if (d < NEAR_M || d - 1.0 > WALK * WALK_MAX_S) return false;
    const spot = { x: other.pos.x + (dx / d) * 1.0, z: other.pos.z + (dz / d) * 1.0, yaw: Math.atan2(-dx, -dz), anim: 'idle' };
    r.temp = { anim: 'idle', t: 5, goal: spot, back: true, talk: true, sayText: text };
    walkTo(r, spot);
    return true;
  }

  function updateFast(dt) {
    for (const [root, q] of fastQ) {
      q.t -= dt;
      if (q.t <= 0) { fastQ.delete(root); showLine(q.e); }
    }
  }

  function celebrate(r, seconds, sparkle) {
    r.temp = { anim: 'celebrate', t: seconds, keepPos: true };
    if (sparkle) emote(r, 'sparkle', seconds);
  }

  let lastParty = -1e9;
  function companyParty() {
    const cur = office.current;
    if (!cur) return;
    // A launch arrives with celebrate(null) in the same batch; throw one party, not two.
    const now = performance.now();
    if (now - lastParty < 1500) return;
    lastParty = now;
    const L = cur.L;
    for (let i = 0; i < 3; i++) fx.confetti(rnd(-L.W / 4, L.W / 4), 1.0, rnd(-L.D / 4, L.D / 4), { spread: 1.4 });
    let k = 0;
    for (const r of recs.values()) {
      if (r.hidden || r.mode !== 'placed' || r.temp?.standup) continue;
      r.temp = { anim: 'celebrate', t: 1.8 + (k++ % 5) * 0.12, keepPos: true, delay: (k % 7) * 0.08 };
    }
  }

  function incident(e) {
    const cur = office.current;
    if (!cur) return;
    const L = cur.L;
    const racks = cur.dyn.racks;
    const hot = racks.length ? racks[0].position : new THREE.Vector3(0, 0, 0);
    fx.alarm(new THREE.Vector3(0, 0, 0), Math.min(L.W, L.D) * 0.3, e.caught ? 1.6 : 3.2);
    if (!e.caught) rig?.shake(0.22, 0.4);
    // The nearest few people run to the servers, then go back.
    const near = [...recs.values()].filter((r) => !r.hidden && r.mode === 'placed' && !r.temp?.standup)
      .sort((a, b) => a.pos.distanceToSquared(hot) - b.pos.distanceToSquared(hot))
      .slice(0, e.caught ? 1 : 4);
    near.forEach((r, i) => {
      emote(r, 'exclamation', 3);
      const spot = { x: hot.x + 0.6 + (i % 2) * 0.7, z: hot.z + 1.0 + Math.floor(i / 2) * 0.6, yaw: Math.PI, anim: 'idle' };
      r.temp = { anim: 'idle', t: 5.5, goal: spot, back: true, run: true };
      walkTo(r, spot, true);
    });
  }

  // Perk visits (coffee, nap pod, couch, arcade, shelves, tables) replace plain wandering.
  const perks = createPerks({ office, recs, walkTo, emote, parent: group, isBusy: () => !!standup });
  const pets = createPets({ office, recs, emote, parent: group });
  const incentives = createIncentives({ office, recs, walkTo, emote, parent: group, caricature, setDim, setAccent, setPictureLight, getYaw: () => rig?.yaw ?? Math.PI / 4, rig, fx });

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
      r.yaw = angleLerp(r.yaw, Math.atan2(dir.x, dir.z), 1 - Math.exp(-dt * 12));
    }
    r.char.setMoveSpeed(r.speed);
    r.char.setAnim(anim);
  }

  function updateRec(r, dt) {
    const c = r.char;
    if (r.face) { r.face.t -= dt; if (r.face.t <= 0) r.face = null; }
    if (r.emoteT > 0) { r.emoteT -= dt; if (r.emoteT <= 0) c.setEmote(null); }

    // Mood emotes now and then, so state reads without UI.
    r.moodEmoteT -= dt;
    if (r.moodEmoteT <= 0 && !r.hidden) {
      r.moodEmoteT = rnd(9, 18);
      const m = r.staff.mood;
      if (!c.emote) {
        if (m === 'burnout') emote(r, 'zzz', 3);
        else if (isTired(r.staff)) {
          emote(r, 'tired', 2.6);
          // Now and then a tired person nods off at the desk for a few seconds.
          if (r.goal?.seated && !r.temp && !r.path.length && Math.random() < 0.35) r.temp = { anim: 'desknap', t: rnd(3, 5), keepPos: true };
        }
        else if (m === 'coasting' && Math.random() < 0.6) emote(r, 'sweat', 2.5);
        else if (r.goal?.thinking && Math.random() < 0.7) emote(r, 'lightbulb', 2.5);
        else if (r.goal?.mentoring && Math.random() < 0.5) emote(r, 'heart', 2);
        else if (m === 'ok' && Math.random() < 0.12) emote(r, 'music', 2.2);
      }
    }

    if (r.path.length) {
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
        if (tp.sayText) { labels.say(tp.sayText, c.root, holdSeconds(tp.sayText, speed)); tp.sayText = null; }
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
        if (Math.hypot(r.pos.x - g.x, r.pos.z - g.z) > 0.05) { r.pos.lerp(dir.set(g.x, 0, g.z), 1 - Math.exp(-dt * 8)); }
        r.yaw = angleLerp(r.yaw, r.face?.yaw ?? g.yaw, 1 - Math.exp(-dt * 8));
        c.setAnim(g.anim);
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
  function setSpeed(k) { speed = k; }

  // Where a standup gathers: around the meeting table, else in front of the whiteboard, else on
  // open floor. Everyone faces the middle of the group.
  function ringSpots(n) {
    const Z = office.current.zones;
    const spots = [];
    if (Z.meeting) {
      const M = Z.meeting;
      const a = M.L / 2 + 0.5, b = M.D / 2 + 0.5;
      const c = Math.cos(M.rotY), sn = Math.sin(M.rotY);
      for (let i = 0; i < n; i++) {
        const lap = Math.floor(i / 8);
        const t = ((i % 8) / Math.min(8, n - lap * 8)) * Math.PI * 2 + 0.4 + lap * 0.4;
        const lx = Math.cos(t) * (a + lap * 0.6), lz = Math.sin(t) * (b + lap * 0.6);
        spots.push({ x: M.x + c * lx + sn * lz, z: M.z - sn * lx + c * lz, cx: M.x, cz: M.z });
      }
      return spots;
    }
    const w = Z.whiteboard;
    const base = w ?? openSpot();
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
    if (said && !(labels.speechCount?.() >= MAX_SPEECH)) labels.say(said.text, recs.get(said.staffId).char.root, holdSeconds(said.text, speed));
  }

  const MAX_STANDUP_LINES = 3;
  const NOD_S = 0.5;
  const GAP_S = 0.3;
  const SILENT_S = 1.3;
  function interest(l) {
    const t = l.text ?? '';
    if (!t) return 3;                                           // a burned-out silence says a lot
    if (/block|stuck|flaky|broke|outage|incident|help/i.test(t)) return 4;
    if (/[!?]|lol|pun|sorry|somehow|again/i.test(t)) return 2;
    return 1;
  }

  function startStandup(e, state) {
    if (!office.current) return;
    const week = Number.isFinite(state?.week) ? state.week : standupCount;
    standupCount++;
    if (week < lastStagedWeek) { lastStagedWeek = -Infinity; lastStagedAt = -Infinity; }   // a new or loaded game
    // In person only now and then (by real play time, so speed doesn't change how often); a
    // standup still talking is never cut off, and the weeks between stay at the desks.
    const stage = speed < 4 && !standup && playTime - lastStagedAt >= STAGE_GAP_S;
    const present = (l) => { const r = recs.get(l.staffId); return r && !r.hidden && r.mode === 'placed' && !r.temp?.standup; };
    if (!stage) { deskStandup((e.lines ?? []).filter(present)); return; }
    const lines = (e.lines ?? []).filter((l) => { const r = recs.get(l.staffId); return r && !r.hidden && r.mode === 'placed'; });
    if (!lines.length) return;
    lastStagedWeek = week;
    lastStagedAt = playTime;
    // Only the most interesting few speak (blockers, jokes, silences); the rest just nod.
    // The most interesting few speak (blockers, silences, jokes); the rest nod.
    const speaking = new Set(lines.map((l, i) => ({ l, i, s: interest(l) })).sort((a, b) => b.s - a.s || a.i - b.i)
      .slice(0, MAX_STANDUP_LINES).map((x) => x.l));
    const spots = ringSpots(lines.length);
    const people = lines.map((l, i) => {
      const r = recs.get(l.staffId);
      const sp = spots[i];
      const spot = { x: sp.x, z: sp.z, yaw: Math.atan2(sp.cx - sp.x, sp.cz - sp.z), anim: 'idle' };
      r.temp = { anim: 'idle', t: Infinity, goal: spot, standup: true };
      labels.clearFor(r.char.root);
      walkTo(r, spot);
      // Everyone arrives within GATHER seconds (weeks are short); far walkers jog.
      let len = 0, px = r.pos.x, pz = r.pos.z;
      for (const q of r.path) { len += Math.hypot(q.x - px, q.z - pz); px = q.x; pz = q.z; }
      const need = len / (GATHER / (speed >= 2 ? 2 : 1));
      if (need > r.speed) { r.speed = need; r.walkAnim = need > 2 ? 'run' : 'walk'; }
      return { r, text: speaking.has(l) ? l.text : null, nod: !speaking.has(l) };
    });
    standup = { people, phase: 'gather', t: 0, i: 0 };
    office.tuckMeetingChairs(true);
  }

  // A nodder waves briefly, then goes back to standing in the ring.
  function setTimeoutFree(r) { r.nodT = NOD_S; }

  function endStandup() {
    office.tuckMeetingChairs(false);
    for (const { r } of standup.people) {
      if (!recs.has(r.id) || r.temp?.standup !== true) continue;
      r.temp = null;
      if (r.goal && !r.goal.hidden) walkTo(r, r.goal);
    }
    standup = null;
  }

  function updateStandup(dt) {
    if (!standup) return;
    const st = standup;
    st.t += dt;
    for (const p of st.people) if (p.r.nodT > 0 && (p.r.nodT -= dt) <= 0 && p.r.temp?.standup) p.r.temp.anim = 'idle';
    const live = st.people.filter((p) => recs.has(p.r.id) && p.r.temp?.standup);
    if (!live.length) { standup = null; office.tuckMeetingChairs(false); return; }
    if (speed >= 4) { endStandup(); return; }
    if (st.phase === 'gather') {
      // Talking starts once most of the ring is in place; stragglers finish walking in.
      const arrived = live.filter((p) => !p.r.path.length).length;
      if (arrived >= Math.ceil(live.length * 0.6) || st.t > GATHER / (speed >= 2 ? 2 : 1)) { st.phase = 'talk'; st.t = 0.2; st.i = -1; }
      return;
    }
    if (st.phase === 'talk') {
      // Each speaker holds the floor for the full reading time of their line, then a short pause.
      const beat = (p) => (p.nod ? NOD_S : p.text ? holdSeconds(p.text, speed) + GAP_S : SILENT_S * (speed >= 2 ? 0.75 : 1));
      const cur = st.i >= 0 ? st.people[st.i] : null;
      if (st.i < 0 || st.t >= beat(cur)) {
        st.i++;
        st.t = 0;
        if (st.i >= st.people.length) { st.phase = 'close'; st.t = 0; return; }
        const p = st.people[st.i];
        if (!recs.has(p.r.id)) return;
        if (p.nod) { p.r.temp.anim = 'wave'; emote(p.r, 'lightbulb', 0.9); setTimeoutFree(p.r); }
        else if (p.text) labels.say(p.text, p.r.char.root, holdSeconds(p.text, speed));
        else emote(p.r, p.r.staff.mood === 'burnout' ? 'zzz' : 'sweat', beat(p));
      }
      return;
    }
    if (st.phase === 'close' && st.t > 0.3) endStandup();
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
        walkTo(r, dest);
        r.speed = speed; r.walkAnim = anim;
        continue;
      }
      if (r.temp?.enter || r.temp?.lift || r.goal?.seated && Math.hypot(r.pos.x - r.goal.x, r.pos.z - r.goal.z) < 0.3) continue;
      if (nav.isBlocked(r.pos.x, r.pos.z, BODY_R)) {
        // The nearest point, in widening rings, where the whole body is clear.
        let p = null;
        for (let d = 0.3; d < 3 && !p; d += 0.2) {
          for (let a = 0; a < 12; a++) {
            const q = { x: r.pos.x + Math.cos((a / 12) * Math.PI * 2) * d, z: r.pos.z + Math.sin((a / 12) * Math.PI * 2) * d };
            if (!nav.isBlocked(q.x, q.z, BODY_R)) { p = q; break; }
          }
        }
        p ??= nav.freePoint(r.pos.x, r.pos.z);
        r.path = [{ x: p.x, z: p.z }];
        if (r.temp) r.temp.goal = { ...r.temp.goal, x: p.x, z: p.z };
        else if (r.goal && !r.goal.seated) Object.assign(r.goal, r.goal && nav.isBlocked(r.goal.x, r.goal.z) ? p : {});
      }
    }
  }

  function update(dt, { paused = false } = {}) {
    if (!office.current) return;
    if (paused) {
      // Nothing advances, but everyone is still drawn where they are (new arrivals included).
      for (const r of [...recs.values(), ...leavers]) {
        r.char.root.position.copy(r.pos);
        if (r.temp?.lift && !r.path.length) r.char.root.position.y = r.temp.lift;
        r.char.root.rotation.y = r.yaw;
        if (!r.hidden) r.char.breathe(dt);
      }
      return;
    }
    playTime += dt;
    if (office.navVersion !== navSeen) { navSeen = office.navVersion; repath(); }
    updateStandup(dt);
    updateFast(dt);
    perks.update(dt, lastState);
    pets.update(dt);
    incentives.update(dt);
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
    for (const r of recs.values()) disposeRec(r);
    for (const r of leavers) disposeRec(r);
    recs.clear();
    leavers.length = 0;
  }

  return {
    sync, handleEvents, update, pick, positionOf, dispose, setSpeed, perks, pets, incentives, setCharacterShadows,
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
    get standup() { return standup ? { phase: standup.phase, n: standup.people.length, i: standup.i } : null; },
    get count() { return recs.size; },
    get leaverCount() { return leavers.length; },
  };
}
