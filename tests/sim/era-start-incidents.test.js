import { describe, it, expect } from 'vitest';
import { createGame } from '../../src/sim/index.js';
import { landIncident } from '../../src/sim/incidents.js';
import { makeCtx } from '../../src/sim/registry.js';
import { addProduct, withItem } from './helpers.js';

function incident(startEra, week, kind = 'db_wipe', model = 'chatgbt') {
  const state = createGame({ startEra });
  state.week = week;
  state.era = { id: 'agents', since: 0 };
  state.brand = 50;
  addProduct(state, { mrr: 100000 });
  const cash = state.cash;
  const ctx = makeCtx(state);
  landIncident(ctx, { kind, severity: 5, caught: false, model });
  return { state, cash, events: ctx.events };
}

describe('Agents founding incident runway', () => {
  it.each([0, 259])('keeps early incidents costly but recoverable at company week %s', (week) => {
    for (const [kind, model] of [['db_wipe', 'chatgbt'], ['ransomware', null]]) {
      const { state, cash, events } = incident('agents', week, kind, model);
      expect(state.incidentLog[0].severity).toBe(2);
      expect(state.stats.incidents).toBe(1);
      expect(state.cash).toBeLessThan(cash);
      expect(state.brand).toBeLessThan(50);
      expect(state.outage).toBe(null);
      expect(events.find((e) => e.type === 'incident').severity).toBe(2);
    }
  });

  it('restores full incident severity after five company years', () => {
    const { state } = incident('agents', 260);
    expect(state.incidentLog[0].severity).toBe(5);
    expect(state.outage.severity).toBe(5);
  });

  it('caps NOC misreads while preserving catches and minor incidents', () => {
    const state = createGame({ startEra: 'agents' });
    withItem(state, 'noc', 2);
    state.ops.noc = 'agents';
    const ctx = makeCtx(state);
    for (let n = 0; n < 30; n++) landIncident(ctx, { kind: 'mass_email', severity: n % 2 + 1, caught: true, model: 'chatgbt' });
    const incidents = ctx.events.filter((e) => e.type === 'incident');
    expect(incidents.some((e) => e.misread)).toBe(true);
    expect(incidents.some((e) => e.caught && e.severity === 1)).toBe(true);
    expect(incidents.every((e) => e.severity <= 2)).toBe(true);
  });

  it.each(['classic', 'chatgbt'])('keeps %s incident rules when its company reaches Agents', (startEra) => {
    const { state } = incident(startEra, 100);
    expect(state.incidentLog[0].severity).toBe(5);
    expect(state.outage.severity).toBe(5);
  });
});
