import { describe, it, expect } from 'vitest';
import { TALK, SAY_SOLO, RUNNING_JOKES } from '../../src/data/talk.js';
import { INCENTIVES } from '../../src/data/incentives.js';
import { CALL_SCRIPTS } from '../../src/data/ladder.js';
import { STANDUP } from '../../src/data/standup.js';
import { OPENING_BEATS } from '../../src/sim/projects.js';

// Render cuts a speech bubble at 70 characters, so anything spoken aloud has to fit. Placeholders are
// measured as a typical name or product (7 characters).
export const BUBBLE_MAX = 70;
const measure = (t) => t.replace(/\{\w+\}/g, 'Xxxxxxx').length;

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
