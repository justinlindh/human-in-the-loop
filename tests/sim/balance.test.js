import { describe, it, expect, beforeAll } from 'vitest';
import { Worker } from 'node:worker_threads';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { ARCHETYPES, foundingWarning } from '../../src/data/founders.js';

// Every run is 20 years (B.runWeeks) from January 2019 unless it ends sooner.
const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);
const runs = {};
const get = (name) => (runs[name] ??= SEEDS.map((seed) => runBot(name, seed)));
// The five bots' runs are independent and take most of the time, so they run at once, one worker
// thread each, before the cases below read them through get().
const BOTS = ['automateAll', 'allHumans', 'balanced', 'sensible', 'recklessHumans'];
beforeAll(() => Promise.all(BOTS.map((name) => new Promise((resolve, reject) => {
  const w = new Worker(new URL('./balance-worker.js', import.meta.url), { workerData: { name, seeds: SEEDS } });
  w.once('message', (r) => { runs[name] = r; resolve(); });
  w.once('error', reject);
  w.once('exit', (code) => { if (!runs[name]) reject(new Error(`balance worker for ${name} exited with ${code}`)); });
}))), 300000);
const share = (list, pred) => list.filter(pred).length / list.length;
const median = (xs) => [...xs].sort((a, b) => a - b)[xs.length >> 1];

describe('balance thresholds (40 seeds per bot, 20 years each; an exit is retiring by IPO or acquisition)', () => {
  it('runs last 20 years', () => {
    expect(B.runWeeks).toBe(1040);
  });

  it('automate-everything collapses in at least 70% of seeds, after the agents arrive', () => {
    const a = get('automateAll');
    expect(share(a, (r) => r.lostAfterAgents)).toBeGreaterThanOrEqual(0.7);
  }, 300000);

  it('careful all-humans play reaches an exit in at most 40% of seeds', () => {
    expect(share(get('allHumans'), (r) => r.exited)).toBeLessThanOrEqual(0.4);
  }, 300000);

  it('balanced exits in 30% to 90% of seeds, beats all-humans by 20 points, and reaches HQ', () => {
    const b = get('balanced');
    const wins = share(b, (r) => r.exited);
    expect(wins).toBeGreaterThanOrEqual(0.3);
    expect(wins).toBeLessThanOrEqual(0.9);
    expect(wins - share(get('allHumans'), (r) => r.exited)).toBeGreaterThanOrEqual(0.2);
    expect(b.some((r) => r.maxStage === 2)).toBe(true);
  }, 300000);

  it('a sensible player who hires one early survives the opening', () => {
    expect(share(get('sensible'), (r) => r.weeks > 104 || r.won)).toBeGreaterThanOrEqual(0.9);
  }, 300000);

  it('a sensible player who hires two early also survives the opening', () => {
    const two = SEEDS.slice(0, 20).map((seed) => runBot('sensible', seed, 110, { setup: (s) => { s.flags.botEarlyHires = 2; } }));
    expect(two.every((r) => r.state.stats.hires >= 2)).toBe(true);
    expect(share(two, (r) => r.weeks > 104)).toBeGreaterThanOrEqual(0.9);
  }, 300000);

  it('every founder pair survives the opening for a sensible player; only builder-less pairs get a warning', () => {
    const ids = Object.keys(ARCHETYPES);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const founders = [ids[i], ids[j]];
        const r = [1, 2, 3].map((seed) => runBot('sensible', seed, 110, { founding: { founders } }));
        expect(r.every((x) => x.weeks > 104), founders.join('+')).toBe(true);
        expect(r.every((x) => x.firstLaunch !== null && x.firstLaunch <= 26), founders.join('+')).toBe(true);
        expect(foundingWarning(founders) !== null, founders.join('+')).toBe(founders.every((id) => !ARCHETYPES[id].builder));
      }
    }
  }, 300000);

  it('reckless humans never exit, always get a product out first, and score poorly', () => {
    const r = get('recklessHumans');
    expect(r.some((x) => x.exited)).toBe(false);
    expect(r.every((x) => x.firstLaunch !== null)).toBe(true);
    expect(median(r.map((x) => x.score))).toBeLessThan(0.25 * median(get('balanced').map((x) => x.score)));
  }, 300000);

  it('turnover: crunch burns reckless teams out; careful teams lose someone every year or two', () => {
    const resign = (name) => median(get(name).map((x) => x.resignations));
    expect(resign('recklessHumans')).toBeGreaterThanOrEqual(10);
    expect(resign('recklessHumans')).toBeLessThanOrEqual(40);
    for (const name of ['allHumans', 'balanced', 'sensible']) {
      expect(resign(name), name).toBeGreaterThanOrEqual(1);
      expect(resign(name), name).toBeLessThanOrEqual(25);
    }
  }, 300000);

  it('every run that lasts ends at the 20th anniversary with a score', () => {
    for (const name of ['allHumans', 'balanced', 'sensible']) {
      for (const r of get(name)) {
        if (r.exited || !r.won) continue;
        expect(r.reason).toBe('anniversary');
        expect(r.weeks).toBe(B.anniversaryWeek);
        expect(r.score).toBeGreaterThan(0);
      }
    }
  }, 300000);

  it('era by era: money still matters at the ChatGBT moment, and the office grows across the run', () => {
    const b = get('balanced');
    const atChat = b.map((r) => r.eras.chatgbt).filter(Boolean);
    expect(atChat.length).toBeGreaterThanOrEqual(0.9 * b.length);
    const cash = median(atChat.map((e) => e.cash));
    expect(cash).toBeGreaterThan(250000);
    expect(cash).toBeLessThan(6000000);
    expect(median(atChat.map((e) => e.staff))).toBeLessThanOrEqual(14);
    const floor = median(b.map((r) => r.stageWeeks[1]).filter((w) => w !== undefined));
    const hq = median(b.map((r) => r.stageWeeks[2]).filter((w) => w !== undefined));
    expect(floor).toBeGreaterThanOrEqual(104);
    expect(floor).toBeLessThanOrEqual(156);
    expect(hq).toBeGreaterThanOrEqual(260);
    expect(hq).toBeLessThanOrEqual(364);
    // Nobody retires before year 10.
    for (const name of ['balanced', 'sensible']) for (const r of get(name)) if (r.exited) expect(r.weeks).toBeGreaterThanOrEqual(B.retireFromWeek);
  }, 300000);
});
