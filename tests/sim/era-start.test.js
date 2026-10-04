import { describe, it, expect } from 'vitest';
import { createGame, dispatch, tick, scoreRun, calendarDate } from '../../src/sim/index.js';
import { endgameSystem } from '../../src/sim/endgame.js';
import { annualSystem } from '../../src/sim/calendar.js';
import { B } from '../../src/sim/balance.js';
import { calendarStart } from '../../src/sim/vendors.js';
import { checkGoals } from '../../src/sim/goals.js';
import { makeCtx } from '../../src/sim/registry.js';
import { seatOf } from '../../src/sim/office.js';
import { saveGame, loadGame, saveMeta } from '../../src/save/save.js';
import { MODELS } from '../../src/data/models.js';
import { CATEGORIES } from '../../src/data/categories.js';

const storage = () => {
  const data = new Map();
  return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
};

describe('starting era', () => {
  it('keeps omitted, explicit and invalid Classic starts identical', () => {
    for (const seed of [1, 17, 200]) {
      const classic = createGame({ seed });
      for (const startEra of ['classic', 'unknown', 'toString', 'long_career', null]) {
        expect(createGame({ seed, startEra })).toEqual(classic);
      }
    }
  });

  it.each(['chatgbt', 'agents', 'consolidation', 'plateau'])('starts a new %s company with every funding choice', (startEra) => {
    for (const funding of Object.keys(B.funding)) {
      const s = createGame({ seed: 11, startEra, funding });
      const kit = B.eraStarts[startEra];
      expect(s.week).toBe(0);
      expect(s.era).toEqual({ id: startEra, since: 0 });
      expect(s.cash).toBe(B.funding[funding].cash + kit.cash);
      expect(s.officeStage).toBe(kit.officeStage);
      expect(s.office.stage).toBe(kit.officeStage);
      expect(s.officeStage).toBe(0);
      expect(s.goals.office_floor.skipped).toBeUndefined();
      expect(s.office.placed).toHaveLength(kit.desks);
      expect(s.staff).toHaveLength(2);
      for (const p of s.staff) { expect(p.hiredWeek).toBe(0); expect(seatOf(s, p.id)).toBeTruthy(); }
      expect(s.stats.launches).toBe(0);
      expect(s.stats.hires).toBe(0);
      expect(s.products).toEqual([]);
      expect(s.policies).toEqual({});
      expect(s.models.chatgbt.available).toBe(true);
      expect(s.market.unlockedAngles).toContain('copilot');
      for (const key of ['marketing', 'ops', 'research', 'models', 'automation', 'meaning', 'policy.pair']) expect(s.unlocks[key]).toBe(0);
      expect(s.founding.eraScoreMult).toBe(kit.scoreMult);
      expect(s.goals.five_years).toEqual({ done: false, week: null });
      expect(s.goals.first_launch).toEqual({ done: false, week: null, skipped: true });
    }
  });

  it('provides usable AI tools immediately with the correct permissions', () => {
    const chat = createGame({ startEra: 'chatgbt' });
    expect(dispatch(chat, { type: 'startProject', kind: 'new', name: 'A', category: 'notes', angle: 'copilot', model: 'chatgbt', size: 'small' }).ok).toBe(true);
    expect(dispatch(chat, { type: 'setAutomation', fn: 'support', level: 1, model: 'chatgbt' }).ok).toBe(true);
    expect(chat.automation.support.level).toBe(B.chatgbtAutomationCap);
    expect(dispatch(chat, { type: 'setAutomation', fn: 'engineering', level: 1, model: 'chatgbt' }).ok).toBe(false);
    const agents = createGame({ startEra: 'agents' });
    expect(dispatch(agents, { type: 'startProject', kind: 'new', name: 'A', category: 'support', angle: 'agent', model: 'chatgbt', size: 'small' }).ok).toBe(true);
    expect(dispatch(agents, { type: 'setAutomation', fn: 'engineering', level: 1, model: 'chatgbt' }).ok).toBe(true);
    expect(agents.automation.engineering.level).toBe(1);
  });

  it('lets an Agents founding earn its move out of the garage', () => {
    const s = createGame({ startEra: 'agents' });
    expect(s.officeStage).toBe(0);
    expect(s.goals.office_floor).toEqual({ done: false, week: null });
    s.officeStage = s.office.stage = 1;
    const brand = s.brand;
    const ctx = makeCtx(s);
    checkGoals(ctx);
    expect(s.goals.office_floor.done).toBe(true);
    expect(s.brand).toBeGreaterThan(brand);
    expect(ctx.events).toContainEqual({ type: 'goal', goalId: 'office_floor' });
  });

  it('shifts the world schedule without skipping company age or replaying past arrivals', () => {
    const classic = createGame({ seed: 17 });
    const s = createGame({ seed: 17, startEra: 'chatgbt' });
    const offset = classic.eraSchedule.chatgbt;
    expect(s.founding.calendarOffset).toBe(offset);
    expect(s.eraSchedule.chatgbt).toBe(0);
    expect(s.eraSchedule.agents).toBe(classic.eraSchedule.agents - offset);
    expect(calendarDate(s).year).toBe(2019 + Math.floor(offset / 52));
    expect(calendarDate(s, 52).year).toBe(calendarDate(s).year + 1);
    const initial = makeCtx(s);
    calendarStart(initial);
    expect(initial.events.filter((e) => e.type === 'era')).toEqual([]);
    s.week = s.eraSchedule.agents;
    const arrival = makeCtx(s);
    calendarStart(arrival);
    expect(arrival.events.filter((e) => e.type === 'era')).toEqual([{ type: 'era', eraId: 'agents' }]);
    expect(s.era.since).toBe(s.week);
  });

  it('skips goals without rewards or trophies even when their predicates pass', () => {
    const s = createGame({ startEra: 'agents' });
    s.stats.launches = 1;
    const cash = s.cash, brand = s.brand;
    const c = makeCtx(s);
    checkGoals(c);
    expect(s.cash).toBe(cash);
    expect(s.brand).toBe(brand);
    expect(c.events).toEqual([]);
    expect(s.goals.first_launch.done).toBe(false);
  });

  it('uses the calendar for releases and save labels, and age for the anniversary', () => {
    const s = createGame({ seed: 1, startEra: 'agents' });
    const year = calendarDate(s).year;
    expect(saveMeta(s, 's1').year).toBe(year);
    for (const m of Object.values(MODELS)) expect(s.models[m.id].available).toBe(m.releaseYear <= year);
    for (const c of Object.values(CATEGORIES)) expect(s.market.unlockedCategories.includes(c.id)).toBe(c.unlockYear <= year);
    s.week = B.anniversaryWeek - s.founding.calendarOffset;
    endgameSystem(makeCtx(s));
    expect(s.gameOver).toBe(null);
    s.week = B.anniversaryWeek - 1;
    endgameSystem(makeCtx(s));
    expect(s.gameOver.reason).toBe('anniversary');
  });

  it('keeps an existing later-start company on its saved office floor', () => {
    const s = createGame({ startEra: 'agents' });
    s.officeStage = s.office.stage = 1;
    s.goals.office_floor.skipped = true;
    const mem = storage();
    expect(saveGame(s, mem)).toBe(true);
    const loaded = loadGame(mem);
    expect(loaded.ok).toBe(true);
    expect(loaded.state.officeStage).toBe(1);
    expect(loaded.state.goals.office_floor.skipped).toBe(true);
  });

  it('opens a model on the next calendar year boundary, not the company birthday', () => {
    const s = createGame({ seed: 17, startEra: 'chatgbt' });
    expect(calendarDate(s).year).toBe(2022);
    expect(s.models.claudius.available).toBe(false);
    s.week = 4 * 52 - s.founding.calendarOffset;
    calendarStart(makeCtx(s));
    expect(calendarDate(s).year).toBe(2023);
    expect(s.models.claudius.available).toBe(true);
  });

  it('waits for a real product before sending a later-start company conference invitations', () => {
    for (const weekOfYear of [B.aiSummitWeek, 40]) {
      const s = createGame({ seed: 1, startEra: 'agents' });
      s.week = (weekOfYear - 1 - s.founding.calendarOffset % 52 + 52) % 52;
      annualSystem(makeCtx(s));
      expect(s.pendingDecision).toBe(null);
      expect(s.scheduled).toEqual([]);
      s.stats.launches = 1;
      annualSystem(makeCtx(s));
      expect(s.pendingDecision?.eventId ?? s.scheduled[0]?.payload.eventId).toBe(weekOfYear === 40 ? 'conference_expo' : 'ai_summit');
    }
  });

  it('multiplies era, funding, dilution and incubator factors with one rounding', () => {
    const s = createGame({ startEra: 'agents', funding: 'family' });
    s.gameOver = { won: true };
    s.flags.diluted = true;
    s.flags.incubatorCut = 0.1;
    s.stats.launches = 1;
    const run = scoreRun(s);
    const raw = Object.values(run.breakdown).reduce((a, b) => a + b, 0);
    expect(run.score).toBe(Math.round(raw * B.funding.family.scoreMult * 0.8 * 0.9 * B.eraStarts.agents.scoreMult));
  });

  it.each(['classic', 'chatgbt', 'agents', 'consolidation', 'plateau'])('round-trips %s and continues deterministically', (startEra) => {
    const s = createGame({ seed: 9, startEra });
    const mem = storage();
    expect(saveGame(s, mem)).toBe(true);
    const loaded = loadGame(mem);
    expect(loaded.ok).toBe(true);
    expect(loaded.state).toEqual(s);
    for (let i = 0; i < 80; i++) {
      if (s.pendingDecision) {
        const choice = s.pendingDecision.choices.findIndex((c) => c.available);
        expect(dispatch(loaded.state, { type: 'resolveDecision', choice })).toEqual(dispatch(s, { type: 'resolveDecision', choice }));
      }
      expect(tick(loaded.state)).toEqual(tick(s));
    }
    expect(loaded.state).toEqual(s);
    if (startEra !== 'classic') expect(s.lockdown).toBe(null);
  });
});
