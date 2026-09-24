import { describe, it, expect } from 'vitest';
import { TALK, SAY_SOLO, RUNNING_JOKES } from '../../src/data/talk.js';
import { INCENTIVES } from '../../src/data/incentives.js';
import { CALL_SCRIPTS } from '../../src/data/ladder.js';
import { STANDUP } from '../../src/data/standup.js';
import { OPENING_BEATS } from '../../src/sim/projects.js';
import { FIRST_NAMES, LAST_NAMES } from '../../src/data/names.js';
import { RIVAL_NAMES, PET_NAMES } from '../../src/data/ladder.js';
import { ITEMS } from '../../src/data/items.js';
import { INCUMBENTS } from '../../src/data/incumbents.js';
import { MODELS } from '../../src/data/models.js';
import { CATEGORIES } from '../../src/data/categories.js';
import { B } from '../../src/sim/balance.js';

// Render cuts a speech bubble at 70 characters, so anything spoken aloud has to fit, with every
// placeholder filled at its longest realistic value.
export const BUBBLE_MAX = 70;
const longest = (list) => Math.max(...list.map((x) => x.length));
const firstName = longest(FIRST_NAMES);
export const PLACEHOLDER_MAX = {
  a: firstName, b: firstName, c: firstName, coworker: firstName, mentee: firstName, winner: firstName, gone: firstName,
  rivalFounder: firstName + 1 + longest(LAST_NAMES),
  product: B.productNameMax,
  // A project is named after its product: an update adds " v12", a migration " migration".
  project: B.productNameMax + ' migration'.length,
  category: longest(Object.values(CATEGORIES).map((c) => c.name)),
  incumbent: longest(INCUMBENTS.map((i) => i.name)),
  rival: longest(RIVAL_NAMES),
  pet: longest(Object.values(PET_NAMES).flat()),
  item: longest(Object.values(ITEMS).map((i) => i.name)),
  model: longest(Object.values(MODELS).map((m) => m.name)),
  company: B.productNameMax,
  pct: 3,
};
const measure = (t) => t.replace(/\{(\w+)\}/g, (_, k) => 'x'.repeat(PLACEHOLDER_MAX[k] ?? 20)).length;

export function spokenLines() {
  const out = [];
  const turns = (where, list) => { for (const [, variants] of list) for (const v of variants) out.push([where, v]); };
  for (const t of TALK) if (t.stream === 'say') turns(t.id, t.turns);
  for (const [key, lines] of Object.entries(SAY_SOLO)) for (const l of lines) out.push([`solo.${key}`, l]);
  for (const j of RUNNING_JOKES) if (j.stream === 'say') for (const beat of j.beats) turns(j.id, beat);
  for (const r of INCENTIVES) { turns(`incentive.${r.id}`, r.onlookers); for (const l of r.winner) out.push([`incentive.${r.id}.winner`, l]); }
  for (const script of CALL_SCRIPTS) turns('call', script);
  for (const [key, lines] of Object.entries(STANDUP)) for (const l of lines) out.push([`standup.${key}`, l]);
  for (const b of OPENING_BEATS) for (const l of b.say ?? []) out.push(['opening', l]);
  return out;
}

describe('issue #156: spoken lines fit in a bubble', () => {
  it(`every line said aloud is ${BUBBLE_MAX} characters or fewer`, () => {
    const lines = spokenLines();
    expect(lines.length).toBeGreaterThan(1000);
    const long = lines.filter(([, t]) => measure(t) > BUBBLE_MAX).map(([w, t]) => `${w}: ${t}`);
    expect(long.slice(0, 30), `${long.length} lines over ${BUBBLE_MAX}`).toEqual([]);
  });
});

describe('product names fit the bubbles too', () => {
  it('startProject trims names, refuses empty or over-long ones, and defaults when none is given', async () => {
    const { dispatch } = await import('../../src/sim/index.js');
    const { game, expectFail } = await import('./helpers.js');
    const s = game(3);
    s.cash = 1e6;
    const base = { type: 'startProject', kind: 'new', category: s.market.unlockedCategories[0], angle: 'web', model: null, size: 'small' };
    expectFail(expect, dispatch, s, { ...base, name: '   ' }, 'Needs a name');
    expectFail(expect, dispatch, s, { ...base, name: 'x'.repeat(B.productNameMax + 1) }, `Names are ${B.productNameMax} characters at most`);
    const ok = dispatch(s, { ...base, name: `  ${'y'.repeat(B.productNameMax)}  ` });
    expect(ok.ok).toBe(true);
    expect(s.projects.at(-1).name).toBe('y'.repeat(B.productNameMax));
    s.projects = [];
    expect(dispatch(s, { ...base, name: undefined }).ok).toBe(true);
    expect(s.projects.at(-1).name.length).toBeLessThanOrEqual(B.productNameMax);
  });
});
