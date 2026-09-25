import { describe, it, expect } from 'vitest';
import { dispatch, tick, securityPosture } from '../../src/sim/index.js';
import { itemBonus, researchBonus } from '../../src/sim/bonus.js';
import { staffMods, staffUpkeep, outputMult, generateStaff } from '../../src/sim/staff.js';
import { productsSystem } from '../../src/sim/products.js';
import { meaningSystem } from '../../src/sim/meaning.js';
import { knowledgeSystem, institutionalKnowledge } from '../../src/sim/knowledge.js';
import { marketingSystem } from '../../src/sim/marketing.js';
import { workSystem } from '../../src/sim/work.js';
import { oversightProvided } from '../../src/sim/automation.js';
import { rogueRisk, fixCapacity } from '../../src/sim/incidents.js';
import { projectsSystem } from '../../src/sim/projects.js';
import { makeCtx } from '../../src/sim/registry.js';
import { B } from '../../src/sim/balance.js';
import { ITEMS } from '../../src/data/items.js';
import { RESEARCH } from '../../src/data/research.js';
import { PATHS } from '../../src/data/paths.js';
import { TRAINING } from '../../src/data/training.js';
import { OFFICE_STAGES } from '../../src/data/office.js';
import { game, addStaff, addProduct, expectFail, withoutGrind, withItem, placeAction, passOfficeGates } from './helpers.js';

const once = (s, sys) => { const c = makeCtx(s); sys(c); return c.events; };
const walkFinite = (v, p = 's') => {
  if (typeof v === 'number') expect(Number.isFinite(v), p).toBe(true);
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) walkFinite(x, `${p}.${k}`);
};

