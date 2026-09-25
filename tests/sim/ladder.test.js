import { describe, it, expect } from 'vitest';
import { createGame, dispatch, tick } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { ladderSystem, petComfort, rivalPressure } from '../../src/sim/ladder.js';
import { raiseDecision, eligibleEvents } from '../../src/sim/events.js';
import { weeklyCosts } from '../../src/sim/economy.js';
import { competition } from '../../src/sim/products.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { staffUpkeep } from '../../src/sim/staff.js';
import { knowledgeSystem } from '../../src/sim/knowledge.js';
import { classicGame, addStaff, addProduct, addDesks, offeredEvents } from './helpers.js';

const step = (s) => { const c = makeCtx(s); ladderSystem(c); return c.events; };
const choose = (s, label) => {
  const i = EVENTS[s.pendingDecision.eventId].choices.findIndex((c) => c.label === label);
  return dispatch(s, { type: 'resolveDecision', choice: i });
};

describe('lockdown and the work policy', () => {
  it('the office empties for ten weeks, then the company picks a policy once', () => {
    const s = classicGame(3);
    addDesks(s, 4);
    for (let i = 0; i < 2; i++) addStaff(s, 'engineer', 'mid');
    s.week = B.lockdownWeek - 1;
    step(s);
    expect(s.lockdown).toBe(null);
    s.week = B.lockdownWeek;
    step(s);
    expect(s.lockdown).toEqual({ since: B.lockdownWeek, until: B.lockdownWeek + B.lockdownWeeks, stayerId: expect.any(String) });
    expect(s.pendingDecision.eventId).toBe('lockdown_start');
    const stayer = s.staff.find((p) => p.id === s.lockdown.stayerId);
    expect(s.pendingDecision.text).toContain(stayer.name);
    choose(s, 'Laptops and a stipend for everyone');
    for (const p of s.staff) expect(p.remote).toBe(p.id !== stayer.id);
    s.week = s.lockdown.until;
    step(s);
    expect(s.staff.every((p) => !p.remote)).toBe(true);
    expect(s.pendingDecision?.eventId ?? s.scheduled.at(-1)?.payload.eventId).toBe('work_policy');
    s.pendingDecision = null;
    s.scheduled = [];
    s.week++;
    step(s);
    expect(s.pendingDecision).toBe(null);
    expect(s.scheduled).toEqual([]);
  });

  it('remote-first cuts the rent, widens hiring, keeps many people home but not the core', () => {
    const s = classicGame(5);
    s.flags.lockdownWeek = -1;
    addDesks(s, 4);
    for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'mid');
    const rent = weeklyCosts(s).rent;
    raiseDecision(makeCtx(s), 'work_policy');
    choose(s, 'Remote-first');
    expect(s.workPolicy).toBe('remote');
    expect(weeklyCosts(s).rent).toBe(rent * B.remoteRentMult);
    let remoteWeeks = 0;
    let changes = 0;
    const hires = s.staff.filter((p) => !p.founder);
    let last = hires.map((p) => p.remote);
    for (let w = 0; w < 104; w++) {
      s.week++;
      step(s);
      remoteWeeks += hires.filter((p) => p.remote).length;
      for (const p of s.staff) if (p.founder) expect(p.remote).toBe(false);
      const now = hires.map((p) => p.remote);
      changes += now.filter((r, i) => r !== last[i]).length;
      last = now;
    }
    expect(remoteWeeks / (104 * hires.length)).toBeGreaterThan(0.45);
    expect(remoteWeeks / (104 * hires.length)).toBeLessThan(0.85);
    // Patterns are sticky: at most one change per person every 8 weeks.
    expect(changes).toBeLessThanOrEqual(hires.length * Math.ceil(104 / 8));
    s.week = 200;
    tick(s);
    expect(s.candidates.length).toBe(B.candidateCount + B.remoteExtraCandidates);
  });

  it('a remote mentee learns more slowly than one in the office', () => {
    const gain = (remote) => {
      const s = classicGame(2);
      const mentor = addStaff(s, 'engineer', 'senior');
      const junior = addStaff(s, 'engineer', 'junior', { remote, assignment: { type: 'maintenance', targetId: null } });
      mentor.assignment = { type: 'mentor', targetId: junior.id };
      const xp = junior.xp;
      const knowledge = junior.knowledge;
      const c = makeCtx(s);
      staffUpkeep(c);
      knowledgeSystem(c);
      return { xp: junior.xp - xp, knowledge: junior.knowledge - knowledge };
    };
    const office = gain(false);
    const home = gain(true);
    expect(home.xp).toBeCloseTo(office.xp * B.remoteLearningMult);
    expect(home.knowledge).toBeLessThan(office.knowledge);
  });
});

