import { describe, it, expect } from 'vitest';
import { createGame, dispatch, tick, dateOf } from '../../src/sim/index.js';
import { eraIndex, currentEra, eraAllowsText, eraOnlyAllowsText } from '../../src/sim/eras.js';
import { eligibleEvents } from '../../src/sim/events.js';
import { applyEffects } from '../../src/sim/effects.js';
import { refreshCandidates as refreshCandidatesFor } from '../../src/sim/staff.js';
import { calendarStart } from '../../src/sim/vendors.js';
import { makeCtx } from '../../src/sim/registry.js';
import { ANGLES } from '../../src/data/angles.js';
import { ERAS } from '../../src/data/eras.js';
import { EVENTS } from '../../src/data/events.js';
import { comboFit } from '../../src/data/combos.js';
import { B } from '../../src/sim/balance.js';
import { classicGame as game, addProduct, offeredEvents } from './helpers.js';

const toWeek = (s, w) => { for (const c of [calendarStart]) { while (s.week < w) { s.week++; c(makeCtx(s)); } } return s; };

describe('the run starts in 2019', () => {
  it('week 0 is January 2019', () => {
    expect(dateOf(0)).toEqual({ year: 2019, yearIndex: 0, week: 1, quarter: 1 });
    const s = game();
    expect(s.era).toEqual({ id: 'classic', since: 0 });
  });
});

describe('era schedule', () => {
  it('is jittered by at most a quarter around the timeline, deterministic per seed', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = createGame({ seed });
      for (const e of ERAS.slice(1)) {
        expect(Math.abs(s.eraSchedule[e.id] - e.week), `${seed} ${e.id}`).toBeLessThanOrEqual(13);
      }
      expect(s.eraSchedule.chatgbt).toBeLessThan(s.eraSchedule.agents);
      expect(s.eraSchedule.agents).toBeLessThan(s.eraSchedule.consolidation);
      expect(s.eraSchedule.consolidation).toBeLessThan(s.eraSchedule.plateau);
      expect(createGame({ seed }).eraSchedule).toEqual(s.eraSchedule);
    }
    expect(dateOf(ERAS[1].week).year).toBe(2022);
  });

  it('eras arrive on schedule with an era event and a decision', () => {
    const s = game(4);
    s.stats.launches = 1;
    const at = s.eraSchedule.chatgbt;
    s.week = at - 1;
    let c = makeCtx(s);
    calendarStart(c);
    expect(s.era.id).toBe('classic');
    s.week = at;
    c = makeCtx(s);
    calendarStart(c);
    expect(s.era).toEqual({ id: 'chatgbt', since: at });
    expect(c.events).toContainEqual({ type: 'era', eraId: 'chatgbt' });
    expect(s.pendingDecision?.eventId ?? s.scheduled.find((x) => x.payload?.eventId === 'era_chatgbt')?.payload.eventId).toBe('era_chatgbt');
  });
});

