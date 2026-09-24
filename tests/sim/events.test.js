import { describe, it, expect } from 'vitest';
import { dispatch, tick } from '../../src/sim/index.js';
import { eventsSystem, eligibleEvents, raiseDecision, resolveSubjects, fillText } from '../../src/sim/events.js';
import { applyEffects, modifierBonus, processScheduled, expireModifiers } from '../../src/sim/effects.js';
import { annualSystem } from '../../src/sim/calendar.js';
import { outputMult } from '../../src/sim/staff.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS, INCIDENT_EVENT } from '../../src/data/events.js';
import { MODIFIER_KEYS } from '../../src/data/modifiers.js';
import { game, addStaff, addProduct, expectFail } from './helpers.js';

const ctxOf = (s) => makeCtx(s);
const raise = (s, id, subjectId = null) => { const c = ctxOf(s); raiseDecision(c, id, subjectId); return c.events; };
const resolve = (s, choice) => dispatch(s, { type: 'resolveDecision', choice });

function busy(seed = 1) {
  const s = game(seed);
  s.cash = 1e7;
  s.week = 60;
  s.officeStage = 1;
  s.automation.engineering.level = 0.75;
  addStaff(s, 'engineer', 'senior', { meaning: 50 });
  addStaff(s, 'engineer', 'junior');
  addStaff(s, 'support', 'mid', { meaning: 25, mood: 'coasting' });
  addStaff(s, 'marketer', 'mid', { meaning: 10, mood: 'burnout', burnoutWeeks: 1 });
  addProduct(s, { name: 'Inboxer', customers: 5000, mrr: 50000, score: 8 });
  addProduct(s, { name: 'Jotly', category: 'notes', customers: 800, mrr: 9600, score: 5 });
  return s;
}

describe('eligibility', () => {
  it('respects when, subject availability, and cooldown', () => {
    const s = game();
    const ids = () => eligibleEvents(s).map((e) => e.id);
    expect(ids()).not.toContain('viral_post');
    expect(ids()).not.toContain('burnout_warning');
    addProduct(s);
    expect(ids()).toContain('viral_post');
    s.flags.cd_viral_post = s.week + 5;
    expect(ids()).not.toContain('viral_post');
    s.week += 5;
    expect(ids()).toContain('viral_post');
    expect(ids().every((id) => EVENTS[id].random)).toBe(true);
  });

  it('never picks a founder as the subject of an event that can make someone leave', () => {
    const s = game();
    for (const f of s.staff) { f.mood = 'burnout'; f.meaning = 5; }
    expect(resolveSubjects(s, EVENTS.resignation_letter)).toEqual([]);
    expect(resolveSubjects(s, EVENTS.poached_by_bigco)).toEqual([]);
    expect(resolveSubjects(s, EVENTS.ai_skeptic_speech).length).toBe(1);
  });

  it('the resign effect is a no-op on founders', () => {
    const s = game();
    const f = s.staff[0];
    applyEffects(ctxOf(s), { resign: true }, f.id);
    expect(s.staff).toContain(f);
  });
});

