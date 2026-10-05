// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { portrait, portraitImg, portraitLive, setPortraitSource } from './widgets.js';

// A renderer stub: portrait() returns a URL naming the expression it was asked for.
function stub(faces) {
  const asked = [];
  return {
    asked,
    face: (id) => (faces[id] ? { name: faces[id] } : null),
    // Like Low quality: one live canvas at a time; a second is a still that never animates.
    active: 0,
    portraitLive(p) {
      asked.push(p);
      const el = document.createElement('canvas');
      el.dataset.expr = p.expression ?? 'none';
      if (this.active >= 1) el.dataset.still = '1'; else this.active++;
      return { el, dispose: () => { if (!el.dataset.still) this.active--; } };
    },
    portrait: (p) => { asked.push(p); return `blob:${p.id}-${p.expression ?? 'none'}`; },
  };
}
const staff = { id: 7, role: 'engineer', mood: 'ok', appearance: {} };

describe('portraits follow the scene face', () => {
  afterEach(() => document.body.replaceChildren());

  it('asks for the expression the character shows', () => {
    const r = stub({ 7: 'delighted' });
    setPortraitSource(() => r);
    const img = portrait(staff, 48);
    expect(img.src).toContain('7-delighted');
    expect(r.asked[0].expression).toBe('delighted');
  });

  it('leaves a person the scene does not have as given', () => {
    const r = stub({});
    setPortraitSource(() => r);
    portrait({ ...staff, id: 99 }, 48);
    expect(r.asked[0].expression).toBeUndefined();
  });

  it('swaps a visible portrait when its face changes, and ignores other people', () => {
    const faces = { 7: 'ok', 8: 'ok' };
    const r = stub(faces);
    setPortraitSource(() => r);
    const a = portraitImg(staff, 44);
    const b = portraitImg({ ...staff, id: 8 }, 44);
    document.body.append(a, b);
    faces[7] = 'shocked';
    dispatchEvent(new CustomEvent('hitl:faceChange', { detail: { staffId: 7, name: 'shocked' } }));
    expect(a.src).toContain('7-shocked');
    expect(b.src).toContain('8-ok');
    faces[7] = 'ok';
    dispatchEvent(new CustomEvent('hitl:faceChange', { detail: { staffId: 7, name: 'ok' } }));
    expect(a.src).toContain('7-ok');
  });

  it('skips portraits that left the page', () => {
    const r = stub({ 7: 'ok' });
    setPortraitSource(() => r);
    const gone = portraitImg(staff, 44);
    const n = r.asked.length;
    dispatchEvent(new CustomEvent('hitl:faceChange', { detail: { staffId: 7, name: 'sad' } }));
    expect(r.asked.length).toBe(n);
    expect(gone.isConnected).toBe(false);
  });

  it('gives a live portrait a fresh canvas in place when the face changes', () => {
    const faces = { 7: 'ok' };
    const r = stub(faces);
    setPortraitSource(() => r);
    const el = portraitLive(staff, 88);
    document.body.append(el);
    expect(el.dataset.expr).toBe('ok');
    faces[7] = 'sad';
    dispatchEvent(new CustomEvent('hitl:faceChange', { detail: { staffId: 7, name: 'sad' } }));
    expect(el.isConnected).toBe(false);
    const fresh = document.body.querySelector('canvas');
    expect(fresh.dataset.expr).toBe('sad');
    expect(fresh.dataset.still).toBeUndefined();
    expect(r.active).toBe(1);
  });
});
