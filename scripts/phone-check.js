// Phone and tablet playability check: plays the real game on touch device descriptors and fails on
// anything that makes it unplayable by finger. Exits 1 on a failed check or a console error.
//
// node scripts/phone-check.js [--devices iphone14,iphone14-land,android,ipad] [--checks a,b]
//   [--query "seed=7"] [--out shots/phone] [--software|--gpu]
//
// Devices: iphone14 (390x664), iphone14-land (750x340), iphone-se-land (667x375), android (360x800),
// android-land (800x360), ipad (768x1024), desktop (1440x900, mouse; layout checks only).
// Checks (all by default):
//   pinch      two-finger pinch zooms the camera, never the page; two-finger pan, one-finger drag, and
//              lifting one finger of a pinch does not jump the camera; pinch on the HUD and double-tap
//              leave the page at scale 1
//   hud        the top bar, tray strip, Yak and menu don't overlap, and nothing runs off the right edge
//   panels     every menu panel fits on screen, nothing inside is cut off, and its close button works
//   decision   a real decision card fits, and its last choice can be reached and tapped
//   toasts     phones show at most two toasts and they don't block taps
//   placement  Office, Place, then tap-to-aim and tap-to-place puts furniture down
//   taps       a plain tap on a person opens them; two fingers resting on a person pop no long-press tip
//   audio      audio unlocks on the first tap under an iOS-like gesture rule (pointerup, touchend, click)
//   yak        Yak expands (by its caret) with its header controls inside it and without covering the
//              HUD, collapses, and its maximized view opens and closes without leaving anything over
//              the game
// Uses CDP Input.dispatchTouchEvent for real multi-touch. GL follows scripts/lib/gl.js, and the run
// holds the matching render lock.
import { createServer } from 'vite';
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { glMode, holdRenderLock, launchChromium } from './lib/gl.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

const DEVICES = {
  iphone14: devices['iPhone 14'],
  'iphone14-land': devices['iPhone 14 landscape'],
  'iphone-se-land': { ...devices['iPhone SE landscape'], viewport: { width: 667, height: 375 } },
  android: { ...devices['Galaxy S8'], viewport: { width: 360, height: 800 } },
  'android-land': { ...devices['Galaxy S8 landscape'], viewport: { width: 800, height: 360 } },
  ipad: devices['iPad Mini'],
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
};
const ALL_CHECKS = ['pinch', 'hud', 'panels', 'decision', 'toasts', 'placement', 'taps', 'audio', 'yak'];
const TOUCH_ONLY = new Set(['pinch', 'toasts', 'taps', 'audio']);

const args = parseArgs(process.argv.slice(2));
const deviceNames = String(args.devices ?? 'iphone14,iphone14-land,android,ipad').split(',');
const checks = String(args.checks ?? ALL_CHECKS.join(',')).split(',');
const outDir = resolve(String(args.out ?? 'shots/phone'));
const query = typeof args.query === 'string' ? args.query : 'seed=7';
for (const d of deviceNames) if (!DEVICES[d]) { console.error(`phone-check: unknown device ${d}`); process.exit(2); }
for (const c of checks) if (!ALL_CHECKS.includes(c)) { console.error(`phone-check: unknown check ${c}`); process.exit(2); }
mkdirSync(outDir, { recursive: true });

const GL = glMode();
holdRenderLock(GL);

// With __strictAudio set, the page's AudioContext acts like iOS Safari's: it starts or resumes only
// inside a pointerup, touchend, click or keydown.
const INIT = () => {
  const AC = window.AudioContext;
  if (!AC) return;
  window.__ctxs = [];
  const ok = () => ['pointerup', 'touchend', 'click', 'keydown'].includes(window.event?.type);
  window.AudioContext = class extends AC {
    constructor(...a) { super(...a); window.__ctxs.push(this); if (window.__strictAudio && !ok()) super.suspend(); }
    resume() { if (window.__strictAudio && !ok()) return Promise.reject(new Error('not a gesture')); return super.resume(); }
  };
};

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const { browser } = await launchChromium(chromium, { mode: GL, label: 'phone-check', args: ['--autoplay-policy=user-gesture-required'] });

