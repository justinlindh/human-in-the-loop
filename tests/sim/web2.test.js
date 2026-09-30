import { describe, it, expect } from 'vitest';
import { createGame, dispatch, tick, calendarDate } from '../../src/sim/index.js';
import { B } from '../../src/sim/balance.js';
import { makeCtx } from '../../src/sim/registry.js';
import { calendarStart } from '../../src/sim/vendors.js';
import { projectsSystem } from '../../src/sim/projects.js';
import { progressRecords } from '../../src/sim/progression.js';
import { compatibilityMult, web2Step } from '../../src/sim/web2.js';
import { raiseDecision, resolveSubjects } from '../../src/sim/events.js';
import { applyEffects } from '../../src/sim/effects.js';
import { checkGoals } from '../../src/sim/goals.js';
import { EVENTS } from '../../src/data/events.js';
import { chatAppName } from '../../src/data/early-eras.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { addProduct } from './helpers.js';

const game = () => createGame({ seed: 17, startEra: 'web2' });
const start = (s, angle = 'web') => {
  expect(dispatch(s, { type: 'startProject', kind: 'new', name: 'Client Machine', category: 'email', angle, size: 'small' }).ok).toBe(true);
  return s.projects.at(-1);
};
const roundtrip = (s) => {
  const m = new Map(); const store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
  expect(saveGame(s, store)).toBe(true); const r = loadGame(store); expect(r.ok).toBe(true); return r.state;
};
const launch = (s, j, contributors) => {
  const c = makeCtx(s), pts = { features: 1e4, polish: 1e4, reliability: 1e4, novelty: 1e4 };
  c.weekEffort = { [j.id]: pts }; c.weekStats = { [j.id]: pts };
  c.contributors = { [j.id]: contributors.map((staffId) => ({ staffId, pts })) };
  projectsSystem(c); return s.products.at(-1);
};

