// Browser lifecycle check through the real UI: title, founding (company, founders, funding), play,
// save, reload, Continue. Exits non-zero on any console or page error, or a failed step.
// npm run lifecycle -- [--out shots/lifecycle] [--weeks 12]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = arg('out', 'shots/lifecycle');
const WEEKS = Number(arg('weeks', 12));
mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await (await browser.newContext({ viewport: { width: 1600, height: 900 } })).newPage();
const errors = [];
const failures = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror ${e.message} @ ${(e.stack || '').split('\n').slice(1, 4).join(' / ')}`));
const ready = () => page.waitForFunction(() => window.__HITL_READY === true, null, { timeout: 60000 });
const check = (label, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`); if (!ok) failures.push(label); };
const clickText = (re) => page.locator('button', { hasText: re }).first().click({ timeout: 10000 });

try {
  await page.goto(base); await ready(); await page.waitForTimeout(1000);
  const t0 = await page.evaluate(() => ({ playing: window.__HITL.playing, text: document.body.innerText }));
  check('title shows, not playing', !t0.playing && /New Game/.test(t0.text));
  await page.screenshot({ path: `${OUT}/1-title.png` });

  // Record what the UI hands to controls.newGame.
  await page.evaluate(() => {
    const c = window.__HITL.controls;
    const orig = c.newGame;
    c.newGame = (o) => { window.__newGameOpts = o; return orig(o); };
  });
  await clickText(/New Game/);
  await page.locator('input.text').first().fill('Testco');
  await page.locator('input.seed').fill('42');
  await page.screenshot({ path: `${OUT}/2-company.png` });
  await clickText(/Next: founders/);
  const cards = page.locator('button.fcard');
  await cards.nth(0).click(); await cards.nth(1).click();
  await page.screenshot({ path: `${OUT}/3-founders.png` });
  await clickText(/Next: funding/);
  await page.locator('button.fund').last().click();
  await page.screenshot({ path: `${OUT}/4-funding.png` });
  await clickText(/Start the company/);
  await page.waitForTimeout(800);
  const t1 = await page.evaluate(() => ({ playing: window.__HITL.playing, name: window.__HITL.state.companyName, seed: window.__HITL.state.seed, opts: window.__newGameOpts }));
  const o = t1.opts ?? {};
  check('started as Testco with seed 42', t1.playing && t1.name === 'Testco' && t1.seed === 42, JSON.stringify({ playing: t1.playing, name: t1.name, seed: t1.seed }));
  check('newGame got the founding options', o.companyName === 'Testco' && o.founders?.length === 2 && !!o.funding && !!o.logoColor && typeof o.tagline === 'string', JSON.stringify(o));

  for (let i = 0; i < 6; i++) await page.keyboard.press('Escape');
  // Advances n weeks, resolving any decision first (tick does nothing while one is pending).
  await page.evaluate(() => {
    window.__advance = (n) => {
      const H = window.__HITL;
      for (let i = 0; i < n; i++) {
        for (let g = 0; g < 5 && H.state.pendingDecision; g++) H.dispatch({ type: 'resolveDecision', choice: 0 });
        H.tickN(1);
      }
      return H.state.week;
    };
  });
  await page.evaluate((n) => { window.__advance(n); window.__HITL.controls.save(); }, WEEKS);
  const saved = await page.evaluate(() => ({ week: window.__HITL.state.week, has: Object.keys(localStorage).some((k) => k.startsWith('hitl.save')) }));
  check(`played ${WEEKS} weeks and saved`, saved.week === WEEKS && saved.has, JSON.stringify(saved));
  await page.screenshot({ path: `${OUT}/5-played.png` });

  // Saves without an explicit save: the tab going hidden, then the page being hidden (pagehide).
  const savedWeek = () => page.evaluate(() => {
    const k = Object.keys(localStorage).find((x) => x.startsWith('hitl.save'));
    try { return JSON.parse(localStorage.getItem(k)).week ?? JSON.parse(localStorage.getItem(k)).state?.week; } catch { return null; }
  });
  const hiddenWeek = await page.evaluate(() => {
    const week = window.__advance(2);
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    return week;
  });
  const onHidden = await savedWeek();
  check('saves when the tab is hidden', hiddenWeek === WEEKS + 2 && onHidden === hiddenWeek, `week ${hiddenWeek}, saved week ${onHidden}`);
  const finalWeek = await page.evaluate(() => { const week = window.__advance(1); dispatchEvent(new Event('pagehide')); return week; });
  const onPagehide = await savedWeek();
  check('saves on pagehide', finalWeek === WEEKS + 3 && onPagehide === finalWeek, `week ${finalWeek}, saved week ${onPagehide}`);

  await page.reload(); await ready(); await page.waitForTimeout(1000);
  const t2 = await page.evaluate(() => ({ playing: window.__HITL.playing, status: window.__HITL.controls.loadStatus() }));
  check('reload shows the title with a save', !t2.playing && t2.status.ok, JSON.stringify(t2.status));
  check('loadStatus carries the save meta', t2.status.meta?.companyName === 'Testco' && t2.status.meta?.week === WEEKS + 3 && 'logoColor' in (t2.status.meta ?? {}), JSON.stringify(t2.status.meta));
  await clickText(/Continue/);
  await page.waitForTimeout(800);
  const t3 = await page.evaluate(() => ({ playing: window.__HITL.playing, name: window.__HITL.state.companyName, week: window.__HITL.state.week }));
  check('Continue resumes the saved game', t3.playing && t3.name === 'Testco' && t3.week === WEEKS + 3, JSON.stringify(t3));
  await page.screenshot({ path: `${OUT}/6-continued.png` });
} catch (e) {
  failures.push(`step threw: ${e.message.split('\n')[0]}`);
  console.log(`FAIL step threw: ${e.message.split('\n')[0]}`);
} finally {
  await browser.close(); await server.close();
}
console.log(`console and page errors: ${errors.length}`);
for (const e of errors) console.log(`  ${e}`);
console.log(`screenshots: ${OUT}/`);
process.exit(errors.length || failures.length ? 1 : 0);
