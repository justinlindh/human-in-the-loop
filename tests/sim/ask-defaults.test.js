import { describe, it, expect } from 'vitest';
import { EVENTS } from '../../src/data/events.js';
import { EVENT_MAIL } from '../../src/data/mail.js';
import { defaultChoiceOf } from '../../src/sim/asks.js';
import { sensibleValue } from '../../src/sim/bots.js';
import { game, addProduct, addDesks, addStaff } from './helpers.js';

// What an ask falls back to when nobody answers it. Emergencies and noExpire asks never expire, so their
// defaults never apply.
const isEmergency = (ev) => (['incident', 'cyber'].includes(ev.kind) && ev.emergency !== false) || !!ev.emergency || !!EVENT_MAIL[ev.id]?.emergency;
function defaultsOf(ev) {
  const out = [];
  const d = defaultChoiceOf(ev);
  if (Number.isInteger(d)) out.push(['decision', d]);
  if (Number.isInteger(ev.yak?.ignore)) out.push(['prompt', ev.yak.ignore]);
  if (Number.isInteger(EVENT_MAIL[ev.id]?.ignore)) out.push(['letter', EVENT_MAIL[ev.id].ignore]);
  return out;
}

// A cautious default costs a little now and nothing later: nobody leaves, no customers go, no penalty waits
// and no coin flip can hurt.
const HARM_KEYS = ['cash', 'brand', 'meaning', 'teamMeaning', 'customersPct', 'hype'];
const harms = (fx) => !!fx && (HARM_KEYS.some((k) => (fx[k] ?? 0) < 0) || !!fx.resign || !!fx.fire);
function punishes(fx) {
  if (!fx) return null;
  if (fx.resign || fx.fire) return 'someone leaves';
  if ((fx.customersPct ?? 0) < 0) return 'customers leave';
  if (fx.later?.some((l) => harms(l.effects) || harms(l.effects?.gamble?.effects) || harms(l.effects?.gamble?.else))) return 'a penalty waits';
  if (fx.gamble && (harms(fx.gamble.effects) || harms(fx.gamble.else))) return 'a gamble that can hurt';
  return null;
}
// The most a default may cost a careful player: a small one-off (meaning -5, brand -1, team meaning -2, a few
// hundred dollars).
const SMALL_COST = -1.25;

describe('ask defaults are cautious', () => {
  // A mid-game company of eight, so a careful player values a hard problem as a team that size would.
  const s = game(1);
  s.week = 200;
  s.cash = 200000;
  addDesks(s, 8);
  for (let i = 0; i < 6; i++) addStaff(s, 'engineer', 'mid', { hiredWeek: 0 });
  addProduct(s, { name: 'Ledgerly', customers: 300, mrr: 6000 });
  const expirable = Object.values(EVENTS).filter((ev) => ev.choices?.length > 1 && !isEmergency(ev) && !ev.noExpire);

  it('no default removes a person, loses customers, schedules a penalty or gambles', () => {
    const bad = expirable.flatMap((ev) => defaultsOf(ev).map(([via, i]) => [ev.id, via, i, punishes(ev.choices[i].effects)]).filter((x) => x[3]));
    expect(bad).toEqual([]);
  });

  it('no default costs a careful player more than a small one-off', () => {
    const bad = expirable.flatMap((ev) => defaultsOf(ev)
      .map(([via, i]) => [ev.id, via, i, Math.round(sensibleValue(s, ev.choices[i].effects) * 10) / 10])
      .filter((x) => x[3] < SMALL_COST));
    expect(bad).toEqual([]);
  });

  it('an unanswered NOC still watches: the agents take the glass', () => {
    expect(EVENTS.noc_bet.choices[defaultChoiceOf(EVENTS.noc_bet)].effects.nocMode).toBe('agents');
  });

  it('a poached senior gets a small counter-offer by default', () => {
    const ev = EVENTS.poached_by_bigco;
    const i = defaultChoiceOf(ev);
    expect(ev.choices[i]).toMatchObject({ label: 'Make a small counter-offer', hint: '+8% salary; they stay, for now', effects: { salaryPct: 8, meaning: 1 } });
  });
});
