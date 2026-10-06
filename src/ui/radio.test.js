// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { stationList, hasBoombox, radioValue, pickAction, radioCard, OFF } from './radio.js';

const STATIONS = [{ id: 'lofi', name: 'Lo-fi' }, { id: 'funk', name: 'Funk' }];

describe('radio helpers', () => {
  it('reads stations from an object or an array, and tolerates none', () => {
    expect(stationList({ lofi: { name: 'Lo-fi' }, polka: 'Polka', funk: {} })).toEqual([{ id: 'lofi', name: 'Lo-fi' }, { id: 'polka', name: 'Polka' }, { id: 'funk', name: 'Funk' }]);
    expect(stationList([{ id: 'bossa', name: 'Bossa' }])).toEqual([{ id: 'bossa', name: 'Bossa' }]);
    expect(stationList(null)).toEqual([]);
  });

  it('shows only with a placed boombox', () => {
    expect(hasBoombox({ office: { placed: [{ id: 'p1', itemId: 'boombox' }] } })).toBe(true);
    expect(hasBoombox({ office: { placed: [{ id: 'p1', itemId: 'plant' }] } })).toBe(false);
    expect(hasBoombox({ office: { placed: [] } })).toBe(false);
  });

  it('shows the playing station, or Radio off', () => {
    expect(radioValue({ radio: { on: true, station: 'funk' } })).toBe('funk');
    expect(radioValue({ radio: { on: false, station: 'funk' } })).toBe(OFF);
    expect(radioValue({})).toBe(OFF);
  });

  it('a station turns the radio on with it; Radio off only turns it off', () => {
    expect(pickAction('funk')).toEqual({ type: 'setRadio', on: true, station: 'funk' });
    expect(pickAction(OFF)).toEqual({ type: 'setRadio', on: false });
  });
});

describe('radio card', () => {
  afterEach(() => document.body.replaceChildren());
  function make(radio) {
    const s = { radio };
    const acts = [];
    const ctx = { getState: () => s, act: vi.fn((a) => { acts.push(a); return { ok: true }; }), sfx: vi.fn(), acts };
    const binds = [];
    const card = radioCard(ctx, s, (fn) => binds.push(fn), STATIONS);
    document.body.append(card);
    binds.forEach((b) => b(s));
    return { s, ctx, card, refresh: () => binds.forEach((b) => b(s)) };
  }

  it('toggles the radio through setRadio and reports what is playing', () => {
    const { card, ctx, s, refresh } = make({ on: true, station: 'lofi' });
    expect(card.querySelector('.radionow').textContent).toBe('Playing Lo-fi.');
    expect(card.querySelector('.radiotoggle').getAttribute('aria-pressed')).toBe('true');
    card.querySelector('.radiotoggle').click();
    expect(ctx.acts).toContainEqual({ type: 'setRadio', on: false });
    s.radio = { on: false, station: 'lofi' };
    refresh();
    expect(card.querySelector('.radionow').textContent).toBe('Off. Lo-fi is next time.');
    expect(card.querySelector('.gpick').textContent).toContain('Radio off');
  });

  it('turns the radio on from a station pick', () => {
    const { card, ctx } = make({ on: false, station: null });
    card.querySelector('.gpick').click();
    const row = [...document.querySelectorAll('.pk-row')].find((r) => r.textContent.includes('Funk'));
    expect(row).toBeTruthy();
    row.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(ctx.acts).toContainEqual({ type: 'setRadio', on: true, station: 'funk' });
  });
});
