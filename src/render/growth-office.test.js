import { describe, it, expect } from 'vitest';
import { createGrowthQueue, growthBadge } from './growth-office.js';
import { B } from '../sim/balance.js';
import { GROWTH } from './growth-tune.js';
import { makeCtx } from '../sim/registry.js';
import { staffUpkeep } from '../sim/staff.js';
import { game, addStaff, addDesks } from '../../tests/sim/helpers.js';

const event = id => ({ type: 'levelUp', staffId: id, level: 3, gains: { polish: 2 } });
const state = n => ({ week: 1, staff: Array.from({ length: n }, (_, i) => ({ id: `s${i}`, level: 3 })) });
describe('office growth admission', () => {
  it('uses producer metadata and suppresses the promotion level across paced frames', () => {
    const s = game(2); addDesks(s, 4);
    const p = addStaff(s, 'engineer', 'junior', { level: 4, xp: B.xpPerLevel * 4 });
    const q = createGrowthQueue(); q.sync(s);
    const ctx = makeCtx(s); staffUpkeep(ctx);
    const level = ctx.events.find(e => e.type === 'levelUp' && e.staffId === p.id);
    const promoted = ctx.events.find(e => e.type === 'promoted' && e.staffId === p.id);
    expect(level).toBeTruthy(); expect(promoted).toBeTruthy();
    q.add([level], s); expect(q.size).toBe(0);
    q.add([promoted], s); expect(q.take(() => true).badges[0].text).toBe('Mid II');
  });
  it('bounds a 40-person burst and expires blocked work without extending the deadline', () => {
    const s = state(40), q = createGrowthQueue(); q.sync(s);
    q.add(s.staff.map(p => event(p.id)), s); expect(q.size).toBe(GROWTH.queueMax);
    q.step(GROWTH.maxAge - 0.1); q.add([event('s0')], s);
    expect(q.take(() => false)).toBeNull();
    q.step(0.2); expect(q.size).toBe(0);
  });
  it('coalesces simultaneous metadata, leaving bubbles untouched', () => {
    const s = state(1), q = createGrowthQueue(); q.sync(s);
    const events = [event('s0'), { type: 'bubble', staffId: 's0', text: '+2 Polish' }, { type: 'traitEarned', staffId: 's0', traitId: 'natural_mentor', source: 'record' }];
    const before = JSON.stringify({ s, events }); q.add(events, s);
    expect(q.take(() => true).badges).toEqual([{ text: 'Natural Mentor', icons: ['mentor'] }]);
    expect(JSON.stringify({ s, events })).toBe(before);
  });
  it('does not replay after load, reset or departure', () => {
    const s = state(2), q = createGrowthQueue(); q.sync(s); q.add([event('s0')], s);
    q.sync(structuredClone(s)); expect(q.size).toBe(0);
    q.sync(s); q.add([event('s0')], s); s.staff.shift(); q.sync(s); expect(q.size).toBe(0);
    q.add([event('s1')], s); s.week = 0; q.sync(s); expect(q.size).toBe(0);
  });
  it('keeps later training on a top-level person and uses every gained skill icon', () => {
    const s = state(1); s.staff[0].level = B.maxLevel;
    const q = createGrowthQueue(); q.sync(s);
    q.add([{ type: 'skillTrained', staffId: 's0', skill: 'polish', gain: 2 }], s);
    expect(q.take(() => true).badges[0].icons).toEqual(['stat.polish']);
    expect(growthBadge({ ...event('s0'), gains: { polish: 1, features: 2, novelty: 0 } }).icons).toEqual(['stat.features', 'stat.polish']);
  });
});