const results = [];
const wait = (page, ms) => page.waitForTimeout(ms);

async function openGame(deviceName, extraQuery = '') {
  const ctx = await browser.newContext({ ...DEVICES[deviceName] });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  const q = new URLSearchParams(query);
  for (const [k, v] of new URLSearchParams(extraQuery)) q.set(k, v);
  await page.goto(`${base}?${q}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HITL_READY === true, null, { timeout: 90000 });
  await wait(page, 800);
  await page.evaluate(() => document.querySelectorAll('.btn').forEach((b) => { if (/Skip tour/.test(b.textContent)) b.click(); }));
  await wait(page, 300);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y, id], i) => ({ x, y, id: id ?? i })) });
  const touchy = deviceName !== 'desktop';
  const tap = (loc) => (touchy ? loc.tap({ timeout: 4000 }) : loc.click({ timeout: 4000 }));
  return { ctx, page, errors, touch, tap, touchy, vp: page.viewportSize() };
}

// Keeps the company solvent and answers any decision with its first available choice.
const stepWeek = (page) => page.evaluate(() => {
  const h = window.__HITL;
  if (h.state.cash < 50000) h.state.cash += 200000;
  for (let c = 0; c < 4 && h.state.pendingDecision; c++) h.dispatch({ type: 'resolveDecision', choice: c });
  h.tickN(1);
});
const clearDecisions = (page) => page.evaluate(() => { const h = window.__HITL; for (let c = 0; c < 4 && h.state.pendingDecision; c++) h.dispatch({ type: 'resolveDecision', choice: c }); });
const camera = (page) => page.evaluate(() => { const c = window.__HITL.controls.renderer.camera; return { h: c.top - c.bottom, x: c.position.x, z: c.position.z, scale: visualViewport.scale }; });
// Yak's caret expands and collapses it; the header's other buttons resize or maximize it, so taps
// meant to expand go to the caret only.
const yakCollapsed = (page) => page.evaluate(() => document.querySelector('.bottom > .chat')?.classList.contains('collapsed') ?? null);
async function setYakOpen(page, tap, open) {
  if ((await yakCollapsed(page)) === !open) return;
  await tap(page.locator('.bottom > .chat .chat-head .caret').first());
  await wait(page, 500);
}
const yakMaxShown = (page) => page.evaluate(() => [...document.querySelectorAll('.yak-back')].some((e) => e.getBoundingClientRect().width && getComputedStyle(e).display !== 'none'));
const isPhone = (vp) => vp.width <= 480 || vp.height <= 500;

// Visible boxes of the fixed HUD pieces, and the pairs that overlap by more than 2 px.
const hudOverlaps = (page) => page.evaluate(() => {
  const pick = { topbar: '.topbar', strip: '.tray-toggle', yak: '.bottom > .chat', menu: '.mbtn' };
  const shown = (e) => { for (let p = e; p; p = p.parentElement) if (getComputedStyle(p).display === 'none') return false; return true; };
  const boxes = [];
  for (const [k, sel] of Object.entries(pick)) {
    let el = document.querySelector(sel);
    if (k === 'menu' && el) el = el.parentElement;
    if (!el || !shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 2 && r.height > 2) boxes.push({ k, r });
  }
  const out = [];
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
    const a = boxes[i].r, b = boxes[j].r;
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left), h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w > 2 && h > 2) out.push(`${boxes[i].k}/${boxes[j].k} ${Math.round(w)}x${Math.round(h)}`);
  }
  return out;
});
// Elements under root that end past the right edge and aren't inside a sideways scroller.
const cutOff = (page, rootSel) => page.evaluate((sel) => {
  const root = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width) ?? null;
  if (!root) return [];
  const out = new Set();
  for (const e of root.querySelectorAll('*')) {
    const r = e.getBoundingClientRect();
    if (!r.width || r.right <= innerWidth + 1) continue;
    let scrolled = false;
    for (let q = e.parentElement; q && q !== document.body; q = q.parentElement) {
      const cs = getComputedStyle(q);
      if (/auto|scroll|hidden/.test(cs.overflowX) && q.getBoundingClientRect().right <= innerWidth + 1) { scrolled = true; break; }
    }
    if (!scrolled) out.add(String(e.className).slice(0, 30) || e.tagName);
  }
  return [...out].slice(0, 6);
}, rootSel);

const CHECKS = {
  async pinch({ page, touch, vp }) {
    const fails = [];
    const cx = vp.width / 2, cy = vp.height * 0.55;
    const pinch = async (x, y, from, to) => {
      await touch('touchStart', [[x - from, y], [x + from, y]]);
      for (let i = 1; i <= 12; i++) { const r = from + (to - from) * i / 12; await touch('touchMove', [[x - r, y], [x + r, y]]); await wait(page, 16); }
      await touch('touchEnd', []); await wait(page, 500);
    };
    const c0 = await camera(page);
    await pinch(cx, cy, 40, 140);
    const c1 = await camera(page);
    if (!(c1.h < c0.h * 0.8)) fails.push(`pinch out did not zoom the camera (view height ${c0.h.toFixed(1)} to ${c1.h.toFixed(1)})`);
    if (c1.scale !== 1) fails.push(`pinch zoomed the page to ${c1.scale}`);
    await pinch(cx, cy, 140, 60);
    const c2 = await camera(page);
    if (!(c2.h > c1.h)) fails.push('pinch in did not zoom out');
    await touch('touchStart', [[cx - 40, cy], [cx + 40, cy]]);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', [[cx - 40 + 8 * i, cy + 6 * i], [cx + 40 + 8 * i, cy + 6 * i]]); await wait(page, 16); }
    await touch('touchEnd', []); await wait(page, 500);
    const c3 = await camera(page);
    if (Math.hypot(c3.x - c2.x, c3.z - c2.z) < 0.2) fails.push('two-finger pan did not move the camera');
    await touch('touchStart', [[cx, cy]]);
    for (let i = 1; i <= 10; i++) { await touch('touchMove', [[cx - 8 * i, cy - 6 * i]]); await wait(page, 16); }
    await touch('touchEnd', []); await wait(page, 500);
    const c4 = await camera(page);
    if (Math.hypot(c4.x - c3.x, c4.z - c3.z) < 0.2) fails.push('one-finger drag did not move the camera');
    // Lift one finger mid-pinch; the other keeps still, so the camera should not move.
    await touch('touchStart', [[cx - 60, cy, 0], [cx + 60, cy, 1]]);
    for (let i = 1; i <= 4; i++) { await touch('touchMove', [[cx - 60 - 5 * i, cy, 0], [cx + 60 + 5 * i, cy, 1]]); await wait(page, 16); }
    await wait(page, 300);
    const c5 = await camera(page);
    await touch('touchEnd', [[cx - 80, cy, 0]]); await wait(page, 16);
    await touch('touchMove', [[cx - 80, cy, 0]]); await wait(page, 300);
    const c6 = await camera(page);
    await touch('touchEnd', []); await wait(page, 300);
    if (Math.hypot(c6.x - c5.x, c6.z - c5.z) > 0.5) fails.push(`lifting one finger jumped the camera by ${Math.hypot(c6.x - c5.x, c6.z - c5.z).toFixed(2)}`);
    await pinch(vp.width / 2, 50, 30, 120);
    for (let k = 0; k < 2; k++) { await touch('touchStart', [[cx, cy]]); await touch('touchEnd', []); await wait(page, 80); }
    await wait(page, 400);
    const c7 = await camera(page);
    if (c7.scale !== 1) fails.push(`a pinch on the HUD or a double-tap zoomed the page to ${c7.scale}`);
    return { fails, note: `view height ${c0.h.toFixed(1)} to ${c1.h.toFixed(1)}` };
  },

  async hud({ page }) {
    const fails = [];
    const o = await hudOverlaps(page);
    if (o.length) fails.push(`HUD overlaps: ${o.join(', ')}`);
    const cut = await cutOff(page, '.hitl');
    if (cut.length) fails.push(`past the right edge: ${cut.join(', ')}`);
    return { fails };
  },

  async panels({ page, tap, shot }) {
    const fails = [];
    const menus = await page.evaluate(() => [...document.querySelectorAll('.mbtn')].filter((b) => b.getBoundingClientRect().width).map((b) => b.dataset.menu));
    for (const m of menus) {
      const btn = page.locator(`.mbtn[data-menu="${m}"]`);
      await btn.scrollIntoViewIfNeeded().catch(() => {});
      try { await tap(btn); } catch { fails.push(`${m}: menu button not tappable`); continue; }
      await wait(page, 700);
      const p = await page.evaluate(() => { const e = [...document.querySelectorAll('.panel')].find((x) => x.getBoundingClientRect().width); if (!e) return null; const r = e.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }; });
      await shot(`panel-${m}`);
      if (!p) { fails.push(`${m}: no panel opened`); continue; }
      const vp = page.viewportSize();
      if (p.left < -1 || p.right > vp.width + 1 || p.top < -1 || p.bottom > vp.height + 1) fails.push(`${m}: panel runs off screen`);
      const cut = await cutOff(page, '.panel');
      if (cut.length) fails.push(`${m}: cut off at the right: ${cut.join(', ')}`);
      const close = page.locator('.panel .btn.x >> visible=true').first();
      try { await tap(close); } catch { fails.push(`${m}: close button not tappable`); await page.keyboard.press('Escape'); }
      await wait(page, 400);
    }
    return { fails, note: `${menus.length} panels` };
  },

  async decision({ page, tap, shot, vp }) {
    const fails = [];
    let found = false;
    for (let i = 0; i < 200 && !found; i++) {
      found = await page.evaluate(() => { const h = window.__HITL; if (h.state.cash < 50000) h.state.cash += 200000; if (!h.state.pendingDecision) h.tickN(1); return !!h.state.pendingDecision; });
    }
    if (!found) return { fails: ['no decision came up in 200 weeks'] };
    await wait(page, 900);
    const card = await page.evaluate(() => { const c = [...document.querySelectorAll('.modal.decision')].find((e) => e.getBoundingClientRect().width); if (!c) return null; const r = c.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
    await shot('decision');
    if (!card) return { fails: ['no decision card on screen'] };
    if (card.l < -1 || card.r > vp.width + 1 || card.t < -1 || card.b > vp.height + 1) fails.push('decision card runs off screen');
    const last = page.locator('.modal.decision button.choice:not(.unavail)').last();
    try { await last.scrollIntoViewIfNeeded({ timeout: 2000 }); await tap(last); } catch { fails.push('last choice not tappable'); }
    await wait(page, 500);
    if (await page.evaluate(() => !!window.__HITL.state.pendingDecision)) fails.push('tapping a choice did not resolve the decision');
    return { fails };
  },

  async toasts({ page, vp, shot, tap }) {
    const fails = [];
    let most = 0, blocking = 0;
    for (let i = 0; i < 60; i++) {
      await stepWeek(page); await wait(page, 100);
      const t = await page.evaluate(() => { const ts = [...document.querySelectorAll('.toast:not(.out)')].filter((e) => e.getBoundingClientRect().width && getComputedStyle(e.parentElement).display !== 'none'); return { n: ts.length, blocking: ts.filter((e) => getComputedStyle(e).pointerEvents !== 'none' && !e.classList.contains('clickable') && !e.classList.contains('cut')).length }; });
      if (t.n > most) { most = t.n; await shot('toasts'); }
      blocking = Math.max(blocking, t.blocking);
    }
    await clearDecisions(page);
    // A long toast: if it is cut off, it shows a cue and opens in full after one tap.
    const longText = 'A very long message from the office that will not fit on one line on a phone, so it has to open when tapped.';
    await page.evaluate(() => window.__HITL.setSpeed(0)); await clearDecisions(page); await wait(page, 300);
    // Held on screen for the check, so a loaded machine cannot time it out before the tap.
    await page.evaluate((text) => { window.__HITL_UI?.freezeToasts?.(true); window.__HITL.emit([{ type: 'toast', text, tone: 'warn' }]); }, longText); // warn always shows
    await wait(page, 600);
    const long = page.locator('.toasts .toast', { hasText: 'A very long message' }).first();
    if (!(await long.count())) fails.push('the long test toast never showed');
    else {
      const { cut, overflows } = await long.evaluate((e) => { const tt = e.querySelector('.tt'); return { cut: e.classList.contains('cut'), overflows: tt.scrollWidth > tt.clientWidth + 1 || tt.scrollHeight > tt.clientHeight + 1 }; });
      if (overflows && !cut) fails.push('a toast is cut off with no cue and no way to read the rest');
      if (cut) {
        await tap(long); await wait(page, 300);
        const seen = await long.evaluate((e) => { const tt = e.querySelector('.tt'); return { open: e.classList.contains('open'), fits: tt.scrollWidth <= tt.clientWidth + 1 && tt.scrollHeight <= tt.clientHeight + 1 }; }).catch(() => ({ gone: true }));
        if (!seen.open || !seen.fits) fails.push(`tapping a cut toast does not show it in full (${seen.gone ? 'it was gone after the tap' : seen.open ? 'open but still cut' : 'it did not open'})`);
        await shot('toast-long');
      }
    }
    await page.evaluate(() => window.__HITL_UI?.freezeToasts?.(false));
    if (isPhone(vp)) {
      if (most > 2) fails.push(`${most} toasts at once on a phone (at most 2)`);
      if (blocking) fails.push(`${blocking} toasts take taps without an action`);
    }
    return { fails, note: `most at once: ${most}` };
  },

  async placement({ page, tap, touchy, vp, shot }) {
    const fails = [];
    await clearDecisions(page); await wait(page, 300);
    try { await tap(page.locator('.mbtn[data-menu="office"]')); } catch { return { fails: ['Office menu not tappable'] }; }
    await wait(page, 600);
    try { await tap(page.locator('button:has-text("Place") >> visible=true').first()); } catch { return { fails: ['no Place button'] }; }
    await wait(page, 600);
    await shot('placement');
    const n0 = await page.evaluate(() => window.__HITL.state.office.placed.length);
    let placed = false;
    for (const [fx, fy] of [[0.5, 0.55], [0.4, 0.6], [0.6, 0.5], [0.45, 0.45], [0.55, 0.65], [0.35, 0.5]]) {
      const x = vp.width * fx, y = vp.height * fy;
      // Touch aims with the first tap and places with the second; a mouse places on the first click.
      if (touchy) { await page.touchscreen.tap(x, y); await wait(page, 250); await page.touchscreen.tap(x, y); } else await page.mouse.click(x, y);
      await wait(page, 250);
      if ((await page.evaluate(() => window.__HITL.state.office.placed.length)) > n0) { placed = true; break; }
    }
    if (!placed) fails.push('could not place furniture by tapping');
    await page.keyboard.press('Escape'); await wait(page, 300);
    return { fails };
  },

  async taps({ page, touch, vp, shot }) {
    const fails = [];
    await page.evaluate(() => { window.__HITL.setSpeed(0); window.__clicks = 0; addEventListener('hitl:characterClick', () => window.__clicks++); });
    await wait(page, 400);
    const find = () => page.evaluate(({ w, h }) => { const r = window.__HITL.controls.renderer; for (let y = h * 0.3; y < h * 0.85; y += 6) for (let x = w * 0.1; x < w * 0.9; x += 6) { const p = r.pick(x, y); if (p?.kind === 'staff') return { x, y }; } return null; }, { w: vp.width, h: vp.height });
    const tipShown = () => page.evaluate(() => [...document.querySelectorAll('.gtip')].some((t) => t.style.display !== 'none' && t.getBoundingClientRect().width));
    let who = await find();
    if (!who) return { fails: ['no person on screen to tap'] };
    // Two fingers resting still, the second on the person, held past the long-press time.
    await touch('touchStart', [[who.x - 80, who.y, 0]]); await wait(page, 30);
    await touch('touchStart', [[who.x - 80, who.y, 0], [who.x, who.y, 1]]); await wait(page, 700);
    const tip = await tipShown();
    await touch('touchEnd', [[who.x - 80, who.y, 0]]); await wait(page, 30);
    await touch('touchEnd', []); await wait(page, 500);
    if (tip) fails.push('two fingers resting on a person popped a long-press tip');
    await page.keyboard.press('Escape'); await wait(page, 300);
    who = await find();
    await page.touchscreen.tap(who.x, who.y); await wait(page, 700);
    const opened = await page.evaluate(() => window.__clicks > 0 && [...document.querySelectorAll('.stafftable, .detail')].some((e) => e.getBoundingClientRect().width));
    await shot('tap-person');
    if (!opened) fails.push('a tap on a person did not open them');
    await page.keyboard.press('Escape'); await wait(page, 300);
    return { fails };
  },

  async yak({ page, tap, vp, shot }) {
    const fails = [];
    try { await setYakOpen(page, tap, true); } catch { return { fails: ['Yak caret not tappable'] }; }
    if (await yakCollapsed(page)) fails.push('the caret did not expand Yak');
    await shot('yak-open');
    // Every header control a player can see sits inside Yak, not clipped at its edge.
    const clipped = await page.evaluate(() => {
      const chat = document.querySelector('.bottom > .chat')?.getBoundingClientRect();
      if (!chat) return [];
      return [...document.querySelectorAll('.bottom > .chat .chat-head > *, .bottom > .chat .chat-head .ysz')]
        .filter((e) => { const r = e.getBoundingClientRect(); return r.width && getComputedStyle(e).visibility !== 'hidden' && (r.right > chat.right - 1 || r.left < chat.left + 1); })
        .map((e) => e.className || e.tagName.toLowerCase());
    });
    if (clipped.length) fails.push(`Yak header controls cut off at its edge: ${clipped.join(', ')}`);
    const o = await hudOverlaps(page);
    if (o.length) fails.push(`expanded Yak overlaps: ${o.join(', ')}`);
    await setYakOpen(page, tap, false);
    if (!(await yakCollapsed(page))) fails.push('the caret did not collapse Yak');
    try { await tap(page.locator('.ysz.ymax').first()); } catch { fails.push('maximize button not tappable'); return { fails }; }
    await wait(page, 500);
    if (!(await yakMaxShown(page))) fails.push('maximize did not open the big Yak view');
    const box = await page.evaluate(() => { const c = document.querySelector('.chat.max'); if (!c) return null; const r = c.getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom }; });
    await shot('yak-max');
    if (box && (box.l < -1 || box.r > vp.width + 1 || box.t < -1 || box.b > vp.height + 1)) fails.push('the big Yak view runs off screen');
    try { await tap(page.locator('.chat.max .ysz.ymax').first()); } catch { fails.push('the big Yak view has no tappable close'); await page.keyboard.press('Escape'); }
    await wait(page, 500);
    if (await yakMaxShown(page)) fails.push('closing the big Yak view left its backdrop over the game');
    return { fails };
  },

  async audio({ page, vp }) {
    await page.evaluate(() => { window.__strictAudio = true; });
    await page.touchscreen.tap(vp.width / 2, vp.height * 0.6); await wait(page, 600);
    const states = await page.evaluate(() => (window.__ctxs ?? []).map((c) => c.state));
    return { fails: states.includes('running') ? [] : [`audio still ${states.join(',') || 'not created'} after the first tap`] };
  },
};

try {
  for (const d of deviceNames) {
    for (const c of checks) {
      if (d === 'desktop' && TOUCH_ONLY.has(c)) continue;
      const g = await openGame(d);
      const shot = (name) => g.page.screenshot({ path: `${outDir}/${d}-${name}.png` }).catch(() => {});
      let r;
      try { r = await CHECKS[c]({ ...g, shot }); } catch (e) { r = { fails: [`crashed: ${String(e.message ?? e).split('\n')[0]}`] }; }
      for (const e of g.errors) r.fails.push(`console: ${e.slice(0, 160)}`);
      results.push({ d, c, ...r });
      console.log(`${r.fails.length ? 'FAIL' : 'pass'}  ${d.padEnd(15)} ${c.padEnd(10)} ${r.fails.join('; ') || r.note || ''}`);
      await g.ctx.close();
    }
  }
} finally {
  await browser.close();
  await server.close();
}
const failed = results.filter((r) => r.fails.length);
console.log(`phone-check: ${results.length - failed.length}/${results.length} passed; screenshots in ${outDir}`);
process.exit(failed.length ? 1 : 0);
