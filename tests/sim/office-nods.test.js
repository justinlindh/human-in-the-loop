import { describe, it, expect } from 'vitest';
import { dispatch } from '../../src/sim/index.js';
import { makeCtx } from '../../src/sim/registry.js';
import { raiseDecision, eligibleEvents, resolveSubjects } from '../../src/sim/events.js';
import { processScheduled } from '../../src/sim/effects.js';
import { propsSystem } from '../../src/sim/props.js';
import { removeStaff } from '../../src/sim/staff.js';
import { B } from '../../src/sim/balance.js';
import { EVENTS } from '../../src/data/events.js';
import { OFFICE_NODS, cuttable, consultantRating } from '../../src/data/office-nods.js';
import { game, passOfficeGates, addStaff } from './helpers.js';

const N = B.nods;
const IDS = OFFICE_NODS.map((e) => e.id);

// A company on the office floor with n staff, all hired long enough ago to count as veterans.
function company(seed, n, week = 200) {
  const s = passOfficeGates(game(seed));
  s.cash = 1e7;
  dispatch(s, { type: 'upgradeOffice' });
  s.week = week;
  while (s.staff.length < n) addStaff(s, 'engineer', 'mid', { hiredWeek: 0 });
  for (const p of s.staff) { p.hiredWeek = 0; p.mood = 'ok'; }
  s.era = { id: week >= 526 ? 'consolidation' : 'classic', since: week };
  return s;
}
const raise = (s, id, subjectId = null) => { delete s.flags.lastDecisionWeek; s.pendingDecision = null; return raiseDecision(makeCtx(s), id, subjectId); };
const choose = (s, label) => {
  const i = EVENTS[s.pendingDecision.eventId].choices.findIndex((c) => c.label === label);
  expect(i).toBeGreaterThanOrEqual(0);
  const r = dispatch(s, { type: 'resolveDecision', choice: i });
  return { r, events: r.events };
};
// Runs the scheduled effects week by week and collects the Yak posts they make.
function weeksOfChat(s, weeks) {
  const posts = [];
  for (let w = 0; w < weeks; w++) {
    s.week++;
    const ctx = makeCtx(s);
    processScheduled(ctx);
    posts.push(...ctx.events.filter((e) => e.type === 'chat'));
  }
  return posts;
}

