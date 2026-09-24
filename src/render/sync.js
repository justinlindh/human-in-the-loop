import * as THREE from 'three';
import { createCharacter } from './character.js';
import { ROLE_COLORS } from './palette.js';
import { glow } from './materials.js';

// Keeps one character per staff member in step with state, and plays event effects.
// Characters are keyed by staff id; removed staff walk out and are disposed.

const WALK = 1.25;
const RUN = 2.8;
const SEATED_ANIM = { ok: 'typing', coasting: 'slumped', burnout: 'burnout' };
const STAT_TONES = new Set(['features', 'polish', 'reliability', 'novelty']);
const MAX_WANDERERS = 2;
const MAX_SPEECH = 4;

function rnd(a, b) { return a + Math.random() * (b - a); }
function angleLerp(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

export function createStaffSync({ office, parent, labels, fx, rig }) {
  const group = new THREE.Group();
  group.name = 'staff';
  parent.add(group);
  const recs = new Map();       // staff id -> record
  const leavers = [];
  const hired = new Set();
  const leaving = new Map();    // staff id -> { fired }
  let stageSeen = -1;
  let firstSync = true;
  let lastState = null;
  let wanderClock = rnd(4, 8);
  const ledMats = {
    green: glow('led_green', 4), dim: glow('led_green', 0.5, 'dim'), amber: glow('led_amber', 4),
    red: glow('led_red', 5), redDim: glow('led_red', 1.2, 'dim'),
  };
  let ledClock = 0;

  function makeRec(s) {
    const char = createCharacter(s.appearance, ROLE_COLORS[s.role], { role: s.role });
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

  // Seats follow the sim: staff[i] sits at the i-th desk in office.placed.
  function assignSeats(list, state) {
    const deskIds = (state.office?.placed ?? []).filter((p) => office.deskById(p.id)).map((p) => p.id);
    list.forEach((s, i) => { recs.get(s.id).seat = deskIds[i] ?? null; });
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
    if (s.mood === 'away' || type === 'sabbatical') return { hidden: true, x: Z.door.x, z: Z.door.z, yaw: 0, anim: 'idle', key: 'away' };
    const desk = r.seat !== null ? office.deskById(r.seat) : null;
    const seated = (d) => ({ x: d.seat.x, z: d.seat.z, yaw: d.seat.rotY, anim: SEATED_ANIM[s.mood] ?? 'typing', seated: true });
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
    if (desk) return { ...seated(desk), key: `desk-${desk.seat.x.toFixed(2)},${desk.seat.z.toFixed(2)},${desk.seat.rotY.toFixed(2)}-${s.mood}` };
    const W = Z.wander?.length ? Z.wander : [Z.door];
    const w = W[r.id.length % W.length];
    return { x: w.x + rnd(-0.5, 0.5), z: w.z + rnd(-0.5, 0.5), yaw: rnd(0, 6.28), anim: 'idle', key: 'nodesk' };
  }

  function walkTo(r, goal, run = false) {
    const nav = office.nav();
    r.path = nav.path({ x: r.pos.x, z: r.pos.z }, { x: goal.x, z: goal.z });
    r.path.shift();
    r.speed = run ? RUN : WALK;
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
    const stageChanged = cur.stage !== stageSeen;
    stageSeen = cur.stage;
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
    if (stageChanged) for (const r of recs.values()) r.seat = null;
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
        case 'say': {
          const r = recs.get(e.staffId);
          if (!r || r.hidden || !e.text) break;
          if (labels.speechCount?.() >= MAX_SPEECH) break;
          labels.say(e.text, r.char.root, 3.2);
          break;
        }
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
        default: break;
      }
    }
    void state;
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

  // Idle wandering: a few people at a time fetch coffee or stretch in the lounge.
  function maybeWander(dt) {
    wanderClock -= dt;
    if (wanderClock > 0) return;
    wanderClock = rnd(5, 11);
    const cur = office.current;
    const busy = [...recs.values()].filter((r) => r.temp?.wander).length;
    if (busy >= MAX_WANDERERS) return;
    if (standup) return;
    const pool = [...recs.values()].filter((r) => r.mode === 'placed' && !r.hidden && !r.temp && !r.path.length
      && r.staff.mood !== 'burnout' && ['idle', 'project', 'maintenance', 'marketing', 'sales', 'support', 'security'].includes(r.staff.assignment?.type));
    if (!pool.length) return;
    const r = pool[Math.floor(Math.random() * pool.length)];
    const Z = cur.zones;
    const coffee = !!Z.coffee && Math.random() < 0.65;
    const pool2 = Z.lounge?.length ? Z.lounge : Z.wander ?? [];
    if (!coffee && !pool2.length) return;
    const base = coffee ? Z.coffee : pool2[Math.floor(Math.random() * pool2.length)];
    const spot = { x: base.x + rnd(-0.4, 0.4), z: base.z + rnd(-0.3, 0.3), yaw: rnd(0, Math.PI * 2), anim: coffee ? 'sip' : 'idle' };
    r.temp = { anim: spot.anim, t: rnd(5, 8), goal: spot, back: true, wander: true };
    walkTo(r, spot);
  }

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
    r.char.setAnim(anim);
  }

  function updateRec(r, dt) {
    const c = r.char;
    if (r.emoteT > 0) { r.emoteT -= dt; if (r.emoteT <= 0) c.setEmote(null); }

    // Mood emotes now and then, so state reads without UI.
    r.moodEmoteT -= dt;
    if (r.moodEmoteT <= 0 && !r.hidden) {
      r.moodEmoteT = rnd(9, 18);
      const m = r.staff.mood;
      if (!c.emote) {
        if (m === 'burnout') emote(r, 'zzz', 3);
        else if (m === 'coasting' && Math.random() < 0.6) emote(r, 'sweat', 2.5);
        else if (r.goal?.thinking && Math.random() < 0.7) emote(r, 'lightbulb', 2.5);
        else if (r.goal?.mentoring && Math.random() < 0.5) emote(r, 'heart', 2);
        else if (m === 'ok' && Math.random() < 0.12) emote(r, 'music', 2.2);
      }
    }

    if (r.path.length) {
      stepWalker(r, dt, r.walkAnim);
    } else if (r.temp) {
      const tp = r.temp;
      if (tp.delay > 0) { tp.delay -= dt; }
      else {
        tp.t -= dt;
        c.setAnim(tp.anim);
        if (tp.goal && !tp.keepPos) r.yaw = angleLerp(r.yaw, tp.goal.yaw, 1 - Math.exp(-dt * 6));
        if (tp.t <= 0) {
          r.temp = null;
          if (tp.back && r.goal) walkTo(r, r.goal);
        }
      }
    } else if (r.goal) {
      if (r.goal.hidden) {
        if (!r.hidden) { r.hidden = true; c.root.visible = false; }
      } else {
        if (r.mode === 'enter') r.mode = 'placed';
        const g = r.goal;
        if (Math.hypot(r.pos.x - g.x, r.pos.z - g.z) > 0.05) { r.pos.lerp(dir.set(g.x, 0, g.z), 1 - Math.exp(-dt * 8)); }
        r.yaw = angleLerp(r.yaw, g.yaw, 1 - Math.exp(-dt * 8));
        c.setAnim(g.anim);
      }
    }
    c.setRingScale(c.seated ? 1.4 : 1);
    c.root.position.copy(r.pos);
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
  const STAGE_EVERY = { 1: 3, 2: 6 };
  let lastStagedWeek = -Infinity;
  let standupCount = 0;

  function deskStandup(lines) {
    for (const l of lines) emote(recs.get(l.staffId), l.text ? 'lightbulb' : 'zzz', 1.4);
    if (speed >= 4) return;
    const said = lines.filter((l) => l.text).sort((a, b) => a.text.length - b.text.length)[0];
    if (said && !(labels.speechCount?.() >= MAX_SPEECH)) labels.say(said.text, recs.get(said.staffId).char.root, 2.4);
  }

  function startStandup(e, state) {
    if (!office.current) return;
    const week = Number.isFinite(state?.week) ? state.week : standupCount;
    standupCount++;
    if (week < lastStagedWeek) lastStagedWeek = -Infinity;   // a new or loaded game
    const every = STAGE_EVERY[speed >= 2 ? 2 : 1];
    const stage = speed < 4 && week - lastStagedWeek >= every;
    const present = (l) => { const r = recs.get(l.staffId); return r && !r.hidden && r.mode === 'placed' && !r.temp?.standup; };
    if (!stage) { deskStandup((e.lines ?? []).filter(present)); return; }
    // A new week's standup takes over from one still running; attendees not in it head back.
    if (standup) {
      const next = new Set((e.lines ?? []).map((l) => l.staffId));
      for (const { r } of standup.people) {
        if (next.has(r.id) || !recs.has(r.id) || !r.temp?.standup) continue;
        r.temp = null;
        if (r.goal && !r.goal.hidden) walkTo(r, r.goal);
      }
      for (const { r } of standup.people) if (next.has(r.id)) { r.temp = null; labels.clearFor(r.char.root); }
      standup = null;
    }
    const lines = (e.lines ?? []).filter((l) => { const r = recs.get(l.staffId); return r && !r.hidden && r.mode === 'placed'; });
    if (!lines.length) return;
    lastStagedWeek = week;
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
      return { r, text: l.text };
    });
    standup = { people, phase: 'gather', t: 0, i: 0 };
    office.tuckMeetingChairs(true);
  }

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
    const k = speed >= 2 ? 2 : 1;
    const st = standup;
    st.t += dt * k;
    const live = st.people.filter((p) => recs.has(p.r.id) && p.r.temp?.standup);
    if (!live.length) { standup = null; office.tuckMeetingChairs(false); return; }
    if (speed >= 4) { endStandup(); return; }
    if (st.phase === 'gather') {
      const arrived = live.every((p) => !p.r.path.length);
      if (arrived || st.t > GATHER + 0.6) { st.phase = 'talk'; st.t = 0.2; st.i = -1; }
      return;
    }
    if (st.phase === 'talk') {
      const beat = (p) => (p.text ? 0.9 + Math.min(0.6, p.text.length * 0.018) : 0.6);
      const cur = st.i >= 0 ? st.people[st.i] : null;
      if (st.i < 0 || st.t >= beat(cur)) {
        st.i++;
        st.t = 0;
        if (st.i >= st.people.length) { st.phase = 'close'; st.t = 0; return; }
        const p = st.people[st.i];
        if (!recs.has(p.r.id)) return;
        if (p.text) labels.say(p.text, p.r.char.root, Math.max(0.6, beat(p) / k - 0.1));
        else emote(p.r, p.r.staff.mood === 'burnout' ? 'zzz' : 'sweat', beat(p) / k);
      }
      return;
    }
    if (st.phase === 'close' && st.t > 0.3) endStandup();
  }

  function update(dt) {
    if (!office.current) return;
    updateStandup(dt);
    maybeWander(dt);
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
    sync, handleEvents, update, pick, positionOf, dispose, setSpeed,
    get standup() { return standup ? { phase: standup.phase, n: standup.people.length, i: standup.i } : null; },
    get count() { return recs.size; },
    get leaverCount() { return leavers.length; },
  };
}
