import * as THREE from 'three';
import { B } from '../sim/balance.js';
import { TRAITS } from '../data/traits.js';
import { PALETTE as P } from './palette.js';

const SKILLS = ['features', 'polish', 'reliability', 'novelty'];
const TRAIT_ICONS = { natural_mentor: 'mentor', mentor: 'mentor', paranoid: 'oversight', visionary: 'stat.novelty' };
const TYPES = new Set(['levelUp', 'promoted', 'traitEarned', 'skillTrained']);

// The pacer can deliver a promotion's level, celebrate and promoted in different frames.
// The saved milestone identifies that same tick without changing or delaying its bubbles.
export function promotionWeek(person, week) {
  return person?.growth?.some(g => g.week >= week - 1 && g.week <= week && g.kind === 'promoted') ?? false;
}

export function growthBadge(event) {
  if (event.type === 'promoted') return { text: event.seniority === 'senior' ? 'Senior III' : 'Mid II', icons: ['arrow.up'] };
  if (event.type === 'traitEarned') return { text: TRAITS[event.traitId]?.name ?? event.traitId, icons: [TRAIT_ICONS[event.traitId] ?? 'toast.good'] };
  if (event.type === 'skillTrained') return { text: `${event.skill} +${event.gain}`, icons: SKILLS.includes(event.skill) ? [`stat.${event.skill}`] : [] };
  return { text: `LV ${event.level}`, icons: SKILLS.filter(k => event.gains?.[k] > 0).map(k => `stat.${k}`) };
}

// Pending work is bounded independently of headcount. Coalescing never extends its deadline.
export function createGrowthQueue() {
  let owner = null, week = -Infinity, clock = 0;
  const pending = new Map();
  function sync(state) {
    if (owner !== state || state.week < week) { pending.clear(); clock = 0; }
    owner = state; week = state.week;
    for (const id of pending.keys()) if (!state.staff.some(p => p.id === id)) pending.delete(id);
  }
  function add(events, state) {
    const medium = new Set(events.filter(e => TYPES.has(e.type) && e.type !== 'levelUp').map(e => e.staffId));
    for (const e of events) {
      if (!TYPES.has(e.type)) continue;
      const p = state.staff.find(p => p.id === e.staffId);
      if (!p || (e.type === 'levelUp' && (p.level >= B.maxLevel || medium.has(p.id) || promotionWeek(p, state.week)))) continue;
      const before = pending.get(p.id);
      if (!before && pending.size >= B.growthOffice.queueMax) continue;
      if (before && before.event.type !== 'levelUp' && e.type === 'levelUp') continue;
      const badges = before?.badges ?? [];
      const badge = growthBadge(e);
      if (e.type === 'levelUp') badges.splice(0, badges.length, badge);
      else if (!badges.some(b => b.text === badge.text) && badges.length < SKILLS.length) badges.push(badge);
      pending.set(p.id, { event: { ...e }, badges, at: before?.at ?? clock });
    }
  }
  function step(dt) {
    clock += dt;
    for (const [id, q] of pending) if (clock - q.at >= B.growthOffice.maxAge) pending.delete(id);
  }
  function take(ready) {
    for (const [id, q] of pending) if (ready(id, q)) { pending.delete(id); return q; }
    return null;
  }
  return { sync, add, step, take, clear: () => pending.clear(), get size() { return pending.size; } };
}