describe('Web 2.0 career', () => {
  it('founds a garage company with period markets, HipCheck and the stated kit', () => {
    const s = game();
    expect(s.cash).toBe(B.funding.bootstrapped.cash + B.eraStarts.web2.cash);
    expect(s.officeStage).toBe(0); expect(s.office.placed).toHaveLength(B.eraStarts.web2.desks);
    expect(s.founding.eraScoreMult).toBe(0.75); expect(s.founding.timelineVersion).toBe('historical-v2');
    expect(calendarDate(s).year).toBe(2003); expect(chatAppName(s)).toBe('HipCheck');
    expect(s.market.unlockedAngles).toEqual(['web', 'onprem', 'api', 'freemium']);
    expect(s.market.unlockedCategories).toContain('devtools');
    expect(Object.values(s.models).some((m) => m.available)).toBe(false);
    expect(s.goals.office_floor.skipped).toBeUndefined(); expect(s.goals.first_launch.skipped).toBeUndefined();
    expect(dispatch(s, { type: 'startProject', kind: 'new', name: 'No', category: 'notes', angle: 'mobile', size: 'small' }).ok).toBe(false);
  });

  it('locks compatibility work at creation, including across reload and Classic', () => {
    const s = game(); const j = start(s);
    expect(j.pointsNeeded).toBe(B.sizes.small.points * B.web2.workMult);
    expect(j.compatibility.factor).toBe(B.web2.workMult);
    const p = s.staff[0]; p.role = 'engineer'; p.seniority = 'senior'; p.traits.push('legacy_whisperer');
    expect(compatibilityMult(s, 'web')).toBe(B.web2.whispererWorkMult);
    expect(j.pointsNeeded).toBe(480);
    const loaded = roundtrip(s); expect(loaded.projects).toEqual(s.projects);
    loaded.week = loaded.eraSchedule.classic; calendarStart(makeCtx(loaded));
    expect(loaded.projects[0].pointsNeeded).toBe(480);
    expect(start(loaded).compatibility).toBeUndefined();
    const normal = start(s, 'api'); expect(normal.pointsNeeded).toBe(B.sizes.small.points); expect(normal.compatibility).toBeUndefined();
    const reduced = start(s); expect(reduced.pointsNeeded).toBe(B.sizes.small.points * B.web2.whispererWorkMult);
    p.mood = 'away'; expect(compatibilityMult(s, 'web')).toBe(B.web2.workMult);
  });

  it('credits actual contributing engineers and earns the trait once, at seniority', () => {
    const s = game(), worker = s.staff[0], observer = s.staff[1];
    worker.role = observer.role = 'engineer'; worker.seniority = 'mid'; worker.traits = []; observer.traits = [];
    for (let i = 0; i < B.web2.legacyLaunches; i++) {
      const j = start(s);
      observer.assignment = { type: 'project', targetId: j.id };
      const product = launch(s, j, [worker.id]); expect(product.legacyCompatible).toBe(true);
      progressRecords(makeCtx(s), worker);
    }
    expect(worker.record.compatibleLaunches).toBe(B.web2.legacyLaunches);
    expect(observer.record.compatibleLaunches).toBeUndefined();
    expect(worker.traits).not.toContain('legacy_whisperer');
    worker.seniority = 'senior'; const c = makeCtx(s); progressRecords(c, worker); progressRecords(c, worker);
    expect(worker.traits).toEqual(['legacy_whisperer']);
    expect(c.events.filter((e) => e.type === 'traitEarned')).toHaveLength(1);
    expect(roundtrip(s).staff[0].record.compatibleLaunches).toBe(B.web2.legacyLaunches);
  });

  it('does not grant absent counters or overwrite three existing traits', () => {
    const s = game(), p = s.staff[0]; p.role = 'engineer'; p.seniority = 'senior'; p.traits = [];
    progressRecords(makeCtx(s), p); expect(p.traits).toEqual([]);
    p.record.compatibleLaunches = B.web2.legacyLaunches; p.traits = ['steady', 'loyal', 'mentor'];
    progressRecords(makeCtx(s), p); expect(p.traits).toEqual(['steady', 'loyal', 'mentor']);
  });

  it('keeps contributor ids when the team rotates and excludes zero work', () => {
    const s = game(), j = start(s), [a, b] = s.staff; a.role = b.role = 'engineer';
    const c = makeCtx(s), pts = { features: 2, polish: 2, reliability: 2, novelty: 2 };
    c.weekEffort = { [j.id]: pts }; c.weekStats = { [j.id]: pts };
    c.contributors = { [j.id]: [{ staffId: a.id, pts }, { staffId: b.id, pts: { features: 0, polish: 0, reliability: 0, novelty: 0 } }] };
    projectsSystem(c); expect(j.compatibility.contributors).toEqual([a.id]);
    launch(s, j, [b.id]); expect(a.record.compatibleLaunches).toBe(1); expect(b.record.compatibleLaunches).toBe(1);
  });

  it('offers arrival once and retires its queued cards at the boundary', () => {
    const s = game(); web2Step(makeCtx(s)); expect(s.pendingDecision.eventId).toBe('web2_recovery');
    s.pendingDecision = null; web2Step(makeCtx(s)); expect(s.pendingDecision).toBe(null);
    const loaded = roundtrip(s); loaded.week = loaded.eraSchedule.classic;
    const c = makeCtx(loaded); calendarStart(c);
    expect(loaded.era.id).toBe('classic'); expect(chatAppName(loaded)).toBe('Yak'); expect(calendarDate(loaded).year).toBe(2019);
    expect(loaded.flags.web2.retired).toBe(true);
    expect(c.events.some((e) => JSON.stringify(e).includes('Which one?'))).toBe(true);
    const next = makeCtx(loaded); web2Step(next); expect(next.events).toEqual([]);
    expect(raiseDecision(makeCtx(loaded), 'web2_recovery')).toBe(false);
  });

  it('patches only the selected compatible live product and awards its goal once', () => {
    const s = game(), a = addProduct(s, { legacyCompatible: true }), b = addProduct(s), dead = addProduct(s, { legacyCompatible: true, killed: true });
    expect(resolveSubjects(s, EVENTS.web2_grey_png)).toEqual([a]);
    const before = a.stats.polish; applyEffects(makeCtx(s), { legacyPolish: B.web2.pngPolish }, a.id);
    expect(a.stats.polish).toBe(before + B.web2.pngPolish);
    const others = [b.stats.polish, dead.stats.polish];
    for (const p of [b, dead]) applyEffects(makeCtx(s), { legacyPolish: B.web2.pngPolish }, p.id);
    expect([b.stats.polish, dead.stats.polish]).toEqual(others);
    const c = makeCtx(s); checkGoals(c); expect(c.events.some((e) => e.goalId === 'web2_compatible_launch')).toBe(true);
    const cash = s.cash; checkGoals(makeCtx(s)); expect(s.cash).toBe(cash);
  });

  it('routes new dot-com careers through Web 2.0 without replacing the company', () => {
    const s = createGame({ seed: 17, startEra: 'dotcom' }), p = addProduct(s);
    const ids = s.staff.map((x) => x.id); s.week = B.dotcom.weeks; calendarStart(makeCtx(s));
    expect(s.era.id).toBe('web2'); expect(calendarDate(s).year).toBe(2003); expect(s.flags.dotcom.recovered).toBe(true);
    expect(s.products[0]).toBe(p); expect(s.staff.map((x) => x.id)).toEqual(ids);
    expect(s.market.unlockedAngles).toContain('freemium');
    s.pendingDecision = null; s.scheduled = []; s.week = s.eraSchedule.classic; calendarStart(makeCtx(s));
    expect(s.era.id).toBe('classic'); expect(s.flags.erasVisited).toEqual(['dotcom', 'web2', 'classic']);
    expect(calendarDate(s).year).toBe(2019); expect(s.products[0]).toBe(p);
  });

  it('preserves the saved direct bridge, its goals and duration', () => {
    const s = createGame({ seed: 17, startEra: 'dotcom' });
    s.founding.timelineVersion = 'dotcom-bridge-v1'; s.founding.earlyChapters.pop(); delete s.eraSchedule.web2;
    for (const id of Object.keys(s.eraSchedule)) s.eraSchedule[id] -= B.web2.weeks;
    delete s.goals.web2_compatible_launch;
    const loaded = roundtrip(s); expect(loaded).toEqual(s);
    loaded.week = B.dotcom.weeks; calendarStart(makeCtx(loaded));
    expect(loaded.era.id).toBe('classic'); expect(loaded.flags.web2).toBeUndefined();
    expect(loaded.goals.web2_compatible_launch).toBeUndefined();
    expect(loaded.eraSchedule.classic).toBe(B.dotcom.weeks);
  });

  it('continues identically after saving a taxed project near the era boundary', () => {
    const s = game(); s.cash = 1e7; s.week = B.web2.weeks - 5; start(s); const loaded = roundtrip(s);
    for (let i = 0; i < 12; i++) {
      if (s.pendingDecision) {
        const choice = s.pendingDecision.choices.findIndex((c) => c.available);
        expect(dispatch(loaded, { type: 'resolveDecision', choice })).toEqual(dispatch(s, { type: 'resolveDecision', choice }));
      }
      expect(tick(loaded)).toEqual(tick(s));
    }
    expect(loaded).toEqual(s); expect(s.era.id).toBe('classic');
  });
});
