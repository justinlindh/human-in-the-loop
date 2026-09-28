import { describe, it, expect } from 'vitest';
import { dispatch, createGame, tick } from '../../src/sim/index.js';
import { saveGame, loadGame } from '../../src/save/save.js';
import { SQUAD_NAMES } from '../../src/data/squads.js';
import { B } from '../../src/sim/balance.js';
import { game, classicGame, addStaff, addDesks } from './helpers.js';

const floor = () => { const s = game(); s.officeStage = 1; addDesks(s, 8); s.unlocks.squads = 0; return s; };
const eng = (s, seniority = 'mid') => addStaff(s, 'engineer', seniority);
const make = (s, name, memberIds) => { const r = dispatch(s, { type: 'createSquad', name, memberIds }); return s.squads.find((x) => x.id === r.squadId); };
const project = (s) => { const r = dispatch(s, { type: 'startProject', kind: 'refactor' }); return s.projects.find((j) => j.id === r.projectId); };

describe('squads: state and actions (#938)', () => {
  it('a new game has no squads, and SQUAD_NAMES offers names', () => {
    expect(createGame({ seed: 1, companyName: 'A' }).squads).toEqual([]);
    expect(SQUAD_NAMES.length).toBeGreaterThanOrEqual(8);
  });

  it('unlocks the first week the company has the Office Floor or 8 people, and stays unlocked', () => {
    const s = classicGame();
    addDesks(s, 8);
    expect(dispatch(s, { type: 'createSquad', name: 'Core', memberIds: [s.staff[0].id] })).toMatchObject({ ok: false, reason: `Squads unlock with the Office Floor or ${B.squadUnlockStaff} people` });
    while (s.staff.length < B.squadUnlockStaff) eng(s);
    tick(s);
    expect(s.unlocks.squads).toBe(s.week - 1);
    s.staff = s.staff.slice(0, 3);
    tick(s);
    expect(dispatch(s, { type: 'createSquad', name: 'Core', memberIds: [s.staff[0].id] }).ok).toBe(true);
  });

  it('creates, renames, sets a lead, and refuses bad input', () => {
    const s = floor();
    const [a, b, c] = [eng(s), eng(s), eng(s, 'senior')];
    const r = dispatch(s, { type: 'createSquad', name: '  Core  ', memberIds: [a.id, b.id, c.id] });
    expect(r.ok).toBe(true);
    const sq = s.squads.find((x) => x.id === r.squadId);
    expect(sq).toMatchObject({ name: 'Core', memberIds: [a.id, b.id, c.id], leadId: null, posting: { type: 'idle', targetId: null }, afterLaunch: 'upkeep', benchUntil: null, cohesion: 0, formedWeek: s.week });
    expect(dispatch(s, { type: 'createSquad', name: '', memberIds: [a.id] })).toMatchObject({ ok: false, reason: 'Name the squad' });
    expect(dispatch(s, { type: 'createSquad', name: 'X', memberIds: [] })).toMatchObject({ ok: false, reason: 'A squad has 1 to 8 people' });
    expect(dispatch(s, { type: 'createSquad', name: 'X', memberIds: ['nobody'] })).toMatchObject({ ok: false, reason: 'No such staff member' });
    expect(dispatch(s, { type: 'renameSquad', squadId: sq.id, name: 'Platform' }).ok).toBe(true);
    expect(sq.name).toBe('Platform');
    expect(dispatch(s, { type: 'setSquadLead', squadId: sq.id, staffId: c.id }).ok).toBe(true);
    expect(sq.leadId).toBe(c.id);
    expect(dispatch(s, { type: 'setSquadLead', squadId: sq.id, staffId: s.staff[0].id })).toMatchObject({ ok: false, reason: 'Not in this squad' });
    expect(dispatch(s, { type: 'setSquadAfterLaunch', squadId: sq.id, mode: 'maintenance' }).ok).toBe(true);
    expect(sq.afterLaunch).toBe('maintenance');
    expect(dispatch(s, { type: 'setSquadAfterLaunch', squadId: sq.id, mode: 'nap' }).ok).toBe(false);
  });

  it('a person is in one squad: joining another moves them and halves the old cohesion', () => {
    const s = floor();
    const [a, b] = [eng(s), eng(s)];
    const one = make(s, 'One', [a.id, b.id]);
    one.cohesion = 0.8;
    const two = make(s, 'Two', [b.id]);
    expect(one.memberIds).toEqual([a.id]);
    expect(two.memberIds).toEqual([b.id]);
    expect(one.cohesion).toBeCloseTo(0.4);
    two.cohesion = 0.6;
    dispatch(s, { type: 'setSquadMembers', squadId: two.id, memberIds: [b.id, a.id] });
    expect(two.cohesion).toBeCloseTo(0.3);
    expect(one.memberIds).toEqual([]);
  });

  it('at most 6 squads', () => {
    const s = floor();
    for (let i = 0; i < B.squadMax; i++) expect(dispatch(s, { type: 'createSquad', name: `S${i}`, memberIds: [eng(s).id] }).ok).toBe(true);
    expect(dispatch(s, { type: 'createSquad', name: 'Seven', memberIds: [eng(s).id] })).toMatchObject({ ok: false, reason: 'Up to 6 squads' });
  });

  it('postSquad assigns everyone who can take it and reports the rest', () => {
    const s = floor();
    const a = eng(s);
    const b = eng(s);
    const d = addStaff(s, 'designer', 'mid');
    const sq = make(s, 'Core', [a.id, b.id, d.id]);
    const j = project(s);
    const r = dispatch(s, { type: 'postSquad', squadId: sq.id, posting: { type: 'project', targetId: j.id } });
    expect(r.ok).toBe(true);
    expect(r.placed.sort()).toEqual([a.id, b.id, d.id].sort());
    expect(a.assignment).toEqual({ type: 'project', targetId: j.id });
    expect(sq.posting).toEqual({ type: 'project', targetId: j.id });
    const m = dispatch(s, { type: 'postSquad', squadId: sq.id, posting: { type: 'maintenance', targetId: null } });
    expect(m.placed.sort()).toEqual([a.id, b.id].sort());
    expect(m.skipped.map((x) => x.staffId)).toEqual([d.id]);
    expect(typeof m.skipped[0].reason).toBe('string');
    const only = make(s, 'Pixels', [d.id]);
    expect(dispatch(s, { type: 'postSquad', squadId: only.id, posting: { type: 'maintenance', targetId: null } }).ok).toBe(false);
  });

  it('a plain assign leaves the member in the squad; disband keeps their work', () => {
    const s = floor();
    const [a, b] = [eng(s), eng(s)];
    const sq = make(s, 'Core', [a.id, b.id]);
    dispatch(s, { type: 'postSquad', squadId: sq.id, posting: { type: 'maintenance', targetId: null } });
    dispatch(s, { type: 'assign', staffId: a.id, assignment: { type: 'idle', targetId: null } });
    expect(sq.memberIds).toContain(a.id);
    expect(dispatch(s, { type: 'disbandSquad', squadId: sq.id }).ok).toBe(true);
    expect(s.squads).toEqual([]);
    expect(b.assignment.type).toBe('maintenance');
    expect(dispatch(s, { type: 'disbandSquad', squadId: sq.id })).toMatchObject({ ok: false, reason: 'No such squad' });
  });

  it('a departure leaves the squad and clears the lead; the empty squad stays', () => {
    const s = floor();
    const a = eng(s, 'senior');
    const sq = make(s, 'Core', [a.id]);
    dispatch(s, { type: 'setSquadLead', squadId: sq.id, staffId: a.id });
    dispatch(s, { type: 'fire', staffId: a.id });
    expect(sq.memberIds).toEqual([]);
    expect(sq.leadId).toBe(null);
    expect(s.squads.length).toBe(1);
  });

  it('squads survive save and load; an old save without them loads with none', () => {
    const store = (() => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; })();
    const s = createGame({ seed: 2, companyName: 'Keep' });
    s.officeStage = 1;
    s.unlocks.squads = 0;
    dispatch(s, { type: 'createSquad', name: 'Core', memberIds: [s.staff[0].id] });
    saveGame(s, store);
    expect(loadGame(store).state.squads).toEqual(s.squads);
    const old = createGame({ seed: 3, companyName: 'Old' });
    delete old.squads;
    saveGame(old, store);
    const res = loadGame(store, old.flags.saveSlot);
    expect(res.ok).toBe(true);
    expect(res.state.squads).toEqual([]);
    tick(res.state);
  });
});
