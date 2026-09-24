import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { runBot } from '../../src/sim/bots.js';
import { game, addStaff, addProduct, expectFail } from './helpers.js';

describe('cancelProject', () => {
  it('removes an unfinished project, idles its people, ends its campaigns, and says so in Slackk', () => {
    const s = game(3);
    s.cash = 1e6;
    const a = addStaff(s, 'engineer', 'senior');
    const b = addStaff(s, 'designer', 'mid');
    const started = dispatch(s, { type: 'startProject', kind: 'new', category: s.market.unlockedCategories[0], angle: 'web', model: null, size: 'small', name: 'Doomed' });
    expect(started.ok).toBe(true);
    const id = started.projectId;
    for (const p of [a, b]) expect(dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: id } }).ok).toBe(true);
    s.projects.find((j) => j.id === id).progress = 40;
    s.campaigns.push({ id: 'c99', channel: 'content', productId: null, projectId: id, weeksLeft: 3 });
    s.flags[`returnTo_${a.id}`] = id;
    const cash = s.cash;
    const res = dispatch(s, { type: 'cancelProject', projectId: id });
    expect(res.ok).toBe(true);
    expect(s.projects.some((j) => j.id === id)).toBe(false);
    expect(s.cash).toBe(cash);
    for (const p of [a, b]) expect(p.assignment).toEqual({ type: 'idle', targetId: null });
    expect(s.campaigns.some((c) => c.projectId === id)).toBe(false);
    expect(s.flags[`returnTo_${a.id}`]).toBeUndefined();
    const line = res.events.find((e) => e.type === 'chat' && e.text.includes('Doomed'));
    expect(line?.fromId).toBe(a.id);
    expect(JSON.parse(JSON.stringify(s))).toBeTruthy();
  });

  it('works for updates with nobody on them, speaking as a founder', () => {
    const s = game(4);
    s.cash = 1e6;
    const pr = addProduct(s, { name: 'Oldie' });
    const started = dispatch(s, { type: 'startProject', kind: 'update', productId: pr.id });
    expect(started.ok).toBe(true);
    const res = dispatch(s, { type: 'cancelProject', projectId: started.projectId });
    expect(res.ok).toBe(true);
    const line = res.events.find((e) => e.type === 'chat');
    expect(s.staff.find((p) => p.id === line.fromId)?.founder).toBe(true);
    expect(s.products.find((p) => p.id === pr.id).killed).toBe(false);
  });

  it('rejects unknown projects', () => {
    expectFail(expect, dispatch, game(5), { type: 'cancelProject', projectId: 'j999' }, 'No such project');
  });
});

describe('bots staff what they start', () => {
  // Stalled: nobody on it and no engineering automation working on it either.
  it('no project sits stalled for more than 12 weeks, and cancelling stays rare', () => {
    const automatable = new Set(['new', 'update', 'migration']);
    for (const [bot, seed] of [['balanced', 1], ['sensible', 2], ['allHumans', 3]]) {
      const since = {};
      let longest = 0;
      let cancels = 0;
      runBot(bot, seed, 500, { onEvents: (ev, a) => { if (a?.type === 'cancelProject') cancels++; }, onWeek: (s) => {
        for (const j of s.projects) {
          const crew = s.staff.some((p) => p.assignment.type === 'project' && p.assignment.targetId === j.id);
          if (crew || (s.automation.engineering.level > 0 && automatable.has(j.kind))) { delete since[j.id]; continue; }
          since[j.id] ??= s.week;
          longest = Math.max(longest, s.week - since[j.id]);
        }
      } });
      expect(longest, bot).toBeLessThanOrEqual(12);
      expect(cancels, bot).toBeLessThanOrEqual(15);
    }
  }, 120000);
});