describe('office pets', () => {
  it('a dog arrives by decision, lifts recovery while its owner is in, and leaves with its owner; a cat stays', () => {
    const s = classicGame(4);
    addDesks(s, 4);
    for (let i = 0; i < 5; i++) addStaff(s, 'engineer', 'mid');
    s.week = 150;
    s.stats.launches = 2;
    addProduct(s, { model: null, angle: 'web' });
    expect(offeredEvents(s)).not.toContain('pet_request');
    s.workPolicy = 'office';
    expect(offeredEvents(s)).toContain('pet_request');
    const owner = s.staff.find((p) => !p.founder);
    raiseDecision(makeCtx(s), 'pet_request', owner.id);
    choose(s, 'Yes, dogs welcome');
    expect(s.pets).toEqual([{ id: expect.any(String), species: 'dog', name: expect.any(String), ownerId: owner.id, arrivedWeek: 150 }]);
    expect(petComfort(s)).toBeCloseTo(B.petMeaningRecovery);
    owner.remote = true;
    expect(petComfort(s)).toBe(0);
    owner.remote = false;
    s.pets.push({ id: 'c1', species: 'cat', name: 'Null', ownerId: owner.id, arrivedWeek: 150 });
    s.staff = s.staff.filter((p) => p !== owner);
    step(s);
    expect(s.pets).toEqual([expect.objectContaining({ species: 'cat', ownerId: null })]);
    expect(petComfort(s)).toBeCloseTo(B.petMeaningRecovery);
  });
});

describe('the rival', () => {
  it('appears after the second launch from 2021, presses on its category, and can be hurt', () => {
    const s = classicGame(6);
    s.flags.lockdownWeek = -1;
    const p = addProduct(s, { model: null, angle: 'web', category: 'notes' });
    s.stats.launches = 2;
    s.week = B.rivalFromWeek - 1;
    step(s);
    expect(s.rival).toBe(null);
    s.week = B.rivalFromWeek;
    const ev = step(s);
    expect(s.rival).toMatchObject({ name: expect.any(String), founderName: expect.any(String), categoryId: 'notes', strength: B.rivalStartStrength, status: 'rising' });
    expect(ev.some((e) => e.type === 'chat' && e.from === '@newsbot' && e.text.includes(s.rival.name))).toBe(true);
    expect(s.pendingDecision.eventId).toBe('rival_appears');
    expect(s.pendingDecision.text).toContain(s.rival.name);
    expect(s.pendingDecision.text).toContain(s.rival.founderName);
    const withRival = competition(s, p).incumbent;
    expect(rivalPressure(s, 'notes')).toBeGreaterThan(0);
    expect(rivalPressure(s, 'email')).toBe(0);
    const strength = s.rival.strength;
    s.pendingDecision = null;
    delete s.flags.lastDecisionWeek;
    raiseDecision(makeCtx(s), 'rival_jab');
    choose(s, 'Poach one of their people');
    expect(s.rival.strength).toBe(Math.max(0, strength - 15));
    expect(competition(s, p).incumbent).toBeLessThan(withRival);
  });

  it('its story resolves in the Consolidation era; a merger brings its customers over', () => {
    const outcomes = new Set();
    for (let seed = 1; seed <= 12; seed++) {
      const s = classicGame(seed);
      s.flags.lockdownWeek = -1;
      const p = addProduct(s, { model: null, angle: 'web', category: 'notes', customers: 1000 });
      s.stats.launches = 2;
      s.week = B.rivalFromWeek;
      step(s);
      s.pendingDecision = null;
      s.era = { id: 'consolidation', since: 600 };
      s.week = 600 + B.rivalFateAfterWeeks;
      s.cash = 1e6;
      step(s);
      if (s.rival.status === 'rising' || s.rival.status === 'stalled') {
        expect(s.pendingDecision?.eventId).toBe('rival_merge');
        choose(s, 'Merge');
        expect(p.customers).toBe(Math.floor(1000 * (1 + B.rivalMergeCustomers)));
      }
      outcomes.add(s.rival.status);
      expect(rivalPressure(s, 'notes')).toBe(0);
    }
    expect([...outcomes].sort()).toEqual(['acquired', 'dead', 'merged']);
  });
});

