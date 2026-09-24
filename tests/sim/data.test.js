import { describe, it, expect } from 'vitest';
import { CATEGORIES } from '../../src/data/categories.js';
import { ANGLES } from '../../src/data/angles.js';
import { COMBO_OVERRIDES, comboFit } from '../../src/data/combos.js';
import { INCUMBENTS, incumbentFor } from '../../src/data/incumbents.js';
import { MODELS } from '../../src/data/models.js';
import { ROLES } from '../../src/data/roles.js';
import { TRAITS, TRAIT_MOD_KEYS } from '../../src/data/traits.js';
import { FIRST_NAMES, LAST_NAMES } from '../../src/data/names.js';
import { POLICIES } from '../../src/data/policies.js';
import { CHANNELS } from '../../src/data/channels.js';
import { OFFICE_STAGES } from '../../src/data/office.js';
import { TRENDS } from '../../src/data/trends.js';
import { PRESS, REVIEW_QUOTES } from '../../src/data/press.js';
import { CHATTER } from '../../src/data/chatter.js';
import { EVENTS, EFFECT_KEYS, CONDITION_IDS, SUBJECTS } from '../../src/data/events.js';
import { EPILOGUES, GENERIC_EPILOGUES } from '../../src/data/epilogues.js';

const KEYED = { CATEGORIES, ANGLES, MODELS, ROLES, TRAITS, POLICIES, CHANNELS, TRENDS, EVENTS };
const EM_DASH = String.fromCharCode(0x2014);
const ROLE_IDS = ['designer', 'engineer', 'marketer', 'sales', 'security', 'support'];

