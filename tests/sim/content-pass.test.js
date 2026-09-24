import { describe, it, expect } from 'vitest';
import { runBot } from '../../src/sim/bots.js';
import { staffUpkeep } from '../../src/sim/staff.js';
import { marketingSystem } from '../../src/sim/marketing.js';
import { chatSystem } from '../../src/sim/chat.js';
import { marketSystem } from '../../src/sim/market.js';
import { OUTAGE_KINDS } from '../../src/sim/incidents.js';
import { makeCtx } from '../../src/sim/registry.js';
import { dispatch } from '../../src/sim/index.js';
import { ROLES } from '../../src/data/roles.js';
import { EVENTS } from '../../src/data/events.js';
import { game, addStaff, addProduct } from './helpers.js';

describe('content pass', () => {
  it('promotions use job titles', () => {
    expect(ROLES.support.title).toBe('Support Specialist');
    const s = game();
    const p = addStaff(s, 'support', 'junior', { traits: [], level: 4, xp: 239, assignment: { type: 'support', targetId: null } });
    const c = makeCtx(s);
    staffUpkeep(c);
    expect(c.events.some((e) => e.type === 'toast' && e.text === `${p.name} is now a Mid Support Specialist!`)).toBe(true);
  });

  it('a finished campaign ends quietly', () => {
    const s = game();
    const p = addProduct(s);
    dispatch(s, { type: 'runCampaign', channel: 'producthunt', productId: p.id });
    const c = makeCtx(s);
    marketingSystem(c);
    expect(s.campaigns).toHaveLength(0);
    expect(c.events.some((e) => e.type === 'toast' && /wrapped up/.test(e.text))).toBe(false);
  });

  it('misc events post their own short bot line, not the popup text', () => {
    for (const id of ['coffee_machine_broke', 'office_dog']) {
      expect(EVENTS[id].chat, id).toBeTruthy();
      expect(EVENTS[id].chat).not.toBe(EVENTS[id].text);
    }
  });

  it('the clone thread talks about the category that was cloned', () => {
    const s = game();
    addStaff(s, 'marketer', 'mid');
    addStaff(s, 'engineer', 'mid');
    addProduct(s, { name: 'Jotly', category: 'notes', score: 8 });
    addProduct(s, { name: 'Inboxer', category: 'email', score: 4 });
    for (let w = 0; w < 400; w++) {
      const c = makeCtx(s);
      marketSystem(c);
      chatSystem(c);
      const thread = c.events.find((e) => e.type === 'chat' && /clone with our exact tagline/.test(e.text));
      if (thread) { expect(thread.text).toContain('a Notes clone'); return; }
      s.week++;
    }
    throw new Error('clone thread never fired');
  });

  it('launch threads celebrate first launches, not updates', () => {
    const s = game();
    for (let i = 0; i < 4; i++) addStaff(s, 'designer', 'mid');
    const p = addProduct(s, { version: 3 });
    for (let i = 0; i < 20; i++) {
      const c = makeCtx(s);
      c.events.push({ type: 'launch', productId: p.id });
      chatSystem(c);
      expect(c.events.some((e) => e.type === 'chat' && /empty state has a tiny dancing cat|and nothing is on fire\. I keep|demos booked/.test(e.text))).toBe(false);
      s.week++;
    }
  });

  it('phishing and data theft cost money and trust but do not take a product down', () => {
    for (const kind of ['phishing', 'data_exfiltration', 'credential_stuffing']) expect(OUTAGE_KINDS.has(kind), kind).toBe(false);
    for (const kind of ['ransomware', 'supply_chain', 'db_wipe', 'runaway_spend']) expect(OUTAGE_KINDS.has(kind), kind).toBe(true);
  });

  it('Hacker News clone posts are rate limited', () => {
    let last = -99;
    const r = runBot('balanced', 3, 520, {
      onWeek: (s, ev) => {
        const posts = ev.filter((e) => e.type === 'chat' && e.from === '@hackernewsbot').length;
        expect(posts).toBeLessThanOrEqual(1);
        if (posts) { expect(s.week - last).toBeGreaterThanOrEqual(6); last = s.week; }
      },
    });
    expect(r.weeks).toBeGreaterThan(0);
  });
});
