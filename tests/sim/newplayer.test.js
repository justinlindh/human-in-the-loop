import { describe, it, expect } from 'vitest';
import { createGame, dispatch, tick } from '../../src/sim/index.js';
import { weeklyCosts, weeklyRevenue, modelCostPerCustomer, automationWeeklyCost } from '../../src/sim/economy.js';
import { eventsSystem } from '../../src/sim/events.js';
import { raiseDecision } from '../../src/sim/events.js';
import { emitChat } from '../../src/sim/chat.js';
import { staffUpkeep } from '../../src/sim/staff.js';
import { meaningSystem } from '../../src/sim/meaning.js';
import { makeCtx } from '../../src/sim/registry.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { EVENTS } from '../../src/data/events.js';
import { B } from '../../src/sim/balance.js';
import { MODELS } from '../../src/data/models.js';
import { game, addStaff, addProduct } from './helpers.js';

describe('a new player gets a fair opening', () => {
  it('two founders on a small project launch by about week 14 with 8+ weeks of runway', () => {
    for (const [category, angle] of [['notes', 'freemium'], ['email', 'web'], ['pm', 'web']]) {
      for (let seed = 1; seed <= 10; seed++) {
        const s = createGame({ seed });
        const pid = dispatch(s, { type: 'startProject', kind: 'new', name: 'Loopo', category, angle, size: 'small' }).projectId;
        for (const p of s.staff) dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: pid } });
        while (!s.products.length && s.week < 30) {
          for (let c = 0; c < 4 && s.pendingDecision; c++) dispatch(s, { type: 'resolveDecision', choice: c });
          tick(s);
        }
        expect(s.week, `${category} seed ${seed}`).toBeLessThanOrEqual(15);
        const burn = Object.values(weeklyCosts(s)).reduce((a, b) => a + b, 0) - weeklyRevenue(s);
        expect(s.cash / burn, `${category} seed ${seed}`).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('no random decisions before the first launch or week 10', () => {
    const s = game(1);
    let decisions = 0;
    for (let w = 0; w < 10; w++) {
      const c = makeCtx(s);
      eventsSystem(c);
      if (s.pendingDecision) { decisions++; s.pendingDecision = null; }
      s.week++;
    }
    expect(decisions).toBe(0);
    const t = game(1);
    t.stats.launches = 1;
    addProduct(t);
    let later = 0;
    for (let w = 0; w < 60; w++) { eventsSystem(makeCtx(t)); if (t.pendingDecision) { later++; t.pendingDecision = null; } t.week++; }
    expect(later).toBeGreaterThan(0);
  });
});

describe('small fixes', () => {
  it('greenlighting a side project is unavailable while a craft project runs', () => {
    const s = game();
    dispatch(s, { type: 'startProject', kind: 'craft' });
    raiseDecision(makeCtx(s), 'senior_side_project', s.staff[0].id);
    expect(s.pendingDecision.choices[0]).toMatchObject({ available: false, reason: 'A craft project is already running' });
    expect(dispatch(s, { type: 'resolveDecision', choice: 0 })).toMatchObject({ ok: false, reason: 'A craft project is already running' });
  });

  it('chatLog keeps the last 80 chat events and survives save and load', () => {
    const s = game();
    expect(s.chatLog).toEqual([]);
    const c = makeCtx(s);
    for (let i = 0; i < 90; i++) emitChat(c, { from: '@bot', text: `line ${i}` });
    expect(s.chatLog).toHaveLength(80);
    expect(s.chatLog.at(-1)).toMatchObject({ type: 'chat', text: 'line 89', channel: 'general' });
    expect(s.chatLog[0].text).toBe('line 10');
    const m = new Map();
    const store = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
    saveGame(s, store);
    expect(loadGame(store).state.chatLog).toEqual(s.chatLog);
    const key = `hitl.save.v2.${s.flags.saveSlot}`;
    const old = JSON.parse(m.get(key));
    delete old.chatLog;
    m.set(key, JSON.stringify(old));
    expect(loadGame(store).state.chatLog).toEqual([]);
  });

  it('annual raises come with a toast', () => {
    const s = game();
    s.week = 51;
    const c = makeCtx(s);
    staffUpkeep(c);
    expect(c.events.some((e) => e.type === 'toast' && e.text.includes('payroll +4%'))).toBe(true);
  });

  it('farewells do not repeat back to back', () => {
    let total = 0;
    for (let seed = 1; seed <= 3; seed++) {
      const texts = [];
      const s = game(seed);
      s.automation.engineering.level = 1;
      for (let i = 0; i < 10; i++) addStaff(s, 'engineer', 'senior', { traits: ['job_hopper'], meaning: 0, mood: 'burnout', burnoutWeeks: 5 });
      for (let w = 0; w < 30; w++) {
        for (const p of s.staff) if (!p.founder) { p.meaning = 0; }
        const c = makeCtx(s);
        meaningSystem(c);
        const resigned = new Set(c.events.filter((e) => e.type === 'resign').map((e) => e.name));
        for (const e of c.events) if (e.type === 'chat' && resigned.has(e.from)) texts.push(e.text);
        s.week++;
      }
      for (let i = 1; i < texts.length; i++) expect(texts.slice(Math.max(0, i - 4), i)).not.toContain(texts[i]);
      total += texts.length;
    }
    expect(total).toBeGreaterThan(8);
  });

  it('cost helpers match what the economy charges', () => {
    const s = game();
    s.models.claudius.costMult = 1.3;
    expect(modelCostPerCustomer(s, 'claudius')).toBeCloseTo(MODELS.claudius.productCost * B.modelCostMult * 1.3);
    s.automation.support = { level: 0.5, model: 'chatgbt' };
    expect(automationWeeklyCost(s, 'support')).toBeCloseTo(MODELS.chatgbt.autoCost * B.autoCostMult * 0.5);
    expect(automationWeeklyCost(s, 'qa')).toBe(0);
    expect(weeklyCosts(s).automation).toBeCloseTo(automationWeeklyCost(s, 'support'));
  });
});