describe('decisions', () => {
  it('a choice event blocks tick until resolved', () => {
    const s = busy();
    const ev = raise(s, 'hackathon');
    expect(ev).toContainEqual({ type: 'decision' });
    const w = s.week;
    expect(tick(s)).toEqual([]);
    expect(s.week).toBe(w);
    expect(resolve(s, 1).ok).toBe(true);
    expect(s.pendingDecision).toBe(null);
    tick(s);
    expect(s.week).toBe(w + 1);
  });

  it('resolveDecision applies exactly the chosen effects and toasts the outcome', () => {
    const s = busy();
    s.comprehensionDebt = 10;
    raise(s, 'hackathon');
    const cash = s.cash;
    const meanings = s.staff.map((p) => p.meaning);
    const res = resolve(s, 0);
    expect(s.cash).toBe(cash - 3000);
    expect(s.comprehensionDebt).toBe(12);
    s.staff.forEach((p, i) => expect(p.meaning).toBe(Math.min(100, meanings[i] + 6)));
    expect(res.events.some((e) => e.type === 'toast' && e.text === EVENTS.hackathon.choices[0].outcome)).toBe(true);
  });

  it('rejects bad resolutions with state unchanged', () => {
    const s = busy();
    expectFail(expect, dispatch, s, { type: 'resolveDecision', choice: 0 }, 'No decision pending');
    raise(s, 'hackathon');
    expectFail(expect, dispatch, s, { type: 'resolveDecision', choice: 7 }, 'Invalid choice');
    expectFail(expect, dispatch, s, { type: 'resolveDecision', choice: 'x' }, 'Invalid choice');
    s.pendingDecision = null;
    s.officeStage = 0;
    s.week += B.decisionGapWeeks;
    raise(s, 'conference_expo');
    expectFail(expect, dispatch, s, { type: 'resolveDecision', choice: 2 }, 'Needs the Office Floor');
  });

  it('accepting an acquisition ends the run as a win and names the acquirer', () => {
    const s = busy();
    raise(s, 'acquisition_offer');
    const res = resolve(s, 0);
    expect(res.ok).toBe(true);
    expect(s.gameOver).toMatchObject({ won: true, reason: 'retired', retiredVia: 'acquired' });
    expect(s.flags.acquirer).toBe('Gmale');
    expect(res.events).toContainEqual({ type: 'gameOver' });
  });

  it('the acquisition popup and the epilogue name the same acquirer', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = busy(seed);
      raise(s, 'acquisition_offer');
      const d = s.pendingDecision;
      resolve(s, 0);
      expect(d.text, `seed ${seed}`).toContain(s.flags.acquirer);
      const named = s.gameOver.epilogue.join(' ').match(/Acquired by ([A-Za-z ]+?)\./);
      if (named) expect(named[1]).toBe(s.flags.acquirer);
    }
  });

  it('a decision uses one incumbent across title, text, hints, and outcome', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = busy(seed);
      raise(s, 'poached_by_bigco', s.staff.find((p) => p.seniority === 'senior' && !p.founder).id);
      const name = s.pendingDecision.vars.incumbent;
      expect(s.pendingDecision.text).toContain(name);
      const res = resolve(s, 1);
      const out = res.events.find((e) => e.type === 'toast').text;
      expect(out).toContain(name);
    }
  });

  it('pivot cancels the killed product work and uses year-scaled points', () => {
    const s = busy();
    s.week = 52 * 3;
    const weak = s.products[1];
    const up = dispatch(s, { type: 'startProject', kind: 'update', productId: weak.id }).projectId;
    const f = s.staff.find((p) => p.founder);
    raise(s, 'pivot_pitch', f.id);
    const res = resolve(s, 0);
    expect(res.events.filter((e) => e.type === 'toast').length).toBeLessThanOrEqual(2);
    expect(weak.killed).toBe(true);
    expect(s.projects.some((j) => j.id === up)).toBe(false);
    const fresh = s.projects.find((j) => j.kind === 'new');
    expect(s.pendingDecision).toBe(null);
    expect(fresh.pointsNeeded).toBeCloseTo(B.sizes.medium.points * (1 + 3 * B.pointsGrowthPerYear));
  });

  it('fixing pay equity raises everyone', () => {
    const s = busy();
    const before = s.staff.map((p) => p.salary);
    raise(s, 'pay_equity_question', s.staff[2].id);
    resolve(s, 0);
    s.staff.forEach((p, i) => expect(p.salary).toBeGreaterThan(before[i]));
    expect(EVENTS.pay_equity_question.choices[0].hint).toMatch(/permanent raise for everyone/i);
  });

  it('keeping the four-day week schedules a yearly review', () => {
    const s = busy();
    raise(s, 'four_day_week_review');
    resolve(s, 0);
    expect(s.modifiers.every((m) => m.untilWeek === s.week + 52)).toBe(true);
    expect(s.scheduled.some((x) => x.kind === 'event' && x.payload.eventId === 'four_day_week_review' && x.week === s.week + 52)).toBe(true);
  });

  it('pairing a junior with a mentor assigns a free senior', () => {
    const s = busy();
    const j = s.staff.find((p) => p.seniority === 'junior');
    raise(s, 'junior_asks_mentor', j.id);
    expect(resolve(s, 0).ok).toBe(true);
    const m = s.staff.find((p) => p.assignment.type === 'mentor' && p.assignment.targetId === j.id);
    expect(m).toBeDefined();
    expect(m.seniority).not.toBe('junior');
  });

  it('subject-null hype and customer effects target the newest product; incident effects hit the incident product', () => {
    const s = busy();
    const [old, newest] = s.products;
    raise(s, 'conference_expo');
    resolve(s, 1);
    expect(newest.hype).toBe(10);
    expect(old.hype).toBe(0);
    const before = old.customers;
    raise(s, 'agent_mass_email', old.id);
    resolve(s, 0);
    expect(old.customers).toBe(Math.floor(before * 0.97));
  });
});

