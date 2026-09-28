import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { advice, advisorsSystem } from '../../src/sim/advisors.js';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { ADVICE_LINES } from '../../src/data/advisors.js';
import { weeklyRevenue, weeklyCosts } from '../../src/sim/economy.js';
import { game, classicGame, addStaff, addProduct } from './helpers.js';

const net = (s) => weeklyRevenue(s) - Object.values(weeklyCosts(s)).reduce((a, v) => a + v, 0);
const find = (s, key) => advice(s).find((a) => a.key === key);
// A company losing money, with cash set to leave `weeks` of runway.
function burning(weeks, seed = 1) {
  const s = game(seed);
  for (let i = 0; i < 3; i++) addStaff(s, 'engineer', 'mid');
  s.cash = Math.round(-net(s) * weeks + 1);
  return s;
}

describe('advisors (#808): what they notice', () => {
  it('runway: tiers from what the cash readout shows, with the fact and the panel', () => {
    expect(net(burning(20))).toBeLessThan(0);
    expect(find(burning(20), 'runway')).toBeUndefined();
    const mild = find(burning(11), 'runway');
    expect(mild).toMatchObject({ advisor: 'cfo', tier: 1, severity: 2, target: { panel: 'reports' } });
    expect(mild.why).toMatch(/11 weeks/);
    expect(find(burning(7), 'runway')).toMatchObject({ tier: 2, severity: 3 });
    expect(find(burning(3), 'runway')).toMatchObject({ tier: 3, severity: 3 });
    const red = burning(3); red.cash = -5000;
    expect(find(red, 'runway')).toMatchObject({ tier: 3, severity: 3 });
    expect(ADVICE_LINES.runway.red).toContain(find(red, 'runway').text);
  });

  it('burnout: one person is a thought; a third of the team is urgent', () => {
    const s = game(2);
    for (let i = 0; i < 5; i++) addStaff(s, 'engineer', 'mid');
    for (const p of s.staff) p.mood = 'ok';
    expect(find(s, 'burnout')).toBeUndefined();
    s.staff[1].mood = 'burnout';
    expect(find(s, 'burnout')).toMatchObject({ advisor: 'people', tier: 1, severity: 1, target: { panel: 'staff' } });
    s.staff[2].mood = 'burnout';
    expect(find(s, 'burnout')).toMatchObject({ tier: 2, severity: 2 });
    s.staff[3].mood = 'burnout';
    expect(find(s, 'burnout')).toMatchObject({ tier: 3, severity: 3 });
  });

  it('debt, one person holding the knowledge, unmentored juniors and an overdue migration', () => {
    const s = game(3);
    for (let i = 0; i < 3; i++) addStaff(s, 'engineer', 'mid');
    s.comprehensionDebt = B.advisor.debt[1];
    expect(find(s, 'debt')).toMatchObject({ advisor: 'tech', tier: 2 });
    for (const p of s.staff) p.knowledge = 5;
    const keeper = s.staff.find((p) => p.role === 'engineer');
    keeper.knowledge = 90;
    expect(find(s, `busFactor:${keeper.id}`)).toMatchObject({ advisor: 'tech', target: { panel: 'staff', arg: keeper.id } });
    expect(find(s, `busFactor:${keeper.id}`).text).toContain(keeper.name.split(' ')[0]);
    addStaff(s, 'engineer', 'junior'); addStaff(s, 'designer', 'junior');
    expect(find(s, 'juniors')).toMatchObject({ advisor: 'people' });
    const pr = addProduct(s, { name: 'Jotly' });
    pr.migrationDueWeek = s.week - 1;
    expect(find(s, `migration:${pr.id}`)).toMatchObject({ advisor: 'tech', tier: 2 });
  });

  it('an unlocked policy nobody has tried, unless its opposite is on', () => {
    const s = game(4);
    s.unlocks['policy.sabbatical'] = s.week;
    s.week += B.advisor.unusedPolicyWeeks - 1;
    expect(find(s, 'unusedPolicy:sabbatical')).toBeUndefined();
    s.week += 1;
    expect(find(s, 'unusedPolicy:sabbatical')).toMatchObject({ advisor: 'people', target: { panel: 'policies', arg: 'sabbatical' } });
    s.week += B.advisor.unusedPolicyWindowWeeks;
    expect(find(s, 'unusedPolicy:sabbatical')).toBeUndefined();
    s.week -= B.advisor.unusedPolicyWindowWeeks;
    s.policies.sabbatical = true;
    expect(find(s, 'unusedPolicy:sabbatical')).toBeUndefined();
    delete s.policies.sabbatical;
    s.unlocks['policy.no_crunch'] = 0;
    s.policies.crunch = true;
    expect(find(s, 'unusedPolicy:no_crunch')).toBeUndefined();
  });

  it('an era only after it has arrived, and one product carrying the company', () => {
    const s = game(5);
    s.era = { id: 'agents', since: s.week };
    expect(find(s, 'era:agents')).toMatchObject({ advisor: 'tech' });
    s.week += B.advisor.eraWeeks;
    expect(find(s, 'era:agents')).toBeUndefined();
    const a = addProduct(s, { name: 'Jotly' }), b = addProduct(s, { name: 'Notely' });
    a.mrr = 90000; b.mrr = 5000;
    expect(find(s, 'oneProduct')).toMatchObject({ advisor: 'cfo' });
    expect(find(s, 'oneProduct').text).not.toMatch(/[{}]/);
  });

  it('says things are fine when nothing applies, and ranks the rest by severity', () => {
    const s = classicGame(6);
    s.cash = 1e7;
    expect(advice(s)).toEqual([expect.objectContaining({ key: 'fine', severity: 1, target: null })]);
    const busy = burning(3, 6);
    busy.comprehensionDebt = 50;
    const ranked = advice(busy);
    expect(ranked[0].key).toBe('runway');
    for (let i = 1; i < ranked.length; i++) expect(ranked[i - 1].severity).toBeGreaterThanOrEqual(ranked[i].severity);
    expect(ranked.some((a) => a.key === 'fine')).toBe(false);
  });

  it('is a pure read: no state change and no draw from the game RNG', () => {
    const s = burning(3, 7);
    const before = JSON.stringify(s);
    const first = advice(s);
    expect(JSON.stringify(s)).toBe(before);
    expect(advice(s)).toEqual(first);
    for (const a of first) {
      expect(Object.keys(a).sort()).toEqual(['advisor', 'cooldownWeeks', 'key', 'severity', 'target', 'text', 'tier', 'why']);
      expect(a.text).not.toMatch(/[{}]/);
    }
  });
});

