import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFaceGeometry, faceWeights, faceMetrics, bakeFace, EXPRESSIONS, MORPHS } from './face.js';

const geo = createFaceGeometry({ ink: { color: new THREE.Color(0.1, 0.1, 0.1) }, shine: { color: new THREE.Color(1, 1, 1) } });
const m = (name) => faceMetrics(geo, faceWeights(name));
const ok = m('ok');

// What each expression has to show, measured on the face geometry (metres, head space).
const RULES = {
  delighted: (x) => x.mouthCorner >= 0.02 && x.mouthOpen >= 0.025 && x.lidGap <= 0.035 && x.browLift >= 0.006,
  shocked: (x) => x.mouthOpen >= 0.03 && x.lidGap >= ok.lidGap * 1.1 && x.browLift >= 0.012,
  flat: (x) => Math.abs(x.mouthCorner) <= 0.003 && x.lidGap <= ok.lidGap * 0.85,
  coasting: (x) => Math.abs(x.mouthCorner) <= 0.003 && x.lidGap <= ok.lidGap * 0.85,
  panicked: (x) => x.browTilt >= 0.012 && x.lidGap >= ok.lidGap * 1.05,
  gritted: (x) => x.browTilt <= -0.012 && x.mouthOpen >= 0.012,
  sad: (x) => x.mouthCorner <= -0.012 && x.browTilt >= 0.012 && x.gazeY < 0,
  smug: (x) => x.mouthCorner >= 0.005 && x.lidGap <= ok.lidGap * 0.9,
  sideeye: (x) => Math.abs(x.gazeX) >= 0.005 && x.lidGap <= ok.lidGap * 0.9,
  burnout: (x) => x.lidGap <= 0.012 && x.mouthCorner <= -0.008,
  ok: (x) => x.mouthCorner >= 0.01 && x.lidGap >= 0.08,
};

describe('face', () => {
  it('has a rule for every expression, and each one passes', () => {
    expect(Object.keys(RULES).sort()).toEqual(Object.keys(EXPRESSIONS).sort());
    for (const [name, rule] of Object.entries(RULES)) expect([name, rule(m(name))]).toEqual([name, true]);
  });

  it('names only known morphs in every expression', () => {
    for (const e of Object.values(EXPRESSIONS)) for (const k of Object.keys(e)) expect(MORPHS).toContain(k);
  });

  it('keeps every morph the same length as the basis, so blends stay in step', () => {
    const n = geo.attributes.position.count * 3;
    expect(geo.morphAttributes.position).toHaveLength(MORPHS.length);
    for (const a of geo.morphAttributes.position) expect(a.array.length).toBe(n);
  });

  it('bakes a fixed face equal to the blended one (Low quality)', () => {
    const w = faceWeights('shocked');
    const baked = bakeFace(geo, w);
    const morphed = geo.attributes.position.array.slice();
    geo.morphAttributes.position.forEach((a, k) => { for (let i = 0; i < morphed.length; i++) morphed[i] += a.array[i] * w[k]; });
    const b = baked.attributes.position.array;
    let worst = 0;
    for (let i = 0; i < b.length; i++) worst = Math.max(worst, Math.abs(b[i] - morphed[i]));
    expect(worst).toBeLessThan(1e-6);
  });

  it('stays on the front of the head and above its surface', () => {
    const p = geo.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) expect(p[i + 2]).toBeGreaterThan(0.1);
  });
});
