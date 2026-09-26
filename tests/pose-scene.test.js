import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { judgeScene } from '../blender/checks/pose-rules.js';

const rule = { text: 'facePx>0', id: null, measure: 'facePx', op: '>', value: 0, share: 1 };
const rows = [{ id: 's3', frame: 0, facePx: 20 }, { id: 's3', frame: 30, facePx: 10 }];

describe('scene pose thresholds', () => {
  it('rejects empty scenes and fully absent requested subjects', () => {
    expect(judgeScene([], [0, 30], null, [rule]).pass).toBe(false);
    const result = judgeScene(rows, [0, 30], ['s3', 'missing'], [rule]);
    expect(result.pass).toBe(false);
    expect(result.missing).toEqual([{ id: 'missing', frames: [0, 30] }]);
    expect(result.verdicts.find((v) => v.id === 'missing').pass).toBe(false);
  });

  it('rejects missing samples even with a relaxed share or no rules', () => {
    const partial = judgeScene(rows.slice(0, 1), [0, 30], ['s3'], [{ ...rule, share: 0.5 }]);
    expect(partial.verdicts[0].share).toBe(0.5);
    expect(partial.pass).toBe(false);
    expect(partial.missing).toEqual([{ id: 's3', frames: [30] }]);
    expect(judgeScene([], [0], ['missing'], []).pass).toBe(false);
  });

  it('checks discovered and rule-prefixed subjects across all frames', () => {
    expect(judgeScene(rows.slice(1), [0, 30], null, [rule]).pass).toBe(false);
    expect(judgeScene(rows, [0, 30], null, [{ ...rule, id: 'visitor:0', share: 0 }]).pass).toBe(false);
  });

  it('passes complete subjects and applies thresholds to the requested frames', () => {
    expect(judgeScene(rows, [0, 30], ['s3'], [rule]).pass).toBe(true);
    expect(judgeScene(rows, [0, 30], null, [{ ...rule, value: 15, share: 0.5 }]).pass).toBe(true);
    expect(judgeScene(rows, [0, 30], null, [{ ...rule, value: 15 }]).pass).toBe(false);
    expect(judgeScene(rows, [], ['s3'], [rule]).pass).toBe(false);
  });

  it('does not treat an absent prop as zero penetration', () => {
    const depth = { ...rule, measure: 'heldHeadDepth', op: '<=', value: 0.000001 };
    const held = [{ id: 's3', frame: 0, heldHeadDepth: 0 }, { id: 's3', frame: 30, heldHeadDepth: null }];
    expect(judgeScene(held, [0, 30], ['s3'], [depth]).pass).toBe(false);
    held[1].heldHeadDepth = 0.023;
    expect(judgeScene(held, [0, 30], ['s3'], [depth]).pass).toBe(false);
    held[1].heldHeadDepth = 0;
    expect(judgeScene(held, [0, 30], ['s3'], [depth]).pass).toBe(true);
  });
});

it.each(['--scene', '--check-browser'])('rejects a different root before starting %s', (mode) => {
  const cli = fileURLToPath(new URL('../blender/checks/pose.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [cli, mode, '--root', '/nonexistent-pose-checkout'], { encoding: 'utf8', timeout: 10000 });
  expect(result.status).toBe(2);
  expect(result.stderr).toContain(`${mode} measures the page's own checkout`);
  expect(result.stdout).toBe('');
});