describe('advisors: dismissing and the rare push', () => {
  it('dismissAdvice silences a topic until it gets worse', () => {
    const s = burning(11, 8);
    expect(dispatch(s, { type: 'dismissAdvice', key: 'nope' })).toMatchObject({ ok: false, reason: 'No such advice' });
    expect(dispatch(s, { type: 'dismissAdvice', key: 'runway' }).ok).toBe(true);
    expect(find(s, 'runway')).toBeUndefined();
    s.cash = Math.round(-net(s) * 5);
    expect(find(s, 'runway')).toMatchObject({ tier: 2 });
  });

  it('pushes only urgent advice, at most once per gap, never in a week with a decision, and not the same tier twice', () => {
    const s = burning(3, 9);
    const week = (extra = []) => { const ctx = makeCtx(s); for (const e of extra) ctx.emit(e); advisorsSystem(ctx); return ctx.events.filter((e) => e.type === 'advice'); };
    expect(week([{ type: 'decision' }])).toHaveLength(0);
    const pushed = week();
    expect(pushed).toHaveLength(1);
    expect(pushed[0]).toMatchObject({ key: 'runway', severity: 3, tier: 3 });
    s.week += 1;
    expect(week()).toHaveLength(0);
    s.week += B.advisor.pushGapWeeks;
    expect(week()).toHaveLength(0);
    s.week += B.advisor.cooldownWeeks;
    expect(week()).toHaveLength(1);
    const calm = burning(20, 9);
    const ctx = makeCtx(calm); advisorsSystem(ctx);
    expect(ctx.events.some((e) => e.type === 'advice')).toBe(false);
  });

  it('forgets dismissals and pushes for topics that no longer apply', () => {
    const s = burning(3, 10);
    dispatch(s, { type: 'dismissAdvice', key: 'runway' });
    s.cash = 1e9;
    advisorsSystem(makeCtx(s));
    expect(s.advisors.dismissed.runway).toBeUndefined();
  });

  it('bot games end the same with advisors on or off', () => {
    const end = (on) => {
      const saved = B.advisorsEnabled;
      B.advisorsEnabled = on;
      try {
        let last; runBot('balanced', 3, 260, { onWeek: (s) => { last = s; } });
        const { advisors, ...rest } = last;
        return JSON.stringify(rest);
      } finally { B.advisorsEnabled = saved; }
    };
    expect(end(true)).toBe(end(false));
  }, 120000);
});
