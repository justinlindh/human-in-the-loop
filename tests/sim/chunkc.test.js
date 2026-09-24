import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { annualSystem } from '../../src/sim/calendar.js';
import { onDeparture } from '../../src/sim/knowledge.js';
import { raiseDecision } from '../../src/sim/events.js';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { game, classicGame, addStaff, addProduct } from './helpers.js';

const run = (s) => { const c = makeCtx(s); annualSystem(c); return c.events; };
const atWeekOfYear = (s, year, w) => { s.week = year * 52 + w - 1; };
const awards = (ev) => ev.filter((e) => e.type === 'award').map((e) => e.text);

function aiCompany(seed = 1) {
  const s = game(seed);
  s.week = 330;
  s.cash = 1e6;
  addProduct(s, { name: 'Summarizzle', score: 8.5 });
  addProduct(s, { name: 'Draftly', score: 7.8 });
  return s;
}

describe('the AI Summit', () => {
  it('is raised once a year from the ChatGBT moment, never in the Classic era', () => {
    const c = classicGame();
    atWeekOfYear(c, 1, B.aiSummitWeek);
    run(c);
    expect(c.pendingDecision?.eventId).not.toBe('ai_summit');
    const s = aiCompany();
    atWeekOfYear(s, 6, B.aiSummitWeek);
    run(s);
    expect(s.pendingDecision?.eventId).toBe('ai_summit');
    expect(EVENTS.ai_summit.choices.find((x) => x.requires)?.requires).toBe('stage1');
  });

  it('rotates three formats, costs more in later eras, and pauses after two declines until a new AI product ships', () => {
    const s = aiCompany(2);
    const seen = [];
    const skip = () => {
      const i = EVENTS[s.pendingDecision.eventId].choices.findIndex((c) => c.effects.summit === 'skip');
      expect(dispatch(s, { type: 'resolveDecision', choice: i }).ok).toBe(true);
    };
    const attend = () => {
      const i = EVENTS[s.pendingDecision.eventId].choices.findIndex((c) => c.effects.summit === 'small');
      const cash = s.cash;
      expect(dispatch(s, { type: 'resolveDecision', choice: i }).ok).toBe(true);
      return cash - s.cash;
    };
    for (let y = 6; y < 9; y++) {
      atWeekOfYear(s, y, B.aiSummitWeek);
      run(s);
      seen.push(s.pendingDecision.eventId);
      attend();
    }
    expect(new Set(seen).size).toBe(3);
    s.era = { id: 'plateau', since: 0 };
    atWeekOfYear(s, 9, B.aiSummitWeek);
    run(s);
    expect(s.pendingDecision.choices[1].hint).toContain(`$${Math.round(B.summitCost.small * B.summitEraMult[4] / 1000)}k`);
    skip();
    atWeekOfYear(s, 10, B.aiSummitWeek);
    run(s);
    skip();
    atWeekOfYear(s, 11, B.aiSummitWeek);
    run(s);
    expect(s.pendingDecision).toBeNull();
    addProduct(s, { name: 'Newbot', launchedWeek: s.week });
    atWeekOfYear(s, 12, B.aiSummitWeek);
    run(s);
    expect(s.pendingDecision?.eventId).toMatch(/^ai_summit/);
  });
});

describe('the new Saasies', () => {
  it('Best AI Feature goes to the best AI product once AI is a thing', () => {
    const s = aiCompany();
    atWeekOfYear(s, 6, 50);
    expect(awards(run(s))).toContain('Best AI Feature: Summarizzle');
    const c = classicGame();
    addProduct(c, { name: 'Plannr', angle: 'web', model: null, score: 9 });
    atWeekOfYear(c, 1, 50);
    expect(awards(run(c)).some((t) => t.startsWith('Best AI Feature'))).toBe(false);
  });

  it('Best Place to Work needs a happy team and nobody quitting this year', () => {
    const make = (quits) => {
      const s = aiCompany(3);
      for (const role of ['engineer', 'designer', 'marketer', 'support', 'sales', 'engineer', 'engineer', 'designer', 'support', 'sales']) addStaff(s, role, 'mid', { meaning: 90 });
      for (const p of s.staff) { p.meaning = 90; p.mood = 'ok'; p.strain = 0; }
      atWeekOfYear(s, 6, 1);
      run(s);
      s.stats.resignations += quits;
      atWeekOfYear(s, 6, 50);
      return awards(run(s));
    };
    expect(make(0).some((t) => t.startsWith('Best Place to Work'))).toBe(true);
    expect(make(3).some((t) => t.startsWith('Best Place to Work'))).toBe(false);
  });

  it('Most Trusted needs Consolidation, live products, and no breach this year', () => {
    const make = (era, breaches) => {
      const s = aiCompany(4);
      s.era = { id: era, since: 0 };
      atWeekOfYear(s, 11, 1);
      run(s);
      s.stats.breaches += breaches;
      atWeekOfYear(s, 11, 50);
      return awards(run(s)).some((t) => t.startsWith('Most Trusted'));
    };
    expect(make('consolidation', 0)).toBe(true);
    expect(make('consolidation', 1)).toBe(false);
    expect(make('agents', 0)).toBe(false);
  });
});

