import * as THREE from 'three';
import { getTemplate } from './models.js';
import { mat } from './materials.js';
import { emoteMaterial } from './emotes.js';
import { footprint } from './layout.js';
import { kindOf } from './office.js';

// Office pets from state.pets. A dog makes rounds (hearts on the person it visits), naps in a sunny
// spot or on a beanbag or couch, and now and then chases the cat. A cat sleeps on a rack or a desk,
// knocks a pen off a desk, and only goes to its favourite person. Parts come from pets.glb and are
// animated with plain transforms like the chibi characters.

const COATS = {
  dog: [['wood_honey', 'paper'], ['plastic_charcoal', 'paper'], ['wood_walnut', 'wood_light']],
  cat: [['marker_orange', 'paper'], ['fabric_slate', 'paper_sheet']],
};
const SPEED = { dog: 1.4, cat: 1.1 };
const RUN = 3.0;

function rnd(a, b) { return a + Math.random() * (b - a); }
function hash(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function angleLerp(a, b, k) {
  let d = ((b - a + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// Pivots in the game's frame (y up, front +z), matching how pets.py models each part.
const RIG = {
  dog: { hip: 0.19, legs: [[-0.07, -0.02], [0.07, -0.02], [-0.07, 0.2], [0.07, 0.2]], neck: [0, 0.27, 0.27], ears: [[-0.1, 0.16, 0.0], [0.1, 0.16, 0.0]], tail: [0, 0.25, -0.12], extra: ['dog_eyes', 'dog_nose'] },
  cat: { hip: 0.15, legs: [[-0.055, -0.01], [0.055, -0.01], [-0.055, 0.15], [0.055, 0.15]], neck: [0, 0.21, 0.19], ears: [[-0.065, 0.16, -0.02], [0.065, 0.16, -0.02]], tail: [0, 0.2, -0.1], extra: ['cat_eyes', 'cat_nose'] },
};

function buildPet(species, look) {
  const tpl = getTemplate('pets');
  const [c1, c2] = COATS[species][look % COATS[species].length];
  const skin = (o) => {
    o.traverse((m) => {
      if (!m.isMesh) return;
      const pick = (mm) => {
        const n = (mm?.name ?? '').toLowerCase();
        if (n.startsWith('pal_coat2')) return mat(c2);
        if (n.startsWith('pal_coat')) return mat(c1);
        return mm;
      };
      m.material = Array.isArray(m.material) ? m.material.map(pick) : pick(m.material);
      m.castShadow = true;
      m.receiveShadow = true;
    });
    return o;
  };
  const part = (name) => (tpl?.getObjectByName(name) ? skin(tpl.getObjectByName(name).clone(true)) : new THREE.Group());
  const R = RIG[species];
  const root = new THREE.Group();
  root.name = 'pet';
  const body = new THREE.Group();
  body.position.y = R.hip;
  root.add(body);
  body.add(part(`${species}_body`));
  const legs = R.legs.map(([x, z]) => {
    const p = new THREE.Group();
    p.position.set(x, 0, z);
    p.add(part(`${species}_leg`));
    body.add(p);
    return p;
  });
  const neck = new THREE.Group();
  neck.position.set(R.neck[0], R.neck[1] - R.hip, R.neck[2]);
  body.add(neck);
  const head = new THREE.Group();
  neck.add(head);
  head.add(part(`${species}_head`));
  for (const n of R.extra) head.add(part(n));
  if (species === 'dog') neck.add(part('dog_collar'));
  const ears = R.ears.map(([x, y, z], i) => {
    const p = new THREE.Group();
    p.position.set(x, y, z);
    p.add(part(`${species}_ear`));
    p.rotation.z = (i ? -1 : 1) * (species === 'dog' ? 0.35 : -0.15);
    head.add(p);
    return p;
  });
  const tail = new THREE.Group();
  tail.position.set(R.tail[0], R.tail[1] - R.hip, R.tail[2]);
  tail.add(part(`${species}_tail`));
  body.add(tail);
  const emote = new THREE.Sprite(emoteMaterial('heart'));
  emote.position.y = 0.62;
  emote.center.set(0.5, 0.1);
  emote.scale.setScalar(0.28);
  emote.visible = false;
  emote.renderOrder = 10;
  root.add(emote);
  return { root, body, legs, neck, head, ears, tail, emote };
}

export function createPets({ office, recs, emote: staffEmote, parent }) {
  const pets = new Map();       // pet id -> rec
  const pens = [];
  const penGeo = new THREE.CylinderGeometry(0.014, 0.014, 0.17, 8);
  let lastState = null;

  function present(state, p) {
    if (!p.ownerId) return true;
    const s = state.staff?.find((x) => x.id === p.ownerId);
    return !!s && s.mood !== 'away' && !s.remote && s.assignment?.type !== 'sabbatical';
  }

  function favourite(p) {
    if (p.ownerId && recs.get(p.ownerId)) return recs.get(p.ownerId);
    const list = [...recs.values()].filter((r) => !r.hidden).sort((a, b) => (a.id < b.id ? -1 : 1));
    return list[hash(p.id) % Math.max(1, list.length)] ?? null;
  }

  function spawnAt() {
    const d = office.current.zones.door;
    return new THREE.Vector3(d.x, 0, d.z);
  }

  function sync(state) {
    lastState = state;
    if (!office.current) return;
    const want = new Set();
    for (const p of state.pets ?? []) {
      if (!present(state, p)) continue;
      want.add(p.id);
      if (pets.has(p.id)) { pets.get(p.id).data = p; continue; }
      const look = hash(p.id);
      const rig = buildPet(p.species === 'cat' ? 'cat' : 'dog', look);
      parent.add(rig.root);
      const pos = spawnAt();
      pets.set(p.id, { id: p.id, data: p, species: p.species === 'cat' ? 'cat' : 'dog', rig, pos, yaw: 0, path: [], mode: 'idle', t: rnd(1, 3), y: 0, pose: 'stand', emoteT: 0, phase: Math.random() * 6 });
    }
    for (const [id, r] of pets) if (!want.has(id)) { r.rig.root.removeFromParent(); pets.delete(id); }
  }

  function walkTo(r, x, z, run = false) {
    const nav = office.nav();
    r.path = nav.path({ x: r.pos.x, z: r.pos.z }, { x, z });
    r.path.shift();
    r.speed = run ? RUN : SPEED[r.species];
  }

  function petEmote(r, kind, s = 2) {
    r.rig.emote.material = emoteMaterial(kind);
    r.rig.emote.visible = true;
    r.emoteT = s;
  }

  function placedOf(pred) {
    return [...office.placed.values()].filter(pred);
  }

  // Perches: tops of racks and desks, as a floor spot to hop from, a perch point, and its height.
  function perches(kind) {
    const out = [];
    for (const e of office.placed.values()) {
      const k = kindOf(e.itemId);
      const t = e.target;
      if (kind === 'rack' && (k === 'rack' || e.itemId === 'server_rack')) {
        const top = new THREE.Box3().setFromObject(e.obj).max.y;
        out.push({ x: t.x, z: t.z, y: top, fx: t.x + Math.sin(t.rotY) * 0.7, fz: t.z + Math.cos(t.rotY) * 0.7 });
      }
      if (kind === 'desk' && k === 'desk') {
        // The desk top, toward the side away from the chair.
        const dz = -0.35;
        const x = t.x + Math.sin(t.rotY) * dz + Math.cos(t.rotY) * 0.28, z = t.z + Math.cos(t.rotY) * dz - Math.sin(t.rotY) * 0.28;
        out.push({ x, z, y: 0.64, fx: t.x + Math.cos(t.rotY) * 0.75, fz: t.z - Math.sin(t.rotY) * 0.75, desk: e });
      }
    }
    return out;
  }

  function restSpots() {
    const out = [];
    for (const e of office.placed.values()) {
      const k = kindOf(e.itemId);
      if (k === 'couch' || (e.itemId === 'nap_pod' && e.level <= 1)) {
        const f = footprint(e.itemId, 0);
        void f;
        out.push({ x: e.target.x + Math.cos(e.target.rotY) * 0.3, z: e.target.z - Math.sin(e.target.rotY) * 0.3, y: k === 'couch' ? 0.42 : 0.3 });
      }
    }
    return out;
  }

  // A sunny spot: floor just inside a window on a back wall.
  function sunSpot() {
    const L = office.current.L;
    const wins = L.openings.filter((o) => o.kind === 'window' && (o.wall === 'x' || o.wall === 'z'));
    if (!wins.length) return null;
    const o = wins[Math.floor(Math.random() * wins.length)];
    return o.wall === 'x' ? { x: -L.W / 2 + 0.6, z: o.at, y: 0 } : { x: o.at, z: -L.D / 2 + 0.6, y: 0 };
  }

  function decide(r) {
    const people = [...recs.values()].filter((p) => !p.hidden && p.mode === 'placed');
    if (r.species === 'dog') {
      const cat = [...pets.values()].find((x) => x.species === 'cat' && x.y === 0 && !x.hop);
      const roll = Math.random();
      if (cat && roll < 0.15) {
        r.mode = 'chase'; r.t = 5; r.target = cat;
        cat.mode = 'flee'; cat.t = 4;
        const away = new THREE.Vector3().subVectors(cat.pos, r.pos).setY(0).normalize().multiplyScalar(3).add(cat.pos);
        const L = office.current.L;
        away.x = Math.max(-L.W / 2 + 0.6, Math.min(L.W / 2 - 0.6, away.x));
        away.z = Math.max(-L.D / 2 + 0.6, Math.min(L.D / 2 - 0.6, away.z));
        walkTo(cat, away.x, away.z, true);
        return;
      }
      if (people.length && roll < 0.65) {
        const who = people[Math.floor(Math.random() * people.length)];
        const f = who.yaw;
        r.mode = 'visit'; r.who = who; r.t = rnd(3, 5);
        walkTo(r, who.pos.x + Math.sin(f + 1.2) * 0.55, who.pos.z + Math.cos(f + 1.2) * 0.55);
        return;
      }
      const rest = restSpots();
      const spot = rest.length && Math.random() < 0.5 ? rest[Math.floor(Math.random() * rest.length)] : sunSpot();
      if (spot) { r.mode = 'nap'; r.t = rnd(10, 16); r.spot = spot; walkTo(r, spot.x + 0.5, spot.z + 0.5); return; }
    } else {
      const roll = Math.random();
      const fav = favourite(r.data);
      if (fav && !fav.hidden && roll < 0.3) {
        r.mode = 'visit'; r.who = fav; r.t = rnd(5, 8);
        walkTo(r, fav.pos.x + Math.sin(fav.yaw - 1.2) * 0.5, fav.pos.z + Math.cos(fav.yaw - 1.2) * 0.5);
        return;
      }
      if (roll < 0.5) {
        const desks = perches('desk');
        if (desks.length) { const p = desks[Math.floor(Math.random() * desks.length)]; r.mode = 'knock'; r.perch = p; r.t = rnd(4, 6); walkTo(r, p.fx, p.fz); return; }
      }
      const spots = [...perches('rack'), ...perches('desk'), ...restSpots().map((s) => ({ ...s, fx: s.x + 0.5, fz: s.z + 0.5 }))];
      if (spots.length) { const p = spots[Math.floor(Math.random() * spots.length)]; r.mode = 'sleep'; r.perch = p; r.t = rnd(14, 22); walkTo(r, p.fx, p.fz); return; }
    }
    r.mode = 'idle'; r.t = rnd(3, 6);
  }

  function pose(r, dt, t) {
    const g = r.rig;
    const moving = r.path.length > 0 || !!r.hop;
    const k = 1 - Math.exp(-dt * 10);
    let bodyY = RIG[r.species].hip, legSwing = 0, tailWag = Math.sin(t * 3 + r.phase) * 0.2, headTilt = 0, lie = 0;
    if (moving) {
      const f = r.speed > 2 ? 16 : 10;
      legSwing = Math.sin(t * f) * 0.6;
      bodyY += Math.abs(Math.sin(t * f)) * 0.015;
      tailWag = Math.sin(t * 8) * 0.3;
    } else if (r.pose === 'lie') {
      lie = 1;
      bodyY = 0.07;
      tailWag = Math.sin(t * 0.8) * 0.08;
      headTilt = 0.35 + Math.sin(t * 1.1 + r.phase) * 0.03;
    } else if (r.pose === 'sit') {
      bodyY -= 0.03;
      tailWag = r.species === 'dog' ? Math.sin(t * 14) * 0.6 : Math.sin(t * 1.2) * 0.25;
      headTilt = Math.sin(t * 1.3 + r.phase) * 0.12;
    } else if (r.pose === 'swipe') {
      g.legs[3].rotation.x = -1.2 + Math.max(0, Math.sin(t * 6)) * 1.1;
    }
    g.body.position.y += (bodyY - g.body.position.y) * k;
    g.legs.forEach((l, i) => {
      const tgt = lie ? (i < 2 ? -1.4 : 1.4) : (i % 2 ? legSwing : -legSwing) * (i < 2 ? -1 : 1);
      if (r.pose === 'swipe' && i === 3 && !moving) return;
      l.rotation.x += (tgt - l.rotation.x) * k;
    });
    g.tail.rotation.x = -0.7 - (r.pose === 'sit' ? 0.4 : 0);
    g.tail.rotation.z = tailWag;
    g.neck.rotation.x += (headTilt - g.neck.rotation.x) * k;
    g.neck.rotation.z = r.pose === 'sit' && r.species === 'dog' ? Math.sin(t * 0.9) * 0.18 : 0;
  }

  function knockPen(p) {
    const m = new THREE.Mesh(penGeo, mat('marker_orange'));
    m.castShadow = true;
    m.position.set(p.x, p.y + 0.02, p.z);
    m.rotation.z = Math.PI / 2;
    parent.add(m);
    pens.push({ m, v: new THREE.Vector3(rnd(-0.6, 0.6), 1.2, rnd(-0.6, 0.6)), t: 0, spin: rnd(6, 10) });
  }

  const dir = new THREE.Vector3();
  let clock = 0;
  function update(dt) {
    if (!office.current) return;
    clock += dt;
    for (const r of pets.values()) {
      const g = r.rig;
      if (r.emoteT > 0) { r.emoteT -= dt; if (r.emoteT <= 0) g.emote.visible = false; }
      if (r.hop) {
        // A short arc onto or off a perch.
        r.hop.t += dt / 0.45;
        const q = Math.min(1, r.hop.t);
        r.pos.lerpVectors(r.hop.from, r.hop.to, q);
        r.y = r.hop.y0 + (r.hop.y1 - r.hop.y0) * q + Math.sin(q * Math.PI) * 0.35;
        if (q >= 1) { r.y = r.hop.y1; r.hop = null; }
      } else if (r.path.length) {
        const tgt = r.path[0];
        dir.set(tgt.x - r.pos.x, 0, tgt.z - r.pos.z);
        const d = dir.length();
        const step = r.speed * dt;
        if (d <= step) { r.pos.set(tgt.x, 0, tgt.z); r.path.shift(); } else {
          dir.multiplyScalar(1 / d);
          r.pos.addScaledVector(dir, step);
          r.yaw = angleLerp(r.yaw, Math.atan2(dir.x, dir.z), 1 - Math.exp(-dt * 10));
        }
        if (r.mode === 'chase' && r.target && !r.target.hop) {
          // Keep following the cat as it runs.
          if (Math.random() < dt * 2) walkTo(r, r.target.pos.x, r.target.pos.z, true);
        }
        r.pose = 'stand';
      } else {
        r.t -= dt;
        arrive(r);
        if (r.knockT > 0 && (r.knockT -= dt) <= 0 && r.mode === 'knock' && r.perch && r.y > 0.3) {
          const p = r.perch;
          knockPen({ x: p.x + (p.fx - p.x) * 0.25, y: p.y, z: p.z + (p.fz - p.z) * 0.25 });
          petEmote(r, 'sparkle', 1.2);
        }
        if (r.t <= 0) leave(r);
      }
      pose(r, dt, clock);
      g.root.position.set(r.pos.x, r.y, r.pos.z);
      g.root.rotation.y = r.yaw;
    }
    for (let i = pens.length - 1; i >= 0; i--) {
      const p = pens[i];
      p.t += dt;
      p.v.y -= 9.8 * dt;
      p.m.position.addScaledVector(p.v, dt);
      p.m.rotation.x += p.spin * dt;
      if (p.m.position.y < 0.01) { p.m.position.y = 0.01; p.v.set(0, 0, 0); p.spin = 0; }
      if (p.t > 6) { p.m.removeFromParent(); pens.splice(i, 1); }
    }
  }

  // Runs while a pet is at its destination.
  function arrive(r) {
    if (r.arrived) return;
    r.arrived = true;
    if (r.mode === 'visit' && r.who) {
      r.yaw = Math.atan2(r.who.pos.x - r.pos.x, r.who.pos.z - r.pos.z);
      r.pose = 'sit';
      if (r.species === 'dog') { if (!r.who.char.emote) staffEmote(r.who, 'heart', 2.2); petEmote(r, 'heart', 1.6); } else petEmote(r, 'heart', 2);
    } else if (r.mode === 'nap' && r.spot) {
      if (r.spot.y > 0) r.hop = { from: r.pos.clone(), to: new THREE.Vector3(r.spot.x, 0, r.spot.z), y0: 0, y1: r.spot.y, t: 0 };
      r.pose = 'lie';
      petEmote(r, 'zzz', 3);
    } else if ((r.mode === 'sleep' || r.mode === 'knock') && r.perch) {
      const p = r.perch;
      r.hop = { from: r.pos.clone(), to: new THREE.Vector3(p.x, 0, p.z), y0: 0, y1: p.y, t: 0 };
      r.yaw = Math.atan2(p.fx - p.x, p.fz - p.z);
      r.pose = r.mode === 'sleep' ? 'lie' : 'swipe';
      if (r.mode === 'sleep') petEmote(r, 'zzz', 3);
      else r.knockT = 1.6;
    } else if (r.mode === 'chase') {
      r.pose = 'sit';
      petEmote(r, 'exclamation', 1.2);
    } else if (r.mode === 'flee') {
      r.pose = 'sit';
      petEmote(r, 'storm', 1.5);
    } else {
      r.pose = 'sit';
    }
  }

  function leave(r) {
    r.arrived = false;
    if (r.y > 0.01) {
      // Hop back down to the floor beside the perch before the next plan.
      const p = r.perch ?? { fx: r.pos.x + 0.6, fz: r.pos.z + 0.6 };
      const to = r.spot && r.mode === 'nap' ? new THREE.Vector3(r.spot.x + 0.5, 0, r.spot.z + 0.5) : new THREE.Vector3(p.fx, 0, p.fz);
      r.hop = { from: r.pos.clone(), to, y0: r.y, y1: 0, t: 0 };
    }
    r.perch = null; r.spot = null; r.who = null; r.target = null;
    r.pose = 'stand';
    if (r.y > 0.01) { r.mode = 'idle'; r.t = 0.5; return; }
    decide(r);
  }

  function reset() {
    for (const r of pets.values()) r.rig.root.removeFromParent();
    pets.clear();
    for (const p of pens) p.m.removeFromParent();
    pens.length = 0;
  }

  return {
    sync, update, reset,
    get count() { return pets.size; },
    // Test hook: force a plan now ('visit' | 'nap' | 'chase' | 'sleep' | 'knock').
    force(id, mode) {
      const r = pets.get(id);
      if (!r) return false;
      r.path = []; r.hop = null; r.y = 0; r.arrived = false;
      for (let i = 0; i < 40; i++) { decide(r); if (r.mode === mode) return true; r.path = []; }
      return false;
    },
    peek(id) { const r = pets.get(id); return r && { mode: r.mode, pose: r.pose, y: +r.y.toFixed(2), path: r.path.length, pos: [+r.pos.x.toFixed(2), +r.pos.z.toFixed(2)] }; },
    get state() { return lastState; },
  };
}
