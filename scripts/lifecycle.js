// Browser lifecycle check through the real UI: title, founding (company, founders, funding), play,
// save, reload, Continue. Exits non-zero on any console or page error, or a failed step.
// npm run lifecycle -- [--out shots/lifecycle] [--weeks 12] [--quality low] [--no-shots]
// CI uses --quality low --no-shots: runners render with software GL, where full screenshots time out.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = arg('out', 'shots/lifecycle');
const WEEKS = Number(arg('weeks', 12));
const QUALITY = arg('quality', null);
const SHOTS = !argv.includes('--no-shots');
mkdirSync(OUT, { recursive: true });

const server = await createServer({ server: { port: 0 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const context = await browser.newContext({ viewport: QUALITY === 'low' ? { width: 960, height: 540 } : { width: 1600, height: 900 } });
// No CSS animation or transitions: on a slow runner an animating card never counts as stable, so
// clicks on it time out. The checks here are about behavior, not motion.
await context.addInitScript(() => {
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style');
    style.textContent = '*, *::before, *::after { animation: none !important; transition: none !important; }';
    document.head.append(style);
  });
});
const page = await context.newPage();
const shot = (name) => (SHOTS ? page.screenshot({ path: `${OUT}/${name}` }) : null);
const errors = [];
const failures = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror ${e.message} @ ${(e.stack || '').split('\n').slice(1, 4).join(' / ')}`));
const ready = () => page.waitForFunction(() => window.__HITL_READY === true, null, { timeout: 60000 });
const check = (label, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`); if (!ok) failures.push(label); };
// Generous: CI runners render with software GL and can take many seconds per frame.
// DOM clicks, not mouse input: on a software-GL runner a frame can take seconds (menus draw 3D
// portraits), and real input waits behind rendering long enough to time out. These checks are
// about behavior, not pointer handling.
// Long limits: opening the founders step blocks the main thread for seconds on a slow CPU (portraits).
const click = async (loc) => { await loc.waitFor({ state: 'attached', timeout: 120000 }); await loc.evaluate((el) => el.click(), undefined, { timeout: 120000 }); };
const clickText = (re) => click(page.locator('button:visible', { hasText: re }).first());