export function createOfficeGrowth({ recs, labels, parent, low, ready, blocked, faceToward }) {
  const queue = createGrowthQueue(), live = [], rings = [];
  let owner = null, stage = null, week = -Infinity, gap = 0, speed = 1;
  const tune = B.growthOffice;
  function release(beat) {
    if (beat.label?.growthOwner === beat.token) beat.label.t = beat.label.life;
    if (beat.ring) { beat.ring.visible = false; rings.push(beat.ring); }
    for (const { r, temp } of beat.cast) if (r.temp === temp) { r.temp = null; r.face = null; r.char.setAnim(r.goal?.anim ?? 'idle'); }
  }
  function clear() { for (const beat of live) release(beat); live.length = 0; queue.clear(); gap = tune.settleSeconds; }
  function sync(state) {
    if (state !== owner || state.week < week || stage !== state.officeStage) clear();
    owner = state; stage = state.officeStage; week = state.week;
    queue.sync(state);
  }
  function ringFor(r) {
    let ring = rings.pop();
    if (!ring) {
      ring = new THREE.Mesh(new THREE.RingGeometry(tune.ringRadius * tune.ringInner, tune.ringRadius, tune.ringSegments), new THREE.MeshBasicMaterial({ color: P.gold, transparent: true, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2; parent.add(ring);
    }
    ring.material.opacity = tune.ringOpacity;
    ring.visible = true; ring.position.set(r.pos.x, tune.ringY, r.pos.z);
    return ring;
  }
  function events(events, state) { queue.add(events, state); }
  function update(dt, { paused = false } = {}) {
    if (paused) { clear(); return; }
    queue.step(dt); gap = Math.max(0, gap - dt);
    const priority = blocked();
    for (let i = live.length - 1; i >= 0; i--) {
      const b = live[i]; b.left -= dt;
      if (b.left <= 0 || priority || b.label.growthOwner !== b.token || (b.r.temp && !b.r.temp.growthOffice) || recs.get(b.r.id) !== b.r || b.r.hidden || b.r.goal?.hidden || b.cast.some(({ r, temp }) => r.temp !== temp || r.path.length || r.hidden || r.goal?.hidden)) {
        release(b); live.splice(i, 1); continue;
      }
      if (b.ring) {
        b.ring.visible = !low();
        b.ring.position.set(b.r.pos.x, tune.ringY, b.r.pos.z);
        b.ring.material.opacity = tune.ringOpacity * b.left / tune.smallSeconds;
      }
    }
    if (priority || gap || live.length >= (low() ? tune.lowMax : tune.liveMax)) return;
    const q = queue.take((id, q) => {
      const r = recs.get(id);
      return r && ready(r, q.event.type !== 'levelUp') && !live.some(b => b.r === r);
    });
    if (!q) return;
    const r = recs.get(q.event.staffId), medium = q.event.type !== 'levelUp';
    const seconds = medium ? tune.mediumSeconds : tune.smallSeconds;
    const label = labels.growth(q.badges.map(b => b.text).join(' · '), [...new Set(q.badges.flatMap(b => b.icons))], r.char.root, seconds);
    if (!label) return;
    const cast = [];
    if (medium) {
      const cheer = (actor, star) => {
        const temp = { anim: `${star ? 'growthpump' : 'growthclap'}${actor.char.seated ? 'sit' : ''}`, t: seconds, keepPos: true, growthOffice: true, tick: (actor, dt) => { if (actor.face) actor.yaw += Math.atan2(Math.sin(actor.face.yaw - actor.yaw), Math.cos(actor.face.yaw - actor.yaw)) * Math.min(1, dt * tune.pumpRate); return false; } };
        actor.temp = temp; cast.push({ r: actor, temp });
        if (!star) faceToward(actor, r, seconds);
      };
      cheer(r, true);
      let n = 0;
      for (const other of recs.values()) {
        if (n >= (low() ? 1 : tune.coworkerMax)) break;
        if (other !== r && ready(other, true) && other.pos.distanceTo(r.pos) < tune.nearby) { cheer(other, false); n++; }
      }
    }
    live.push({ r, label, token: label.growthOwner, cast, ring: !medium && !low() ? ringFor(r) : null, left: seconds });
    gap = speed >= 4 ? tune.fastGap : tune.gap;
  }
  function dispose() { clear(); for (const ring of rings) { ring.removeFromParent(); ring.geometry.dispose(); ring.material.dispose(); } rings.length = 0; }
  return { sync, events, update, clear, dispose,
    setSpeed(k) { if (k !== speed) clear(); speed = k; },
    get stats() { return { pending: queue.size, live: live.length, rings: rings.length + live.filter(b => b.ring).length }; },
  };
}
