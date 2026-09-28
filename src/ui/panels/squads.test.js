import { describe, it, expect } from 'vitest';
import { memberStatus, postingText, nextSquadName, onPosting } from './squads.js';
import { SQUAD_NAMES } from '../../data/squads.js';

const person = (id, type, targetId = null, mood = 'ok') => ({ id, name: `${id} Person`, mood, assignment: { type, targetId } });
const squad = (over = {}) => ({ id: 'q1', name: 'Core', memberIds: [], leadId: null, posting: { type: 'project', targetId: 'j1' }, afterLaunch: 'upkeep', benchUntil: null, cohesion: 0, crewIds: [], ...over });

describe('squad member status', () => {
  it('counts someone on the posted project as posted and anyone elsewhere as on loan', () => {
    const sq = squad();
    expect(memberStatus(sq, person('a', 'project', 'j1'))).toBe('posted');
    expect(memberStatus(sq, person('b', 'project', 'j2'))).toBe('loan');
    expect(memberStatus(sq, person('c', 'support'))).toBe('loan');
  });

  it('says a member whose role cannot take the posting keeps their own work, not on loan', () => {
    const sq = squad({ posting: { type: 'maintenance', targetId: null } });
    expect(memberStatus(sq, { ...person('a', 'idle'), role: 'designer' })).toBe('cant');
    expect(memberStatus(sq, { ...person('b', 'support'), role: 'engineer' })).toBe('loan');
  });

  it('shows upkeep crew as on upkeep, never on loan', () => {
    const sq = squad({ crewIds: ['a'] });
    expect(memberStatus(sq, person('a', 'maintenance'))).toBe('crew');
  });

  it('shows someone away as away', () => {
    expect(memberStatus(squad(), person('a', 'sabbatical'))).toBe('away');
    expect(memberStatus(squad(), person('b', 'project', 'j1', 'away'))).toBe('away');
  });

  it('matches non-project postings on type alone', () => {
    expect(onPosting(squad({ posting: { type: 'support', targetId: null } }), person('a', 'support'))).toBe(true);
  });
});

describe('posting pill', () => {
  const s = { week: 10, projects: [{ id: 'j1', kind: 'new', name: 'Inboxly' }], products: [] };
  it('names the project, the bench countdown, or idle', () => {
    expect(postingText(s, squad()).text).toBe('on Inboxly');
    expect(postingText(s, squad({ posting: { type: 'idle', targetId: null }, benchUntil: 12 })).text).toBe('benched · 2w left');
    expect(postingText(s, squad({ posting: { type: 'idle', targetId: null } })).text).toBe('idle');
  });
});

describe('suggested names', () => {
  it('skips names already in use', () => {
    const s = { squads: [{ name: SQUAD_NAMES[0] }, { name: SQUAD_NAMES[1] }] };
    expect(nextSquadName(s)).toBe(SQUAD_NAMES[2]);
    expect(nextSquadName(s, SQUAD_NAMES[2])).toBe(SQUAD_NAMES[3]);
  });
});
