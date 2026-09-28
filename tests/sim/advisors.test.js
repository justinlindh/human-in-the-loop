import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { advice, advisorsSystem } from '../../src/sim/advisors.js';
import { runBot } from '../../src/sim/bots.js';
import { B } from '../../src/sim/balance.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { ADVICE_LINES, ADVISORS } from '../../src/data/advisors.js';
import { FIRST_NAMES, LAST_NAMES } from '../../src/data/names.js';
import { weeklyRevenue, weeklyCosts } from '../../src/sim/economy.js';
import { isUnlocked } from '../../src/sim/unlocks.js';
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
    s.projects.push({ id: 'jm', kind: 'migration', productId: pr.id });
    expect(find(s, `migration:${pr.id}`)).toBeUndefined();
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

  it("no advisor shares a first or last name with the staff name pools", () => {
    for (const { name } of Object.values(ADVISORS)) {
      const [first, last] = name.split(' ');
      expect(FIRST_NAMES, name).not.toContain(first);
      expect(LAST_NAMES, name).not.toContain(last);
    }
  });

  it('is a pure read: no state change and no draw from the game RNG', () => {
    const s = burning(3, 7);
    const before = JSON.stringify(s);
    const first = advice(s);
    expect(JSON.stringify(s)).toBe(before);
    expect(advice(s)).toEqual(first);
    for (const a of first) {
      expect(Object.keys(a).sort()).toEqual(['advisor', 'cooldownWeeks', 'key', 'options', 'severity', 'since', 'target', 'text', 'tier', 'why']);
      expect(a.text).not.toMatch(/[{}]/);
    }
  });
});

describe('advisors: options', () => {
  const MENUS = ['build', 'staff', 'office', 'reports', 'marketing', 'policies', 'ops', 'models', 'automation'];

  it('runway offers sales, a campaign, and a paid policy to switch off when one is on', () => {
    const s = burning(7, 15);
    s.unlocks.marketing = 0;
    const r = find(s, 'runway');
    expect(r.options.map((o) => o.target.panel)).toContain('staff');
    s.policies.top_pay = true;
    expect(find(s, 'runway').options.at(-1)).toMatchObject({ target: { panel: 'policies', arg: 'top_pay' } });
  });

  it('burnout names the person to send on time off, and offers No Crunch only once it is unlocked', () => {
    const s = game(16);
    for (let i = 0; i < 3; i++) addStaff(s, 'engineer', 'mid');
    for (const p of s.staff) p.mood = 'ok';
    const tired = s.staff[2]; tired.mood = 'burnout';
    const b = find(s, 'burnout');
    expect(b.options[0]).toMatchObject({ target: { panel: 'staff', arg: tired.id } });
    expect(b.options[0].text).toContain(tired.name.split(' ')[0]);
    expect(b.options.some((o) => o.target.arg === 'no_crunch')).toBe(false);
    s.unlocks['policy.no_crunch'] = s.week;
    expect(find(s, 'burnout').options.some((o) => o.target.arg === 'no_crunch')).toBe(true);
  });

  it('The Big Refactor is offered only when a builder is free; otherwise the option is to free one up', () => {
    const s = game(17);
    for (let i = 0; i < 2; i++) addStaff(s, 'engineer', 'mid');
    s.comprehensionDebt = B.advisor.debt[1];
    for (const p of s.staff) p.assignment = { type: 'support', targetId: null };
    expect(find(s, 'debt').options[0]).toMatchObject({ text: 'Free up an engineer for The Big Refactor', target: { panel: 'staff' } });
    s.staff.find((p) => p.role === 'engineer').assignment = { type: 'idle', targetId: null };
    expect(find(s, 'debt').options[0]).toMatchObject({ text: 'Start The Big Refactor', target: { panel: 'build' } });
  });

  it('over real games every piece of advice offers 2 or 3 real options, pointing at real menus and things', () => {
    let checked = 0;
    for (const seed of [1, 2]) runBot('balanced', seed, 520, { onWeek: (s) => {
      if (s.week % 5) return;
      for (const a of advice(s)) {
        checked++;
        expect(a.options.length, a.key).toBeGreaterThanOrEqual(2);
        expect(a.options.length, a.key).toBeLessThanOrEqual(3);
        for (const o of a.options) {
          expect(MENUS, a.key).toContain(o.target.panel);
          expect(o.text).not.toMatch(/[{}]|undefined/);
          expect(o.text, `${a.key}: the chip names the menu`).not.toMatch(new RegExp(`\\b${o.target.panel}\\b`, 'i'));
          const arg = o.target.arg;
          if (!['staff', 'policies', 'reports', 'marketing', 'build'].includes(o.target.panel)) expect(arg, `${a.key} ${o.target.panel}`).toBeUndefined();
          if (arg === undefined) continue;
          if (o.target.panel === 'policies') expect(isUnlocked(s, `policy.${arg}`) || s.policies[arg], `${a.key} ${arg}`).toBeTruthy();
          else if (o.target.panel === 'staff') expect(s.staff.some((p) => p.id === arg && p.mood !== 'away' || p.id === arg && a.key === 'burnout')).toBe(true);
          else expect(s.products.some((p) => p.id === arg && !p.killed), `${a.key} ${arg}`).toBe(true);
        }
      }
    } });
    expect(checked).toBeGreaterThan(100);
  }, 120000);
});

