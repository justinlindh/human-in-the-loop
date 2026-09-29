import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const cache = mkdtempSync(join(tmpdir(), 'prewarm-'));
process.env.HITL_EVENTS_DIR = cache;
const { splitArgs, readQueries } = await import('../../scripts/events/prewarm.js');
const { simHash, indexDir } = await import('../../scripts/events/lib.js');
const run = (...args) => spawnSync(process.execPath, ['scripts/events/prewarm.js', ...args], { encoding: 'utf8', env: { ...process.env, HITL_EVENTS_DIR: cache } });
const hash = simHash();
const dir = indexDir(hash);
const queries = readQueries(readFileSync('scripts/events/prewarm.txt', 'utf8'));
const listHash = createHash('sha256').update(queries.join('\n')).digest('hex').slice(0, 16);

afterAll(() => rmSync(cache, { recursive: true, force: true }));

describe('prewarm argument lines', () => {
  it('splits words, single and double quotes', () => {
    expect(splitArgs(`--where "e.type === 'week' && s.x" --limit 3`)).toEqual(['--where', "e.type === 'week' && s.x", '--limit', '3']);
    expect(splitArgs(`a  'b c'  ""`)).toEqual(['a', 'b c', '']);
  });
  it('refuses an unclosed quote', () => {
    expect(() => splitArgs(`--where "oops`)).toThrow(/unclosed/);
  });
  it('skips blank lines and comments', () => {
    expect(readQueries('# c\n\n  x --y 1  \n#z\nq')).toEqual(['x --y 1', 'q']);
  });
  it('lists the shipped queries and starts with the outage stretch', () => {
    expect(queries.length).toBeGreaterThan(0);
    expect(queries[0]).toContain('s.outage');
    expect(run('--list').stdout.trim().split('\n')).toEqual(queries);
  });
});

describe('prewarm with a fake index', () => {
  beforeAll(() => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, 'events.jsonl.gz'), 'not a real index'); });

  it('returns at once when the stamp matches this sim code and list', () => {
    writeFileSync(join(dir, 'prewarm.json'), JSON.stringify({ list: listHash }));
    const t = Date.now(); const r = run();
    expect(r.status).toBe(0);
    expect(r.stderr).toContain(`warm for ${hash}`);
    expect(Date.now() - t).toBeLessThan(3000);
  });

  it('reruns when the list changed, and exits 1 naming a query it could not answer', () => {
    writeFileSync(join(dir, 'prewarm.json'), JSON.stringify({ list: 'other' }));
    const r = run();
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('could not answer (exit 2)');
    expect(r.stderr).toContain('bad-index');
  });

  it('--force ignores the stamp', () => {
    writeFileSync(join(dir, 'prewarm.json'), JSON.stringify({ list: listHash }));
    expect(run('--force').status).toBe(1);
  });

  it('a running prewarm for the same sim code makes the second exit 0 without work', () => {
    rmSync(join(dir, 'prewarm.json'), { force: true });
    const lock = join(cache, `prewarm-${hash}.lock`);
    writeFileSync(lock, String(process.pid));
    const r = run();
    expect(r.status).toBe(0);
    expect(r.stderr).toContain('another prewarm is running');
    rmSync(lock);
  });

  it('a lock left by a dead process does not block it', () => {
    const dead = spawnSync(process.execPath, ['-e', 'process.stdout.write(String(process.pid))'], { encoding: 'utf8' }).stdout;
    writeFileSync(join(cache, `prewarm-${hash}.lock`), dead);
    const r = run();
    expect(r.stderr).not.toContain('another prewarm');
    expect(r.status).toBe(1);
  });
});
