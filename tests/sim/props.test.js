import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { raiseDecision, resolveSubjects } from '../../src/sim/events.js';
import { propsSystem, leaveProp, stageTile } from '../../src/sim/props.js';
import { suggestPlacement, footprintCells, frontCells } from '../../src/sim/office.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { game, passOfficeGates, addStaff } from './helpers.js';

const floor = (seed = 1) => {
  const s = passOfficeGates(game(seed));
  s.cash = 1e6;
  dispatch(s, { type: 'upgradeOffice' });
  return s;
};
const raise = (s, id) => { delete s.flags.lastDecisionWeek; s.pendingDecision = null; raiseDecision(makeCtx(s), id, null); };
const choose = (s, label) => dispatch(s, { type: 'resolveDecision', choice: EVENTS[s.pendingDecision.eventId].choices.findIndex((c) => c.label === label) });
const tables = (s) => s.office.placed.filter((i) => i.itemId === 'ping_pong_table').length;

describe('issue #228: the ping pong question, staged', () => {
  it('shows the printed picture on a wall tile while the decision is open', () => {
    const s = floor(1);
    raise(s, 'ping_pong');
    expect(s.pendingDecision.stage).toMatchObject({ prop: 'picture_pingpong', anchor: 'wall', y: 0 });
    expect(Number.isInteger(s.pendingDecision.stage.x)).toBe(true);
  });

  it('"Buy one" grants a real table for the choice price, charged once, with no leftover picture', () => {
    const s = floor(2);
    raise(s, 'ping_pong');
    const cash = s.cash;
    expect(choose(s, 'Buy one').ok).toBe(true);
    expect(tables(s)).toBe(1);
    expect(s.cash).toBe(cash - 1500);
    expect(s.office.props).toEqual([]);
  });

  it('"Not yet" leaves the picture with a ball on the stage tile until a table is placed', () => {
    const s = floor(3);
    raise(s, 'ping_pong');
    const tile = { x: s.pendingDecision.stage.x, y: s.pendingDecision.stage.y };
    choose(s, 'Not yet');
    expect(s.office.props).toEqual([expect.objectContaining({ prop: 'picture_pingpong_ball', ...tile, until: { item: 'ping_pong_table' } })]);
    propsSystem(makeCtx(s));
    expect(s.office.props).toHaveLength(1);
    const spot = suggestPlacement(s, 'ping_pong_table');
    expect(dispatch(s, { type: 'placeItem', itemId: 'ping_pong_table', ...spot }).ok).toBe(true);
    propsSystem(makeCtx(s));
    expect(s.office.props).toEqual([]);
  });

  it('with no room for a table, "Buy one" is unavailable with the reason and never charges', () => {
    const s = floor(4);
    for (let i = 0; i < 200; i++) {
      const spot = suggestPlacement(s, 'plant');
      if (!spot || !dispatch(s, { type: 'placeItem', itemId: 'plant', ...spot }).ok) break;
    }
    raise(s, 'ping_pong');
    const buy = s.pendingDecision.choices.find((c) => c.label === 'Buy one');
    expect(buy).toMatchObject({ available: false, reason: 'No room for it' });
    const cash = s.cash;
    expect(choose(s, 'Buy one').ok).toBe(false);
    expect(s.cash).toBe(cash);
  });

  it('does not come up in the garage or once a table is owned', () => {
    const g = game(5);
    for (let i = 0; i < 4; i++) addStaff(g, 'engineer', 'mid');
    expect(EVENTS.ping_pong.when(g)).toBe(false);
    const s = floor(6);
    expect(EVENTS.ping_pong.when(s)).toBe(true);
    raise(s, 'ping_pong');
    choose(s, 'Buy one');
    expect(EVENTS.ping_pong.when(s)).toBe(false);
  });
});

describe('lingering props', () => {
  it('expire by weeks or flag, cap at officePropsMax, and survive a save', () => {
    const s = floor(7);
    leaveProp(s, { prop: 'pizza_boxes', until: { weeks: 2 } }, null);
    leaveProp(s, { prop: 'curtain', until: { flag: 'curtainDown' } }, { x: 3, y: 0 });
    s.week += 2;
    propsSystem(makeCtx(s));
    expect(s.office.props.map((p) => p.prop)).toEqual(['curtain']);
    s.flags.curtainDown = true;
    propsSystem(makeCtx(s));
    expect(s.office.props).toEqual([]);
    for (let i = 0; i < B.officePropsMax + 3; i++) leaveProp(s, { prop: `p${i}`, until: null }, null);
    expect(s.office.props).toHaveLength(B.officePropsMax);
    expect(s.office.props[0].prop).toBe('p3');
    const m = new Map();
    const store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
    delete s.office.props;
    saveGame(s, store);
    expect(loadGame(store).state.office.props).toEqual([]);
  });
});