describe('delayed consequences', () => {
  it('a later effect applies exactly at week + inWeeks', () => {
    const s = busy();
    applyEffects(ctxOf(s), { later: [{ inWeeks: 3, effects: { cash: 1000 } }] }, null);
    const cash = s.cash;
    expect(s.scheduled).toHaveLength(1);
    for (let i = 0; i < 2; i++) { s.week++; processScheduled(ctxOf(s)); }
    expect(s.cash).toBe(cash);
    s.week++;
    processScheduled(ctxOf(s));
    expect(s.cash).toBe(cash + 1000);
    expect(s.scheduled).toHaveLength(0);
  });

  it('a modifier changes its system while active and stops after untilWeek', () => {
    const s = busy();
    const p = s.staff[0];
    const base = outputMult(s, p);
    applyEffects(ctxOf(s), { modifier: { key: 'output', value: -0.2, weeks: 4, label: 'Four-day week trial' } }, null, 'four_day_week');
    expect(modifierBonus(s, 'output')).toBeCloseTo(-0.2);
    expect(outputMult(s, p)).toBeCloseTo(base * 0.8);
    expect(s.modifiers[0]).toMatchObject({ key: 'output', label: 'Four-day week trial', untilWeek: s.week + 4, source: 'four_day_week' });
    s.week += 4;
    const c = ctxOf(s);
    expireModifiers(c);
    expect(s.modifiers).toHaveLength(0);
    expect(outputMult(s, p)).toBeCloseTo(base);
    expect(c.events.some((e) => e.type === 'toast' && e.text.includes('Four-day week trial'))).toBe(true);
  });

  it('a follow-up event raises its decision at the scheduled week', () => {
    const s = busy();
    raise(s, 'four_day_week', s.staff[0].id);
    resolve(s, 0);
    const due = s.scheduled.find((x) => x.kind === 'event');
    expect(due.payload.eventId).toBe('four_day_week_review');
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    s.week = due.week - 1;
    processScheduled(ctxOf(s));
    expect(s.pendingDecision).toBe(null);
    s.week = due.week;
    const c = ctxOf(s);
    processScheduled(c);
    expect(s.pendingDecision.eventId).toBe('four_day_week_review');
    expect(c.events).toContainEqual({ type: 'decision' });
  });

  it('switching off Grokk migrates products and automation to another model', () => {
    const s = busy();
    const p = s.products[0];
    p.model = 'grokk';
    s.automation.sales = { level: 0.5, model: 'grokk' };
    raise(s, 'grokk_pr_scandal');
    resolve(s, 1);
    expect(s.automation.sales.model).not.toBe('grokk');
    expect(p.migrationDueWeek).toBe(s.week + B.migrationDeadlineWeeks);
    const res = dispatch(s, { type: 'startProject', kind: 'migration', productId: p.id });
    expect(s.projects.find((j) => j.id === res.projectId).model).not.toBe('grokk');
  });

  it('the no-show person is away and comes back', () => {
    const s = busy();
    const p = s.staff.find((x) => x.role === 'support');
    raise(s, 'no_show', p.id);
    resolve(s, 0);
    expect(p.mood).toBe('away');
    for (let i = 0; i < 6; i++) { s.pendingDecision = null; tick(s); }
    expect(s.staff.find((x) => x.id === p.id)?.mood).not.toBe('away');
  });

  it('the tempting leadership choice pays now and costs later', () => {
    const s = busy();
    const f = s.staff.find((x) => x.founder);
    raise(s, 'ceo_replace_support', f.id);
    resolve(s, 0);
    expect(s.automation.support.level).toBe(1);
    expect(s.scheduled.some((x) => x.kind === 'event' && x.payload.eventId === 'ceo_support_fallout')).toBe(true);
  });

  it('unknown modifier keys are ignored at runtime', () => {
    const s = busy();
    applyEffects(ctxOf(s), { modifier: { key: 'vibes', value: 0.5, weeks: 4, label: 'Vibes' } }, null);
    expect(s.modifiers).toEqual([]);
  });

  it('the polarity table covers every modifierBonus key', () => {
    expect(Object.keys(MODIFIER_KEYS).sort()).toEqual(['acquisition', 'brandPerWeek', 'churn', 'hype', 'meaningDrain', 'meaningRecovery', 'oversight', 'output', 'rogueRisk', 'staminaDrain', 'xp'].sort());
    for (const [k, v] of Object.entries(MODIFIER_KEYS)) {
      expect(v.key).toBe(k);
      expect(['up', 'down']).toContain(v.goodWhen);
      expect(['pct', 'flat']).toContain(v.format);
      expect(v.label.length).toBeGreaterThan(2);
    }
    for (const k of ['meaningDrain', 'churn', 'staminaDrain', 'rogueRisk']) expect(MODIFIER_KEYS[k].goodWhen).toBe('down');
  });

  it('modifier keys only use the supported set', () => {
    const KEYS = Object.keys(MODIFIER_KEYS);
    const walk = (fx) => {
      if (!fx) return;
      for (const m of [fx.modifier].flat().filter(Boolean)) {
        expect(KEYS).toContain(m.key);
        expect(Math.abs(m.value)).toBeLessThanOrEqual(0.5);
      }
      walk(fx.cond?.then); walk(fx.cond?.else); walk(fx.gamble?.effects); walk(fx.gamble?.else);
      for (const l of fx.later ?? []) walk(l.effects);
    };
    for (const e of Object.values(EVENTS)) (e.choices ?? [{ effects: e.auto }]).forEach((c) => walk(c.effects));
  });
});

