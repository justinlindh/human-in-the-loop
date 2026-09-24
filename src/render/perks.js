import * as THREE from 'three';
import { mat } from './materials.js';
import { footprint } from './layout.js';
import { kindOf } from './office.js';
import { sinkDepth, furnitureMeshes } from './contact.js';

// Perk visits: people leave their desks to use what is placed in the office (coffee, nap pod,
// couch, arcade, shelves, plant wall, ping pong, foosball). One visit holds one slot on an item;
// tables need a pair. Visits are more likely for happy or lightly loaded people, rarer in a crunch;
// burned-out people only go somewhere to rest.

function rnd(a, b) { return a + Math.random() * (b - a); }

// Spots are in the item's local frame (origin at the footprint center, front toward +z).
// face: 'item' looks at the item, 'front' faces the way the item faces, 'axis' lies along it.
const PERKS = {
  coffee: { cap: 2, anim: 'sip', dur: [5, 8], weight: 3, spots: (f) => [[-0.35, f.h / 2 + 0.5], [0.35, f.h / 2 + 0.5]], face: 'item' },
  nap_pod: { cap: 1, anim: 'lie', dur: [9, 15], weight: 1.4, rest: true, spots: () => [[0, 0]], face: 'axis', emote: 'zzz' },
  couch: { cap: 2, anim: 'sit', dur: [7, 12], weight: 1.4, rest: true, spots: () => [[-0.4, 0.05], [0.4, 0.05]], face: 'front' },
  arcade: { cap: 1, anim: 'play', dur: [7, 11], weight: 1.5, spots: (f) => [[0, f.h / 2 + 0.45]], face: 'item', bursts: true },
  library: { cap: 2, anim: 'browse', dur: [6, 10], weight: 1.2, spots: (f) => [[-0.45, f.h / 2 + 0.45], [0.45, f.h / 2 + 0.45]], face: 'item', emote: 'lightbulb' },
  bookshelf: { cap: 1, anim: 'browse', dur: [5, 9], weight: 1, spots: (f) => [[0, f.h / 2 + 0.45]], face: 'item', emote: 'lightbulb' },
  plant_wall: { cap: 1, anim: 'water', dur: [3.5, 5], weight: 0.6, spots: (f) => [[0, f.h / 2 + 0.45]], face: 'item' },
  pingpong: { pair: true, anim: 'paddle', dur: [8, 12], weight: 1.3, spots: (f) => [[-(f.w / 2 + 0.2), 0], [f.w / 2 + 0.2, 0]], face: 'item' },
  foosball: { pair: true, anim: 'play', dur: [7, 11], weight: 1.2, spots: (f) => [[0, -(f.h / 2 + 0.3)], [0, f.h / 2 + 0.3]], face: 'item' },
};

// Per-model spots, authored in the model's own frame (x right, z toward its front, meters as built
// in Blender). seat: the seat height to sit on; look: a model-space point to face; yaw: a fixed
// model-space facing. These override the generic footprint spots for that model.
const SEAT_HIP_Y = 0.47;
const MODEL_SPOTS = {
  arcade_l1: [{ x: 0.55, z: 0.1, anim: 'sprawl', look: [0, -0.1] }],
  arcade_l2: [{ x: 0.55, z: 0.35, anim: 'playsit', seat: 0.5, look: [0, -0.2] }],
  arcade_l3: [{ x: 0, z: 0.45, anim: 'playsit', seat: 0.5, look: [0, -0.2] }],
  library_l1: [{ x: 0, z: 0.2, anim: 'browse', yaw: Math.PI }],
  library_l2: [{ x: -0.45, z: 0.2, anim: 'browse', yaw: Math.PI }, { x: 0.55, z: 0.1, anim: 'read', seat: 0.45, yaw: -0.44 }],
  library_l3: [{ x: -0.55, z: 0.2, anim: 'browse', yaw: Math.PI }, { x: 0.35, z: 0.45, anim: 'read', seat: 0.45, yaw: -0.35 }],
};

function perkOf(e) {
  const k = kindOf(e.itemId);
  if (k === 'coffee' || e.itemId === 'espresso') return 'coffee';
  if (PERKS[k]) return k;
  return PERKS[e.itemId] ? e.itemId : null;
}

const ASSIGN_W = { idle: 3, maintenance: 1, support: 1, sales: 1, marketing: 1, security: 1, project: 0.5, mentor: 0.5, oversight: 0.3, hardProblem: 0.3 };
const MOOD_W = { ok: 1, coasting: 1.6, burnout: 1.2 };

