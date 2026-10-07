import { describe, expect, it } from 'vitest';
import { combine, keyAxes, lookDelta, stickAxes } from './firstPersonInput.js';

describe('first-person input maths', () => {
  it('maps WASD and arrows to a unit-capped move', () => {
    expect(keyAxes(new Set(['KeyW']))).toEqual({ x: 0, z: 1 });
    expect(keyAxes(new Set(['ArrowLeft']))).toEqual({ x: -1, z: 0 });
    expect(keyAxes(new Set(['KeyW', 'KeyS']))).toEqual({ x: 0, z: 0 });
    const d = keyAxes(new Set(['KeyW', 'KeyD']));
    expect(Math.hypot(d.x, d.z)).toBeCloseTo(1);
  });

  it('turns a stick offset into a move, with a dead zone and screen-up as forward', () => {
    expect(stickAxes(2, 2, 50)).toEqual({ x: 0, z: 0 });
    const up = stickAxes(0, -50, 50);
    expect(up.z).toBeCloseTo(1);
    expect(up.x).toBeCloseTo(0);
    const far = stickAxes(500, 0, 50);
    expect(far.x).toBeCloseTo(1);
    const half = stickAxes(25, 0, 50);
    expect(half.x).toBeCloseTo(0.5);
  });

  it('turns right on a rightward drag and looks up on an upward drag', () => {
    const l = lookDelta(10, -10, 0.01);
    expect(l.yaw).toBeCloseTo(0.1);
    expect(l.pitch).toBeCloseTo(0.1);
  });

  it('never exceeds full speed when stick and keys are both held', () => {
    const c = combine({ x: 1, z: 0 }, { x: 0, z: 1 });
    expect(Math.hypot(c.x, c.z)).toBeCloseTo(1);
  });
});
