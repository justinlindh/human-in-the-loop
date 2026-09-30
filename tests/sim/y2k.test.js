import { describe, it, expect } from 'vitest';
import { createGame, dispatch, tick, calendarDate } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { projectsSystem } from '../../src/sim/projects.js';
import { y2kStep, y2kProjectOpen } from '../../src/sim/y2k.js';
import { B } from '../../src/sim/balance.js';
import { raiseDecision } from '../../src/sim/events.js';
import { dotcomEffect } from '../../src/sim/dotcom.js';
import { saveGame, loadGame } from '../../src/save/save.js';

const game = () => createGame({ seed: 17, startEra: 'dotcom' });
const at = (s, year) => { while (calendarDate(s).year < year) s.week++; return s; };
const reload = (s) => {
  const data = new Map();
  const storage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  expect(saveGame(s, storage)).toBe(true);
  const loaded = loadGame(storage); expect(loaded.ok).toBe(true); return loaded.state;
};

describe('Y2K', () => {
  it('charges the consultant triple once, checks affordability, and expires a queued offer', () => {
    const s = at(game(), 1999);
    const fee = B.y2k.consultantRate * B.y2k.consultantMultiplier;
    s.cash = fee - 1;
    expect(raiseDecision(makeCtx(s), 'dotcom_y2k_oncall')).toBe(true);
    expect(dispatch(s, { type: 'resolveDecision', choice: 2 }).ok).toBe(false);
    s.cash = fee;
    expect(dispatch(s, { type: 'resolveDecision', choice: 2 }).ok).toBe(true);
    expect(s.cash).toBe(0); expect(s.flags.y2k.onCall).toBe('consultant');
    dotcomEffect(makeCtx(s), 'y2k_consultant'); expect(s.cash).toBe(0);
    const late = at(game(), 2000);
    expect(raiseDecision(makeCtx(late), 'dotcom_y2k_oncall')).toBe(false);
    dotcomEffect(makeCtx(late), 'y2k_consultant');
    expect(late.flags.y2k?.onCall).toBeUndefined();
  });

  it('offers bounded paying compliance work only during calendar 1999', () => {
    const s = game();
    expect(dispatch(s, { type: 'startProject', kind: 'y2k_compliance' }).ok).toBe(false);
    at(s, 1999);
    const cash = s.cash;
    for (let i = 0; i < B.y2k.contractLimit; i++) {
      expect(y2kProjectOpen(s)).toBe(true);
      expect(dispatch(s, { type: 'startProject', kind: 'y2k_compliance' }).ok).toBe(true);
      expect(dispatch(s, { type: 'startProject', kind: 'y2k_compliance' }).ok).toBe(false);
      const j = s.projects[0];
      const ctx = makeCtx(s);
      ctx.weekEffort = { [j.id]: { features: B.y2k.contractPoints, polish: 0, reliability: 0, novelty: 0 } };
      projectsSystem(ctx);
    }
    expect(s.cash).toBe(cash + B.y2k.contractFee * B.y2k.contractLimit);
    expect(y2kProjectOpen(s)).toBe(false);
    expect(s.products).toHaveLength(0);
    const late = at(game(), 2000);
    expect(dispatch(late, { type: 'startProject', kind: 'y2k_compliance' }).ok).toBe(false);
    const classic = createGame(); classic.week = s.week;
    expect(y2kProjectOpen(classic)).toBe(false);
  });

  it.each([208, 312])('stages once in the last calendar week before 2000 with a %i-week chapter', (weeks) => {
    const s = game(); s.founding.earlyChapters[0].weeks = weeks;
    at(s, 1999);
    while (calendarDate(s, s.week + 1).year < 2000) {
      y2kStep(makeCtx(s)); expect(s.flags.y2k?.rolloverWeek).toBeUndefined(); s.week++;
    }
    const cash = s.cash, rng = structuredClone(s.rng);
    y2kStep(makeCtx(s));
    expect(s.flags.y2k).toMatchObject({ stage: 'rollover', rolloverWeek: s.week });
    const first = structuredClone(s.flags.y2k);
    y2kStep(makeCtx(s)); expect(s.flags.y2k).toEqual(first);
    expect(s.cash).toBe(cash); expect(s.rng).toEqual(rng);
    expect(s.office.props.some((p) => p.prop === 'printer')).toBe(true);
  });

  it('reloads before and after rollover without duplicating the moment or the aftermath thread', () => {
    let s = game(); at(s, 2000); s.week--;
    s = reload(s);
    y2kStep(makeCtx(s));
    expect(s.pendingDecision).toBeNull();
    expect(s.flags.y2k.onCall).toBe('founder');
    s = reload(s);
    y2kStep(makeCtx(s)); expect(s.flags.y2k.stage).toBe('rollover');
    s.week++;
    const ctx = makeCtx(s); y2kStep(ctx);
    expect(s.flags.y2k.stage).toBe('after');
    const chats = ctx.events.filter((e) => e.type === 'chat');
    expect(chats.length).toBeGreaterThanOrEqual(4);
    expect(chats.slice(1).every((e) => e.replyTo === chats[0].id)).toBe(true);
    expect(chats.at(-1).text).toMatch(/moved on/i);
    s = reload(s);
    const again = makeCtx(s); y2kStep(again);
    expect(again.events).toHaveLength(0);
  });

  it('keeps tick and reload deterministic across the boundary', () => {
    const s = game(); at(s, 2000); s.week--;
    const copy = reload(s);
    expect(tick(copy)).toEqual(tick(s));
    expect(copy.flags.y2k).toEqual(s.flags.y2k);
    const after = reload(copy);
    expect(tick(after)).toEqual(tick(copy));
  });
});