describe('office shop', () => {
  it('uses the exact item ids the art lane modeled', () => {
    const shop = Object.values(ITEMS).filter((i) => i.kind === 'shop');
    expect(shop.map((i) => i.id).sort()).toEqual(['arcade', 'espresso', 'library', 'monitoring_wall', 'nap_pod', 'plant_wall', 'server_rack', 'standing_desk', 'trophy_case', 'whiteboard_wall']);
    for (const it of shop) {
      expect(it.costs).toHaveLength(3);
      expect(it.effects).toHaveLength(3);
      expect(it.costs[0]).toBeLessThanOrEqual(8000);
      expect(it.costs[1]).toBeGreaterThan(it.costs[0] * 2);
    }
    const furniture = Object.values(ITEMS).filter((i) => i.kind === 'furniture');
    expect(furniture.map((i) => i.id).sort()).toEqual(['bookshelf', 'coffee_corner', 'couch', 'desk', 'foosball', 'meeting_table', 'ping_pong_table', 'plant', 'whiteboard']);
    for (const it of furniture) expect(it.costs).toHaveLength(1);
  });

  it('buy, upgrade, and sell with every reason', () => {
    const s = game();
    s.cash = 1e6;
    expectFail(expect, dispatch, s, { type: 'placeItem', itemId: 'jacuzzi', x: 0, y: 0, rot: 0 }, 'Unknown item');
    expectFail(expect, dispatch, s, placeAction(s, 'nap_pod'), 'Needs a bigger office');
    expectFail(expect, dispatch, s, placeAction(s, 'trophy_case'), 'Needs an award first');
    const at = placeAction(s, 'espresso');
    const res = dispatch(s, at);
    expect(res.ok).toBe(true);
    expect(s.office.placed.at(-1)).toEqual({ id: res.id, itemId: 'espresso', level: 1, x: at.x, y: at.y, rot: at.rot });
    expect(s.cash).toBe(1e6 - ITEMS.espresso.costs[0]);
    const second = dispatch(s, placeAction(s, 'espresso'));
    expect(second.ok).toBe(true);
    expectFail(expect, dispatch, s, placeAction(s, 'espresso'), 'You already have two');
    dispatch(s, { type: 'sellItem', id: second.id });
    expect(dispatch(s, { type: 'upgradeItem', id: res.id }).ok).toBe(true);
    expect(dispatch(s, { type: 'upgradeItem', id: res.id }).ok).toBe(true);
    expectFail(expect, dispatch, s, { type: 'upgradeItem', id: res.id }, 'Already max level');
    expectFail(expect, dispatch, s, { type: 'upgradeItem', id: 'nope' }, 'No such item');
    const desk = s.office.placed.find((p) => p.itemId === 'desk');
    expectFail(expect, dispatch, s, { type: 'upgradeItem', id: desk.id }, 'Nothing to upgrade');
    const cash = s.cash;
    expect(dispatch(s, { type: 'sellItem', id: res.id }).ok).toBe(true);
    expect(s.cash).toBe(cash + (ITEMS.espresso.costs[0] + ITEMS.espresso.costs[1] + ITEMS.espresso.costs[2]) / 2);
    expect(s.office.placed.find((i) => i.id === res.id)).toBeUndefined();
    const pw = dispatch(s, placeAction(s, 'plant_wall'));
    s.cash = 10;
    expectFail(expect, dispatch, s, placeAction(s, 'whiteboard_wall'), 'Not enough cash');
    expectFail(expect, dispatch, s, { type: 'upgradeItem', id: pw.id }, 'Not enough cash');
  });

  it('a second copy of an item gives half its effect', () => {
    const s = withItem(withItem(game(), 'library', 2), 'library', 1);
    expect(itemBonus(s, 'knowledgeGain')).toBeCloseTo(ITEMS.library.effects[1].knowledgeGain + 0.5 * ITEMS.library.effects[0].knowledgeGain);
    const t = withItem(withItem(game(), 'library', 1), 'library', 2);
    expect(itemBonus(t, 'knowledgeGain')).toBeCloseTo(itemBonus(s, 'knowledgeGain'));
  });

  it('itemBonus sums the table value at each level', () => {
    for (const it of Object.values(ITEMS).filter((i) => i.kind === 'shop')) {
      for (let level = 1; level <= 3; level++) {
        const s = withItem(game(), it.id, level);
        for (const [k, v] of Object.entries(it.effects[level - 1])) expect(itemBonus(s, k)).toBeCloseTo(v);
      }
    }
  });

  it('each item changes its system', () => {
    const pair = (itemId, level = 3) => [game(7), withItem(game(7), itemId, level)];

    let [a, b] = pair('espresso');
    for (const s of [a, b]) { s.staff[0].stamina = 50; s.staff[0].assignment = { type: 'idle', targetId: null }; once(s, staffUpkeep); }
    expect(b.staff[0].stamina - 50).toBeCloseTo((a.staff[0].stamina - 50) * 1.45);

    [a, b] = pair('standing_desk');
    for (const s of [a, b]) { s.staff[0].traits = []; s.staff[0].assignment = { type: 'maintenance', targetId: null }; once(s, staffUpkeep); }
    expect(100 - b.staff[0].stamina).toBeCloseTo((100 - a.staff[0].stamina) * 0.7);

    [a, b] = pair('plant_wall');
    for (const s of [a, b]) { s.staff.forEach((p) => { p.traits = []; p.meaning = 50; p.assignment = { type: 'idle', targetId: null }; }); withoutGrind(B, () => once(s, meaningSystem)); }
    expect(b.staff[0].meaning - 50).toBeCloseTo((a.staff[0].meaning - 50) * 1.3);

    [a, b] = pair('arcade');
    for (const s of [a, b]) { s.staff.forEach((p) => { p.traits = []; p.meaning = 50; p.assignment = { type: 'idle', targetId: null }; }); withoutGrind(B, () => once(s, meaningSystem)); }
    expect(b.staff[0].meaning - 50).toBeCloseTo((a.staff[0].meaning - 50) * 1.35);

    [a, b] = pair('arcade');
    expect(outputMult(b, b.staff[0]) / outputMult(a, a.staff[0])).toBeCloseTo(0.96);

    [a, b] = pair('library');
    for (const s of [a, b]) { s.staff[0].assignment = { type: 'maintenance', targetId: null }; s.staff[0].knowledge = 20; once(s, knowledgeSystem); }
    expect(b.staff[0].knowledge - 20).toBeCloseTo((a.staff[0].knowledge - 20) * 1.45);

    [a, b] = pair('monitoring_wall');
    for (const s of [a, b]) s.staff[0].assignment = { type: 'oversight', targetId: null };
    expect(oversightProvided(b) / oversightProvided(a)).toBeCloseTo(1.45);

    [a, b] = pair('server_rack');
    for (const s of [a, b]) { addProduct(s, { customers: 4000, health: 50 }); s.ops.maintenanceCapacity = 3.5; once(s, productsSystem); }
    expect(b.ops.maintenanceShortfall).toBeLessThan(a.ops.maintenanceShortfall);
    expect(b.products[0].uptime).toBeGreaterThan(a.products[0].uptime);

    [a, b] = pair('trophy_case');
    for (const s of [a, b]) { s.brand = 50; once(s, marketingSystem); }
    expect(50 - b.brand).toBeCloseTo((50 - a.brand) * 0.55);

    [a, b] = pair('whiteboard_wall');
    for (const s of [a, b]) {
      dispatch(s, { type: 'startProject', kind: 'new', name: 'X', category: 'notes', angle: 'copilot', model: 'chatgbt', size: 'small' });
      for (const p of s.staff) p.assignment = { type: 'project', targetId: s.projects[0].id };
      const c = makeCtx(s); workSystem(c); projectsSystem(c);
    }
    expect(b.projects[0].stats.novelty / a.projects[0].stats.novelty).toBeCloseTo(1.15);
    expect(b.projects[0].progress).toBeCloseTo(a.projects[0].progress);
  });

  it('the nap pod delays burnout resignations', () => {
    const quits = (withPod) => {
      let n = 0;
      for (let seed = 1; seed <= 200; seed++) {
        const s = game(seed);
        if (withPod) withItem(s, 'nap_pod', 3);
        const p = addStaff(s, 'engineer', 'mid', { traits: [], meaning: 0, mood: 'burnout', burnoutWeeks: 3 });
        once(s, meaningSystem);
        if (!s.staff.includes(p)) n++;
      }
      return n;
    };
    expect(quits(false)).toBeGreaterThan(0);
    expect(quits(true)).toBeLessThan(quits(false));
  });
});