describe('incident decisions', () => {
  it('every decision the incidents system can raise resolves with every choice', () => {
    for (const eventId of new Set(Object.values(INCIDENT_EVENT))) {
      for (let choice = 0; choice < EVENTS[eventId].choices.length; choice++) {
        const s = busy();
        raise(s, eventId, s.products[0].id);
        const res = resolve(s, choice);
        expect(res.ok, `${eventId}[${choice}] ${res.reason}`).toBe(true);
        expect(s.pendingDecision).toBe(null);
        const w = s.week;
        tick(s);
        expect(s.week).toBe(w + 1);
      }
    }
  });

  it('a severe incident while another decision is pending is queued, not dropped', () => {
    const s = busy();
    raise(s, 'hackathon');
    const c = ctxOf(s);
    raiseDecision(c, 'agent_db_wipe', s.products[0].id, { queue: true });
    expect(s.pendingDecision.eventId).toBe('hackathon');
    expect(s.scheduled.some((x) => x.kind === 'event' && x.payload.eventId === 'agent_db_wipe')).toBe(true);
    resolve(s, 1);
    processScheduled(ctxOf(s));
    expect(s.pendingDecision.eventId).toBe('agent_db_wipe');
  });
});

describe('content', () => {
  it('has 58+ events and every follow-up target exists and is not random', () => {
    expect(Object.keys(EVENTS).length).toBeGreaterThanOrEqual(58);
    const targets = [];
    const walk = (fx) => {
      if (!fx) return;
      if (fx.followUp) targets.push(fx.followUp.eventId);
      walk(fx.cond?.then); walk(fx.cond?.else); walk(fx.gamble?.effects); walk(fx.gamble?.else);
      for (const l of fx.later ?? []) walk(l.effects);
    };
    for (const e of Object.values(EVENTS)) (e.choices ?? [{ effects: e.auto }]).forEach((c) => walk(c.effects));
    expect(targets.length).toBeGreaterThanOrEqual(4);
    for (const t of targets) {
      expect(EVENTS[t], t).toBeDefined();
      expect(EVENTS[t].random).toBe(false);
    }
  });

  it('choices with delayed consequences say so in the hint', () => {
    for (const e of Object.values(EVENTS)) {
      for (const c of e.choices ?? []) {
        const fx = c.effects;
        if (fx.later || fx.modifier || fx.followUp) expect(c.hint, `${e.id}: ${c.label}`).toMatch(/later|week|trial/i);
      }
    }
  });

  it('every choice has an outcome line', () => {
    for (const e of Object.values(EVENTS)) for (const c of e.choices ?? []) expect(c.outcome, `${e.id}: ${c.label}`).toBeTruthy();
  });

  it('every event fills its placeholders', () => {
    const s = busy();
    for (const e of Object.values(EVENTS)) {
      const subjects = resolveSubjects(s, e);
      const subjectId = subjects[0]?.id ?? s.products[0].id;
      for (const text of [e.title, e.text, ...(e.choices ?? []).map((c) => c.outcome ?? '')]) {
        expect(fillText(s, s.rng, text, subjectId), `${e.id}: ${text}`).not.toMatch(/[{}]/);
      }
    }
  });

  it('300 weeks with a fixed seed produce at least 10 distinct events', () => {
    const s = busy(3);
    for (let w = 0; w < 300; w++) {
      if (s.pendingDecision) resolve(s, s.pendingDecision.choices.findIndex((_, i) => dispatch(JSON.parse(JSON.stringify(s)), { type: 'resolveDecision', choice: i }).ok));
      s.cash = 1e7;
      s.lowCashWeeks = 0;
      eventsSystem(ctxOf(s));
      s.week++;
    }
    const seen = Object.keys(s.flags).filter((k) => k.startsWith('cd_'));
    expect(seen.length).toBeGreaterThanOrEqual(10);
  });
});

