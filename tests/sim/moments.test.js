import { describe, it, expect } from 'vitest';
import { MOMENT_CAPTIONS } from '../../src/data/moments.js';
import { EVENTS } from '../../src/data/events.js';

describe('moment captions', () => {
  it('every staged decision has a caption, keyed by its event id', () => {
    for (const e of Object.values(EVENTS)) if (e.stage) expect(MOMENT_CAPTIONS[e.id], e.id).toBeTruthy();
    for (const key of Object.keys(MOMENT_CAPTIONS)) expect(EVENTS[key], key).toBeTruthy();
  });

  it('captions are one short line of plain text', () => {
    for (const [key, text] of Object.entries(MOMENT_CAPTIONS)) {
      expect(text.length, key).toBeLessThanOrEqual(72);
      expect(text, key).not.toMatch(/[{}\n]|startup/i);
    }
  });
});