describe('research', () => {
  const research = (s, id) => dispatch(s, { type: 'startProject', kind: 'research', researchId: id });

  it('validates prerequisites and completion, then records it', () => {
    const s = game();
    expectFail(expect, dispatch, s, { type: 'startProject', kind: 'research', researchId: 'time_machine' }, 'Unknown research');
    expectFail(expect, dispatch, s, { type: 'startProject', kind: 'research', researchId: 'agent_sandbox' }, 'Requires Eval Harness');
    const res = research(s, 'eval_harness');
    expect(res.ok).toBe(true);
    const j = s.projects.find((x) => x.id === res.projectId);
    expect(j).toMatchObject({ kind: 'research', researchId: 'eval_harness', pointsNeeded: RESEARCH.eval_harness.points });
    expectFail(expect, dispatch, s, { type: 'startProject', kind: 'research', researchId: 'eval_harness' }, 'Already in progress');
    for (const p of s.staff) p.assignment = { type: 'project', targetId: j.id };
    const events = [];
    for (let w = 0; w < 80 && s.projects.length; w++) { const c = makeCtx(s); workSystem(c); projectsSystem(c); events.push(...c.events); s.week++; }
    expect(s.research.done).toEqual(['eval_harness']);
    expect(events.some((e) => e.type === 'chat' && e.channel === 'wins')).toBe(true);
    expectFail(expect, dispatch, s, { type: 'startProject', kind: 'research', researchId: 'eval_harness' }, 'Already researched');
    expect(research(s, 'agent_sandbox').ok).toBe(true);
  });

  it('research points are within 300 to 800', () => {
    for (const r of Object.values(RESEARCH)) {
      expect(r.points).toBeGreaterThanOrEqual(300);
      expect(r.points).toBeLessThanOrEqual(800);
      if (r.requires) expect(RESEARCH[r.requires]).toBeDefined();
    }
  });

  it('each research effect applies', () => {
    const done = (ids) => { const s = game(3); s.research.done = ids; return s; };
    const a = done([]);
    a.automation.engineering = { level: 1, model: 'grokk' };
    const b = done(['eval_harness']);
    b.automation.engineering = { level: 1, model: 'grokk' };
    expect(rogueRisk(b, 'engineering') / rogueRisk(a, 'engineering')).toBeCloseTo(0.75);
    expect(researchBonus(done(['eval_harness', 'agent_sandbox']), 'rogueDamage')).toBeCloseTo(-0.4);
    expect(fixCapacity(done(['observability'])) / fixCapacity(done([]))).toBeCloseTo(1.4);
    expect(securityPosture(done(['red_team_suite'])) - securityPosture(done([]))).toBeCloseTo(10);
    const ik0 = done([]); addProduct(ik0);
    const ik1 = done(['docs_culture']); addProduct(ik1);
    expect(institutionalKnowledge(ik1) / institutionalKnowledge(ik0)).toBeCloseTo(1.1);
    const kit = done(['docs_culture', 'onboarding_kit']);
    kit.cash = 1e6;
    const c = kit.candidates[0];
    dispatch(kit, { type: 'hire', candidateId: c.id });
    expect(kit.staff.find((p) => p.id === c.id).knowledge).toBe(B.newHireKnowledge + 15);
    const hd0 = done([]); const hd1 = done(['ci_cd']);
    for (const s of [hd0, hd1]) { addProduct(s, { health: 90 }); s.ops.maintenanceCapacity = 0; once(s, productsSystem); }
    expect(90 - hd1.products[0].health).toBeCloseTo((90 - hd0.products[0].health) * 0.8);
  });
});

