import { describe, it, expect } from 'vitest';
import { nocLook, QUIET_WEEKS } from './noc.js';

const log = (...weeks) => weeks.map((week) => ({ week, kind: 'x', productId: null, caught: true, severity: 1 }));

describe('nocLook', () => {
  it('shows agent logs only when the agents have the NOC', () => {
    expect(nocLook({ week: 10, ops: { noc: 'agents' } }).mode).toBe('agents');
    expect(nocLook({ week: 10, ops: { noc: 'humans' } }).mode).toBe('humans');
    expect(nocLook({ week: 10, ops: { noc: null } }).mode).toBe('humans');
    expect(nocLook({ week: 10 }).mode).toBe('humans');
  });

  it('goes red for a live outage or an incident this week', () => {
    expect(nocLook({ week: 10, outage: { kind: 'db_wipe' }, incidentLog: log(3) }).alert).toBe(true);
    expect(nocLook({ week: 10, incidentLog: log(3, 10) }).alert).toBe(true);
    expect(nocLook({ week: 10, incidentLog: log(3, 9) }).alert).toBe(false);
  });

  it('counts days since the last incident in weeks of seven days', () => {
    expect(nocLook({ week: 10, incidentLog: log(3, 7) }).days).toBe(21);
    expect(nocLook({ week: 5, incidentLog: [] }).days).toBe(35);
  });

  it('is quiet after enough weeks without an incident, never during an outage', () => {
    expect(nocLook({ week: 20, incidentLog: log(20 - QUIET_WEEKS) }).quiet).toBe(true);
    expect(nocLook({ week: 20, incidentLog: log(21 - QUIET_WEEKS) }).quiet).toBe(false);
    expect(nocLook({ week: 20, incidentLog: [], outage: { kind: 'x' } }).quiet).toBe(false);
  });
});