describe('annual calendar', () => {
  it('raises the expo, holds the awards, and summarizes the year', () => {
    const s = busy();
    s.week = 52 + 39;
    const c1 = ctxOf(s);
    annualSystem(c1);
    expect(s.pendingDecision?.eventId).toBe('conference_expo');
    s.pendingDecision = null;
    s.week = 52 + 49;
    const brand = s.brand;
    const c2 = ctxOf(s);
    annualSystem(c2);
    const awards = c2.events.filter((e) => e.type === 'award');
    expect(awards.some((e) => e.text === 'Product of the Year: Inboxer')).toBe(true);
    expect(s.brand).toBeGreaterThanOrEqual(Math.min(100, brand + 6));
    expect(s.stats.awards).toBe(awards.length);
    s.week = 52 + 51;
    const c3 = ctxOf(s);
    annualSystem(c3);
    expect(c3.events.some((e) => e.type === 'toast' && /MRR/.test(e.text))).toBe(true);
  });

  it('gives a joke award for an unrecoverable outage that year', () => {
    const s = busy();
    s.week = 52 + 49;
    s.flags.worstOutageYear = 1;
    s.flags.worstOutageProduct = 'Jotly';
    const c = ctxOf(s);
    annualSystem(c);
    expect(c.events.some((e) => e.type === 'award' && e.text.includes('Worst Outage'))).toBe(true);
  });
});
