import { describe, expect, it } from 'vitest';
import { gagDetail } from './ambient.js';

const state = { products: [{ id: 'pr1' }], staff: [{ id: 's1' }] };

describe('a card-less gag as an ambient bubble', () => {
  it('uses the event\'s caption and the info tone', () => {
    expect(gagDetail({ eventId: 'printer_jam', subjectId: 's1' }, state)).toMatchObject({ topic: 'gag', subjectId: 's1', subjectKind: 'staff', text: 'Printer jammed', tone: 'info' });
    expect(gagDetail({ eventId: 'ping_pong', subjectId: null }, state).text).toBe('Ping-pong!');
    expect(gagDetail({ eventId: 'ai_summit', subjectId: null }, state).text).toBe('AI summit trip');
  });

  it('is the company\'s when there is no subject and a product\'s when the subject is one', () => {
    expect(gagDetail({ eventId: 'pet_mishap', subjectId: null }, state).subjectKind).toBe('company');
    expect(gagDetail({ eventId: 'pet_mishap', subjectId: 'pr1' }, state).subjectKind).toBe('product');
  });

  it('falls back to a generic caption for an event without one', () => {
    expect(gagDetail({ eventId: 'something_new', subjectId: null }, state)).toMatchObject({ text: 'Office moment', icon: 'idea' });
  });
});