describe('career paths and legends', () => {
  it('promotion to senior sets pathPending, and choosePath validates and clears it', () => {
    const s = game();
    const p = addStaff(s, 'engineer', 'mid', { traits: [], level: 9, xp: 539 });
    const ev = once(s, staffUpkeep);
    expect(p.seniority).toBe('senior');
    expect(p.pathPending).toBe(true);
    expect(ev.some((e) => e.type === 'toast' && e.text.includes('career path'))).toBe(true);
    expectFail(expect, dispatch, s, { type: 'choosePath', staffId: p.id, pathId: 'ux_lead' }, 'That path is for designers');
    expectFail(expect, dispatch, s, { type: 'choosePath', staffId: p.id, pathId: 'wizard' }, 'Unknown path');
    expectFail(expect, dispatch, s, { type: 'choosePath', staffId: 'nope', pathId: 'architect' }, 'No such staff member');
    expect(dispatch(s, { type: 'choosePath', staffId: p.id, pathId: 'architect' }).ok).toBe(true);
    expect(p).toMatchObject({ path: 'architect', pathPending: false });
    expectFail(expect, dispatch, s, { type: 'choosePath', staffId: p.id, pathId: 'tech_lead' }, 'No path to choose yet');
  });

  it('seniors start with a path to choose', () => {
    const s = game();
    expect(generateStaff(s, { role: 'engineer', seniority: 'senior' }).pathPending).toBe(true);
    expect(generateStaff(s, { role: 'engineer', seniority: 'mid' }).pathPending).toBe(false);
    expect(s.staff.find((p) => p.seniority === 'senior').pathPending).toBe(true);
  });

  it('every role has paths and path mods apply; Legend boosts them by 25%', () => {
    for (const role of ['engineer', 'designer', 'marketer', 'support', 'security', 'sales']) {
      expect(Object.values(PATHS).filter((p) => p.role === role).length).toBeGreaterThanOrEqual(2);
    }
    const s = game();
    const p = addStaff(s, 'designer', 'senior', { traits: [], path: 'ux_lead' });
    expect(staffMods(p).polish).toBeCloseTo(1.3);
    p.legend = true;
    expect(staffMods(p).polish).toBeCloseTo(1 + 0.3 * 1.25);
    const w = addStaff(s, 'engineer', 'senior', { traits: [], path: 'ai_wrangler', legend: true });
    expect(staffMods(w).catch).toBeCloseTo(0.15 * 1.25);
  });

  it('no Legend path perk exceeds 50%', () => {
    for (const path of Object.values(PATHS)) {
      for (const [k, v] of Object.entries(path.mods)) {
        if (['catch', 'brandPerWeek', 'postureFlat'].includes(k)) continue;
        const legend = 1 + (v - 1) * 1.25;
        expect(legend, `${path.id}.${k}`).toBeLessThanOrEqual(1.5 + 1e-9);
        expect(legend, `${path.id}.${k}`).toBeGreaterThanOrEqual(0.5);
      }
    }
  });

  it('every path mod key is a real mod, so no perk is silently ignored', () => {
    const s = game();
    const known = Object.keys(staffMods(s.staff[0]));
    for (const path of Object.values(PATHS)) for (const k of Object.keys(path.mods)) expect(known, `${path.id}.${k}`).toContain(k);
  });

  it('path perks reach their systems', () => {
    const s = game();
    const base = securityPosture(s);
    addStaff(s, 'security', 'senior', { traits: [], path: 'red_team_lead', assignment: { type: 'idle', targetId: null } });
    expect(securityPosture(s)).toBeCloseTo(base + 8);
    const b = game();
    b.brand = 50;
    addStaff(b, 'designer', 'senior', { traits: [], path: 'brand_designer' });
    const c = game();
    c.brand = 50;
    once(b, marketingSystem);
    once(c, marketingSystem);
    expect(b.brand - c.brand).toBeCloseTo(0.03);
  });

  it('level 20 makes a Legend with fanfare', () => {
    const s = game();
    const p = addStaff(s, 'engineer', 'senior', { traits: [], level: 19, xp: 60 * 19 - 1, path: 'architect' });
    const ev = once(s, staffUpkeep);
    expect(p.level).toBe(20);
    expect(p.legend).toBe(true);
    expect(ev).toContainEqual({ type: 'celebrate', staffId: p.id });
    expect(ev.some((e) => e.type === 'chat' && e.channel === 'wins')).toBe(true);
  });
});