describe('what each era allows', () => {
  it('classic offers approaches only; AI angles arrive with their eras', () => {
    const s = game();
    expect(s.market.unlockedAngles.sort()).toEqual(['api', 'freemium', 'mobile', 'onprem', 'web']);
    for (const a of ['web', 'mobile', 'api', 'freemium', 'onprem']) expect(ANGLES[a].ai).toBe(false);
    for (const a of ['copilot', 'summarizer', 'agent', 'workflow', 'native']) expect(ANGLES[a].ai).toBe(true);
    toWeek(s, s.eraSchedule.chatgbt);
    expect(s.market.unlockedAngles).toEqual(expect.arrayContaining(['copilot', 'summarizer']));
    expect(s.market.unlockedAngles).not.toContain('agent');
    toWeek(s, s.eraSchedule.agents);
    expect(s.market.unlockedAngles).toEqual(expect.arrayContaining(['agent', 'workflow', 'native']));
  });

  it('approaches have real combo fits', () => {
    expect(comboFit('devtools', 'api')).toBeGreaterThan(1);
    expect(comboFit('security', 'onprem')).toBeGreaterThan(1);
    expect(comboFit('notes', 'freemium')).toBeGreaterThan(1);
  });

  it('no models or automation in classic; a classic product has no model', () => {
    const s = game();
    expect(Object.values(s.models).some((m) => m.available)).toBe(false);
    expect(dispatch(s, { type: 'setAutomation', fn: 'support', level: 0.5 })).toMatchObject({ ok: false });
    const res = dispatch(s, { type: 'startProject', kind: 'new', name: 'Loopo', category: 'notes', angle: 'freemium', size: 'small' });
    expect(res.ok).toBe(true);
    expect(s.projects[0].model).toBe(null);
    expect(dispatch(s, { type: 'startProject', kind: 'new', name: 'X', category: 'notes', angle: 'copilot', model: 'chatgbt', size: 'small' }).ok).toBe(false);
  });

  it('the ChatGBT era allows gentle automation only; Agents allows the full dials', () => {
    const s = game();
    toWeek(s, s.eraSchedule.chatgbt);
    s.unlocks.automation = s.week;
    expect(s.models.chatgbt.available).toBe(true);
    expect(dispatch(s, { type: 'setAutomation', fn: 'support', level: 1, model: 'chatgbt' }).ok).toBe(true);
    expect(s.automation.support.level).toBe(B.chatgbtAutomationCap);
    expect(dispatch(s, { type: 'setAutomation', fn: 'engineering', level: 0.5, model: 'chatgbt' })).toMatchObject({ ok: false, reason: 'Arrives with the Agents era' });
    toWeek(s, s.eraSchedule.agents);
    expect(dispatch(s, { type: 'setAutomation', fn: 'engineering', level: 1, model: 'chatgbt' }).ok).toBe(true);
    expect(s.automation.engineering.level).toBe(1);
  });

  it('AI flavored events and text stay out of the classic era', () => {
    const s = game();
    s.stats.launches = 3;
    s.week = 60;
    addProduct(s, { model: null, angle: 'web' });
    const ids = offeredEvents(s);
    for (const id of ids) expect(eraOnlyAllowsText(s, JSON.stringify([EVENTS[id].title, EVENTS[id].text])), id).toBe(true);
    expect(ids).not.toContain('vendor_new_version');
    expect(eraAllowsText(s, 'The agent rewrote pricing')).toBe(false);
    expect(eraAllowsText(s, 'Pairing today was fun')).toBe(true);
  });

  it('a whole classic stretch with a live product produces no AI talk and stays finite', () => {
    const s = game(6);
    dispatch(s, { type: 'startProject', kind: 'new', name: 'Loopo', category: 'notes', angle: 'freemium', size: 'small' });
    for (const p of s.staff) p.assignment = { type: 'project', targetId: s.projects[0].id };
    s.cash = 1e6;
    const lines = [];
    while (s.week < s.eraSchedule.chatgbt - 1) {
      for (let c = 0; c < 4 && s.pendingDecision; c++) dispatch(s, { type: 'resolveDecision', choice: c });
      for (const e of tick(s)) if (e.type === 'chat' || e.type === 'toast') lines.push(e.text);
      s.cash = Math.max(s.cash, 1e6);
      s.lowCashWeeks = 0;
    }
    expect(s.products.length).toBeGreaterThan(0);
    const ai = lines.filter((t) => !eraOnlyAllowsText({ era: { id: 'classic' } }, t));
    expect(ai).toEqual([]);
    expect(currentEra(s).id).toBe('classic');
    expect(eraIndex(s)).toBe(0);
  });
});

