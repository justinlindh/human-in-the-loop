import { describe, it, expect } from 'vitest';
import { beatList } from './trailer-beats/replay.mjs';

// Building the beat list loads every capture manifest, which is slow.
describe('trailer and landing beat replay (#1175)', { timeout: 60000 }, () => {
  it('covers trailer, pin and landing beats with a sim setup, and none that opens at an indexed moment', async () => {
    const list = await beatList();
    const ids = list.map((i) => i.id);
    for (const prefix of ['trailer-', 'pin-', 'site-']) expect(ids.some((id) => id.startsWith(prefix)), prefix).toBe(true);
    expect(list.every((i) => i.setup && !i.moment)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
