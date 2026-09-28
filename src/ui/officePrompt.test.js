import { describe, it, expect, beforeEach } from 'vitest';
import { SIMX } from './simapi.js';
import { OFFICE_STAGES } from '../data/office.js';
import { createOfficePrompt } from './officePrompt.js';
import { companyKey } from './saveKey.js';

const cost = OFFICE_STAGES[1].upgradeCost;
const state = (week, cash) => ({ week, cash, officeStage: 0, flags: {} });

describe('office move prompt', () => {
  beforeEach(() => { SIMX.officeGateReason = () => ''; });

  it('waits two weeks of the move being possible, and starts over after a dip', () => {
    const p = createOfficePrompt();
    for (let w = 130; w <= 134; w++) expect(p.current(state(w, cost - 1))).toBeNull();
    expect(p.current(state(135, cost))).toBeNull();
    expect(p.current(state(136, cost))).toBeNull();
    expect(p.current(state(137, cost))?.name).toBe(OFFICE_STAGES[1].name);
    expect(p.rows(state(137, cost))[0].text).toContain('within reach');
    // A dip: gone at once, and the wait starts over when it comes back.
    expect(p.current(state(138, cost - 1))).toBeNull();
    expect(p.current(state(139, cost))).toBeNull();
    expect(p.current(state(140, cost))).toBeNull();
    expect(p.current(state(141, cost))).not.toBeNull();
  });

  it('clears for good once Later is tapped, until the next office', () => {
    const p = createOfficePrompt();
    for (let w = 135; w <= 137; w++) p.current(state(w, cost));
    p.rows(state(137, cost))[0].later.run();
    expect(p.current(state(138, cost))).toBeNull();
    const next = { ...state(200, OFFICE_STAGES[2]?.upgradeCost ?? 0), officeStage: 1 };
    for (let w = 200; w <= 202; w++) p.current({ ...next, week: w });
    expect(p.current({ ...next, week: 202 })).not.toBeNull();
  });

  it('keys saved records to the company, not only the reused slot', () => {
    expect(companyKey({ flags: {} })).toBeNull();
    const a = companyKey({ flags: { saveSlot: 's1' }, seed: 4, companyName: 'Loopworks' });
    const b = companyKey({ flags: { saveSlot: 's1' }, seed: 9, companyName: 'Byteside' });
    expect(a).not.toBe(b);
  });
});