describe('props never change a seeded run', () => {
  it('a game that leaves props every few weeks matches one that does not, week for week', async () => {
    const { botDecide, botTurn } = await import('../../src/sim/bots.js');
    const { tick, createGame } = await import('../../src/sim/index.js');
    const a = createGame({ seed: 1 });
    const b = createGame({ seed: 1 });
    // Only the props themselves, and where a staged prop lands (it avoids tiles props use), may differ.
    const strip = (s) => {
      const c = structuredClone(s);
      c.office.props = [];
      delete c.flags.propSeq;
      if (c.pendingDecision?.stage) c.pendingDecision.stage = null;
      for (const p of c.chatPrompts ?? []) if (p.stage) p.stage = null;
      return JSON.stringify(c);
    };
    for (let w = 0; w < 260; w++) {
      if (w % 5 === 0) leaveProp(b, { prop: 'pizza_boxes', until: { weeks: 3 } }, null);
      for (const s of [a, b]) { botDecide('sensible', s); botTurn('sensible', s); tick(s); }
      expect(strip(b), `week ${w}`).toBe(strip(a));
    }
    expect(b.flags.propSeq).toBeGreaterThan(40);
  }, 120000);
});

describe('prop ids from older saves', () => {
  it('a new prop never reuses the id of one numbered off the old shared counter', () => {
    const s = floor(9);
    s.office.props = [{ id: 'prop1', prop: 'brochure', x: 1, y: 0, since: 0, until: null }, { id: 'prop412', prop: 'invoice', x: 2, y: 0, since: 0, until: null }];
    delete s.flags.propSeq;
    leaveProp(s, { prop: 'pizza_boxes', until: null }, null);
    const ids = s.office.props.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.at(-1)).toBe('prop413');
  });
});

describe('issue #228: the whiteboard anchor and a stageless leave\'s own anchor', () => {
  it('a whiteboard stage sits on the placed whiteboard, else on the back wall', () => {
    const s = floor(11);
    raise(s, 'pivot_pitch');
    expect(s.pendingDecision.stage).toMatchObject({ prop: 'whiteboard_scrawl', anchor: 'whiteboard', y: 0 });
    const t = floor(12);
    expect(dispatch(t, { type: 'placeItem', itemId: 'whiteboard', x: 6, y: 6, rot: 0 }).ok).toBe(true);
    raise(t, 'pivot_pitch');
    expect(t.pendingDecision.stage).toMatchObject({ prop: 'whiteboard_scrawl', x: 6, y: 6 });
  });

  it('a choice on an event with no stage leaves its prop where its own anchor resolves', () => {
    const s = floor(13);
    expect(dispatch(s, { type: 'placeItem', itemId: 'whiteboard', x: 6, y: 6, rot: 0 }).ok).toBe(true);
    raise(s, 'last_bet');
    expect(s.pendingDecision.stage).toBe(null);
    choose(s, 'One last moonshot');
    expect(s.office.props.at(-1)).toMatchObject({ prop: 'whiteboard_scrawl', x: 6, y: 6, until: { weeks: 26 } });
  });

  it('"Not yet" on the coffee question leaves the French press until an espresso machine arrives', () => {
    const s = floor(14);
    s.week = 30;
    raise(s, 'coffee_wanted');
    expect(s.pendingDecision.stage.prop).toBe('french_press');
    choose(s, 'Not yet');
    expect(s.office.props.at(-1).prop).toBe('french_press');
    const spot = suggestPlacement(s, 'espresso');
    expect(dispatch(s, { type: 'placeItem', itemId: 'espresso', x: spot.x, y: spot.y, rot: spot.rot }).ok).toBe(true);
    propsSystem(makeCtx(s));
    expect(s.office.props.some((p) => p.prop === 'french_press')).toBe(false);
  });
});

describe('staged prop tiles keep off items and their front zones', () => {
  it('kitchen, door and wall anchors land on free floor, never on an item or where people stand to use one', () => {
    for (let seed = 21; seed <= 26; seed++) {
      const s = floor(seed);
      for (const [itemId, x, y, rot] of [['coffee_corner', 3, 6, 0], ['espresso', 10, 1, 0], ['bookshelf', 6, 0, 0], ['plant', 8, 0, 0], ['arcade', 7, 9, 2]]) {
        dispatch(s, { type: 'placeItem', itemId, x, y, rot });
      }
      const taken = new Set();
      for (const p of s.office.placed) {
        for (const c of footprintCells(p.itemId, p.x, p.y, p.rot)) taken.add(String(c));
        for (const c of frontCells(p.itemId, p.x, p.y, p.rot, p.level)) taken.add(String(c));
      }
      for (const anchor of ['kitchen', 'door', 'wall']) {
        const t = stageTile(s, anchor, null);
        expect(taken.has(String([t.x, t.y])), `seed ${seed} ${anchor} at ${t.x},${t.y}`).toBe(false);
      }
      const corner = s.office.placed.find((p) => p.itemId === 'coffee_corner');
      const k = stageTile(s, 'kitchen', null);
      expect(Math.max(Math.abs(k.x - corner.x), Math.abs(k.y - corner.y)), `seed ${seed}`).toBeLessThanOrEqual(3);
    }
  });
});

