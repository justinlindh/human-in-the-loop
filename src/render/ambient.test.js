import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { AMBIENT_ICON, CHECK_S, ambientCarriers, ambientGlyph, ambientListener, ambientSeconds, deskBubblesOn } from './ambient.js';

const event = (detail) => ({ detail, preventDefault: vi.fn() });

describe('ambient status news', () => {
  it('leaves every event unclaimed with deskBubbles off, so it stays a toast', () => {
    const draw = vi.fn(() => true);
    const ev = event({ topic: 'back', subjectId: 's1', subjectKind: 'staff', text: 'Back!' });
    ambientListener(draw, () => deskBubblesOn({ pacing: { deskBubbles: false } }))(ev);
    expect(draw).not.toHaveBeenCalled();
    expect(ev.preventDefault).not.toHaveBeenCalled();
  });

  it('claims only what it draws with the switch on', () => {
    const on = () => deskBubblesOn({ pacing: {} });
    const drawn = event({}), skipped = event({});
    ambientListener(() => true, on)(drawn);
    ambientListener(() => false, on)(skipped);
    expect(drawn.preventDefault).toHaveBeenCalledOnce();
    expect(skipped.preventDefault).not.toHaveBeenCalled();
  });

  it('finds the person, a project team, or a product owner then its workers', () => {
    const state = {
      staff: [
        { id: 'a', assignment: { type: 'project', targetId: 'p1' } },
        { id: 'b', assignment: { type: 'maintenance', targetId: 'prod1' } },
        { id: 'c', assignment: { type: 'project', targetId: 'p2' } },
        { id: 'd', assignment: { type: 'sales', targetId: null } },
      ],
      projects: [{ id: 'p1', productId: null }, { id: 'p2', productId: 'prod1' }],
      products: [{ id: 'prod1', ownerId: 'd' }],
    };
    expect(ambientCarriers({ subjectKind: 'staff', subjectId: 'c' }, state)).toEqual(['c']);
    expect(ambientCarriers({ subjectKind: 'staff', subjectId: 'gone' }, state)).toEqual([]);
    expect(ambientCarriers({ subjectKind: 'project', subjectId: 'p1' }, state)).toEqual(['a']);
    expect(ambientCarriers({ subjectKind: 'product', subjectId: 'prod1' }, state)).toEqual(['d', 'b', 'c']);
    expect(ambientCarriers({ subjectKind: 'company', subjectId: 'x' }, state)).toEqual([]);
  });

  it('draws every ui icon id with a glyph that exists, and an unknown one by its tone', () => {
    for (const glyph of Object.values(AMBIENT_ICON)) expect(existsSync(`public/icons/glyphs/${glyph}.svg`), glyph).toBe(true);
    expect(ambientGlyph('nope', 'bad')).toBe('toast.bad');
    expect(existsSync('public/icons/glyphs/toast.bad.svg')).toBe(true);
  });

  it('holds an all-clear check briefly and other news for its reading time', () => {
    expect(ambientSeconds('All clear', 1, 'check')).toBe(CHECK_S);
    expect(ambientSeconds('Minor outage', 1, 'warn')).toBeGreaterThan(CHECK_S);
  });
});
