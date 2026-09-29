import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { gzipSync, gunzipSync } from 'node:zlib';
import { simHash } from '../../scripts/events/lib.js';

const FIND = resolve('scripts/events/find.js');
let dir;
// A tiny index: two hand-written rows, so a query answered from the index and one that needs a scan
// can be told apart without building the real one.
beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), 'events-find-'));
  const idx = join(dir, simHash());
  mkdirSync(idx, { recursive: true });
  const rows = [{ seed: 1, bot: 'balanced', week: 5, era: 'x', stage: 0, staff: 2, type: 'decision', id: 'printer_jam', choice: 0 }];
  writeFileSync(join(idx, 'events.jsonl.gz'), gzipSync(rows.map((r) => JSON.stringify(r)).join('\n') + '\n'));
  writeFileSync(join(idx, 'meta.json'), JSON.stringify({ bots: ['balanced'], seeds: [1], rows: 1 }));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const find = (...args) => {
  const r = spawnSync(process.execPath, [FIND, ...args, '--json'], { encoding: 'utf8', env: { ...process.env, HITL_EVENTS_DIR: dir }, timeout: 120000 });
  let out = null;
  try { out = JSON.parse(r.stdout); } catch { /* not JSON */ }
  return { code: r.status, out, err: r.stderr };
};
const SCAN = ['--scan-seeds', '1', '--scan-weeks', '30', '--bot', 'balanced'];

describe('find.js --where', () => {
  it('answers a predicate that never reads the state from the index, with no scan', () => {
    const r = find('printer_jam', '--where', 'e.choice === 0');
    expect(r.code).toBe(0);
    expect(r.out).toHaveLength(1);
    expect(r.out[0].scanned).toBeUndefined();
  });

  it('scans for a state predicate, writes a snapshot from just before the tick, and caches it', () => {
    const q = ['--where', "e.type === 'week' && s.week === 10", ...SCAN];
    const first = find(...q);
    expect(first.code).toBe(0);
    expect(first.out).toHaveLength(1);
    const row = first.out[0];
    expect(row).toMatchObject({ seed: 1, bot: 'balanced', week: 10, scanned: true });
    expect(existsSync(row.snapshotFile)).toBe(true);
    // The snapshot is the state before the tick that made it week 10.
    expect(JSON.parse(gunzipSync(readFileSync(row.snapshotFile)).toString()).week).toBe(9);
    const again = find(...q);
    expect(again.out).toEqual(first.out);
    expect(again.err).not.toMatch(/scanned/);
  });

  it('exits 1 when a scan finds nothing, and with --no-scan does not scan at all', () => {
    expect(find('--where', 'false', ...SCAN).code).toBe(1);
    const none = find('--where', 's.week === 10', '--no-scan');
    expect(none.code).toBe(1);
    expect(none.out).toEqual([]);
  });

  it("applies --setup to the state each week before the tick, and it changes the match", () => {
    const r = find('--where', "e.type === 'week' && s.marker === 3", '--setup', 's.marker = (s.marker ?? 0) + 1;', ...SCAN);
    expect(r.code).toBe(0);
    expect(r.out[0].week).toBe(3);
  });

  it('refuses a predicate that is not JS with exit 2 and kind bad-query', () => {
    const r = find('--where', 'e.type ===', ...SCAN);
    expect(r.code).toBe(2);
    expect(r.out.kind).toBe('bad-query');
  });

  it('reports a predicate that throws while scanning as scan-failed, exit 2', () => {
    const r = find('--where', 's.nothing.here', ...SCAN);
    expect(r.code).toBe(2);
    expect(r.out.kind).toBe('scan-failed');
  });

  it('looks ahead: --then confirms a moment from a later week, the snapshot stays before the first tick', () => {
    const r = find('--where', "e.type === 'week' && s.week === 4", '--then', "e.type === 'week' && s.week === 9 && s.week", '--within', '10', ...SCAN);
    expect(r.code).toBe(0);
    expect(r.out[0]).toMatchObject({ week: 4, result: 9 });
    expect(JSON.parse(gunzipSync(readFileSync(r.out[0].snapshotFile)).toString()).week).toBe(3);
  });

  it('drops a moment whose --then never holds within --within, and says so', () => {
    const r = find('--where', "e.type === 'week' && s.week === 4", '--then', "e.type === 'week' && s.week === 20", '--within', '5', ...SCAN);
    expect(r.code).toBe(1);
    expect(r.err).toMatch(/1 moment\(s\) matched --where and none satisfied --then within 5 weeks/);
  });

  it('ranks matches by --rank, highest first, over every seed asked for', () => {
    const r = find('--where', "e.type === 'week' && s.week === 6", '--rank', 'm.seed', '--scan-seeds', '1-3', '--scan-weeks', '10', '--bot', 'balanced', '--limit', '3');
    expect(r.out.map((x) => x.seed)).toEqual([3, 2, 1]);
    expect(r.out[0].rank).toBe(3);
  });

  it('names the && part no run made true, so an unreachable condition is not scanned forever', () => {
    const r = find('--explain', '--where', "e.type === 'week' && s.week === 5 && s.office.stage === 2", ...SCAN);
    expect(r.code).toBe(1);
    expect(r.out.matches).toEqual([]);
    expect(r.out.scan.unreachable).toEqual(['s.office.stage === 2']);
    expect(r.err).not.toBe(null);
  });

  it('keeps the snapshots of two queries that differ only in --setup and match the same week apart', () => {
    const base = ['--where', "e.type === 'week' && s.week === 7", ...SCAN];
    const a = find(...base);
    const b = find(...base, '--setup', 's.flags.zzprobe = 1;');
    expect(a.out[0].snapshotFile).not.toBe(b.out[0].snapshotFile);
    const flag = (r) => JSON.parse(gunzipSync(readFileSync(r.out[0].snapshotFile)).toString()).flags?.zzprobe;
    expect(flag(find(...base))).toBeUndefined();
    expect(flag(b)).toBe(1);
  });

  it('applies --stage, --era and --weeks to scanned events', () => {
    const w = ['--where', "e.type === 'week'", ...SCAN, '--limit', '1'];
    expect(find(...w, '--stage', 'hq').code).toBe(1);
    expect(find(...w, '--era', 'no_such_era').code).toBe(1);
    expect(find(...w, '--weeks', '12-13').out[0].week).toBe(12);
    expect(find(...w, '--stage', 'garage', '--weeks', '3-4').out[0].week).toBe(3);
  });

  it('refuses a filter on index-only fields for a scan, exit 2', () => {
    const r = find('--where', 's.week === 3', '--choice', '0', ...SCAN);
    expect(r.code).toBe(2);
    expect(r.out.kind).toBe('bad-query');
  });

  it('runs --before before the decide and the turn each week, and --extra adds fields to the row', () => {
    const r = find('--where', "e.type === 'week' && s.week === 4", '--before', 's.marker = (s.marker ?? 0) + 1;', '--extra', '({ mk: s.marker })', ...SCAN);
    expect(r.code).toBe(0);
    expect(r.out[0].mk).toBe(2 * r.out[0].week);
  });

  it('plays the bot --bot-js names each week, and refuses one that is not JS', () => {
    const ok = find('--where', "e.type === 'week' && s.week === 3", '--bot-js', "s.week < 2 ? 'balanced' : 'sensible'", ...SCAN);
    expect(ok.code).toBe(0);
    const bad = find('--where', 's.week === 3', '--bot-js', "s.week <", ...SCAN);
    expect(bad.code).toBe(2);
    expect(bad.out.kind).toBe('bad-query');
  });
});