try {
  await page.goto(QUALITY ? `${base}?quality=${QUALITY}` : base, { waitUntil: 'domcontentloaded', timeout: 90000 }); await ready(); await page.waitForTimeout(1000);
  const t0 = await page.evaluate(() => ({ playing: window.__HITL.playing, text: document.body.innerText }));
  check('title shows, not playing', !t0.playing && /New Game/.test(t0.text));
  // The saved setting is applied at startup, but an explicit ?quality= wins for the session.
  const q0 = await page.evaluate(() => window.__HITL.controls.getQuality?.());
  check('graphics quality follows ?quality, else the saved setting', q0 === (QUALITY ?? 'high'), `active ${q0}`);
  await shot('1-title.png');

  // Record what the UI hands to controls.newGame.
  await page.evaluate(() => {
    const c = window.__HITL.controls;
    const orig = c.newGame;
    c.newGame = (o) => { window.__newGameOpts = o; return orig(o); };
  });
  // From the title: New Game, then the three founding steps.
  const found = async (name, seed, shots = false) => {
    await clickText(/New Game/);
    await page.locator('input.text').first().fill(name);
    await page.locator('input.seed').fill(String(seed));
    if (shots) await shot('2-company.png');
    await clickText(/Next: founders/);
    const cards = page.locator('button.fcard');
    await click(cards.nth(0)); await click(cards.nth(1));
    if (shots) await shot('3-founders.png');
    await clickText(/Next: funding/);
    await click(page.locator('button.fund').last());
    if (shots) await shot('4-funding.png');
    await clickText(/Start the company/);
    await page.waitForTimeout(800);
  };
  await found('Testco', 42, true);
  const t1 = await page.evaluate(() => ({ playing: window.__HITL.playing, name: window.__HITL.state.companyName, seed: window.__HITL.state.seed, opts: window.__newGameOpts }));
  const o = t1.opts ?? {};
  check('started as Testco with seed 42', t1.playing && t1.name === 'Testco' && t1.seed === 42, JSON.stringify({ playing: t1.playing, name: t1.name, seed: t1.seed }));
  check('newGame got the founding options', o.companyName === 'Testco' && o.founders?.length === 2 && !!o.funding && !!o.logoColor && typeof o.tagline === 'string', JSON.stringify(o));

  // Close the tutorial or any panel: Escape until the UI reports nothing open. Dispatched in the page,
  // since DOM clicks do not give the page keyboard focus.
  const closeAll = () => page.evaluate(() => {
    for (let i = 0; i < 10 && window.__HITL.clock.busy; i++) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    return window.__HITL.clock.busy;
  });
  await page.waitForTimeout(1000);
  await closeAll();
  // Advances n weeks, resolving any decision first (tick does nothing while one is pending).
  const defineAdvance = () => page.evaluate(() => {
    window.__advance = (n) => {
      const H = window.__HITL;
      for (let i = 0; i < n; i++) {
        for (let g = 0; g < 5 && H.state.pendingDecision; g++) H.dispatch({ type: 'resolveDecision', choice: 0 });
        H.tickN(1);
      }
      return H.state.week;
    };
  });
  await defineAdvance();
  await page.evaluate((n) => { window.__advance(n); window.__HITL.controls.save(); }, WEEKS);
  const saved = await page.evaluate(() => ({ week: window.__HITL.state.week, has: Object.keys(localStorage).some((k) => k.startsWith('hitl.save')) }));
  check(`played ${WEEKS} weeks and saved`, saved.week === WEEKS && saved.has, JSON.stringify(saved));
  await shot('5-played.png');

  // Saves without an explicit save: the tab going hidden, then the page being hidden (pagehide).
  const savedWeek = () => page.evaluate(() => {
    const slots = window.__HITL.controls.listSaves?.() ?? [];
    if (slots.length) return slots.find((x) => x.companyName === window.__HITL.state.companyName)?.week ?? null;
    try { return JSON.parse(localStorage.getItem('hitl.save.v1')).week; } catch { return null; }
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

  // Pause holds the world: the clock, the week, the day, and queued events all wait.
  const hold = await page.evaluate(async () => {
    const H = window.__HITL;
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    let routed = 0;
    const api = window.__HITL_UI;
    const orig = api.handleEvents;
    api.handleEvents = (ev, st) => { routed += ev.length; return orig(ev, st); };
    // Play first (a pending decision or an open panel would already hold everything).
    for (let g = 0; g < 5 && H.state.pendingDecision; g++) H.dispatch({ type: 'resolveDecision', choice: 0 });
    for (let i = 0; i < 10 && H.clock.busy; i++) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
    H.controls.setSpeed(1);
    const day0 = H.clock.dayClock;
    await wait(1500);
    const dayMoved = H.clock.dayClock !== day0;
    const before = { busy: H.clock.busy, pending: !!H.state.pendingDecision };
    H.controls.setSpeed(0);
    await wait(300);
    const a = { ...H.clock, week: H.state.week };
    routed = 0;
    await wait(3000);
    const b = { ...H.clock, week: H.state.week };
    api.handleEvents = orig;
    return { dayMoved, before, a, b, routed, rendererPaused: H.controls.renderer?.paused ?? 'n/a' };
  });
  const same = (k) => hold.a[k] === hold.b[k];
  check('pause holds the clock, the week, the day, and events',
    hold.dayMoved && hold.b.frozen && same('acc') && same('week') && same('dayClock') && same('queued') && hold.routed === 0 && hold.rendererPaused !== false,
    JSON.stringify({ dayMoved: hold.dayMoved, before: hold.before, acc: hold.b.acc, week: hold.b.week, day: hold.b.dayClock, queued: hold.b.queued, routed: hold.routed, rendererPaused: hold.rendererPaused }));

  // Auto-pause: focus leaving the page pauses and saves; coming back does not resume.
  const away = await page.evaluate(async () => {
    const H = window.__HITL;
    H.controls.setSpeed(1);
    const week = window.__advance(1);
    let resumeSpeed = null;
    addEventListener('hitl:awaypaused', (e) => { resumeSpeed = e.detail.resumeSpeed; }, { once: true });
    dispatchEvent(new Event('blur'));
    const at = { speed: H.clock.speed, away: H.controls.awayPaused, acc: H.clock.acc, resumeSpeed };
    await new Promise((r) => setTimeout(r, 3000));
    const later = { acc: H.clock.acc, week: H.state.week };
    dispatchEvent(new Event('focus'));
    await new Promise((r) => setTimeout(r, 1000));
    return { week, at, later, afterFocus: H.clock.speed };
  });
  const awaySaved = await savedWeek();
  check('blur pauses, saves, and holds the clock', away.at.speed === 0 && away.at.away && away.at.resumeSpeed === 1 && away.later.acc === away.at.acc && away.later.week === away.week && awaySaved === away.week, JSON.stringify({ ...away, awaySaved }));
  check('focus does not resume', away.afterFocus === 0, `speed ${away.afterFocus}`);
  const offSpeed = await page.evaluate(() => {
    const c = window.__HITL.controls;
    // Both names ui has used for the setting must work.
    c.setPauseOnBlur(false); c.setSpeed(1);
    dispatchEvent(new Event('blur'));
    const viaPauseOnBlur = window.__HITL.clock.speed;
    c.setPauseOnBlur(true); c.setAutoPause(false); c.setSpeed(1);
    dispatchEvent(new Event('blur'));
    const viaAutoPause = window.__HITL.clock.speed;
    c.setAutoPause(true); c.setSpeed(0);
    return viaPauseOnBlur === 1 && viaAutoPause === 1 && c.getAutoPause() === true ? 1 : `${viaPauseOnBlur}/${viaAutoPause}`;
  });
  check('with auto-pause off, blur leaves the game running', offSpeed === 1, `speed ${offSpeed}`);
  const lastWeek = away.week;

  // DOM-ready is enough: ready() then waits for the game itself, and slow runners can miss 'load' within 30 s.
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); await ready(); await page.waitForTimeout(1000);
  const t2 = await page.evaluate(() => ({ playing: window.__HITL.playing, status: window.__HITL.controls.loadStatus() }));
  check('reload shows the title with a save', !t2.playing && t2.status.ok, JSON.stringify(t2.status));
  check('loadStatus carries the save meta', t2.status.meta?.companyName === 'Testco' && t2.status.meta?.week === lastWeek && 'logoColor' in (t2.status.meta ?? {}), JSON.stringify(t2.status.meta));
  await clickText(/Continue/);
  await page.waitForTimeout(800);
  const t3 = await page.evaluate(() => ({ playing: window.__HITL.playing, name: window.__HITL.state.companyName, week: window.__HITL.state.week }));
  check('Continue resumes the saved game', t3.playing && t3.name === 'Testco' && t3.week === lastWeek, JSON.stringify(t3));
  await shot('6-continued.png');
  await defineAdvance();

  // A second company, then back to the title: New Game must not delete either earlier save.
  await page.evaluate(() => window.__HITL.controls.newGame());
  await page.waitForTimeout(500);
  await found('Secondco', 7);
  await page.evaluate(() => { window.__advance(3); window.__HITL.controls.save(); window.__HITL.controls.newGame(); });
  await page.waitForTimeout(800);
  const t4 = await page.evaluate(() => ({
    slots: (window.__HITL.controls.listSaves?.() ?? []).map((x) => `${x.companyName}@${x.week}${x.ok ? '' : ` (${x.reason})`}`),
    rows: document.querySelectorAll('.tl-slot').length,
  }));
  check('both companies stay listed after another New Game', ['Testco', 'Secondco'].every((n) => t4.slots.some((x) => x.startsWith(`${n}@`))) && t4.rows >= 2, JSON.stringify(t4));
  const t5 = await page.evaluate(() => {
    const first = window.__HITL.controls.listSaves().find((x) => x.companyName === 'Testco');
    const res = window.__HITL.controls.continueGame(first.id);
    return { ok: res.ok, name: window.__HITL.state.companyName, week: window.__HITL.state.week };
  });
  check('continueGame(id) loads that company', t5.ok && t5.name === 'Testco' && t5.week === lastWeek, JSON.stringify(t5));
} catch (e) {
  failures.push(`step threw: ${e.message.split('\n')[0]}`);
  // The first lines of Playwright's call log say what the click was waiting on.
  console.log(`FAIL step threw: ${e.message.split('\n').slice(0, 8).join('\n     ')}`);
} finally {
  await browser.close(); await server.close();
}
console.log(`console and page errors: ${errors.length}`);
for (const e of errors) console.log(`  ${e}`);
if (SHOTS) console.log(`screenshots: ${OUT}/`);
process.exit(errors.length || failures.length ? 1 : 0);
