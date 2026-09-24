import { describe, it, expect } from 'vitest';
import { dispatch, productAppeal } from '../../src/sim/index.js';
import { productsSystem, categoryShare, totalMrr } from '../../src/sim/products.js';
import { economySystem } from '../../src/sim/economy.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { CATEGORIES } from '../../src/data/categories.js';
import { OFFICE_STAGES } from '../../src/data/office.js';
import { game, addStaff, addProduct, expectFail, passOfficeGates } from './helpers.js';

const runProducts = (s, n = 1) => { const ev = []; for (let i = 0; i < n; i++) { const c = makeCtx(s); productsSystem(c); ev.push(...c.events); s.week++; } return ev; };
const runEconomy = (s, n = 1) => { const ev = []; for (let i = 0; i < n; i++) { const c = makeCtx(s); economySystem(c); ev.push(...c.events); } return ev; };

describe('appeal and competition', () => {
  it('appeal rises with score, brand, and novelty', () => {
    const s = game();
    const p = addProduct(s, { score: 5 });
    const a0 = productAppeal(s, p);
    p.score = 8;
    const a1 = productAppeal(s, p);
    expect(a1).toBeGreaterThan(a0);
    s.brand = 60;
    const a2 = productAppeal(s, p);
    expect(a2).toBeGreaterThan(a1);
    p.novelty = 10;
    expect(productAppeal(s, p)).toBeGreaterThan(a2);
  });

  it('DeepSleep on Legal takes the compliance penalty and Claudius does not', () => {
    const s = game();
    const deep = addProduct(s, { category: 'legal', angle: 'copilot', model: 'deepsleep' });
    const claud = addProduct(s, { category: 'legal', angle: 'copilot', model: 'claudius' });
    const deepEmail = addProduct(s, { category: 'email', angle: 'copilot', model: 'deepsleep' });
    const trustRatio = (0.7 + 0.3 * 0.4) / (0.7 + 0.3 * 0.8);
    expect(productAppeal(s, deep) / productAppeal(s, claud)).toBeCloseTo(trustRatio * B.enterpriseComplianceMult);
    expect(productAppeal(s, deepEmail) / productAppeal(s, claud)).toBeCloseTo(trustRatio);
  });

  it('the market share shrinks as clones rise', () => {
    const s = game();
    const p = addProduct(s);
    const before = categoryShare(s, p).mine;
    s.market.categories.email.clones = 5;
    expect(categoryShare(s, p).mine).toBeLessThan(before);
  });
});

