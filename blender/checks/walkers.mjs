// Measure people against furniture and each other in main.js's actual frame loop.
// Seeded saves come from the balanced bot; the same bot continues playing during measurement.
// Counts are intersecting body pairs per sample, using the sweep's mesh test and 2 cm tolerance.
// node blender/checks/walkers.mjs --cases 1:104,1:328,1:535,3:204 --seconds 30 --out shots/walkers
// --record writes every frame of the first case for a before/after clip. --max bounds total hits;
// --max-furniture bounds hits against the world while person-to-person contacts remain reported.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { glMode, holdRenderLock, launchChromium } from '../../scripts/lib/gl.js';
import { createGame, tick } from '../../src/sim/index.js';
import { botDecide, botTurn } from '../../src/sim/bots.js';
import { saveGame } from '../../src/save/save.js';
import { SHIM } from './loop-clock.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const cases = opt('cases', '1:104,1:328,1:535,3:204').split(',').map((s) => s.split(':').map(Number));
const seconds = Number(opt('seconds', 30));
if (!Number.isFinite(seconds) || seconds <= 0 || cases.some(([s, w]) => !Number.isInteger(s) || !Number.isInteger(w) || w < 0)) throw new Error('expected seed:week cases and positive seconds');
const out = resolve(opt('out', 'shots/walkers'));
const mode = glMode({ argv });
holdRenderLock(mode);
mkdirSync(out, { recursive: true });
const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const { browser } = await launchChromium(chromium, { mode, label: 'walkers' });
const results = [];
try {
  for (const [seed, week] of cases) {
    const state = createGame({ seed });
    while (state.week < week && !state.gameOver) { botDecide('balanced', state); botTurn('balanced', state); tick(state); }
    if (state.week !== week) throw new Error(`seed ${seed} ended at ${state.week}, before ${week}`);
    const mem = new Map();
    if (!saveGame(state, { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)), removeItem: (k) => mem.delete(k) })) throw new Error('save failed');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(SHIM);
    await page.addInitScript((entries) => {
      for (const [k, v] of entries) localStorage.setItem(k, v);
      localStorage.setItem('hitl:cameraSettings', JSON.stringify({ moments: false }));
      let s = 7654321;
      window.__tool = (fn) => {
        const prev = Math.random;
        Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
        try { return fn(); } finally { Math.random = prev; }
      };
    }, [...mem]);
    await page.goto(`${server.resolvedUrls.local[0]}?quality=low`, { waitUntil: 'load' });
    for (let i = 0; i < 1200; i++) {
      if (await page.evaluate(() => !!(window.__HITL && window.__hitlRender?.ready))) break;
      await page.evaluate(() => window.__frame(1));
      await new Promise((r) => setTimeout(r, 50));
    }
    await page.evaluate(async () => {
      const H = window.__HITL, R = window.__hitlRender;
      const load = document.querySelector('.tl-slot:not(:disabled)');
      if (!load) throw new Error('no Continue button');
      load.click();
      const X = await import('/blender/checks/intersect.js');
      const D = await import('/blender/checks/dump.js');
      const bots = await import('/src/sim/bots.js');
      await D.prepare();
      H.setSpeed(1);
      const buckets = Object.fromEntries(['chairs', 'plants', 'coffee', 'people', 'other'].map((k) => [k, { count: 0, walking: 0, max: 0 }]));
      let lastWeek = -1, f = 0, walkingSamples = 0;
      const hits = [];
      window.__walkMeasure = { buckets, hits, get walkingSamples() { return walkingSamples; }, step(sample = true) {
        // The Continue recap pauses play until the player dismisses it.
        document.querySelector('.modal-back.generic .btn.x')?.click();
        if (lastWeek !== H.state.week || H.state.pendingDecision) {
          const route = (events) => { if (events?.length) H.emit(events); };
          bots.botDecide('balanced', H.state, { onEvents: route });
          bots.botTurn('balanced', H.state, { onEvents: route });
          lastWeek = H.state.week;
        }
        window.__frame(1);
        f++;
        if (!sample || f % 6) return;
        R.scene.updateMatrixWorld();
        const world = X.bodies(R), ps = X.people(R, world);
        walkingSamples += ps.filter((p) => p.walking).length;
        const skip = (a, b) => { const [p, w] = a.kind === 'person' ? [a, b] : [b, a]; return p.own.has(w.key); };
        const pairs = [...X.crossOverlaps(ps, world, { tol: 0.02, skip }), ...X.overlaps(ps, { tol: 0.02 })];
        for (const o of pairs) {
          const [p, w] = o.a.kind === 'person' ? [o.a, o.b] : [o.b, o.a];
          const category = w.kind === 'person' ? 'people' : /plant/.test(w.label) ? 'plants' : /coffee_corner|espresso/.test(w.label) ? 'coffee' : /desk|chair/.test(w.label) ? 'chairs' : 'other';
          const b = buckets[category], walking = p.walking || !!w.walking;
          b.count++; if (walking) b.walking++; b.max = Math.max(b.max, o.depth);
          if (hits.length < 100) hits.push({ frame: f, week: H.state.week, category, person: p.id, other: w.id ?? w.label, walking, depth: o.depth, path: R.walkOf(p.id) });
          if (!window.__walkDump && walking && category !== 'people') window.__walkDump = { frame: f, t: f / 30, ...D.dumpFrame(R, H.state) };
        }
      } };
      // Let the loaded models finish appearing before measuring their real-size geometry.
      for (let i = 0; i < 90; i++) window.__walkMeasure.step(false);
    });
    const record = argv.includes('--record') && results.length === 0;
    const dir = `${out}/s${seed}-w${week}`;
    mkdirSync(dir, { recursive: true });
    if (record) mkdirSync(`${dir}/frames`, { recursive: true });
    for (let frame = 0; frame < seconds * 30; frame += record ? 1 : 30) {
      await page.evaluate((n) => { for (let i = 0; i < n; i++) window.__walkMeasure.step(); }, record ? 1 : Math.min(30, seconds * 30 - frame));
      if (record) await page.locator('canvas').first().screenshot({ path: `${dir}/frames/${String(frame).padStart(5, '0')}.png` });
    }
    const result = await page.evaluate(() => {
      const M = window.__walkMeasure;
      return { weekEnd: window.__HITL.state.week, buckets: M.buckets, hits: M.hits, walkingSamples: M.walkingSamples, dump: window.__walkDump };
    });
    if (result.dump) writeFileSync(`${dir}/dump.json`, JSON.stringify({ frames: [result.dump] }, null, 1));
    delete result.dump;
    const r = { seed, week, seconds, ...result, errors };
    results.push(r);
    await page.locator('canvas').first().screenshot({ path: `${dir}/end.png` });
    console.log(`walkers seed ${seed} weeks ${week}-${r.weekEnd}: ${JSON.stringify(r.buckets)}; ${r.walkingSamples} walking samples; ${errors.length} errors`);
    await page.close();
  }
} finally { await browser.close(); await server.close(); }
writeFileSync(`${out}/report.json`, JSON.stringify(results, null, 1));
const count = results.reduce((n, r) => n + Object.values(r.buckets).reduce((a, b) => a + b.count, 0), 0);
const furniture = results.reduce((n, r) => n + Object.entries(r.buckets).filter(([k]) => k !== 'people').reduce((a, [, b]) => a + b.count, 0), 0);
const failed = results.some((r) => r.errors.length || !r.walkingSamples || r.weekEnd <= r.week) || count > Number(opt('max', Infinity)) || furniture > Number(opt('max-furniture', Infinity));
console.log(`walkers: ${count} pair samples above 0.02 m; ${failed ? 'FAIL' : 'PASS'}`);
process.exitCode = failed ? 1 : 0;
