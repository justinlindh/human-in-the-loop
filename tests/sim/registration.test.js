import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';

// Runs in a fresh Node process so earlier imports in the test run cannot hide a missing registration.
const probe = (entry) => JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', `
  await import(${JSON.stringify(new URL(entry, import.meta.url).href)});
  const r = await import(${JSON.stringify(new URL('../../src/sim/registry.js', import.meta.url).href)});
  console.log(JSON.stringify({ systems: r.getSystems().map((s) => s.name), actions: r.getActionTypes().sort() }));
`]).toString());

describe('importing any sim entry point registers the whole game', () => {
  const full = probe('../../src/sim/index.js');
  for (const entry of ['../../src/sim/tick.js', '../../src/sim/actions.js', '../../src/sim/bots.js']) {
    it(entry.split('/').pop(), () => {
      const got = probe(entry);
      expect(got.systems).toEqual(full.systems);
      expect(got.actions).toEqual(full.actions);
    });
  }
  it('the full game has every planned system', () => {
    expect(full.systems).toContain('meaning');
    expect(full.systems).toContain('marketing');
    expect(full.systems).toContain('annual');
  });
});