describe('customers and churn', () => {
  it('customers approach the target and never exceed tam', () => {
    const s = game();
    const p = addProduct(s, { score: 10, novelty: 10 });
    s.brand = 100;
    runProducts(s, 5);
    const early = p.customers;
    expect(early).toBeGreaterThan(0);
    runProducts(s, 300);
    expect(p.customers).toBeGreaterThan(early);
    expect(p.customers).toBeLessThanOrEqual(CATEGORIES.email.tam);
    expect(p.mrr).toBe(p.customers * CATEGORIES.email.price);
    const target = CATEGORIES.email.tam * categoryShare(s, p).mine;
    expect(p.customers).toBeLessThanOrEqual(target * 1.01);
  });

  it('a wrapper gap raises churn', () => {
    const a = game();
    const b = game();
    const pa = addProduct(a, { customers: 10000, score: 3, hype: 10 });
    const pb = addProduct(b, { customers: 10000, score: 3, hype: 90 });
    a.market.categories.email.incumbentStrength = 1e9;
    b.market.categories.email.incumbentStrength = 1e9;
    runProducts(a, 1);
    runProducts(b, 1);
    expect(pb.customers).toBeLessThan(pa.customers);
  });

  it('support shortfall comes from customers without support coverage', () => {
    const s = game();
    addProduct(s, { customers: 30000 });
    runProducts(s, 1);
    expect(s.ops.supportShortfall).toBeGreaterThan(0.9);
    for (let i = 0; i < 3; i++) addStaff(s, 'support', 'mid', { traits: [], speed: 1 });
    runProducts(s, 1);
    expect(s.ops.supportShortfall).toBeLessThan(0.7);
    s.automation.support.level = 1;
    runProducts(s, 1);
    expect(s.ops.supportShortfall).toBe(0);
  });

  it('maintenance shortfall decays health and uptime; capacity restores it', () => {
    const s = game();
    const p = addProduct(s, { customers: 1000 });
    s.ops.maintenanceCapacity = 0;
    runProducts(s, 5);
    expect(s.ops.maintenanceShortfall).toBe(1);
    expect(p.health).toBeLessThan(90);
    expect(p.uptime).toBeLessThan(1);
    const low = p.health;
    s.ops.maintenanceCapacity = 100;
    runProducts(s, 3);
    expect(p.health).toBeGreaterThan(low);
    expect(p.health).toBeLessThanOrEqual(p.baseHealth);
  });

  it('a product in an outage has zero uptime and churns faster', () => {
    const a = game();
    const b = game();
    const pa = addProduct(a, { customers: 10000 });
    const pb = addProduct(b, { customers: 10000 });
    for (const s of [a, b]) { s.market.categories.email.incumbentStrength = 1e9; s.ops.maintenanceCapacity = 100; }
    b.outage = { productId: pb.id, kind: 'db_wipe', severity: 4, weeks: 0, unrecoverable: false };
    runProducts(a, 1);
    runProducts(b, 1);
    expect(pb.uptime).toBe(0);
    expect(pb.customers).toBeLessThan(pa.customers);
  });

  it('a missed migration costs extra health', () => {
    const a = game();
    const b = game();
    const pa = addProduct(a);
    const pb = addProduct(b, { migrationDueWeek: 0 });
    a.week = b.week = 5;
    runProducts(a, 1);
    runProducts(b, 1);
    expect(pb.health).toBeLessThan(pa.health);
  });
});

