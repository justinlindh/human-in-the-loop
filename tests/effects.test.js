import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { renderEffects } from '../src/sim/effects-report.js';
import { POLICIES } from '../src/data/policies.js';
import { EVENTS } from '../src/data/events.js';
import { POLICY_EFFECTS, CONDITION_LABELS, SUBJECT_LABELS, ITEM_RULES } from '../src/data/effects-map.js';
import { ITEMS } from '../src/data/items.js';

// docs/effects/ is generated; this fails when it no longer matches the data and balance values.
describe('issue #873: the effects report', () => {
  const report = renderEffects();

  it('docs/effects/ matches what the data and balance.js say now (run npm run effects)', () => {
    const dir = 'docs/effects';
    expect(existsSync(dir), 'run npm run effects').toBe(true);
    expect(readdirSync(dir).filter((f) => f.endsWith('.md')).sort()).toEqual(Object.keys(report).sort());
    for (const [file, text] of Object.entries(report)) expect(readFileSync(`${dir}/${file}`, 'utf8'), `${file} is stale: run npm run effects`).toBe(text);
  });

  it('every policy, event subject and condition has words in the effects map', () => {
    for (const id of Object.keys(POLICIES)) expect(POLICY_EFFECTS[id], id).toBeTruthy();
    for (const ev of Object.values(EVENTS)) {
      if (ev.subject) expect(SUBJECT_LABELS[ev.subject], ev.subject).toBeTruthy();
      for (const c of ev.choices ?? []) if (c.requires) expect(CONDITION_LABELS[c.requires], c.requires).toBeTruthy();
    }
  });

  it('prints no raw data: no JSON, no undefined, no NaN', () => {
    for (const [file, text] of Object.entries(report)) {
      for (const line of text.split('\n')) {
        if (/^<!--|^- \[|^When: /.test(line)) continue;
        expect(line, file).not.toMatch(/[{}]|undefined|NaN|object Object/);
      }
    }
  });
});

describe('the effects report office page covers every item', () => {
  const office = renderEffects()['office.md'];
  const row = (name) => office.split('\n').find((l) => l.startsWith(`| ${name} |`));

  it('every item has an effect in data, an adjacency, or words in ITEM_RULES', () => {
    for (const it of Object.values(ITEMS)) {
      const hasData = it.effects.some((e) => Object.keys(e).length) || it.adjacency;
      expect(hasData || ITEM_RULES[it.id], it.id).toBeTruthy();
    }
  });

  it('prints adjacency bonuses with their radius', () => {
    expect(row('Coffee Corner')).toMatch(/stamina recovery \+8% .*within 3 tiles/);
    expect(row('Potted Plant')).toMatch(/meaning recovery \+4% .*within 2 tiles/);
    expect(row('Server Racks')).toMatch(/uptime floor \+1% for each other Server Racks within 1 tile/);
  });

  it('prints what desks and gated items do', () => {
    expect(row('Desk Set')).toMatch(/seats one person/);
    expect(row('Meeting Table')).toMatch(/no effect on the numbers/);
    expect(row('Trophy Case')).toMatch(/after your first award/);
    expect(row('Monitoring Wall')).toMatch(/agents era/i);
  });

  it('states the stacking rules', () => {
    expect(office).toMatch(/second copy of an item counts at 50%/);
    expect(office).toMatch(/capped at ±50%/);
  });
});