describe('issue #339: office classics', () => {
  it('all six are random, once a run, and use the literal classics', () => {
    expect(IDS).toEqual(['banner_company', 'cover_sheets', 'the_stapler', 'efficiency_consultants', 'printer_jam', 'saturday_ask']);
    for (const ev of OFFICE_NODS) {
      expect(EVENTS[ev.id]).toBe(ev);
      expect(ev.random).toBe(true);
      expect(ev.cooldownWeeks).toBeGreaterThanOrEqual(10000);
    }
    const all = JSON.stringify(OFFICE_NODS.map((e) => [e.title, e.text, e.choices]));
    for (const phrase of ['TPS report', 'PC LOAD LETTER', 'what would you say you do here', 'Is This Good For The Company', 'that would be great', 'Case closed']) {
      expect(all.toLowerCase()).toContain(phrase.toLowerCase());
    }
  });

  it('the banner and consultants only run in Consolidation; the rest run in any era', () => {
    const early = company(1, 16, 200);
    const late = company(1, 16, 560);
    const ids = (s) => eligibleEvents(s).map((e) => e.id).filter((id) => IDS.includes(id));
    expect(ids(early).sort()).toEqual(['cover_sheets', 'printer_jam', 'saturday_ask', 'the_stapler']);
    expect(ids(late).sort()).toEqual([...IDS].sort());
  });

  it('once fired, an event never comes back in the same run', () => {
    const s = company(2, 16, 560);
    s.flags.cd_printer_jam = s.week + EVENTS.printer_jam.cooldownWeeks;
    s.week += 600;
    expect(eligibleEvents(s).map((e) => e.id)).not.toContain('printer_jam');
  });

  it('banner: hanging it leaves the banner on the wall; ironically sometimes costs a little brand', () => {
    const s = company(3, 13, 560);
    raise(s, 'banner_company', s.staff[1].id);
    expect(s.pendingDecision.stage).toMatchObject({ prop: 'banner_company', anchor: 'wall', y: 0 });
    choose(s, 'Hang it');
    expect(s.office.props.map((p) => p.prop)).toEqual(['banner_company']);
    expect(s.modifiers.filter((m) => m.source === 'banner_company').map((m) => m.key).sort()).toEqual(['meaningDrain', 'output']);
    let missed = 0;
    for (let seed = 1; seed <= 60; seed++) {
      const t = company(seed, 13, 560);
      t.brand = 50;
      raise(t, 'banner_company', t.staff[1].id);
      choose(t, 'Hang it, ironically');
      if (t.brand < 50) missed++;
    }
    expect(missed).toBeGreaterThan(3);
    expect(missed).toBeLessThan(25);
  });

  it('cover sheets: mandating it sends {name} three memos from facilities, a week apart', () => {
    const s = company(4, 9);
    const who = s.staff.find((p) => !p.founder);
    raise(s, 'cover_sheets', who.id);
    expect(s.pendingDecision.stage).toMatchObject({ prop: 'cover_sheets', anchor: 'subjectDesk' });
    choose(s, 'Mandate it');
    const posts = weeksOfChat(s, 4);
    const first = who.name.split(' ')[0];
    expect(posts.map((p) => p.from)).toEqual(['@facilities', '@facilities', '@facilities']);
    expect(new Set(posts.map((p) => p.week)).size).toBe(3);
    for (const p of posts) expect(p.text).toContain(first);
    expect(posts[0].text).toContain('TPS');
  });

  it('stapler: only veterans have one; standardizing craters their meaning and the stapler comes back later', () => {
    const s = company(5, 6);
    const fresh = addStaff(s, 'designer', 'junior', { hiredWeek: s.week - 10 });
    expect(resolveSubjects(s, EVENTS.the_stapler).map((p) => p.id)).not.toContain(fresh.id);
    const who = s.staff.find((p) => !p.founder && p.id !== fresh.id);
    who.meaning = 70;
    raise(s, 'the_stapler', who.id);
    choose(s, 'Standardize the staplers');
    expect(who.meaning).toBe(70 - N.staplerLoss);
    const posts = weeksOfChat(s, N.staplerBackWeeks);
    expect(who.meaning).toBe(70 - N.staplerLoss + N.staplerBack);
    expect(posts.at(-1).text).toMatch(/They are keeping it\. Case closed\.$/);
  });

  it('stapler: keeping it leaves the stapler on their desk until they leave', () => {
    const s = company(6, 6);
    const who = s.staff.find((p) => !p.founder);
    raise(s, 'the_stapler', who.id);
    choose(s, 'Let them keep it');
    expect(s.office.props.map((p) => p.prop)).toEqual(['stapler']);
    propsSystem(makeCtx(s));
    expect(s.office.props).toHaveLength(1);
    removeStaff(s, who);
    propsSystem(makeCtx(s));
    expect(s.office.props).toEqual([]);
  });

  it('consultants: never a founder or a recent hire, need three eligible, and cut the two rated lowest through the resign flow', () => {
    const s = company(7, 16, 560);
    for (const p of s.staff.filter((x) => !x.founder).slice(0, 4)) p.hiredWeek = s.week - 5;
    const eligible = cuttable(s);
    expect(eligible.some((p) => p.founder || s.week - p.hiredWeek < N.consultantNewHireWeeks)).toBe(false);
    const expected = [...eligible].sort((a, b) => consultantRating(a) - consultantRating(b)).slice(0, 2).map((p) => p.id);
    raise(s, 'efficiency_consultants');
    expect(s.flags.layoffWeek).toBe(s.week);
    const cash = s.cash;
    const { events } = choose(s, 'Let them work');
    const gone = events.filter((e) => e.type === 'resign');
    expect(gone.map((e) => e.staffId).sort()).toEqual(expected.sort());
    for (const e of gone) expect(e).toMatchObject({ fired: true, reason: 'fired' });
    expect(s.staff.some((p) => expected.includes(p.id))).toBe(false);
    expect(s.cash).toBe(cash - N.consultantFee);

    const few = company(8, 16, 560);
    for (const p of few.staff.filter((x) => !x.founder).slice(2)) p.hiredWeek = few.week - 1;
    expect(cuttable(few).length).toBe(2);
    expect(eligibleEvents(few).map((e) => e.id)).not.toContain('efficiency_consultants');
  });

  it('consultants wait a year after any layoff', () => {
    const s = company(9, 16, 560);
    s.flags.layoffWeek = s.week - N.layoffGapWeeks + 1;
    expect(EVENTS.efficiency_consultants.when(s)).toBe(false);
    s.flags.layoffWeek = s.week - N.layoffGapWeeks;
    expect(EVENTS.efficiency_consultants.when(s)).toBe(true);
  });

  it('printer: needs the office floor; taking it out back leaves the wreck for a few weeks', () => {
    const garage = game(10);
    expect(EVENTS.printer_jam.when(garage)).toBe(false);
    const s = company(10, 6);
    raise(s, 'printer_jam', s.staff[0].id);
    expect(s.pendingDecision.stage.prop).toBe('printer_jammed');
    const cash = s.cash;
    choose(s, 'Take it out back');
    expect(s.cash).toBe(cash - N.printerCost);
    expect(s.office.props.map((p) => p.prop)).toEqual(['printer_wrecked']);
    s.week += N.printerWreckWeeks;
    propsSystem(makeCtx(s));
    expect(s.office.props).toEqual([]);
  });

  it('Saturday: saying yes strains everyone; saying no costs the asker a little', () => {
    const s = company(11, 10);
    const boss = addStaff(s, 'engineer', 'senior', { hiredWeek: 0 });
    for (const p of s.staff) { p.strain = 20; p.meaning = 60; }
    raise(s, 'saturday_ask', boss.id);
    choose(s, 'Saturday it is');
    for (const p of s.staff) expect(p.strain).toBe(20 + N.saturdayStrain);
    const t = company(12, 10);
    const asker = addStaff(t, 'engineer', 'senior', { hiredWeek: 0 });
    for (const p of t.staff) p.meaning = 60;
    raise(t, 'saturday_ask', asker.id);
    choose(t, 'No. Mmkay?');
    expect(asker.meaning).toBe(60 + N.saturdayNoTeam + N.saturdayNoSubject);
    expect(t.staff.find((p) => p !== asker).meaning).toBe(60 + N.saturdayNoTeam);
  });
});
