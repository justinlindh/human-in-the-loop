import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { createRadio } from './radio.js';

// A canvas stand-in: the note sheet only needs a 2D context that accepts drawing calls.
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => {}), set: (t, k, v) => { t[k] = v; return true; } });
beforeEach(() => { globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) }; });

function office(withBoombox) {
  const placed = new Map();
  if (withBoombox) {
    const obj = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.8, 0.4));
    obj.position.set(2, 0.4, -3);
    obj.updateMatrixWorld(true);
    placed.set('bb', { itemId: 'boombox', obj });
  }
  return { placed };
}
const sprites = (g) => g.children.filter((c) => c.isSprite);

describe('radio', () => {
  it('builds nothing without a placed boombox, even with the radio on', () => {
    const parent = new THREE.Group();
    const r = createRadio({ office: office(false), parent });
    r.sync({ radio: { on: true, station: 'lofi' } });
    r.update(0.5);
    expect(r.playing).toBe(false);
    expect(sprites(r.group)).toHaveLength(0);
    expect(r.at()).toBe(null);
  });

  it('stays dark with a boombox while the radio is off or absent', () => {
    const r = createRadio({ office: office(true), parent: new THREE.Group() });
    for (const s of [{}, { radio: { on: false, station: 'polka' } }]) {
      r.sync(s);
      expect(r.playing).toBe(false);
      expect(r.group.visible).toBe(false);
      expect(sprites(r.group)).toHaveLength(0);
    }
  });

  it('floats notes over the boombox while it plays, one at a time on Low', () => {
    let low = false;
    const r = createRadio({ office: office(true), parent: new THREE.Group(), low: () => low });
    r.sync({ radio: { on: true, station: 'funk' } });
    r.update(0.8);
    const shown = () => sprites(r.group).filter((s) => s.visible);
    expect(shown()).toHaveLength(3);
    const top = r.at().y;
    expect(top).toBeCloseTo(0.8, 5);
    for (const s of shown()) expect(s.position.y).toBeGreaterThan(top - 0.2);
    low = true;
    r.update(0.1);
    expect(shown()).toHaveLength(1);
    r.sync({ radio: { on: false, station: 'funk' } });
    expect(r.group.visible).toBe(false);
  });

  it('turns the console record while it plays and leaves it still when off', () => {
    const o = office(true);
    const rec = new THREE.Object3D();
    rec.name = 'boombox_record';
    o.placed.get('bb').obj.add(rec);
    const r = createRadio({ office: o, parent: new THREE.Group() });
    r.sync({ radio: { on: true, station: 'bossa' } });
    r.update(0.5);
    const turned = rec.rotation.y;
    expect(turned).toBeGreaterThan(0);
    r.sync({ radio: { on: false, station: 'bossa' } });
    r.update(0.5);
    expect(rec.rotation.y).toBe(turned);
  });
});