export function createPerks({ office, recs, walkTo, emote, parent, isBusy }) {
  const slots = new Map();      // `${placedId}:${i}` -> rec
  const sessions = [];
  let clock = rnd(2, 4);
  const ballGeo = new THREE.SphereGeometry(0.028, 10, 8);

  function toWorld(t, lx, lz) {
    return { x: t.x + Math.cos(t.rotY) * lx + Math.sin(t.rotY) * lz, z: t.z - Math.sin(t.rotY) * lx + Math.cos(t.rotY) * lz };
  }

  // Napping along a couch: centred on the seat depth, lying along its length with the head on the
  // throw pillow's end (-x in the couch's frame, see kit.couch). Works for any couch length and rotation.
  function couchNap(e) {
    const b = new THREE.Box3().setFromObject(e.obj);
    const len = e.target.rotY % Math.PI === 0 ? b.max.x - b.min.x : b.max.z - b.min.z;
    // The head (about 0.45 m across) stays inside the armrest and clear of the back cushion;
    // the figure's origin sits 0.34 m from the head centre along its length.
    const armIn = len / 2 - 0.18;
    const along = armIn - 0.24 - 0.34 + 0.05;
    const p = toWorld(e.target, -along, 0.16);
    return { x: p.x, z: p.z, yaw: e.target.rotY + Math.PI / 2, anim: 'idle', lift: 0.3 };
  }

  function modelSpots(e) {
    return MODEL_SPOTS[e.obj.userData.model] ?? null;
  }

  function spotFor(e, def, i, other) {
    const ms = modelSpots(e)?.[i];
    if (ms) {
      const fit = e.obj.userData.fit;
      const v = new THREE.Vector3(ms.x, 0, ms.z).applyMatrix4(fit);
      const fitYaw = Math.atan2(fit.elements[8], fit.elements[10]);
      const scale = Math.hypot(fit.elements[0], fit.elements[1], fit.elements[2]);
      const p = toWorld(e.target, v.x, v.z);
      let yaw;
      if (ms.look) {
        const t = new THREE.Vector3(ms.look[0], 0, ms.look[1]).applyMatrix4(fit);
        const q = toWorld(e.target, t.x, t.z);
        yaw = Math.atan2(q.x - p.x, q.z - p.z);
      } else {
        yaw = e.target.rotY + fitYaw + (ms.yaw ?? 0);
      }
      const lift = ms.seat ? Math.max(-0.1, ms.seat * scale - SEAT_HIP_Y) : 0;
      return { x: p.x, z: p.z, yaw, anim: 'idle', perkAnim: ms.anim, lift };
    }
    const f = footprint(e.itemId, 0);
    const [lx, lz] = def.spots(f)[i];
    const p = toWorld(e.target, lx, lz);
    let yaw;
    if (def.face === 'front') yaw = e.target.rotY;
    else if (def.face === 'axis') yaw = e.target.rotY + (f.w > f.h ? Math.PI / 2 : 0);
    else yaw = Math.atan2(e.target.x - p.x, e.target.z - p.z);
    void other;
    return { x: p.x, z: p.z, yaw, anim: 'idle' };
  }

  // Top of a nap pod for lying on; a beanbag (level 1) is sat in instead.
  function lieHeight(e) {
    // A starting height a little low; settle() then lifts them onto the surface.
    if (e.lieY === undefined) e.lieY = new THREE.Box3().setFromObject(e.obj).max.y * 0.3;
    return e.lieY;
  }

  function freeSlots() {
    const out = [];
    for (const e of office.placed.values()) {
      const kind = perkOf(e);
      if (!kind) continue;
      const def = PERKS[kind];
      if (def.pair) {
        if (!slots.has(`${e.id}:0`) && !slots.has(`${e.id}:1`)) out.push({ e, kind, def, i: 0 });
        continue;
      }
      const n = modelSpots(e)?.length ?? def.spots(footprint(e.itemId, 0)).length;
      for (let i = 0; i < Math.min(def.cap, n); i++) if (!slots.has(`${e.id}:${i}`)) { out.push({ e, kind, def, i }); break; }
    }
    return out;
  }

  function eligible(r) {
    return r.mode === 'placed' && !r.hidden && !r.temp && !r.path.length && r.staff.mood !== 'away';
  }

  function weightOf(r, crunch) {
    const a = ASSIGN_W[r.staff.assignment?.type ?? 'idle'] ?? 0.5;
    return a * (MOOD_W[r.staff.mood] ?? 1) * (crunch ? 0.3 : 1);
  }

  function pickWeighted(items, w) {
    const total = items.reduce((s, x) => s + w(x), 0);
    let k = Math.random() * total;
    for (const x of items) { k -= w(x); if (k <= 0) return x; }
    return items[items.length - 1];
  }

  function visit(r, slot) {
    const { e, def, i, kind } = slot;
    const key = `${e.id}:${i}`;
    const spot = spotFor(e, def, i);
    const lying = kind === 'nap_pod';
    const anim = spot.perkAnim ?? (lying ? (e.level <= 1 ? 'sprawl' : 'lie') : def.anim);
    slots.set(key, r);
    r.temp = {
      anim, t: rnd(...def.dur), goal: spot, back: true, wander: true, perkKey: key,
      lift: lying ? lieHeight(e) : spot.lift ?? 0, tick: perkTick, def, burstT: rnd(2, 4), emoteT: rnd(1, 3),
    };
    walkTo(r, spot);
  }

  // Runs every frame while someone is at their perk spot.
  // Resting poses settle onto the furniture: once the pose has formed, the person is lifted by how
  // far they sank into it (measured, so every item and level works the same way).
  const RESTING = new Set(['lie', 'nap', 'sprawl', 'sit', 'read', 'playsit']);
  function settle(r, dt, tp) {
    if (!RESTING.has(tp.anim) || tp.settled >= 2) return;
    tp.settleT = (tp.settleT ?? 0) + dt;
    if (tp.settleT < (tp.settled ? 0.9 : 0.45)) return;
    const e = office.placed.get(tp.perkKey?.split(':')[0]);
    if (!e) { tp.settled = 2; return; }
    const d = sinkDepth(r.char.root, furnitureMeshes(e.obj));
    if (d > 0.002) tp.lift = (tp.lift ?? 0) + d + 0.004;
    tp.settled = (tp.settled ?? 0) + 1;
  }

  function perkTick(r, dt, tp) {
    const def = tp.def;
    settle(r, dt, tp);
    tp.emoteT -= dt;
    if (def.emote && tp.emoteT <= 0) { tp.emoteT = rnd(3.5, 5); if (!r.char.emote) emote(r, def.emote, 2.2); }
    if (def.bursts) {
      tp.burstT -= dt;
      if (tp.burstT <= 0) { tp.burstT = rnd(3, 5); tp.burst = 1.0; if (Math.random() < 0.5) emote(r, 'sparkle', 1.2); }
      // Seated players cheer in their seat (a quick sparkle) rather than jumping off the stool.
      if (tp.burst > 0 && !tp.lift) { tp.burst -= dt; r.char.setAnim(tp.burst > 0 ? 'celebrate' : tp.anim); return true; }
      if (tp.burst > 0) tp.burst = 0;
    }
    return false;
  }

  function startPair(slot, a, b) {
    const { e, def } = slot;
    const s = { e, def, a, b, phase: 'gather', t: 0, dur: rnd(...def.dur), ball: null };
    [a, b].forEach((r, i) => {
      const key = `${e.id}:${i}`;
      slots.set(key, r);
      const spot = spotFor(e, def, i);
      r.temp = { anim: 'idle', t: Infinity, goal: spot, back: true, wander: true, perkKey: key, pair: s };
      walkTo(r, spot);
    });
    sessions.push(s);
  }

  function endPair(s, played) {
    if (s.ball) { s.ball.removeFromParent(); s.ball = null; }
    const live = [s.a, s.b].filter((r) => r.temp?.pair === s);
    if (played && live.length === 2) {
      const win = Math.random() < 0.5 ? 0 : 1;
      live.forEach((r, i) => {
        r.temp.anim = i === win ? 'celebrate' : 'groan';
        r.temp.t = 1.8;
        emote(r, i === win ? 'sparkle' : 'sweat', 1.8);
      });
    } else {
      for (const r of live) r.temp.t = 0.01;
    }
    for (const r of live) r.temp.pair = null;
  }

  function updatePairs(dt) {
    for (let i = sessions.length - 1; i >= 0; i--) {
      const s = sessions[i];
      const ok = s.a.temp?.pair === s && s.b.temp?.pair === s && recs.has(s.a.id) && recs.has(s.b.id);
      if (!ok) { endPair(s, false); sessions.splice(i, 1); continue; }
      s.t += dt;
      if (s.phase === 'gather') {
        if (!s.a.path.length && !s.b.path.length) {
          s.phase = 'play'; s.t = 0;
          s.a.temp.anim = s.b.temp.anim = s.def.anim;
          if (s.def === PERKS.pingpong) { s.ball = new THREE.Mesh(ballGeo, mat('paper')); s.ball.castShadow = true; parent.add(s.ball); }
        } else if (s.t > 12) { endPair(s, false); sessions.splice(i, 1); }
        continue;
      }
      if (s.ball) {
        // A volley: the ball arcs from paddle to paddle and bounces once on each side.
        const u = (s.t * 0.9) % 2;
        const k = u < 1 ? u : 2 - u;
        const A = s.a.pos, B = s.b.pos;
        const x = A.x + (B.x - A.x) * (0.12 + k * 0.76), z = A.z + (B.z - A.z) * (0.12 + k * 0.76);
        const hop = Math.abs(Math.sin(k * Math.PI * 2));
        s.ball.position.set(x, 0.62 + hop * 0.22, z);
      }
      if (s.t >= s.dur) { endPair(s, true); sessions.splice(i, 1); }
    }
  }

  function cleanSlots() {
    for (const [key, r] of slots) if (r.temp?.perkKey !== key || !recs.has(r.id)) slots.delete(key);
  }

  function maybeStart(state) {
    const people = [...recs.values()].filter((r) => r.mode === 'placed' && !r.hidden && r.staff.mood !== 'away');
    // Alone in a lockdown office, the stayer wanders more and naps on the couch.
    const L = state?.lockdown;
    const stayer = L && (state.week ?? 0) < L.until && L.stayerId ? recs.get(L.stayerId) : null;
    if (stayer && eligible(stayer)) {
      const free = freeSlots();
      const couch = free.find((s) => s.kind === 'couch');
      const solo = free.filter((s) => !s.def.pair);
      const slot = couch && Math.random() < 0.5 ? couch : solo[Math.floor(Math.random() * solo.length)];
      if (slot) {
        visit(stayer, slot);
        if (slot === couch) {
          const n = couchNap(slot.e);
          stayer.temp.goal = n;
          stayer.temp.anim = 'nap';
          stayer.temp.lift = n.lift;
          walkTo(stayer, n);
        }
      }
      return;
    }
    const max = Math.max(1, Math.round(people.length / 7));
    const visiting = people.filter((r) => r.temp?.perkKey).length;
    if (visiting >= max) return;
    // An outage is all hands on deck: perk visits all but stop.
    const crunch = !!state?.outage;
    const pool = people.filter(eligible);
    if (!pool.length) return;
    const r = pickWeighted(pool, (x) => weightOf(x, crunch));
    let free = freeSlots();
    if (r.staff.mood === 'burnout') free = free.filter((s) => s.def.rest);
    const partners = pool.filter((x) => x !== r && x.staff.mood !== 'burnout');
    if (visiting + 1 >= max || !partners.length) free = free.filter((s) => !s.def.pair);
    if (!free.length) return;
    const slot = pickWeighted(free, (s) => s.def.weight);
    if (slot.def.pair) {
      const b = partners.sort((p, q) => p.pos.distanceToSquared(r.pos) - q.pos.distanceToSquared(r.pos))[0];
      startPair(slot, r, b);
    } else {
      visit(r, slot);
    }
  }

  // Test hook: while held, nobody starts a new visit (visits sent with send() still run).
  let held = false;

  function update(dt, state) {
    cleanSlots();
    updatePairs(dt);
    if (isBusy() || held) return;
    clock -= dt;
    if (clock > 0) return;
    clock = state?.lockdown && (state.week ?? 0) < state.lockdown.until ? rnd(1, 2) : rnd(2.5, 5);
    maybeStart(state);
  }

  function reset() {
    for (const s of sessions) if (s.ball) s.ball.removeFromParent();
    sessions.length = 0;
    slots.clear();
  }

  return {
    update, reset,
    get visiting() { return [...recs.values()].filter((r) => r.temp?.perkKey).length; },
    get sessions() { return sessions.length; },
    set hold(on) { held = !!on; },
    peek(id) { const r = recs.get(id); return r && { seat: r.seat, yaw: r.yaw, face: r.face ?? null, path: r.path.length, temp: r.temp && { anim: r.temp.anim, t: r.temp.t, goal: r.temp.goal, key: r.temp.perkKey } }; },
    get phases() { return sessions.map((x) => `${x.phase}:${x.t.toFixed(1)}/${x.dur.toFixed(1)}`); },
    // Test hook: send a person (or a pair) to a specific placed item now.
    // nap: true lies the person along a couch, as the lockdown stayer does.
    send(ids, placedId, { dur, slot = 0, nap = false } = {}) {
      const e = office.placed.get(placedId);
      const kind = e && perkOf(e);
      if (!kind) return false;
      const def = PERKS[kind];
      const rs = ids.map((id) => recs.get(id)).filter(Boolean);
      for (const r of rs) { r.temp = null; r.path = []; }
      cleanSlots();
      if (def.pair) {
        if (rs.length < 2) return false;
        startPair({ e, kind, def, i: 0 }, rs[0], rs[1]);
        if (dur) sessions[sessions.length - 1].dur = dur;
        return true;
      }
      visit(rs[0], { e, kind, def, i: slot });
      if (nap && kind === 'couch') {
        const n = couchNap(e);
        Object.assign(rs[0].temp, { goal: n, anim: 'nap', lift: n.lift });
        walkTo(rs[0], n);
      }
      if (dur) rs[0].temp.t = dur;
      return true;
    },
  };
}
