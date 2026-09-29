// The real-game-loop page shared by loop.mjs and play.mjs: virtual time (timers, requestAnimationFrame,
// performance.now and Date.now driven one frame at a time by __frame) and a page that loads a
// snapshot through the title screen's Continue path, so main.js's own frame loop runs as for a player.
import { snapshotEntries } from '../../scripts/events/load.js';

// Virtual time for the page. __frame(n) advances n frames: due timers run, then the frames' rAFs.
export const SHIM = `(() => {
  let now = 0, seq = 1, rafs = [];
  const timers = new Map();
  let s = 20260925;
  Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  performance.now = () => now;
  Date.now = () => 1790000000000 + now;
  window.setTimeout = (fn, ms = 0, ...a) => { const id = seq++; timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, a }); return id; };
  window.setInterval = (fn, ms = 0, ...a) => { const id = seq++; timers.set(id, { at: now + Math.max(1, Number(ms) || 0), fn, a, every: Math.max(1, Number(ms) || 0) }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (cb) => { const id = seq++; rafs.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { rafs = rafs.filter((r) => r.id !== id); };
  const run = (fn, a) => { try { if (typeof fn === 'function') fn(...a); } catch (e) { console.error(e); } };
  window.__frame = (n = 1) => {
    for (let i = 0; i < n; i++) {
      now += 1000 / 30;
      for (const [id, t] of [...timers].sort((x, y) => x[1].at - y[1].at)) {
        if (t.at > now) continue;
        if (t.every) t.at += t.every; else timers.delete(id);
        run(t.fn, t.a);
      }
      const due = rafs; rafs = [];
      for (const r of due) run(r.cb, [now]);
    }
  };
})();`;

// A page on `base` with the shim installed and `snapshotFile` waiting in localStorage, loaded once the
// game and renderer are ready. Returns { page, errors }; nothing has been continued yet.
export async function openLoopPage(browser, base, snapshotFile, { width = 1280, height = 800, quality = 'medium' } = {}) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.addInitScript(SHIM);
  await page.addInitScript((list) => { for (const [k, v] of list) localStorage.setItem(k, v); }, await snapshotEntries(snapshotFile));
  await page.goto(`${base}?quality=${quality}`, { waitUntil: 'load' });
  // Loading (models, fonts) runs on real promises; frames keep the page's own timers moving.
  for (let i = 0; i < 1200; i++) {
    if (await page.evaluate(() => !!(window.__HITL && window.__hitlRender?.ready))) break;
    await page.evaluate(() => window.__frame(1));
    await new Promise((r) => setTimeout(r, 50));
  }
  return { page, errors };
}
