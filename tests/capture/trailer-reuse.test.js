import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { captureKey, canReuse, snapshotHash } from '../../scripts/trailer/reuse.js';
const item = { id: 'trailer-printer', actions: [{ at: 2, js: 'check()' }] };
const beat = { id: 'printer', from: 2 };
const record = { build: 'abc123', errors: 0, marks: [{ label: 'beat-check', beat: 'printer', t: 2, ok: true }] };
const subject = { code: 'code1', snapshots: 'snap1' };
const input = { beat, item, record, subject, key: captureKey(subject, item) };
describe('explicit verified footage reuse', () => {
  it('accepts identical capture specifications with passing cut evidence', () => expect(canReuse(input)).toBe(true));
  it('reuses across builds: the record names a different commit', () => {
    expect(canReuse({ ...input, record: { ...record, build: 'def456' } })).toBe(true);
  });
  it('rejects changed actions, game code or pinned snapshot, and failed or missing evidence', () => {
    expect(canReuse({ ...input, item: { ...item, actions: [] } })).toBe(false);
    expect(canReuse({ ...input, subject: { ...subject, code: 'code2' } })).toBe(false);
    expect(canReuse({ ...input, subject: { ...subject, snapshots: 'snap2' } })).toBe(false);
    for (const patch of [{ errors: 1 }, { build: '' }, { marks: [] }, { marks: [{ ...record.marks[0], ok: false }] }]) {
      expect(canReuse({ ...input, record: { ...record, ...patch } })).toBe(false);
    }
    expect(canReuse({ ...input, beat: { ...beat, from: 3 } })).toBe(false);
  });
  it.each(['yak', 'yak-react'])('requires a fresh %s shot even with a matching specification', id => {
    expect(canReuse({ ...input, beat: { ...beat, id }, record: { ...record, marks: [{ ...record.marks[0], beat: id }] } })).toBe(false);
  });
});
describe('snapshot hash', () => {
  const root = mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), 'reuse-'));
  mkdirSync(join(root, 'snaps'));
  const pinned = { id: 'x', setup: "fetch('/snaps/a.snap')" };
  it('follows the snapshot content, not the commit', () => {
    writeFileSync(join(root, 'snaps/a.snap'), 'one');
    const one = snapshotHash(root, pinned);
    expect(snapshotHash(root, pinned)).toBe(one);
    writeFileSync(join(root, 'snaps/a.snap'), 'two');
    expect(snapshotHash(root, pinned)).not.toBe(one);
  });
  it('ignores items with no snapshot', () => expect(snapshotHash(root, item)).toBe(snapshotHash(root, { id: 'y' })));
});
