import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { raiseDecision, eligibleEvents } from '../../src/sim/events.js';
import { processScheduled } from '../../src/sim/effects.js';
import { emitChat } from '../../src/sim/chat.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { ITEMS } from '../../src/data/items.js';
import { game, addProduct, placeAction, setItems } from './helpers.js';
import { OFFICE_STAGES } from '../../src/data/office.js';

const eventText = (e) => [e.title, e.text, e.chat ?? '', ...(e.choices ?? []).flatMap((c) => [c.label, c.hint, c.outcome ?? ''])].join(' ');
const raise = (s, id, subject = null) => { raiseDecision(makeCtx(s), id, subject); return s.pendingDecision; };

describe('events follow the real office', () => {
  it('the coffee machine can only break if you own one, and upgrading it changes the item', () => {
    const s = game();
    s.stats.launches = 1;
    s.week = 30;
    addProduct(s);
    expect(eligibleEvents(s).map((e) => e.id)).not.toContain('coffee_machine_broke');
    expect(eligibleEvents(s).map((e) => e.id)).toContain('coffee_wanted');
    s.cash = 1e6;
    expect(dispatch(s, placeAction(s, 'espresso')).ok).toBe(true);
    expect(eligibleEvents(s).map((e) => e.id)).toContain('coffee_machine_broke');
    expect(eligibleEvents(s).map((e) => e.id)).not.toContain('coffee_wanted');
    raise(s, 'coffee_machine_broke');
    const cash = s.cash;
    expect(dispatch(s, { type: 'resolveDecision', choice: 0 }).ok).toBe(true);
    expect(s.office.placed.find((i) => i.itemId === 'espresso').level).toBe(2);
    expect(s.cash).toBe(cash - ITEMS.espresso.costs[1]);
  });

  it('buying the coffee machine the team asked for adds a real espresso machine', () => {
    const s = game();
    s.cash = 1e6;
    raise(s, 'coffee_wanted');
    dispatch(s, { type: 'resolveDecision', choice: 0 });
    expect(s.office.placed.filter((i) => i.itemId !== 'desk')).toEqual([expect.objectContaining({ itemId: 'espresso', level: 1 })]);
    expect(s.cash).toBe(1e6 - ITEMS.espresso.costs[0]);
  });

  it('upgrade and purchase choices are unavailable when they cannot happen', () => {
    const s = game();
    setItems(s, [{ itemId: 'espresso', level: 3 }]);
    expect(raise(s, 'coffee_machine_broke').choices[0]).toMatchObject({ available: false });
    s.pendingDecision = null;
    s.week += B.decisionGapWeeks;
    setItems(s, []);
    // Fill every free tile of the garage with plants: nowhere left for an espresso machine.
    const { w, h } = OFFICE_STAGES[0].grid;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) dispatch(s, { type: 'placeItem', itemId: 'plant', x, y, rot: 0 });
    s.cash = 1e6;
    expect(raise(s, 'coffee_wanted').choices[0]).toMatchObject({ available: false, reason: 'No room for it' });
  });

  it('any event that names a shop item is gated on owning it or acts on it', () => {
    const names = Object.values(ITEMS).filter((i) => i.kind === 'shop').flatMap((i) => [i.name.toLowerCase(), i.id.replace('_', ' ')]);
    names.push('coffee machine', 'espresso');
    const bare = game();
    for (const e of Object.values(EVENTS)) {
      const text = eventText(e).toLowerCase();
      const mentioned = names.filter((n) => text.includes(n));
      if (!mentioned.length) continue;
      const acts = (e.choices ?? []).some((c) => c.effects.buyItem || c.effects.upgradeItem);
      expect(e.office || acts, `${e.id} mentions ${mentioned}`).toBeTruthy();
      if (e.office && !acts) expect(e.when(bare, { live: [] }), `${e.id} should need ${e.office}`).toBe(false);
    }
  });
});

describe('decision spacing', () => {
  it('non-incident decisions wait at least the gap after the last one; incidents do not', () => {
    const s = game();
    addProduct(s);
    raise(s, 'hackathon');
    dispatch(s, { type: 'resolveDecision', choice: 1 });
    s.week += 1;
    expect(raise(s, 'team_offsite')).toBe(null);
    raiseDecision(makeCtx(s), 'conference_expo', null, { queue: true });
    expect(s.pendingDecision).toBe(null);
    const queued = s.scheduled.find((x) => x.payload.eventId === 'conference_expo');
    expect(queued.week).toBe(s.week - 1 + B.decisionGapWeeks);
    expect(raise(s, 'agent_db_wipe', s.products[0].id)?.eventId).toBe('agent_db_wipe');
    dispatch(s, { type: 'resolveDecision', choice: 0 });
    s.week = queued.week;
    processScheduled(makeCtx(s));
    expect(s.pendingDecision?.eventId).toBe('conference_expo');
  });

  it('random events respect the gap', () => {
    const s = game();
    s.stats.launches = 1;
    s.week = 40;
    addProduct(s);
    s.flags.lastDecisionWeek = 39;
    expect(eligibleEvents(s).some((e) => e.choices)).toBe(false);
    s.flags.lastDecisionWeek = 40 - B.decisionGapWeeks;
    expect(eligibleEvents(s).some((e) => e.choices)).toBe(true);
  });
});

describe('chat events carry the week', () => {
  it('stamps week on the event and the log', () => {
    const s = game();
    s.week = 17;
    const c = makeCtx(s);
    emitChat(c, { from: '@bot', text: 'hi' });
    expect(c.events[0].week).toBe(17);
    expect(s.chatLog[0].week).toBe(17);
  });
});