describe('economy', () => {
  it('zero products and zero customers give zero revenue, zero shortfalls, finite state', () => {
    const s = game();
    runProducts(s, 3);
    runEconomy(s, 3);
    expect(totalMrr(s)).toBe(0);
    expect(s.ops.supportShortfall).toBe(0);
    expect(s.ops.maintenanceShortfall).toBe(0);
    const walk = (v) => { if (typeof v === 'number') expect(Number.isFinite(v)).toBe(true); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(s);
  });

  it('subtracts salaries and rent and adds revenue', () => {
    const s = game();
    const salaries = s.staff.reduce((a, p) => a + p.salary, 0);
    runEconomy(s, 1);
    expect(s.cash).toBeCloseTo(B.funding.bootstrapped.cash - salaries - OFFICE_STAGES[0].rent);
    const p = addProduct(s, { customers: 1000, mrr: 10000 });
    const before = s.cash;
    runEconomy(s, 1);
    const modelCost = 2.0 * B.modelCostMult * 1000 * 12 / 52;
    expect(s.cash - before).toBeCloseTo(10000 * 12 / 52 - salaries - OFFICE_STAGES[0].rent - modelCost);
    expect(p.mrr).toBe(10000);
  });

  it('charges automation, self-hosting, policies, and tooling', () => {
    const s = game();
    const base = () => { const c = s.cash; runEconomy(s, 1); return c - s.cash; };
    const b0 = base();
    s.automation.support = { level: 0.5, model: 'llamarama' };
    const b1 = base();
    expect(b1 - b0).toBeCloseTo(600 * B.autoCostMult * 0.5 + B.gpuWeeklySelfHost);
    s.policies.apprenticeship = true;
    s.security.tooling = true;
    expect(base() - b1).toBeCloseTo(1500 + B.toolingWeekly);
  });

  it('lowCashWeeks counts negative weeks and resets', () => {
    const s = game();
    s.cash = 100;
    const ev = runEconomy(s, 1);
    s.pendingDecision = null;
    expect(s.lowCashWeeks).toBe(1);
    expect(ev.some((e) => e.type === 'toast' && e.tone === 'warn')).toBe(true);
    const ev2 = runEconomy(s, 1);
    expect(s.lowCashWeeks).toBe(2);
    expect(ev2.some((e) => e.type === 'toast' && e.tone === 'warn')).toBe(false);
    s.cash = 1e6;
    runEconomy(s, 1);
    expect(s.lowCashWeeks).toBe(0);
  });

  it('peakMrr tracks the maximum', () => {
    const s = game();
    const p = addProduct(s, { customers: 5000 });
    runProducts(s, 1);
    const peak = s.stats.peakMrr;
    expect(peak).toBe(totalMrr(s));
    p.killed = true;
    runProducts(s, 1);
    expect(s.stats.peakMrr).toBe(peak);
  });
});

describe('actions', () => {
  it('upgradeOffice waits for its gate, then needs cash', () => {
    const s = game();
    s.cash = 1e7;
    expectFail(expect, dispatch, s, { type: 'upgradeOffice' }, 'Available from 2021');
    s.week = 104;
    expectFail(expect, dispatch, s, { type: 'upgradeOffice' }, 'Needs 2 launches');
    s.stats.launches = 2;
    expectFail(expect, dispatch, s, { type: 'upgradeOffice' }, 'Needs 6 people');
    for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'mid');
    expectFail(expect, dispatch, s, { type: 'upgradeOffice' }, 'Needs brand 15');
    passOfficeGates(s);
    s.cash = 100;
    expectFail(expect, dispatch, s, { type: 'upgradeOffice' }, 'Not enough cash');
    s.cash = 1e7;
    const res = dispatch(s, { type: 'upgradeOffice' });
    expect(res.ok).toBe(true);
    expect(s.officeStage).toBe(1);
    expect(s.cash).toBe(1e7 - OFFICE_STAGES[1].upgradeCost);
    expect(res.events).toContainEqual({ type: 'officeUpgrade', stage: 1 });
    dispatch(s, { type: 'upgradeOffice' });
    expectFail(expect, dispatch, s, { type: 'upgradeOffice' }, 'Needs 28 people');
  });

  it('killProduct zeroes the product and hurts its builders', () => {
    const s = game();
    const p = addProduct(s, { customers: 100, mrr: 1000 });
    const m = s.staff[0].meaning;
    expect(dispatch(s, { type: 'killProduct', productId: p.id }).ok).toBe(true);
    expect(p).toMatchObject({ killed: true, customers: 0, mrr: 0 });
    expect(s.staff[0].meaning).toBe(m - 10);
    expectFail(expect, dispatch, s, { type: 'killProduct', productId: p.id }, 'No such product');
  });

  it('killProduct cancels its update and migration work and clears the owner', () => {
    const s = game();
    const p = addProduct(s, { migrationDueWeek: 30, ownerId: s.staff[1].id });
    const other = addProduct(s, { name: 'Other' });
    const up = dispatch(s, { type: 'startProject', kind: 'update', productId: p.id }).projectId;
    dispatch(s, { type: 'startProject', kind: 'migration', productId: p.id });
    const keep = dispatch(s, { type: 'startProject', kind: 'update', productId: other.id }).projectId;
    dispatch(s, { type: 'assign', staffId: s.staff[0].id, assignment: { type: 'project', targetId: up } });
    const res = dispatch(s, { type: 'killProduct', productId: p.id });
    expect(s.projects.map((j) => j.id)).toEqual([keep]);
    expect(s.staff[0].assignment.type).toBe('maintenance');
    expect(p.ownerId).toBe(null);
    expect(res.events.some((e) => e.type === 'toast' && /cancel/i.test(e.text))).toBe(true);
  });

  it('setOwner validates both ids and can clear ownership', () => {
    const s = game();
    const p = addProduct(s);
    expectFail(expect, dispatch, s, { type: 'setOwner', productId: 'x', staffId: s.staff[0].id }, 'No such product');
    expectFail(expect, dispatch, s, { type: 'setOwner', productId: p.id, staffId: 'x' }, 'No such staff member');
    expect(dispatch(s, { type: 'setOwner', productId: p.id, staffId: s.staff[0].id }).ok).toBe(true);
    expect(p.ownerId).toBe(s.staff[0].id);
    expect(dispatch(s, { type: 'setOwner', productId: p.id, staffId: null }).ok).toBe(true);
    expect(p.ownerId).toBe(null);
  });
});