describe('content data', () => {
  it('meets scope minimums', () => {
    expect(Object.keys(CATEGORIES).length).toBeGreaterThanOrEqual(14);
    expect(Object.keys(ANGLES).length).toBeGreaterThanOrEqual(7);
    expect(Object.keys(MODELS).length).toBeGreaterThanOrEqual(7);
    expect(INCUMBENTS.length).toBeGreaterThanOrEqual(14);
    expect(Object.keys(EVENTS).length).toBeGreaterThanOrEqual(40);
    expect(Object.keys(TRAITS).length).toBeGreaterThanOrEqual(20);
    expect(Object.keys(POLICIES).length).toBeGreaterThanOrEqual(6);
    expect(OFFICE_STAGES.length).toBe(3);
    expect(FIRST_NAMES.length).toBeGreaterThanOrEqual(60);
    expect(LAST_NAMES.length).toBeGreaterThanOrEqual(60);
    expect(EPILOGUES.length).toBeGreaterThanOrEqual(20);
  });

  it('keyed collections use their id as the key', () => {
    for (const [name, coll] of Object.entries(KEYED)) {
      for (const [k, v] of Object.entries(coll)) expect(v.id, `${name}.${k}`).toBe(k);
    }
  });

  it('array collections have unique ids and names', () => {
    for (const arr of [INCUMBENTS, OFFICE_STAGES, PRESS, EPILOGUES]) {
      const ids = arr.map((x) => x.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
    expect(new Set(FIRST_NAMES).size).toBe(FIRST_NAMES.length);
    expect(new Set(LAST_NAMES).size).toBe(LAST_NAMES.length);
  });

  it('has exactly one incumbent per category', () => {
    for (const cat of Object.keys(CATEGORIES)) {
      expect(INCUMBENTS.filter((i) => i.category === cat).length, cat).toBe(1);
      expect(incumbentFor(cat).category).toBe(cat);
    }
    for (const inc of INCUMBENTS) expect(CATEGORIES[inc.category]).toBeDefined();
  });

  it('unlocks enough to play in 2026', () => {
    expect(Object.values(CATEGORIES).filter((c) => c.unlockYear <= 2026).length).toBeGreaterThanOrEqual(4);
    expect(Object.values(ANGLES).filter((a) => a.unlockYear <= 2026).length).toBeGreaterThanOrEqual(3);
    expect(Object.values(MODELS).filter((m) => m.releaseYear <= 2026).length).toBeGreaterThanOrEqual(5);
  });

  it('comboFit stays within [0.6, 1.5] and overrides reference real ids', () => {
    for (const c of Object.keys(CATEGORIES)) {
      for (const a of Object.keys(ANGLES)) {
        const f = comboFit(c, a);
        expect(f).toBeGreaterThanOrEqual(0.6);
        expect(f).toBeLessThanOrEqual(1.5);
      }
    }
    for (const key of Object.keys(COMBO_OVERRIDES)) {
      const [c, a] = key.split(':');
      expect(CATEGORIES[c], key).toBeDefined();
      expect(ANGLES[a], key).toBeDefined();
    }
    expect(comboFit('support', 'agent')).toBe(1.5);
    expect(comboFit('notes', 'copilot')).toBe(1);
  });

  it('model stats are in range', () => {
    for (const m of Object.values(MODELS)) {
      expect(m.capability).toBeGreaterThan(0);
      expect(m.capability).toBeLessThanOrEqual(100);
      expect(m.guardrails).toBeGreaterThanOrEqual(0);
      expect(m.guardrails).toBeLessThanOrEqual(1);
      expect(m.trust).toBeGreaterThanOrEqual(0);
      expect(m.trust).toBeLessThanOrEqual(1);
      expect(m.productCost).toBeGreaterThan(0);
      expect(m.autoCost).toBeGreaterThan(0);
      expect(typeof m.complianceOk).toBe('boolean');
      expect(typeof m.selfHosted).toBe('boolean');
      expect(m.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(m.blurb.length).toBeGreaterThan(10);
    }
  });

  it('has the six roles with valid automation maps', () => {
    expect(Object.keys(ROLES).sort()).toEqual(ROLE_IDS);
    const fns = ['engineering', 'support', 'sales', 'marketing', 'qa', 'ops'];
    for (const r of Object.values(ROLES)) {
      for (const fn of Object.keys(r.automatedBy)) expect(fns).toContain(fn);
      expect(r.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('traits only use known mod keys', () => {
    for (const t of Object.values(TRAITS)) {
      for (const k of Object.keys(t.mods)) expect(TRAIT_MOD_KEYS, `${t.id}.${k}`).toContain(k);
      expect(t.desc.length).toBeGreaterThan(5);
    }
  });

  it('policies have an unlock function', () => {
    for (const p of Object.values(POLICIES)) {
      expect(typeof p.unlock).toBe('function');
      expect(p.weeklyCost).toBeGreaterThanOrEqual(0);
      expect(typeof p.lockText).toBe('string');
    }
    expect(Object.keys(POLICIES).sort()).toEqual(['apprenticeship', 'blameless', 'comprehension_reviews', 'craft_fridays', 'pair', 'sabbatical']);
  });

  it('trends reference real angles and categories', () => {
    expect(TRENDS.steady).toBeDefined();
    for (const t of Object.values(TRENDS)) {
      for (const a of Object.keys(t.angleMods)) expect(ANGLES[a], `${t.id}.${a}`).toBeDefined();
      for (const c of Object.keys(t.categoryMods)) expect(CATEGORIES[c], `${t.id}.${c}`).toBeDefined();
      expect(t.weeks).toBeGreaterThan(0);
    }
  });

  it('press has quotes for every band', () => {
    expect(PRESS.length).toBe(4);
    for (const band of ['low', 'mid', 'high']) expect(REVIEW_QUOTES[band].length).toBeGreaterThanOrEqual(8);
  });

  it('every chatter key has 6+ short lines', () => {
    for (const key of ['happy', 'coasting', 'burnout', 'automated', 'mentor', 'junior', 'incident', 'idle', 'overseer']) {
      expect(CHATTER[key].length, key).toBeGreaterThanOrEqual(6);
      for (const line of CHATTER[key]) expect(line.length, line).toBeLessThan(60);
    }
  });

  it('every event has title, text, and choices or auto, with known effect keys', () => {
    const checkEffects = (fx, where) => {
      for (const [k, v] of Object.entries(fx)) {
        expect(EFFECT_KEYS, `${where}.${k}`).toContain(k);
        if (k === 'cond') {
          expect(CONDITION_IDS, `${where}.cond`).toContain(v.test);
          checkEffects(v.then ?? {}, `${where}.then`);
          checkEffects(v.else ?? {}, `${where}.else`);
        }
        if (k === 'gamble') {
          expect(v.p).toBeGreaterThan(0);
          checkEffects(v.effects, `${where}.gamble`);
        }
      }
    };
    for (const e of Object.values(EVENTS)) {
      expect(e.title, e.id).toBeTruthy();
      expect(e.text, e.id).toBeTruthy();
      expect(Array.isArray(e.choices) || typeof e.auto === 'object', e.id).toBe(true);
      expect(['staff', 'market', 'vendor', 'incident', 'cyber', 'annual', 'misc']).toContain(e.kind);
      expect(SUBJECTS).toContain(e.subject);
      expect(typeof e.when).toBe('function');
      if (e.choices) {
        expect(e.choices.length, e.id).toBeGreaterThanOrEqual(2);
        for (const [i, c] of e.choices.entries()) {
          expect(c.label && c.hint, `${e.id}[${i}]`).toBeTruthy();
          checkEffects(c.effects, `${e.id}[${i}]`);
          if (c.requires) expect(CONDITION_IDS).toContain(c.requires);
        }
        expect(e.choices.some((c) => !c.requires), `${e.id} needs an always-available choice`).toBe(true);
      } else {
        checkEffects(e.auto, e.id);
      }
    }
  });

  it('epilogues have a when function and text', () => {
    for (const e of [...EPILOGUES, ...GENERIC_EPILOGUES]) {
      expect(e.text.length).toBeGreaterThan(10);
      expect(typeof e.when).toBe('function');
    }
    expect(GENERIC_EPILOGUES.length).toBeGreaterThanOrEqual(3);
  });

  it('player-facing text has no em dash and never says the forbidden word', () => {
    const blob = JSON.stringify({
      CATEGORIES, ANGLES, INCUMBENTS, MODELS, ROLES, TRAITS, POLICIES, CHANNELS, OFFICE_STAGES, TRENDS,
      PRESS, REVIEW_QUOTES, CHATTER, EVENTS, EPILOGUES, GENERIC_EPILOGUES, FIRST_NAMES, LAST_NAMES,
    });
    expect(blob.includes(EM_DASH)).toBe(false);
    expect(blob).not.toMatch(/startup/i);
  });
});
