import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { marketingSystem } from '../../src/sim/marketing.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { CHANNELS } from '../../src/data/channels.js';
import { game, addStaff, addProduct, expectFail } from './helpers.js';

const runMarketing = (s, n = 1) => { const ev = []; for (let i = 0; i < n; i++) { const c = makeCtx(s); marketingSystem(c); ev.push(...c.events); s.week++; } return ev; };
const newProject = (s) => { dispatch(s, { type: 'startProject', kind: 'new', name: 'Jotly', category: 'notes', angle: 'copilot', model: 'chatgbt', size: 'small' }); return s.projects.at(-1); };

describe('runCampaign', () => {
  it('deducts cash and the campaign expires after its weeks', () => {
    const s = game();
    const p = addProduct(s);
    const res = dispatch(s, { type: 'runCampaign', channel: 'content', productId: p.id });
    expect(res.ok).toBe(true);
    expect(s.cash).toBe(B.funding.bootstrapped.cash - CHANNELS.content.cost);
    expect(s.campaigns).toHaveLength(1);
    expect(s.campaigns[0]).toMatchObject({ channel: 'content', productId: p.id, projectId: null, weeksLeft: CHANNELS.content.weeks });
    runMarketing(s, CHANNELS.content.weeks - 1);
    expect(s.campaigns).toHaveLength(1);
    runMarketing(s, 1);
    expect(s.campaigns).toHaveLength(0);
    expect(p.hype).toBeGreaterThan(0);
  });

  it('each validation failure leaves state unchanged', () => {
    const s = game();
    const p = addProduct(s);
    const j = newProject(s);
    const run = (over) => ({ type: 'runCampaign', channel: 'content', ...over });
    expectFail(expect, dispatch, s, run({ channel: 'skywriting', productId: p.id }), 'Unknown channel');
    expectFail(expect, dispatch, s, run({ channel: 'conference', productId: p.id }), 'Needs a bigger office');
    expectFail(expect, dispatch, s, run({}), 'Pick a product or a project');
    expectFail(expect, dispatch, s, run({ productId: p.id, projectId: j.id }), 'Pick a product or a project');
    expectFail(expect, dispatch, s, run({ productId: 'nope' }), 'No such product');
    expectFail(expect, dispatch, s, run({ projectId: 'nope' }), 'No such project');
    p.killed = true;
    expectFail(expect, dispatch, s, run({ productId: p.id }), 'No such product');
    s.cash = 10;
    expectFail(expect, dispatch, s, run({ projectId: j.id }), 'Not enough cash');
  });
});

describe('hype and brand', () => {
  it('a campaign on a killed product stops with a toast', () => {
    const s = game();
    const p = addProduct(s);
    dispatch(s, { type: 'runCampaign', channel: 'content', productId: p.id });
    dispatch(s, { type: 'killProduct', productId: p.id });
    const ev = runMarketing(s, 1);
    expect(s.campaigns).toHaveLength(0);
    expect(ev.some((e) => e.type === 'toast' && e.text.includes('stopped'))).toBe(true);
  });

  it('pre-launch project hype is banked on the project', () => {
    const s = game();
    const j = newProject(s);
    dispatch(s, { type: 'runCampaign', channel: 'launch', projectId: j.id });
    runMarketing(s, 2);
    expect(j.bankedHype).toBeGreaterThan(0);
  });

  it('automated marketing adds hype but lowers brand gain', () => {
    const setup = (level) => {
      const s = game();
      const p = addProduct(s);
      s.automation.marketing.level = level;
      s.cash = 1e6;
      dispatch(s, { type: 'runCampaign', channel: 'community', productId: p.id });
      const brand = s.brand;
      runMarketing(s, 1);
      return { hype: p.hype, brandGain: s.brand - brand };
    };
    const human = setup(0);
    const bot = setup(1);
    expect(bot.hype).toBeGreaterThan(human.hype);
    expect(bot.brandGain).toBeLessThan(human.brandGain);
  });

  it('marketers boost campaigns and hype the newest product without one', () => {
    const s = game();
    const old = addProduct(s, { name: 'Old' });
    const fresh = addProduct(s, { name: 'Fresh' });
    addStaff(s, 'marketer', 'mid', { traits: [], speed: 1 });
    runMarketing(s, 1);
    expect(fresh.hype).toBeGreaterThan(0);
    expect(old.hype).toBe(0);
  });

  it('hype and brand decay and stay in range', () => {
    const s = game();
    const p = addProduct(s, { hype: 80 });
    s.brand = 50;
    runMarketing(s, 10);
    expect(p.hype).toBeLessThan(80);
    expect(s.brand).toBeLessThan(50);
    p.hype = 500;
    s.brand = 500;
    runMarketing(s, 1);
    expect(p.hype).toBeLessThanOrEqual(100);
    expect(s.brand).toBeLessThanOrEqual(100);
    s.brand = 0;
    runMarketing(s, 1);
    expect(s.brand).toBeGreaterThanOrEqual(0);
  });

  it('brand settles instead of pinning at 100 under steady marketing', () => {
    const s = game();
    const p = addProduct(s);
    s.cash = 1e7;
    for (let w = 0; w < 520; w++) {
      if (!s.campaigns.length) dispatch(s, { type: 'runCampaign', channel: 'community', productId: p.id });
      runMarketing(s, 1);
    }
    expect(s.brand).toBeGreaterThan(30);
    expect(s.brand).toBeLessThan(75);
  });

  it('the wrapper hit fires once', () => {
    const s = game();
    s.brand = 30;
    const p = addProduct(s, { score: 3, hype: 90 });
    const ev = runMarketing(s, 3);
    expect(p.wrapperHit).toBe(true);
    const hits = ev.filter((e) => e.type === 'toast' && e.text.includes('just a wrapper'));
    expect(hits).toHaveLength(1);
    expect(s.brand).toBeLessThan(30 - B.wrapperBrandHit + 0.001);
  });
});
