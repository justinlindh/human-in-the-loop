import { describe, expect, it } from 'vitest';
import { lookYaw } from './turn.js';
import { LYING } from './character.js';

const person = (anim, extra = {}) => ({ char: { anim }, pos: { x: 0, z: 0 }, path: [], temp: null, goal: null, ...extra });
const east = { pos: { x: 1, z: 0 } };

describe('lookYaw', () => {
  it('turns a standing person to face who they look at', () => {
    expect(lookYaw(person('idle'), east, 0.9)).toBeCloseTo(Math.PI / 2);
  });

  it('leaves anyone lying, napping or sprawled facing as they are', () => {
    for (const anim of LYING) expect(lookYaw(person(anim), east, 0.9)).toBeNull();
    expect(lookYaw(person('lie', { goal: { seated: true, yaw: 0 } }), east, 0.9)).toBeNull();
  });

  it('leaves a facepalmer facing the camera', () => {
    expect(lookYaw(person('facepalm'), east, 0.9)).toBeNull();
    expect(lookYaw(person('facepalmsit'), east, 0.9)).toBeNull();
  });

  it('only swivels someone seated', () => {
    expect(lookYaw(person('sit', { goal: { seated: true, yaw: 0 } }), east, 0.9)).toBeCloseTo(0.9);
  });
});
