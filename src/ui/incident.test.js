import { describe, it, expect } from 'vitest';
import { costPills, createResolutions, POSTMORTEM_IDS } from './incident.js';

const res = (productId, severity = 4) => ({ type: 'incidentResolved', productId, kind: 'db_wipe', severity, weeks: 2, cost: { cash: 12400, brand: 3, customers: 210 }, responderIds: ['s1'], helped: ['a'], hurt: ['b'] });

describe('incident resolution', () => {
  it('writes costs as signed pills and leaves out zeros', () => {
    expect(costPills({ cash: 12400, brand: 3, customers: 210 })).toEqual(['-$12.4K', 'Brand -3', '-210 customers']);
    expect(costPills({ cash: 0, brand: 0, customers: 1 })).toEqual(['-1 customer']);
  });

  it('treats the attack follow-up and rogue-agent SEV decisions as postmortems, not attack alarms', () => {
    expect(POSTMORTEM_IDS.has('incident_postmortem')).toBe(true);
    expect(POSTMORTEM_IDS.has('agent_db_wipe')).toBe(true);
    expect(POSTMORTEM_IDS.has('ransomware')).toBe(false);
  });

  it('heads a postmortem with its product\'s newest resolution', () => {
    const r = createResolutions();
    r.add(res('p1')); const newest = res('p1', 5); r.add(newest); r.add(res('p2'));
    expect(r.forDecision({ eventId: 'agent_db_wipe', subjectId: 'p1', vars: {} })).toBe(newest);
    expect(r.forDecision({ eventId: 'ransomware', subjectId: 'p1', vars: {} })).toBe(null);
  });

  it('falls back to the decision\'s own vars, once per decision, and not while that product is still down', () => {
    const r = createResolutions();
    const d = { eventId: 'incident_postmortem', subjectId: 'p9', vars: { incidentWeeks: 3, incidentCost: { cash: 5 }, incidentResponders: ['s2'], incidentHelped: ['h'], incidentHurt: ['x'] } };
    const s = { flags: { lastIncident: { productId: 'p9', severity: 4 } } };
    const a = r.forDecision(d, s);
    expect(a).toMatchObject({ weeks: 3, severity: 4, responderIds: ['s2'], helped: ['h'], hurt: ['x'] });
    expect(r.forDecision(d, s)).toBe(a);
    expect(r.forDecision(d, { outage: { productId: 'p9' } })).toBe(null);
  });
});