describe('earned traits', () => {
  it('awards traits at thresholds, with a traitEarned event, and caps at 3', () => {
    const s = game();
    const m = addStaff(s, 'engineer', 'senior', { traits: [] });
    const j = addStaff(s, 'engineer', 'junior', { traits: [] });
    m.assignment = { type: 'mentor', targetId: j.id };
    m.record.mentorWeeks = 19;
    const ev = once(s, staffUpkeep);
    expect(m.record.mentorWeeks).toBe(20);
    expect(m.traits).toContain('natural_mentor');
    expect(ev.find((e) => e.type === 'traitEarned')).toEqual({ type: 'traitEarned', staffId: m.id, traitId: 'natural_mentor', source: 'record' });
    expect(ev.some((e) => e.type === 'toast' && e.text.includes('Natural Mentor'))).toBe(false);
    const full = addStaff(s, 'engineer', 'senior', { traits: ['loyal', 'steady', 'cynic'] });
    full.record.catches = 3;
    once(s, staffUpkeep);
    expect(full.traits).toEqual(['loyal', 'steady', 'cynic']);
    const hp = addStaff(s, 'engineer', 'senior', { traits: [], assignment: { type: 'hardProblem', targetId: null } });
    hp.record.hardProblemWeeks = 19;
    once(s, staffUpkeep);
    expect(hp.traits).toContain('visionary');
  });

  it('natural mentor is never rolled for a new hire', () => {
    const s = game();
    for (let i = 0; i < 300; i++) expect(generateStaff(s, { role: 'engineer', seniority: 'mid' }).traits).not.toContain('natural_mentor');
  });
});

describe('meaning is never solved', () => {
  it('a fully automated senior still drifts down with every comfort on', () => {
    const s = game(4);
    s.officeStage = 2;
    for (const id of Object.keys(ITEMS)) { withItem(s, id, 3); withItem(s, id, 3); }
    s.policies = { pair: true, craft_fridays: true };
    s.automation.engineering.level = 1;
    const p = addStaff(s, 'engineer', 'senior', { traits: [], meaning: 70, assignment: { type: 'maintenance', targetId: null } });
    for (let w = 0; w < 52; w++) { once(s, meaningSystem); s.week++; }
    expect(p.meaning).toBeLessThan(70);
  });
});

