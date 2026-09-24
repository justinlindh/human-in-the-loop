import { describe, it, expect } from 'vitest';
import { dispatch, tick } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { forSaleSystem } from '../../src/sim/acquire.js';
import { weeklyCosts } from '../../src/sim/economy.js';
import { suggestPlacement, placementCheck, deskCap } from '../../src/sim/office.js';
import { B } from '../../src/sim/balance.js';
import { OFFICE_STAGES, officeShape } from '../../src/data/office.js';
import { game, addStaff, addProduct, addDesks, passOfficeGates, expectFail } from './helpers.js';

function hq(seed = 1) {
  const s = passOfficeGates(game(seed));
  s.cash = 1e9;
  expect(dispatch(s, { type: 'upgradeOffice' }).ok).toBe(true);
  expect(dispatch(s, { type: 'upgradeOffice' }).ok).toBe(true);
  expect(s.officeStage).toBe(2);
  return s;
}

describe('HQ expansion', () => {
  it('each step only adds tiles, so every placed item stays where it is', () => {
    const exps = OFFICE_STAGES[2].expansions;
    let prev = officeShape(2, 0);
    for (const e of exps) {
      const cur = officeShape(2, e.step);
      expect(cur.grid.w).toBeGreaterThanOrEqual(prev.grid.w);
      expect(cur.grid.h).toBeGreaterThanOrEqual(prev.grid.h);
      for (const b of prev.blocked) expect(cur.blocked).toContainEqual(b);
      prev = cur;
    }
    expect(exps).toHaveLength(3);
  });

  it('upgradeOffice at the HQ buys the next step behind its gate, adds rent, and raises the desk cap', () => {
    const s = hq(2);
    const rent = weeklyCosts(s).rent;
    expectFail(expect, dispatch, s, { type: 'upgradeOffice' }, 'Needs 28 people');
    while (s.staff.length < 28) addStaff(s, 'engineer', 'mid');
    const placed = JSON.stringify(s.office.placed);
    const cash = s.cash;
    const res = dispatch(s, { type: 'upgradeOffice' });
    expect(res.ok).toBe(true);
    expect(s.office.expansion).toBe(1);
    expect(s.cash).toBe(cash - OFFICE_STAGES[2].expansions[0].upgradeCost);
    expect(res.events).toContainEqual({ type: 'officeUpgrade', stage: 2, expansion: 1 });
    expect(JSON.stringify(s.office.placed)).toBe(placed);
    expect(weeklyCosts(s).rent).toBe(rent + OFFICE_STAGES[2].expansions[0].rent);
    expect(deskCap(s)).toBe(B.hqDeskCap + B.expansionDeskStep);
    expectFail(expect, dispatch, s, { type: 'upgradeOffice' }, `Available from ${2019 + Math.floor(OFFICE_STAGES[2].expansions[1].gate.week / 52)}`);
  });

  it('desks stop at the cap, and only outdoor items go on the terrace', () => {
    const s = hq(3);
    let placedDesks = s.office.placed.filter((p) => p.itemId === 'desk').length;
    for (let i = 0; i < 60 && placedDesks < deskCap(s); i++) {
      const spot = suggestPlacement(s, 'desk');
      if (!spot || !dispatch(s, { type: 'placeItem', itemId: 'desk', ...spot }).ok) break;
      placedDesks++;
    }
    expect(placedDesks).toBe(deskCap(s));
    const spot = suggestPlacement(s, 'plant');
    expect(placementCheck(s, { itemId: 'desk', ...spot }).reason).toBe('Desk limit reached');
    s.office.expansion = 2;
    expect(placementCheck(s, { itemId: 'nap_pod', x: 29, y: 3, rot: 0 }).reason).toBe('Only outdoor items go on the terrace');
    expect(placementCheck(s, { itemId: 'plant', x: 29, y: 3, rot: 0 }).ok).toBe(true);
  });
});

describe('acquisitions', () => {
  function market(seed = 4) {
    const s = game(seed);
    s.cash = 5e7;
    addProduct(s, { mrr: 400000, customers: 4000 });
    s.week = 6 * 52 + B.forSaleWeek - 1;
    forSaleSystem(makeCtx(s));
    return s;
  }

  it('a few companies come up for sale once a year from the Agents era, priced off their ARR, and expire', () => {
    const s = market();
    expect(s.market.forSale.length).toBe(B.forSalePerRound);
    for (const c of s.market.forSale) {
      expect(c).toMatchObject({ id: expect.any(String), name: expect.any(String), categoryId: expect.any(String) });
      expect(c.price / c.arr).toBeGreaterThanOrEqual(B.forSalePriceMult[0] * 0.99);
      expect(c.staff).toBeGreaterThanOrEqual(1);
      expect(c.staff).toBeLessThanOrEqual(3);
    }
    s.week += B.forSaleWeeks;
    forSaleSystem(makeCtx(s));
    expect(s.market.forSale).toEqual([]);
  });

  it('acquire brings the product with its customers and the people, and announces it', () => {
    const s = market(5);
    addDesks(s, 4);
    const t = s.market.forSale[0];
    const staff = s.staff.length;
    const products = s.products.length;
    const cash = s.cash;
    const res = dispatch(s, { type: 'acquire', targetId: t.id });
    expect(res.ok).toBe(true);
    expect(s.cash).toBe(cash - t.price);
    expect(s.products).toHaveLength(products + 1);
    const p = s.products.at(-1);
    expect(p).toMatchObject({ name: t.name, category: t.categoryId, killed: false });
    expect(p.mrr * 12).toBeCloseTo(t.arr, -2);
    expect(s.staff).toHaveLength(staff + t.staff);
    expect(res.events.filter((e) => e.type === 'hire')).toHaveLength(t.staff);
    expect(res.events.some((e) => e.type === 'chat' && e.channel === 'wins')).toBe(true);
    expect(s.market.forSale.some((c) => c.id === t.id)).toBe(false);
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    tick(s);
  });

  it('refuses without a free desk for each incoming person', () => {
    const s = market(7);
    const t = s.market.forSale[0];
    const free = s.office.placed.filter((p) => p.itemId === 'desk').length - s.staff.length;
    if (free >= t.staff) s.office.placed = s.office.placed.filter((p, i, all) => p.itemId !== 'desk' || all.slice(0, i).filter((q) => q.itemId === 'desk').length < s.staff.length);
    expectFail(expect, dispatch, s, { type: 'acquire', targetId: t.id }, 'No desks for their team');
    addDesks(s, t.staff);
    expect(dispatch(s, { type: 'acquire', targetId: t.id }).ok).toBe(true);
    expect(s.staff.every((p) => p.deskId)).toBe(true);
  });

  it('rejects unknown companies and empty wallets', () => {
    const s = market(6);
    expectFail(expect, dispatch, s, { type: 'acquire', targetId: 'fs999' }, 'No such company');
    s.cash = 10;
    expectFail(expect, dispatch, s, { type: 'acquire', targetId: s.market.forSale[0].id }, 'Not enough cash');
  });
});