describe('era arrivals', () => {
  it('every era after Classic has a decision with three choices', () => {
    for (const e of ERAS.slice(1)) {
      const ev = EVENTS[`era_${e.id}`];
      expect(ev, e.id).toBeDefined();
      expect(ev.random).toBe(false);
      expect(ev.choices.length).toBe(3);
    }
  });

  it('an era decision waits for the decision gap instead of stacking on the last popup', () => {
    const s = game(4);
    const at = s.eraSchedule.chatgbt;
    s.week = at;
    s.flags.lastDecisionWeek = at - 1;
    const c = makeCtx(s);
    calendarStart(c);
    expect(c.events).toContainEqual({ type: 'era', eraId: 'chatgbt' });
    expect(s.pendingDecision).toBe(null);
    const queued = s.scheduled.find((x) => x.payload?.eventId === 'era_chatgbt');
    expect(queued.week).toBe(at - 1 + B.decisionGapWeeks);
  });

  it('a whole run passes through every era in order, once each', () => {
    const s = game(9);
    const seen = [];
    for (let w = 0; w <= s.eraSchedule.plateau + 1; w++) {
      s.week = w;
      const c = makeCtx(s);
      calendarStart(c);
      seen.push(...c.events.filter((e) => e.type === 'era').map((e) => [e.eraId, w]));
      s.pendingDecision = null;
    }
    expect(seen).toEqual(ERAS.slice(1).map((e) => [e.id, s.eraSchedule[e.id]]));
    expect(s.era).toEqual({ id: 'plateau', since: s.eraSchedule.plateau });
  });

  it('the Classic era has its own events and trends', () => {
    const classic = Object.values(EVENTS).filter((e) => e.eras?.includes('classic'));
    expect(classic.length).toBeGreaterThanOrEqual(4);
    const s = game();
    s.stats.launches = 3;
    s.week = 60;
    addProduct(s, { model: null, angle: 'web' });
    const ids = offeredEvents(s);
    expect(ids).toEqual(expect.arrayContaining(['cloud_bill', 'app_store_rejection']));
    s.era = { id: 'agents', since: 0 };
    expect(offeredEvents(s)).not.toContain('cloud_bill');
  });
});

describe('events respect the era automation cap', () => {
  it('an automation bump in the ChatGBT era only reaches support and marketing, up to the cap', () => {
    const s = game();
    s.era = { id: 'chatgbt', since: 0 };
    applyEffects(makeCtx(s), { automationBump: 1, setAutomation: { engineering: 1 } });
    expect(s.automation.support.level).toBe(B.chatgbtAutomationCap);
    expect(s.automation.marketing.level).toBe(B.chatgbtAutomationCap);
    expect(s.automation.engineering.level).toBe(0);
    expect(s.automation.qa.level).toBe(0);
  });
});

describe('classic text: reviews, traits, and the office', () => {
  it('classic reviews, candidates, and lines stay AI-free and match the office', async () => {
    const { reviewScore } = await import('../../src/sim/projects.js');
    const { isAiText, eraLines } = await import('../../src/sim/eras.js');
    const { TRAITS } = await import('../../src/data/traits.js');
    const s = game(3);
    for (let i = 0; i < 60; i++) {
      const r = reviewScore(s, { stats: { features: 200, polish: 100, reliability: 100, novelty: 40 }, pointsNeeded: 400, category: 'notes', angle: 'web', startedWeek: 0, size: 'small' });
      for (const q of r.reviews) expect(isAiText(q.quote), q.quote).toBe(false);
      for (const q of r.reviews) expect(q.quote).not.toMatch(/chat box|summarize|generated/i);
    }
    for (let i = 0; i < 20; i++) {
      for (const c of makeCandidates(s)) for (const t of c.traits) expect(isAiText(`${TRAITS[t].name} ${TRAITS[t].desc}`), t).toBe(false);
    }
    expect(eraLines(s, ['Just watering the office plant. It is thriving.', 'Hello'])).toEqual(['Hello']);
    s.office.placed.push({ id: 'p1', itemId: 'plant', level: 1, x: 0, y: 0, rot: 0 });
    expect(eraLines(s, ['Just watering the office plant. It is thriving.', 'Hello'])).toHaveLength(2);
  });
});

function makeCandidates(s) {
  refreshCandidatesFor(s);
  return s.candidates;
}
