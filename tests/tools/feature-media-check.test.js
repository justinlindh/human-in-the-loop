import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { spawnAsync } from './spawn-async.js';

const RENDER = resolve(__dirname, '../../scripts/feature-media/render.mjs');
const tmp = mkdtempSync(join(toolTmp(), 'fm-check-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// A docs folder with one entry that opts out of media and one with nothing, and a baseline file.
function setup(name, { baseline, gap = true }) {
  const docs = join(tmp, name, 'docs');
  mkdirSync(docs, { recursive: true });
  writeFileSync(join(docs, 'sample.md'), ['# Sample', '', '- `id: covered_one` a thing. media: none (text only)', ...(gap ? ['- `id: gap_two` another thing.'] : []), ''].join('\n'));
  const file = join(tmp, name, 'baseline.json');
  writeFileSync(file, `${JSON.stringify(baseline, null, 1)}\n`);
  return { env: { ...process.env, FEATURE_MEDIA_DOCS: docs, FEATURE_MEDIA_BASELINE: file }, file };
}
const check = (env, ...args) => spawnAsync(process.execPath, [RENDER, '--check', ...args], { env, timeout: 120000 });

describe.concurrent('feature-media --check baseline', () => {
  it('passes with a stale baseline pair, naming it in a note, and fails on a new gap', async () => {
    const stale = setup('stale', { baseline: ['sample.md:gap_two', 'sample.md:covered_one'] });
    const ok = await check(stale.env);
    expect(ok.status, ok.stdout + ok.stderr).toBe(0);
    expect(ok.stdout).toContain('1 baseline pair is covered now (or gone): sample.md:covered_one');
    const gap = setup('gap', { baseline: [] });
    const bad = await check(gap.env);
    expect(bad.status).toBe(1);
    expect(bad.stderr).toContain('sample.md:gap_two: no media link');
  }, 130000);

  it('--write-baseline tidies the stale pairs and keeps the gaps', async () => {
    const t = setup('tidy', { baseline: ['sample.md:gap_two', 'sample.md:covered_one', 'sample.md:gone'] });
    const r = await check(t.env, '--write-baseline');
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(JSON.parse(readFileSync(t.file, 'utf8'))).toEqual(['sample.md:gap_two']);
    const after = await check(t.env);
    expect(after.status, after.stdout + after.stderr).toBe(0);
    expect(after.stdout).not.toContain('covered now');
  }, 130000);
});