describe('the hearing', () => {
  it('summons a company with two AI products once, and the report follows 13 weeks later', () => {
    const s = aiCompany(5);
    s.week = B.hearingFromWeek + 1;
    run(s);
    expect(s.pendingDecision?.eventId).toBe('hearing_summons');
    const i = EVENTS.hearing_summons.choices.findIndex((c) => c.label === 'Send the lawyers');
    const cash = s.cash;
    expect(dispatch(s, { type: 'resolveDecision', choice: i }).ok).toBe(true);
    expect(s.cash).toBe(cash - 30000);
    expect(JSON.stringify(s)).toContain('hearing_report');
    s.pendingDecision = null;
    s.week += 52;
    run(s);
    expect(s.pendingDecision?.eventId).not.toBe('hearing_summons');
  });

  it('skips companies without AI products', () => {
    const s = game(6);
    s.week = B.hearingFromWeek + 1;
    addProduct(s, { angle: 'web', model: null });
    run(s);
    expect(s.pendingDecision?.eventId).not.toBe('hearing_summons');
  });
});

describe('moving on', () => {
  it('long-tenured people sometimes leave on good terms, join the alumni, and it is not a resignation', async () => {
    const { moveOnSystem } = await import('../../src/sim/alumni.js');
    const s = aiCompany(9);
    for (let i = 0; i < 8; i++) addStaff(s, 'engineer', 'mid', { hiredWeek: s.week - 400 });
    const before = s.staff.length;
    const founders = s.staff.filter((p) => p.founder).length;
    for (const p of s.staff) if (p.founder) p.hiredWeek = s.week - 400;
    let left = 0;
    for (let w = 0; w < 520 && s.staff.length > B.moveOnMinStaff; w++) {
      const c = makeCtx(s);
      moveOnSystem(c);
      left += c.events.filter((e) => e.type === 'resign' && !e.fired).length;
      s.week++;
    }
    expect(left).toBeGreaterThan(0);
    expect(s.flags.alumni.length).toBe(left);
    expect(s.staff.length).toBe(before - left);
    expect(s.stats.resignations).toBe(0);
    expect(s.staff.filter((p) => p.founder)).toHaveLength(founders);
  });
});

describe('alumni', () => {
  it('every departure joins the network, capped, and the alumni events fill {alum}', () => {
    const s = aiCompany(7);
    for (let i = 0; i < B.alumniKept + 5; i++) {
      const p = addStaff(s, 'engineer', 'mid');
      s.staff.splice(s.staff.indexOf(p), 1);
      onDeparture(s, p);
    }
    expect(s.flags.alumni).toHaveLength(B.alumniKept);
    expect(EVENTS.alumni_referral.when(s, { live: s.products })).toBe(true);
    const c = makeCtx(s);
    raiseDecision(c, 'alumni_competitor', s.products[0].id);
    const alum = s.flags.alumni.at(-1).name.split(' ')[0];
    expect(s.pendingDecision.title).toContain(alum);
    expect(JSON.stringify(s.pendingDecision)).not.toMatch(/\{alum\}/);
    expect(EVENTS.alumni_referral.when(game(8), { live: [] })).toBe(false);
  });

  it('shows up in real runs, and the state stays JSON-safe', () => {
    let seen = 0;
    for (const seed of [1, 2, 3]) {
      let last = null;
      runBot('balanced', seed, 700, { setup: (s) => { last = s; }, onWeek: (s) => {
        const id = s.pendingDecision?.eventId ?? '';
        if (/^alumni_|^hearing_|^ai_summit/.test(id)) seen++;
      } });
      expect(() => JSON.parse(JSON.stringify(last.flags.alumni ?? []))).not.toThrow();
      expect(Number.isFinite(last.cash)).toBe(true);
    }
    expect(seen).toBeGreaterThan(0);
  }, 300000);
});
