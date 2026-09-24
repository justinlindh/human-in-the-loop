import { describe, it, expect } from 'vitest';
import { agentsHere, incidentLabel } from './v2content.js';

describe('era-aware agent copy', () => {
  it('says agents only from the Agents era on', () => {
    expect(agentsHere({ era: { id: 'classic' } })).toBe(false);
    expect(agentsHere({ era: { id: 'chatgbt' } })).toBe(false);
    expect(agentsHere({ era: { id: 'agents' } })).toBe(true);
    expect(agentsHere({ era: { id: 'plateau' } })).toBe(true);
  });
  it('names automation incidents without agents before the Agents era', () => {
    expect(incidentLabel({ era: { id: 'chatgbt' } }, 'db_wipe')).toBe('Automation wiped a database');
    expect(incidentLabel({ era: { id: 'agents' } }, 'db_wipe')).toBe('Agent wiped a database');
    expect(incidentLabel({ era: { id: 'classic' } }, 'phishing')).toBe('Phishing');
    expect(incidentLabel({ era: { id: 'classic' } }, 'mystery', 'Incident')).toBe('Incident');
  });
});