describe('desk-staged props never wait on an empty chair', () => {
  const setup = (seed) => {
    const s = floor(seed);
    for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'mid');
    for (const p of s.staff) { p.mood = 'ok'; p.remote = false; }
    return s;
  };

  it('with no subject, a desk prop goes to a present person\'s desk (a founder first) and names them', () => {
    const s = setup(31);
    const founder = s.staff.find((p) => p.founder);
    raise(s, 'hearing_summons');
    expect(s.pendingDecision.stage).toMatchObject({ prop: 'envelope_thick', anchor: 'subjectDesk', staffId: founder.id });
    for (const p of s.staff.filter((x) => x.founder)) p.mood = 'away';
    raise(s, 'hearing_summons');
    const who = s.staff.find((p) => p.id === s.pendingDecision.stage.staffId);
    expect(who.mood).not.toBe('away');
    expect(who.founder).toBe(false);
  });

  it('a decision about someone who is away waits a week instead of staging at their empty desk', () => {
    const s = setup(32);
    const p = s.staff.find((x) => !x.founder);
    p.mood = 'away';
    delete s.flags.lastDecisionWeek; delete s.flags.lastPauseWeek; s.pendingDecision = null;
    expect(raiseDecision(makeCtx(s), 'junior_overwhelmed', p.id, { queue: true })).toBe(false);
    expect(s.pendingDecision).toBe(null);
    expect(s.scheduled.at(-1)).toMatchObject({ kind: 'event', week: s.week + 1, payload: { eventId: 'junior_overwhelmed', subjectId: p.id } });
  });

  it('the wait is bounded: after deskStageWaitWeeks it goes ahead on a present person\'s desk', () => {
    const s = setup(34);
    const p = s.staff.find((x) => !x.founder);
    p.mood = 'away';
    const tryRaise = () => { delete s.flags.lastDecisionWeek; delete s.flags.lastPauseWeek; s.pendingDecision = null; return raiseDecision(makeCtx(s), 'junior_overwhelmed', p.id, { queue: true }); };
    for (let w = 0; w < B.deskStageWaitWeeks; w++) { expect(tryRaise(), `week ${w}`).toBe(false); s.week++; }
    expect(tryRaise()).toBe(true);
    const who = s.staff.find((x) => x.id === s.pendingDecision.stage.staffId);
    expect(who.id).not.toBe(p.id);
    expect(who.mood).not.toBe('away');
    expect(s.flags.deskWait['junior_overwhelmed:' + p.id]).toBeUndefined();
  });

  it('a remote subject is not picked for a desk-staged event, and an out-of-office subject hands the prop to someone in', () => {
    const s = setup(33);
    const remote = s.staff.find((x) => !x.founder);
    remote.seniority = 'junior';
    expect(resolveSubjects(s, EVENTS.junior_overwhelmed).some((p) => p.id === remote.id)).toBe(true);
    remote.remote = true;
    expect(resolveSubjects(s, EVENTS.junior_overwhelmed).some((p) => p.id === remote.id)).toBe(false);
    expect(stageTile(s, 'subjectDesk', remote.id).staffId).not.toBe(remote.id);
  });
});

describe('a desk prop with no subject goes to someone who is in', () => {
  it('skips an away sitter and prefers a founder', () => {
    const s = floor(1);
    for (let i = 0; i < 3; i++) addStaff(s, 'engineer', 'mid');
    const withDesk = s.staff.filter((p) => p.deskId);
    expect(withDesk.length).toBeGreaterThan(1);
    const seatOf = (p) => { const t = stageTile(s, 'subjectDesk', p.id); return `${t.x},${t.y}`; };
    const pick = () => { const t = stageTile(s, 'subjectDesk', null); return `${t.x},${t.y}`; };
    const founder = withDesk.find((p) => p.founder);
    expect(pick()).toBe(seatOf(founder ?? withDesk[0]));
    const first = founder ?? withDesk[0];
    const firstSeat = seatOf(first);
    const otherSeats = withDesk.filter((p) => p !== first).map(seatOf);
    first.mood = 'away';
    const other = pick();
    expect(other).not.toBe(firstSeat);
    expect(otherSeats).toContain(other);
  });
});
