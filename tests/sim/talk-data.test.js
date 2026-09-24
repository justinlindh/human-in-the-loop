import { describe, it, expect } from 'vitest';
import { TALK, SAY_SOLO, RUNNING_JOKES, CAST_SPECS, SITUATIONS, SLOTS } from '../../src/data/talk.js';
import { ERA_IDS } from '../../src/data/eras.js';
import { isAiText } from '../../src/sim/eras.js';

const CHANNELS = ['general', 'wins', 'incidents', 'random'];
const EM_DASH = String.fromCharCode(0x2014);
const slotsIn = (t) => [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

function checkLine(line, where, { max, roles }) {
  expect(typeof line, where).toBe('string');
  expect(line.length, `${where}: ${line}`).toBeLessThanOrEqual(max);
  expect(line.length, where).toBeGreaterThan(1);
  expect(line.includes(EM_DASH), where).toBe(false);
  expect(line, where).not.toMatch(/startup/i);
  expect(line, where).not.toMatch(/ {2}/);
  for (const s of slotsIn(line)) {
    expect(SLOTS, `${where}: {${s}}`).toContain(s);
    if (['a', 'b', 'c'].includes(s)) expect(roles, `${where}: {${s}} not in cast`).toContain(s);
  }
}

function checkTurns(turns, where, { stream, roles, minVariants, classic }) {
  expect(turns.length, where).toBeGreaterThanOrEqual(1);
  expect(turns.length, where).toBeLessThanOrEqual(6);
  for (const [i, [role, variants]] of turns.entries()) {
    expect(roles, `${where} turn ${i}`).toContain(role);
    expect(variants.length, `${where} turn ${i}`).toBeGreaterThanOrEqual(minVariants);
    expect(new Set(variants).size, `${where} turn ${i} duplicates`).toBe(variants.length);
    for (const v of variants) checkLine(v, `${where} turn ${i}`, { max: stream === 'say' ? 80 : 120, roles });
    // An exchange that can run in Classic needs Classic-safe variants for every turn.
    if (classic) expect(variants.filter((v) => !isAiText(v)).length, `${where} turn ${i}: needs Classic-safe variants`).toBeGreaterThanOrEqual(Math.min(2, minVariants));
  }
}

describe('talk data', () => {
  it('has the breadth S18 asks for', () => {
    expect(TALK.length).toBeGreaterThanOrEqual(150);
    expect(TALK.filter((t) => t.stream === 'say').length).toBeGreaterThanOrEqual(80);
    expect(TALK.filter((t) => t.stream === 'chat').length).toBeGreaterThanOrEqual(50);
    expect(new Set(TALK.map((t) => t.id)).size).toBe(TALK.length);
    for (const on of SITUATIONS) expect(TALK.filter((t) => t.on === on).length, on).toBeGreaterThanOrEqual(1);
    expect(TALK.filter((t) => t.rare).length).toBeGreaterThanOrEqual(8);
    for (const era of ERA_IDS.slice(1)) expect(TALK.filter((t) => t.eras?.includes(era)).length, era).toBeGreaterThanOrEqual(4);
  });

  it('every exchange is well formed, with 3+ variants per turn and 2 to 6 turns', () => {
    for (const t of TALK) {
      const where = t.id;
      expect(['say', 'chat'], where).toContain(t.stream);
      if (t.stream === 'chat') expect(CHANNELS, where).toContain(t.channel);
      if (t.on) expect(SITUATIONS, where).toContain(t.on);
      for (const e of t.eras ?? []) expect(ERA_IDS, where).toContain(e);
      const roles = Object.keys(t.cast);
      for (const [role, spec] of Object.entries(t.cast)) {
        expect(['a', 'b', 'c'], where).toContain(role);
        expect(CAST_SPECS, `${where}: ${spec}`).toContain(spec);
      }
      expect(t.turns.length, where).toBeGreaterThanOrEqual(2);
      expect(t.turns[0][0], where).toBe('a');
      const classic = !t.eras || t.eras.includes('classic');
      checkTurns(t.turns, where, { stream: t.stream, roles, minVariants: 3, classic });
    }
  });

  it('solo lines and running jokes are well formed', () => {
    for (const key of ['any', 'building', 'tired', 'coasting', 'burnout', 'outage', 'engineer', 'designer', 'marketer', 'support', 'sales', 'security']) {
      expect(SAY_SOLO[key]?.length, key).toBeGreaterThanOrEqual(6);
      expect(SAY_SOLO[key].filter((l) => !isAiText(l)).length, `${key}: Classic-safe`).toBeGreaterThanOrEqual(4);
      for (const l of SAY_SOLO[key]) checkLine(l, `solo ${key}`, { max: 80, roles: ['a'] });
    }
    expect(RUNNING_JOKES.length).toBeGreaterThanOrEqual(6);
    for (const j of RUNNING_JOKES) {
      expect(j.beats.length, j.id).toBeGreaterThanOrEqual(3);
      const roles = Object.keys(j.cast);
      for (const spec of Object.values(j.cast)) expect(CAST_SPECS).toContain(spec);
      for (const [i, beat] of j.beats.entries()) checkTurns(beat, `${j.id} beat ${i}`, { stream: j.stream, roles, minVariants: 2, classic: !j.eras || j.eras.includes('classic') });
    }
  });
});
