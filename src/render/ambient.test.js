import { describe, it, expect, vi } from 'vitest';
import { existsSync } from 'node:fs';
import { AMBIENT_ICON, CHECK_S, REPLY_ALL, WAIT_S, ambientCarriers, ambientGlyph, ambientListener, ambientSeconds, createAmbientQueue, deskBubblesOn } from './ambient.js';

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

  it('keeps waiting news until a slot frees, oldest first, and drops it after WAIT_S', () => {
    const q = createAmbientQueue();
    q.push('a', 0); q.push('b', 1);
    const shown = [];
    let free = false;
    const show = (x) => { if (!free) return false; shown.push(x); return true; };
    q.drain(3, show);
    expect(q.size).toBe(2);
    free = true;
    q.drain(4, show);
    expect(shown).toEqual(['a', 'b']);
    expect(q.size).toBe(0);
    q.push('late', 10);
    free = false;
    q.drain(10 + WAIT_S + 0.1, show);
    expect(q.size).toBe(0);
    expect(shown).toEqual(['a', 'b']);
  });

  it('runs a reply-all storm as a few quick envelopes, about four seconds in all', () => {
    const total = (REPLY_ALL.count - 1) * REPLY_ALL.gapS + REPLY_ALL.holdS;
    expect(REPLY_ALL.count).toBeGreaterThanOrEqual(3);
    expect(total).toBeGreaterThan(3);
    expect(total).toBeLessThan(5);
    expect(existsSync('public/icons/glyphs/mail.svg')).toBe(true);
  });

  it('holds an all-clear check briefly and other news for its reading time', () => {
    expect(ambientSeconds('All clear', 1, 'check')).toBe(CHECK_S);
    expect(ambientSeconds('Minor outage', 1, 'warn')).toBeGreaterThan(CHECK_S);
  });
});
