// Checks the installable, offline build in a phone-sized Chrome: the manifest is installable (Chrome's
// own installability errors, no icons or start URL missing), the service worker takes control and
// fills its cache, the game boots again with the network off, and a new build replaces the old one
// without a stale page. Builds two versions of the game into the cache directory, serves them from one
// local server, and exits non-zero when a check fails.
// npm run pwa-check -- [--out shots/pwa] [--keep]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, normalize } from 'node:path';
import { glMode, holdRenderLock, launchChromium } from './lib/gl.js';
import { waitForBoot } from './lib/boot.js';

const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const OUT = arg('out', 'shots/pwa');
mkdirSync(OUT, { recursive: true });
const GL = glMode();
holdRenderLock(GL);

const work = join(process.env.TMPDIR || join(homedir(), '.cache', 'hitl-ci', 'tmp'), `pwa-check-${process.pid}`);
const dirs = { a: join(work, 'a'), b: join(work, 'b') };
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const build = (dir, version) => execFileSync('npx', ['vite', 'build', '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], { env: { ...process.env, HITL_VERSION: version }, stdio: 'inherit' });
build(dirs.a, 'v1.0.0');
build(dirs.b, 'v1.0.1');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.webp': 'image/webp' };
let root = dirs.a;
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const { browser } = await launchChromium(chromium, { mode: GL, label: 'pwa-check' });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await context.newPage();
const errors = [];
const failures = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror ${e.message}`));
const check = (label, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`); if (!ok) failures.push(label); };
const swVersion = () => page.evaluate(async () => {
  const reg = await navigator.serviceWorker.getRegistration();
  const worker = reg?.active;
  if (!worker) return null;
  return new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'version') resolve(e.data.version); }, { once: true });
    worker.postMessage({ type: 'version' });
    setTimeout(() => resolve(null), 3000);
  });
});
const cached = () => page.evaluate(async () => {
  const names = await caches.keys();
  const out = {};
  for (const n of names) out[n] = (await (await caches.open(n)).keys()).length;
  return out;
});

try {
  // First visit: boots, installs the worker, takes control, fills the cache.
  await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 90000 });
  await waitForBoot(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  const v1 = await swVersion();
  check('the service worker takes control of the first visit', !!v1, v1);
  const { warm } = await (await fetch(`${base}pwa-assets.json`)).json();
  const warmed = await page.waitForFunction(() => window.__HITL_PWA_WARM && window.__HITL_PWA_WARM.done >= window.__HITL_PWA_WARM.total, null, { timeout: 180000, polling: 1000 }).then(() => true, () => false);
  console.log(`warm progress: ${JSON.stringify(await page.evaluate(() => window.__HITL_PWA_WARM || null))} finished=${warmed}`);
  const c1 = await cached();
  const shellName = Object.keys(c1).find((k) => k.startsWith('hitl-shell-'));
  check('the shell is precached', !!shellName && c1[shellName] >= 20, JSON.stringify(c1));
  check('idle time caches the models, icons and short sounds', (c1['hitl-media'] || 0) >= warm.length * 0.95, `${c1['hitl-media'] || 0} of ${warm.length}`);

  // Chrome's own verdict on whether the page can be installed.
  const cdp = await context.newCDPSession(page);
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors');
  check('Chrome reports no installability errors', installabilityErrors.length === 0, installabilityErrors.map((e) => e.errorId).join(', '));
  const { manifest } = await (async () => {
    const m = await (await fetch(`${base}manifest.webmanifest`)).json();
    return { manifest: m };
  })();
  check('the manifest is standalone with a start URL and a maskable icon', manifest.display === 'standalone' && manifest.start_url === '/' && manifest.icons.some((i) => i.purpose === 'maskable'));
  await page.screenshot({ path: `${OUT}/online.png` });

  // The network goes away: a reload still brings the game up from the cache.
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForBoot(page);
  const offline = await page.evaluate(() => ({ boot: window.__HITL_BOOT_ERROR || null, text: document.body.innerText.slice(0, 80) }));
  check('the game boots with the network off', !offline.boot && /New Game|Continue/.test(await page.evaluate(() => document.body.innerText)), offline.boot || offline.text.replace(/\s+/g, ' '));
  await page.screenshot({ path: `${OUT}/offline.png` });
  // A live office offline: models, glyphs and sounds come from the cache.
  await page.goto(`${base}?mock=floor`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForBoot(page);
  await page.waitForTimeout(4000);
  const floor = await page.evaluate(() => {
    const h = window.__HITL;
    const week0 = h.state.week;
    h.tickN(2000);
    return { boot: window.__HITL_BOOT_ERROR || null, playing: !!h.playing, staff: h.state.staff.length, weeks: h.state.week - week0 };
  });
  check('an office renders and runs weeks of game time with the network off', !floor.boot && floor.playing && floor.staff > 0 && floor.weeks > 0, JSON.stringify(floor));
  await page.screenshot({ path: `${OUT}/offline-floor.png` });
  await context.setOffline(false);

  // A new build: the old page keeps running, the new worker waits, and takes over when the page is hidden.
  root = dirs.b;
  await page.evaluate(async () => { const reg = await navigator.serviceWorker.getRegistration(); await reg.update(); });
  await page.waitForFunction(async () => !!(await navigator.serviceWorker.getRegistration())?.waiting, null, { timeout: 30000 });
  check('a new build installs beside the running one and waits', (await swVersion()) === v1);
  const reloaded = page.waitForEvent('load', { timeout: 30000 });
  await page.evaluate(() => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await reloaded;
  await waitForBoot(page);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30000 });
  const v2 = await swVersion();
  check('the new build takes over when the page is hidden and the page reloads onto it', !!v2 && v2 !== v1, `${v1} -> ${v2}`);
  const c2 = await cached();
  check('the old build\'s shell cache is gone and the media cache stays', Object.keys(c2).filter((k) => k.startsWith('hitl-shell-')).length === 1 && c2['hitl-media'] >= c1['hitl-media'] * 0.95, JSON.stringify(c2));
  await context.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await waitForBoot(page);
  check('the new build also boots offline', !(await page.evaluate(() => window.__HITL_BOOT_ERROR)));
  await context.setOffline(false);
  const real = errors.filter((e) => !/Failed to load resource|net::ERR_INTERNET_DISCONNECTED/.test(e));
  check('no console errors beyond the offline fetches', real.length === 0, real.slice(0, 3).join(' | '));
} catch (e) {
  check('the run finished', false, String(e?.message || e).split('\n')[0]);
} finally {
  await browser.close();
  server.close();
  if (!argv.includes('--keep')) rmSync(work, { recursive: true, force: true });
}
console.log(failures.length ? `pwa-check: ${failures.length} failing` : 'pwa-check: all checks pass');
process.exit(failures.length ? 1 : 0);