describe('a whole run with the ladder is deterministic and JSON-safe', () => {
  it('same seed, same story', () => {
    const play = () => {
      const s = createGame({ seed: 12 });
      s.cash = 1e7;
      addDesks(s, 6);
      for (let i = 0; i < 5; i++) addStaff(s, 'engineer', 'mid');
      for (let w = 0; w < 200; w++) {
        for (let c = 0; c < 4 && s.pendingDecision; c++) dispatch(s, { type: 'resolveDecision', choice: c });
        tick(s);
        s.cash = Math.max(s.cash, 1e6);
      }
      return s;
    };
    const a = play();
    const b = play();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(a.workPolicy).not.toBe(null);
    expect(a.flags.lockdownWeek).toBe(B.lockdownWeek);
  });
});

describe('chunk (a) fixes', () => {
  it('the legacy office dog event is gone; pets only come through adoption', async () => {
    const { EVENTS: E } = await import('../../src/data/events.js');
    expect(E.office_dog).toBeUndefined();
  });

  it('lockdown lines only talk about plants when the office has some', () => {
    const lines = (withPlant) => {
      const s = classicGame(3);
      if (withPlant) s.office.placed.push({ id: 'pl', itemId: 'plant', level: 1, x: 0, y: 0, rot: 0 });
      s.week = B.lockdownWeek;
      const out = [...step(s)];
      s.pendingDecision = null;
      s.week++;
      out.push(...step(s));
      return out.filter((e) => e.text).map((e) => e.text).join(' ');
    };
    expect(lines(false)).not.toMatch(/plant/i);
    expect(lines(true)).toMatch(/plant/i);
  });

  it('a departing owner takes the dog home in the same tick', async () => {
    const { removeStaff } = await import('../../src/sim/staff.js');
    const s = classicGame(2);
    const owner = addStaff(s, 'engineer', 'mid');
    s.pets.push({ id: 'd', species: 'dog', name: 'Biscuit', ownerId: owner.id, arrivedWeek: 0 }, { id: 'c', species: 'cat', name: 'Null', ownerId: owner.id, arrivedWeek: 0 });
    removeStaff(s, owner);
    expect(s.pets).toEqual([expect.objectContaining({ species: 'cat', ownerId: null })]);
  });
});

describe('video calls', () => {
  it('lockdown weeks put everyone on a call with glitch flags, and calls have their moments', () => {
    const s = classicGame(4);
    for (let i = 0; i < 4; i++) addStaff(s, 'engineer', 'mid');
    s.week = B.lockdownWeek;
    let moments = 0;
    let flags = 0;
    for (let w = 0; w < B.lockdownWeeks; w++) {
      const ev = step(s);
      s.pendingDecision = null;
      for (const p of s.staff) {
        expect(p.call).toEqual({ muted: expect.any(Boolean), frozen: expect.any(Boolean), badCamera: expect.any(Boolean) });
        flags += p.call.muted + p.call.frozen + p.call.badCamera;
      }
      const says = ev.filter((e) => e.type === 'say' && e.replyTo);
      if (says.length) moments++;
      s.week++;
    }
    expect(moments).toBeGreaterThanOrEqual(3);
    expect(flags).toBeGreaterThan(5);
    s.week = s.lockdown.until + 1;
    s.workPolicy = 'office';
    step(s);
    expect(s.staff.every((p) => p.call === null)).toBe(true);
  });
});

describe('voices', () => {
  it('every person gets a voice that agrees with their name, spread across variants', async () => {
    const { NAME_VOICE } = await import('../../src/data/names.js');
    const s = classicGame(7);
    for (let i = 0; i < 12; i++) addStaff(s, 'engineer', 'mid');
    const variants = new Set();
    for (const p of [...s.staff, ...s.candidates]) {
      expect(['fem', 'masc']).toContain(p.voice.set);
      const named = NAME_VOICE[p.name.split(' ')[0]];
      if (named) expect(p.voice.set).toBe(named);
      expect(Number.isInteger(p.voice.variant) && p.voice.variant >= 0 && p.voice.variant <= 7).toBe(true);
      expect(Math.abs(p.voice.pitch)).toBeLessThanOrEqual(1);
      variants.add(p.voice.variant);
    }
    expect(variants.size).toBeGreaterThanOrEqual(6);
  });
});
