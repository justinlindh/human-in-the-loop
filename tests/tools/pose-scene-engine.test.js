import { describe, it, expect } from 'vitest';
import { resolve } from 'node:path';
import { runCases } from '../../scripts/studio/page-host.mjs';
import { judgeScene } from '../../blender/checks/pose-rules.js';

// pose.mjs --scene's measures on the studio engine, held to controls that must fail or move.
const PAGE = resolve(__dirname, '../../blender/checks/pose-scene-page.js');
const FRAMES = [0, 1, 6, 15, 30, 60, 90, 120, 180, 240, 300, 450, 600, 900];
const page = (rig) => ({ mock: 'floor', quality: 'medium', rig, width: 1280, height: 800 });

describe('pose --scene on the engine', () => {
  it('measures a staged printer jam, a face blocker and the scene rules\' controls', async () => {
    const [onRig, offRig, blocker] = await runCases([
      { page: page(true), module: PAGE, fn: 'printerControl', arg: { frames: FRAMES } },
      { page: page(false), module: PAGE, fn: 'printerControl', arg: { frames: FRAMES } },
      { page: page(true), module: PAGE, fn: 'blockerControl', arg: null },
    ], { jobs: 3 });
    for (const run of [onRig, offRig]) {
      expect(run.error).toBeUndefined();
      const { rows, cameras } = run.value;
      expect(rows.some((r) => r.heldGap !== null)).toBe(true);
      expect(new Set(rows.filter((r) => r.moment === 'printer').map((r) => r.beat)).size).toBeGreaterThanOrEqual(2);
      expect(rows.some((r) => r.projected.overlays.some((o) => o.kind === 'emote'))).toBe(true);
      expect(cameras[4]).not.toEqual(cameras[0]);
      const subject = [...new Set(rows.map((r) => r.id))].find((id) => FRAMES.every((f) => rows.some((r) => r.id === id && r.frame === f)));
      expect(subject).toBeDefined();
      expect(judgeScene(rows, FRAMES, ['absent-subject'], []).pass).toBe(false);
      expect(judgeScene(rows.filter((r) => r.frame !== 30), FRAMES, [subject], []).pass).toBe(false);
      expect(judgeScene(rows, FRAMES, [subject], [{ measure: 'facePx', op: '<', value: 0, share: 1 }]).pass).toBe(false);
      expect(judgeScene(rows.filter((r) => r.id === subject), FRAMES, [subject], []).pass).toBe(true);
    }
    expect(blocker.error).toBeUndefined();
    const { selected, clear, blocked, restored } = blocker.value;
    expect(selected).not.toBeNull();
    expect(clear.faceVisible).toBeGreaterThan(0);
    expect(blocked.faceVisible).toBe(0);
    expect(blocked.occluder).toBe('prop pose-test-mask');
    expect(restored.faceVisible).toBe(clear.faceVisible);
  }, 120000);
});
