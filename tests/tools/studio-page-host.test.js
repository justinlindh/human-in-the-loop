import { describe, it, expect } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { toolTmp } from '../../scripts/tools/tmp.mjs';
import { join, resolve } from 'node:path';

const HOST = resolve(__dirname, '../../scripts/studio/page-host.mjs');
const PLATFORM = resolve(__dirname, '../../scripts/studio/platform.mjs');
// Runs an ES module body in a fresh Node process and returns its last stdout line as JSON.
const node = (body) => {
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', body], { encoding: 'utf8', timeout: 200000 });
  return { status: r.status, out: JSON.parse(r.stdout.trim().split('\n').pop() || 'null'), err: r.stderr };
};

describe('studio page host', () => {
  it('keeps a small working DOM: classes, text, connection and selector queries', () => {
    const { out } = node(`const { installPlatform, Element } = await import(${JSON.stringify(PLATFORM)});
      installPlatform(process.cwd());
      const layer = document.body.appendChild(new Element());
      const el = document.createElement('div'); el.className = 'hitl-lbl hitl-say';
      const inner = el.appendChild(document.createElement('span')); inner.className = 'in'; inner.textContent = 'hello';
      const loose = document.createElement('div'); loose.classList.add('hitl-say');
      const before = document.querySelector('.hitl-say');
      layer.appendChild(el);
      const seen = { before, found: document.querySelector('.hitl-say') === el, desc: document.querySelectorAll('.hitl-say .in').length,
        text: el.textContent, connected: el.isConnected, looseConnected: loose.isConnected, contains: el.classList.contains('hitl-lbl') };
      const moved = document.createElement('div'); moved.appendChild(inner);
      console.log(JSON.stringify({ ...seen, afterMove: el.textContent, closest: inner.closest('div') === moved, removed: (el.remove(), document.querySelector('.hitl-say')) }));`);
    expect(out).toEqual({ before: null, found: true, desc: 1, text: 'hello', connected: true, looseConnected: false, contains: true, afterMove: '', closest: true, removed: null });
  });

  it('finds a speech bubble the game makes, under the label layer', () => {
    const { out, err } = node(`const { openPage } = await import(${JSON.stringify(HOST)});
      const rt = await openPage({ mock: 'floor', quality: 'low' });
      const { R, S } = rt;
      window.__step(5);
      R.handleEvents([{ type: 'say', staffId: S.staff[0].id, text: 'hello there' }], S);
      window.__step(10);
      const b = document.querySelector('.hitl-say');
      console.log(JSON.stringify({ text: b?.textContent ?? null, connected: !!b?.isConnected })); process.exit(0);`);
    expect(out, err).toEqual({ text: 'hello there', connected: true });
  }, 210000);

  it('runs each case in its own process with imports by site path, and reports an error per case', async () => {
    const dir = mkdtempSync(join(toolTmp(), 'page-host-test-'));
    try {
      const mod = join(dir, 'pages.mjs');
      writeFileSync(mod, `export const staff = async (n) => { const L = await import('/src/render/layout.js'); window.__tick(1000 / 30 * n); return { staff: window.__HITL.state.staff.length, hasLayout: typeof L.footprint === 'function' }; };
        export const boom = async () => { throw new Error('planted failure'); };`);
      const { runCases } = await import(HOST);
      const [a, b, c] = await runCases([
        { page: { mock: 'floor' }, module: mod, fn: 'staff', arg: 3 },
        { page: { mock: 'garage' }, module: mod, fn: 'staff', arg: 1 },
        { page: { mock: 'floor' }, module: mod, fn: 'boom' },
      ], { jobs: 2 });
      expect(a.value.hasLayout).toBe(true);
      expect(a.value.staff).toBeGreaterThan(b.value.staff);
      expect(c.error).toContain('planted failure');
    } finally { rmSync(dir, { recursive: true, force: true }); }
  }, 240000);

  it('blender/checks/standup.mjs stops its case processes when interrupted', async () => {
    const child = spawn(process.execPath, [resolve(__dirname, '../../blender/checks/standup.mjs'), '--no-live', '--jobs=2'], { stdio: 'ignore', env: { ...process.env, HITL_NO_CHECK_CACHE: '1' } });
    const kids = () => spawnSync('pgrep', ['-P', String(child.pid)], { encoding: 'utf8' }).stdout.split('\n').filter(Boolean).map(Number);
    const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
    const closed = new Promise((res) => child.on('close', (code, signal) => res({ code, signal })));
    let running = [];
    for (let i = 0; i < 200 && running.length < 2; i++) { await new Promise((r) => setTimeout(r, 50)); running = kids(); }
    expect(running.length).toBeGreaterThan(0);
    child.kill('SIGTERM');
    const { code, signal } = await closed;
    expect(code === 143 || signal === 'SIGTERM').toBe(true);
    for (let i = 0; i < 60 && running.some(alive); i++) await new Promise((r) => setTimeout(r, 50));
    expect(running.filter(alive)).toEqual([]);
  }, 60000);
});
