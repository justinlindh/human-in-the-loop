// Browser soak: advances weeks with every event routed through the renderer, UI, and audio, with
// frames rendered between weeks, and fails on any console or page error. Catches crashes that
// only fire on events (a still snapshot never sees them).
// npm run soak -- [--weeks 24] [--seed 1] [--quality low]
import { createServer } from 'vite';
import { chromium } from 'playwright';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const WEEKS = Number(arg('weeks', 24));
const SEED = Number(arg('seed', 1));
// Low quality and a small viewport keep software GL (CI runners have no GPU) fast enough.
const QUALITY = arg('quality', 'low');

const RUNS = [
  { name: 'mock floor 1x', query: 'mock=floor', speed: 1 },
  { name: 'mock floor 4x', query: 'mock=floor', speed: 4 },
  { name: `real seed ${SEED} 1x`, query: `seed=${SEED}`, speed: 1 },
];

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let failed = false;

try {
  for (const run of RUNS) {
    const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(`pageerror ${e.message} @ ${(e.stack || '').split('\n').slice(1, 3).join(' / ')}`));
    const t0 = Date.now();
    let res = null;
    try {
      await page.goto(`${base}?${run.query}&speed=${run.speed}&quality=${QUALITY}`);
      await page.waitForFunction(() => window.__HITL_READY === true, null, { timeout: 60000 });
      // One week at a time: resolve any decision, tick with events routed, then let a frame render.
      res = await page.evaluate(async (weeks) => {
        const H = window.__HITL;
        const frame = () => new Promise((r) => requestAnimationFrame(r));
        const start = H.state.week;
        for (let i = 0; i < weeks && !H.state.gameOver; i++) {
          for (let g = 0; g < 5 && H.state.pendingDecision; g++) H.dispatch({ type: 'resolveDecision', choice: 0 });
          H.tickN(1);
          await frame();
        }
        await new Promise((r) => setTimeout(r, 1500));
        return { weeks: H.state.week - start, gameOver: H.state.gameOver?.reason ?? null };
      }, WEEKS);
    } catch (e) {
      errors.push(`soak failed: ${e.message.split('\n')[0]}`);
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    const ok = !errors.length && res && (res.weeks >= WEEKS || res.gameOver);
    failed ||= !ok;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${run.name}: ${res ? `${res.weeks} weeks${res.gameOver ? ` (game over: ${res.gameOver})` : ''}` : 'did not run'}, ${errors.length} errors, ${secs}s`);
    for (const e of errors.slice(0, 5)) console.log(`     ${e}`);
    await page.close();
  }
} finally {
  await browser.close();
  await server.close();
}
process.exit(failed ? 1 : 0);
