import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pairDepths, touching, useInterior } from '../../blender/checks/intersect.js';
import { meshContact, depthAtTol } from '../../scripts/studio/geometry.mjs';

const script = (name) => resolve(__dirname, '../..', name);
const box = (x, y, z, m) => { const mesh = new THREE.Mesh(new THREE.BoxGeometry(x, y, z)); mesh.applyMatrix4(m); mesh.updateMatrixWorld(true); mesh.geometry.computeBoundingBox(); return mesh; };

describe('the engine reads a mesh pair as the sweep does', () => {
  // The crossing reach of a pair whose vertices sit under the tolerance is measured along the other mesh's
  // axes, so it changes with how the pair is turned; the engine has to give the sweep's number on turned
  // meshes too. A seeded scatter of turned, touching boxes: every pair agrees, and enough of them read the
  // crossing reach for the case to count.
  it('agrees with pairDepths on turned meshes, crossing reach included', () => {
    let seed = 12345;
    const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 2 ** 32 - 0.5; };
    const turn = () => new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rand() * 6, rand() * 6, rand() * 6));
    let touched = 0, crossing = 0;
    for (let i = 0; i < 300; i++) {
      const a = box(0.4, 0.6, 0.3, turn());
      const b = box(0.3, 0.3, 0.3, new THREE.Matrix4().makeTranslation(rand() * 0.5, rand() * 0.5, rand() * 0.5).multiply(turn()));
      if (!touching(a, b)) continue;
      touched++;
      const sweep = Math.max(...pairDepths(a, b, 0.02).map((r) => r.depth));
      const c = meshContact(a, b);
      expect(c.intersects).toBe(true);
      expect(Math.abs(depthAtTol(c, 0.02) - sweep), `pair ${i}`).toBeLessThan(1e-5);
      if (!useInterior(c.interiorM, 0.02)) crossing++;
    }
    expect(touched).toBeGreaterThan(100);
    expect(crossing).toBeGreaterThan(5);
  });

  it('one rule chooses between the interior and the crossing reach', () => {
    expect(useInterior(0.03, 0.02)).toBe(true);
    expect(useInterior(0.02, 0.02)).toBe(false);
    expect(depthAtTol({ intersects: true, interiorM: 0.015, crossM: 0.2 }, 0.02)).toBe(0.2);
    expect(depthAtTol({ intersects: true, interiorM: 0.015, crossM: 0.2 }, 0.01)).toBe(0.015);
  });
});

describe('sweep-parity', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sweep-parity-'));
  const report = (name, rows) => { const f = join(dir, name); writeFileSync(f, JSON.stringify({ violations: rows })); return f; };
  const row = (key, value, states = ['mock:floor'], check = 'person') => ({ check, key, value, state: states[0], states });
  const run = (a, b) => spawnSync(process.execPath, [script('scripts/studio/sweep-parity.mjs'), a, b], { encoding: 'utf8' });

  it('passes when the same rows come at the same depths in the same states, and ignores browser-only checks', () => {
    const a = report('a.json', [row('person|x|y', 0.05), row('screen|l|f', 0.4, ['mock:floor'], 'screen')]);
    const b = report('b.json', [row('person|x|y', 0.053)]);
    const r = run(a, b);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/1 of 1 rows match/);
  });

  it('fails on a row in one run only, a depth past the tolerance, and a different state', () => {
    const a = report('c.json', [row('person|x|y', 0.05), row('overlap|p|q', 0.02), row('person|s|t', 0.03, ['mock:floor'])]);
    const b = report('d.json', [row('person|x|y', 0.09), row('person|new|row', 0.04), row('person|s|t', 0.03, ['mock:hq'])]);
    const r = run(a, b);
    expect(r.status).toBe(1);
    expect(r.stdout).toMatch(/first only\s+overlap\|p\|q/);
    expect(r.stdout).toMatch(/second only\s+person\|new\|row/);
    expect(r.stdout).toMatch(/differ\s+person\|x\|y/);
    expect(r.stdout).toMatch(/states\s+person\|s\|t/);
    rmSync(dir, { recursive: true, force: true });
  });
});

describe('sweep --engine', () => {
  it('runs the mocks on the studio engine and finds what the browser sweep finds there', () => {
    const out = mkdtempSync(join(tmpdir(), 'sweep-engine-'));
    const r = spawnSync(process.execPath, [script('blender/checks/sweep.mjs'), '--engine', '--mocks', 'garage,night', '--seeds', 'none', '--out', out], { encoding: 'utf8', timeout: 240000 });
    rmSync(out, { recursive: true, force: true });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/mock:garage 0 violation/);
    expect(r.stdout).toMatch(/mock:night 0 violation/);
  }, 260000);

  it('replays one state from a report in seconds, and refuses an indexed moment', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sweep-replay-'));
    const v = (state) => ({ check: 'person', key: 'person|a|b', state, states: [state], a: 'a', b: 'b', value: 0.1 });
    const write = (name, report) => { const f = join(dir, name); writeFileSync(f, JSON.stringify({ mode: 'fast', ...report })); return f; };
    const t0 = Date.now();
    let r = spawnSync(process.execPath, [script('blender/checks/sweep.mjs'), '--engine', '--replay', write('seed.json', { windows: [], violations: [v('seed:1:w5')] }), '--out', join(dir, 'out')], { encoding: 'utf8', timeout: 120000 });
    expect(r.status, r.stdout + r.stderr).toBe(0);
    expect(r.stdout).toMatch(/seed:1 played to week 6; windows: w5/);
    expect(r.stdout).toMatch(/replay: 0 of 1 reported violation\(s\) still present, 1 gone/);
    expect(Date.now() - t0).toBeLessThan(60000);
    r = spawnSync(process.execPath, [script('blender/checks/sweep.mjs'), '--engine', '--replay', write('event.json', { windows: [{ state: 'event:x:s1', query: 'printer_jam' }], violations: [v('event:x:s1')] }), '--out', join(dir, 'out2')], { encoding: 'utf8', timeout: 120000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/cannot replay an indexed moment/);
    rmSync(dir, { recursive: true, force: true });
  }, 200000);

  it('refuses the runs it does not do yet', () => {
    const r = spawnSync(process.execPath, [script('blender/checks/sweep.mjs'), '--engine', '--moments', 'printer_jam'], { encoding: 'utf8', timeout: 60000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/--engine does not run --moments/);
  });
});
