import { describe, expect, it } from 'vitest';
import { GAG_ICONS, GAG_IDS, SHORT_MAX, gagDetail } from './ambient.js';
import { EVENTS } from '../data/events.js';
import { AMBIENT_ICON } from '../render/ambient.js';

const state = { products: [{ id: 'pr1' }], staff: [{ id: 's1' }] };

describe('a card-less gag as an ambient bubble', () => {
  it('uses the event\'s caption and the info tone', () => {
    expect(gagDetail({ eventId: 'printer_jam', subjectId: 's1' }, state)).toMatchObject({ topic: 'gag', subjectId: 's1', subjectKind: 'staff', text: 'Printer jammed', tone: 'info' });
    expect(gagDetail({ eventId: 'ping_pong', subjectId: null }, state).text).toBe('Ping-pong!');
  });

  it('words a trip by the choice applied', () => {
    expect(gagDetail({ eventId: 'conference_expo', choice: 1 }, state).text).toBe('Off to the expo');
    expect(gagDetail({ eventId: 'conference_expo', choice: 0 }, state).text).toBe('Skipped the expo');
    expect(gagDetail({ eventId: 'ai_summit', choice: 2 }, state).text).toBe('AI summit trip');
    expect(gagDetail({ eventId: 'ai_summit', choice: 0 }, state).text).toBe('Skipped the summit');
    expect(gagDetail({ eventId: 'ai_summit_panel', choice: 0 }, state).icon).toBe('check');
  });

  it('is the company\'s when there is no subject and a product\'s when the subject is one', () => {
    expect(gagDetail({ eventId: 'pet_mishap', subjectId: null }, state).subjectKind).toBe('company');
    expect(gagDetail({ eventId: 'pet_mishap', subjectId: 'pr1' }, state).subjectKind).toBe('product');
  });

  it('sends no bubble for an event without a caption of its own', () => {
    expect(gagDetail({ eventId: 'something_new', subjectId: null }, state)).toBeNull();
  });

  it('every event marked quiet has its own caption that fits a bubble', () => {
    const quiet = Object.values(EVENTS).filter((e) => e.quiet).map((e) => e.id);
    expect(quiet.length).toBeGreaterThan(0);
    for (const id of quiet) {
      const d = gagDetail({ eventId: id, subjectId: null, choice: 1 }, state);
      expect(d, id).not.toBeNull();
      expect(d.text.length, id).toBeLessThanOrEqual(SHORT_MAX);
      expect(d.text, id).not.toBe('Office moment');
    }
    expect(GAG_IDS).toEqual(expect.arrayContaining(quiet));
  });

  it('only uses icons the renderer\'s ambient map knows', () => {
    for (const icon of GAG_ICONS) expect(AMBIENT_ICON[icon], icon).toBeTruthy();
  });
});