import * as THREE from 'three';
import { vi } from 'vitest';
import { createOfficeGrowth } from './growth-office.js';
function officeFixture() {
  const s = state(4), recs = new Map(s.staff.map((p, i) => [p.id, { id: p.id, staff: p, pos: new THREE.Vector3(i / 2, 0, 0), path: [], temp: null, goal: { anim: 'typing' }, char: { root: new THREE.Group(), seated: true, setAnim: vi.fn() } }]));
  const labels = { growth: vi.fn((text, icons, root, seconds) => ({ t: 0, life: seconds })) };
  let blocked = false, low = false;
  const g = createOfficeGrowth({ recs, labels, parent: new THREE.Group(), low: () => low, ready: r => !r.temp && !r.hidden && !r.goal.hidden && !r.path.length, blocked: () => blocked, faceToward: () => {} });
  g.sync(s); g.update(GROWTH.settleSeconds);
  return { s, recs, labels, g, block: () => { blocked = true; }, low: () => { low = true; } };
}
describe('office growth lifecycle', () => {
  it('keeps ordinary work untouched and releases the entire small effect under one second', () => {
    const { s, recs, g } = officeFixture(); g.events([event('s0')], s); g.update(1 / 30);
    expect(g.stats.live).toBe(1); expect(recs.get('s0').temp).toBeNull();
    g.update(GROWTH.smallSeconds); expect(g.stats.live).toBe(0); expect(g.stats.rings).toBe(1); g.dispose();
  });
  it('poses only available coworkers and releases owned poses on pause, speed change and priority', () => {
    for (const stop of ['pause', 'speed', 'priority']) {
      const f = officeFixture(); const reserved = { moment: 'standup' }; f.recs.get('s1').temp = reserved;
      f.g.events([{ type: 'promoted', staffId: 's0', seniority: 'mid' }], f.s); f.g.update(1 / 30);
      expect(f.recs.get('s0').temp.anim).toBe('growthpumpsit');
      expect(f.recs.get('s1').temp).toBe(reserved);
      expect(f.recs.get('s2').temp.anim).toBe('growthclapsit');
      if (stop === 'speed') f.g.setSpeed(4);
      else if (stop === 'pause') f.g.update(0.1, { paused: true });
      else { f.block(); f.g.update(0.1); }
      expect(f.g.stats.live).toBe(0); expect(f.recs.get('s0').temp).toBeNull(); expect(f.recs.get('s1').temp).toBe(reserved); f.g.dispose();
    }
  });
  it('never clears a replacement priority pose and drops absent or hidden actors', () => {
    const f = officeFixture(); f.g.events([{ type: 'promoted', staffId: 's0', seniority: 'mid' }], f.s); f.g.update(1 / 30);
    const scene = { moment: 'letter' }; f.recs.get('s0').temp = scene; f.g.update(1 / 30);
    expect(f.recs.get('s0').temp).toBe(scene); expect(f.g.stats.live).toBe(0);
    f.g.events([event('s3')], f.s); f.recs.get('s3').hidden = true; f.g.update(GROWTH.maxAge + 1);
    expect(f.g.stats.pending).toBe(0); expect(f.g.stats.live).toBe(0); f.g.dispose();
  });
  it('limits Low to one badge, no floor rings and one acknowledgement', () => {
    const f = officeFixture(); f.low(); f.g.events(f.s.staff.map(p => event(p.id)), f.s);
    for (let i = 0; i < 15; i++) { f.g.update(0.1); expect(f.g.stats.live).toBeLessThanOrEqual(1); expect(f.g.stats.rings).toBe(0); }
    f.g.clear(); f.g.update(GROWTH.settleSeconds); f.g.events([{ type: 'promoted', staffId: 's0', seniority: 'mid' }], f.s); f.g.update(0.1);
    expect([...f.recs.values()].filter(r => r.temp).length).toBe(2); f.g.dispose();
  });
});

it('does not expire a speech label that recycled a growth slot', () => {
  const f = officeFixture(); f.g.events([event('s0')], f.s); f.g.update(0.1);
  const label = f.labels.growth.mock.results[0].value;
  label.growthOwner = {}; label.t = 0; label.life = 7;
  f.g.clear(); expect(label.t).toBe(0); f.g.dispose();
});