describe('advisors: dismissing and the rare push', () => {
  it('dismissAdvice silences a topic until it gets worse', () => {
    const s = burning(11, 8);
    const before = JSON.stringify(s.advisors);
    expect(dispatch(s, { type: 'dismissAdvice', key: 'nope' }).ok).toBe(true);
    expect(JSON.stringify(s.advisors)).toBe(before);
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

  it('dismissals survive a save and load; saves without advisors load with the default', () => {
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    const s = burning(11, 11);
    dispatch(s, { type: 'dismissAdvice', key: 'runway' });
    saveGame(s, storage);
    expect(loadGame(storage).state.advisors).toEqual(s.advisors);
    const old = burning(11, 12);
    delete old.advisors;
    saveGame(old, storage);
    const loaded = loadGame(storage).state;
    expect(loaded.advisors).toEqual({ dismissed: {}, pushed: {}, lastPushWeek: null, noticed: {} });
    expect(find(loaded, 'runway')).toBeTruthy();
  });

  it('since is the week a topic started applying; it holds through tier changes and restarts after a gap', () => {
    const s = burning(11, 13);
    expect(find(s, 'runway').since).toBe(s.week);
    const start = s.week;
    advisorsSystem(makeCtx(s));
    s.week += 3;
    expect(find(s, 'runway').since).toBe(start);
    s.cash = Math.round(-net(s) * 5);
    advisorsSystem(makeCtx(s));
    expect(find(s, 'runway')).toMatchObject({ tier: 2, since: start });
    const cash = s.cash;
    s.cash = 1e9; s.week += 1;
    advisorsSystem(makeCtx(s));
    expect(s.advisors.noticed.runway).toBeUndefined();
    s.cash = cash; s.week += 2;
    advisorsSystem(makeCtx(s));
    expect(find(s, 'runway').since).toBe(s.week);
  });

  it("'fine' has a since too, and a save from before since existed still works", () => {
    const s = classicGame(14);
    s.cash = 1e7;
    advisorsSystem(makeCtx(s));
    const start = s.week;
    s.week += 5;
    expect(advice(s)[0]).toMatchObject({ key: 'fine', since: start });
    const store = new Map();
    const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
    delete s.advisors.noticed;
    saveGame(s, storage);
    const loaded = loadGame(storage).state;
    expect(advice(loaded)[0].since).toBe(loaded.week);
    advisorsSystem(makeCtx(loaded));
    expect(loaded.advisors.noticed.fine).toBe(loaded.week);
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
