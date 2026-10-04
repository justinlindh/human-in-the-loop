import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const RUNTIME = JSON.stringify(resolve(__dirname, '../../scripts/studio/runtime.mjs'));
const INTERSECT = JSON.stringify(resolve(__dirname, '../../blender/checks/intersect.js'));

// Runs `body` in a Node process on the engine, with `scene({ mock, era })` building one scene at Medium
// and stepping it a second, and prints the JSON `body` returns.
function onEngine(body) {
  const script = `const { createRuntime } = await import(${RUNTIME});
    const X = await import(${INTERSECT});
    const scene = async (o) => { const { R, S, clock } = await createRuntime({ quality: 'medium', ...o }); for (let i = 0; i < 60; i++) { clock.tick(); R.sync(S); R.render(1 / 30, { draw: false }); } return R; };
    console.log('RESULT ' + JSON.stringify(await (async () => { ${body} })())); process.exit(0);`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8', timeout: 240000 });
  const line = r.stdout.split('\n').find((l) => l.startsWith('RESULT '));
  expect(line, r.stdout + r.stderr).toBeTruthy();
  return JSON.parse(line.slice(7));
}

describe('era scenes on the engine', () => {
  // The engine builds scenes one after another in one process, so each scene's era art has to follow its
  // own state, not whichever scene loaded the renderer first.
  it('wear their own era art, in any order, and a Classic scene keeps the ordinary office', () => {
    const eras = onEngine(`const out = [];
      for (const era of [null, 'dotcom', 'preinternet', null, 'web2']) out.push((await scene({ mock: 'floor', era })).exterior()?.era ?? null);
      return out;`);
    expect(eras).toEqual([null, 'dotcom', 'preinternet', null, 'web2']);
  });

  it('build a street with standing scenery that does not overlap, in a modern era too', () => {
    const got = onEngine(`const out = [];
      for (const [mock, era] of [['garage', 'preinternet'], ['floor', 'agents']]) { const R = await scene({ mock, era }); out.push({ at: mock + '@' + era, feet: R.exterior().feet.length, overlaps: X.exteriorOverlaps(R) }); }
      return out;`);
    for (const g of got) {
      expect(g.feet, g.at).toBeGreaterThan(0);
      expect(g.overlaps, g.at).toEqual([]);
    }
  });
});
