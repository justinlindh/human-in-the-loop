import { describe, it, expect } from 'vitest';
import { captureKey, canReuse } from '../../scripts/trailer/reuse.js';
const item = { id: 'trailer-printer', actions: [{ at: 2, js: 'check()' }] };
const beat = { id: 'printer', from: 2 };
const record = { build: 'abc123', errors: 0, marks: [{ label: 'beat-check', beat: 'printer', t: 2, ok: true }] };
const input = { beat, item, record, key: captureKey(record.build, item) };
describe('explicit verified footage reuse', () => {
  it('accepts identical capture specifications with passing cut evidence', () => expect(canReuse(input)).toBe(true));
  it('rejects changed actions and failed or missing evidence', () => {
    expect(canReuse({ ...input, item: { ...item, actions: [] } })).toBe(false);
    for (const patch of [{ errors: 1 }, { build: '' }, { marks: [] }, { marks: [{ ...record.marks[0], ok: false }] }]) {
      expect(canReuse({ ...input, record: { ...record, ...patch } })).toBe(false);
    }
    expect(canReuse({ ...input, beat: { ...beat, from: 3 } })).toBe(false);
  });
  it.each(['yak', 'yak-react'])('requires a fresh %s shot even with a matching specification', id => {
    expect(canReuse({ ...input, beat: { ...beat, id }, record: { ...record, marks: [{ ...record.marks[0], beat: id }] } })).toBe(false);
  });
});