describe('training programs', () => {
  it('someone trained off a project returns to it', () => {
    const s = game();
    s.cash = 1e6;
    const pid = dispatch(s, { type: 'startProject', kind: 'new', name: 'X', category: 'notes', angle: 'copilot', model: 'chatgbt', size: 'small' }).projectId;
    const p = s.staff[0];
    dispatch(s, { type: 'assign', staffId: p.id, assignment: { type: 'project', targetId: pid } });
    dispatch(s, { type: 'train', staffId: p.id, program: 'course' });
    once(s, staffUpkeep);
    once(s, staffUpkeep);
    expect(p.mood).toBe('ok');
    expect(p.assignment).toEqual({ type: 'project', targetId: pid });
  });

  it('validates program, focus, and presence', () => {
    const s = game();
    const p = s.staff[0];
    expectFail(expect, dispatch, s, { type: 'train', staffId: p.id, program: 'yoga' }, 'Unknown program');
    expectFail(expect, dispatch, s, { type: 'train', staffId: p.id, program: 'workshop' }, 'Pick a skill to focus');
    expectFail(expect, dispatch, s, { type: 'train', staffId: p.id, program: 'workshop', focus: 'charisma' }, 'Pick a skill to focus');
    p.mood = 'away';
    expectFail(expect, dispatch, s, { type: 'train', staffId: p.id, program: 'course' }, 'They are away');
    p.mood = 'ok';
    s.cash = 10;
    expectFail(expect, dispatch, s, { type: 'train', staffId: p.id, program: 'course' }, 'Not enough cash');
  });

  it('each program costs and pays out as listed', () => {
    const s = game();
    s.cash = 1e6;
    const [a, b] = s.staff;
    a.traits = []; b.traits = [];
    const polish = a.skills.polish;
    dispatch(s, { type: 'train', staffId: a.id, program: 'workshop', focus: 'polish' });
    expect(a.skills.polish).toBe(Math.min(100, polish + 3));
    expect(a.xp).toBe(TRAINING.workshop.xp);
    expect(a.mood).not.toBe('away');
    const brand = s.brand;
    const meaning = b.meaning;
    dispatch(s, { type: 'train', staffId: b.id, program: 'conference' });
    expect(b.mood).toBe('away');
    expect(b.sabbaticalWeeksLeft).toBe(1);
    expect(b.meaning).toBe(Math.min(100, meaning + 10));
    expect(s.brand).toBeCloseTo(brand + 0.5);
    expect(s.cash).toBe(1e6 - TRAINING.workshop.cost - TRAINING.conference.cost);
    once(s, staffUpkeep);
    expect(b.mood).toBe('ok');
    const k = a.knowledge;
    dispatch(s, { type: 'train', staffId: a.id, program: 'course' });
    expect(a.knowledge).toBe(k + 15);
    expect(a.sabbaticalWeeksLeft).toBe(2);
  });
});

describe('everything stays JSON-safe and finite', () => {
  it('a long run with items, research, and paths', () => {
    const s = game(5);
    s.cash = 1e7;
    passOfficeGates(s);
    expect(dispatch(s, { type: 'upgradeOffice' }).ok).toBe(true);
    expect(dispatch(s, { type: 'upgradeOffice' }).ok).toBe(true);
    for (const id of ['espresso', 'plant_wall', 'nap_pod', 'arcade', 'library', 'monitoring_wall', 'server_rack', 'server_rack', 'plant', 'whiteboard', 'coffee_corner', 'bookshelf', 'meeting_table']) {
      expect(dispatch(s, placeAction(s, id)).ok, id).toBe(true);
    }
    s.research.done = ['eval_harness', 'observability', 'ci_cd', 'docs_culture', 'red_team_suite'];
    for (let w = 0; w < 200; w++) {
      if (s.pendingDecision) for (let c = 0; c < 4 && s.pendingDecision; c++) dispatch(s, { type: 'resolveDecision', choice: c });
      for (const p of s.staff) if (p.pathPending) dispatch(s, { type: 'choosePath', staffId: p.id, pathId: Object.values(PATHS).find((x) => x.role === p.role).id });
      s.cash = 1e7;
      tick(s);
    }
    expect(JSON.parse(JSON.stringify(s))).toEqual(s);
    walkFinite(s);
  });
});
