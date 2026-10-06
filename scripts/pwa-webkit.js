// The installed game's update and recovery paths in WebKit (the engine of every iPhone and iPad browser).
// Builds versions of the game, serves them from one local server whose "published" build can be switched,
// and drives WebKit through, closing the page between launches the way closing the app does:
//   install       the first launch downloads a whole set and the next one starts from it
//   kill          a launch closed midway through an update download resumes it and finishes
//   update        the finished update asks to restart; Restart runs the new build
//   no network    a launch with the server gone boots from the cache
//   stuck storage a worker whose cache listing never answers is stepped around: the page boots from the
//                 network
//   broken        a build whose modules throw is replaced by the fixed one over the network by the page's
//                 own reload, or lands on the previous complete build; with nothing to fall back on it
//                 shows "Loading failed" with Retry, never a blank screen
// The headless WebKit build has no usable GPU, so the game's own WebGL is stubbed out: the page, the
// worker, the caches and the boot report are real; the 3D scene is not drawn.
// npm run pwa-webkit [-- --keep]   (setup for the browser's system libraries: scripts/pwa-webkit-setup.sh)
import { webkit } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { extname, join, normalize } from 'node:path';

process.env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = '1';
const argv = process.argv.slice(2);
const work = join(process.env.TMPDIR || join(homedir(), '.cache', 'hitl-ci', 'tmp'), `pwa-webkit-${process.pid}`);
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const dirs = { a: join(work, 'a'), b: join(work, 'b'), c: join(work, 'c'), d: join(work, 'd') };
const brokenConfig = join(repo, `vite.pwa-broken-${process.pid}.config.js`);
const failures = [];
const check = (label, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`); if (!ok) failures.push(label); };
const cleanup = () => {
  rmSync(brokenConfig, { force: true });
  if (!argv.includes('--keep')) rmSync(work, { recursive: true, force: true });
};

let browser;
let server;
try {
  rmSync(work, { recursive: true, force: true });
  mkdirSync(work, { recursive: true });
  const build = (dir, version, config) => execFileSync('npx', ['vite', 'build', ...(config ? ['--config', config] : []), '--outDir', dir, '--emptyOutDir', '--logLevel', 'error'], { env: { ...process.env, HITL_VERSION: version }, stdio: 'inherit' });
  build(dirs.a, 'v1.0.0');
  build(dirs.b, 'v1.0.1');
  // A build whose entry throws as its modules load, and the build that fixes it.
  writeFileSync(brokenConfig, `import { mergeConfig } from 'vite';
import base from ${JSON.stringify(join(repo, 'vite.config.js'))};
export default mergeConfig(base, { root: ${JSON.stringify(repo)}, plugins: [{ name: 'break-main', transform(code, id) { if (id.split('?')[0].endsWith('/src/main.js')) return { code: 'throw new Error("boom");\\n' + code, map: null }; } }] });
`);
  build(dirs.c, 'v1.0.2', brokenConfig);
  rmSync(brokenConfig, { force: true });
  build(dirs.d, 'v1.0.3');
  const entryOf = (dir) => /src="([^"]*\/assets\/index-[^"]+\.js)"/.exec(readFileSync(join(dir, 'index.html'), 'utf8'))?.[1];
  const entries = Object.fromEntries(Object.keys(dirs).map((k) => [k, entryOf(dirs[k])]));

  const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.webp': 'image/webp' };
  let root = dirs.a;
  let down = false;
  let stuck = false;
  let slowDownloads = 0;
  let seq = 0;
  server = createServer((req, res) => {
    if (down) { req.socket.destroy(); return; }
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(root, path);
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
    const send = () => {
      res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'max-age=600', Vary: 'Accept-Encoding' });
      // A worker whose storage never answers a listing of its caches.
      if (stuck && path === '/sw.js') {
        res.end(`caches.keys = () => new Promise(() => {});\nself.addEventListener('message', (e) => { if (e.data?.type === 'stuck?') e.source.postMessage({ type: 'stuck' }); });\n${readFileSync(file, 'utf8')}`);
        return;
      }
      createReadStream(file).pipe(res);
    };
    if (req.headers['x-hitl-download'] && slowDownloads) setTimeout(send, slowDownloads * ++seq); else send();
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;

  try {
    browser = await webkit.launch();
  } catch (e) {
    console.log(`pwa-webkit: WebKit does not start here (${String(e.message).split('\n')[0]}); run scripts/pwa-webkit-setup.sh`);
    process.exitCode = 2;
    throw new Error('no webkit');
  }
  // The installed app: matchMedia says standalone. WebGL is stubbed and boot errors are not recorded, so a
  // healthy build reports ready in a browser with no GPU; a build that throws never does.
  const newContext = async () => {
    const c = await browser.newContext({ viewport: { width: 820, height: 1180 }, hasTouch: true });
    await c.addInitScript(() => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { ...mm('all'), matches: true, media: q } : mm(q));
      const get = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, ...a) { return /webgl/.test(t) ? null : get.call(this, t, ...a); };
      Object.defineProperty(window, '__HITL_BOOT_ERROR', { set() {}, get() { return undefined; } });
    });
    return c;
  };
  let ctx = await newContext();
  const launch = async () => {
    const page = await ctx.newPage();
    await page.goto(base, { waitUntil: 'domcontentloaded', timeout: 60000 });
    return page;
  };
  const entry = (page) => page.evaluate(() => document.querySelector('script[type=module]')?.getAttribute('src'));
  const running = async (page) => {
    const src = await entry(page);
    return Object.entries(entries).find(([, e]) => e === src)?.[0] ?? '?';
  };
  const booted = (page, timeout = 30000) => page.waitForFunction(() => window.__HITL_READY === true, null, { timeout }).then(() => true, () => false);
  const stateIs = (page, name, timeout = 120000) => page.waitForFunction((n) => window.__HITL_OFFLINE?.state.state === n, name, { timeout, polling: 250 }).then(() => true, () => false);
  const sets = (page) => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('hitl-set-')).sort());
  const card = (page) => page.evaluate(() => !!document.querySelector('#hitl-boot-failed'));
  const cardUp = async (page, ms = 16000) => { for (let i = 0; i < ms / 250; i++) { if (await card(page)) return true; await page.waitForTimeout(250); } return false; };
  const idOf = (dir) => JSON.parse(readFileSync(join(dir, 'pwa-assets.json'), 'utf8')).id;

  // ---- install
  let p = await launch();
  check('the first launch boots', await booted(p) && (await running(p)) === 'a');
  check('and downloads a whole set', await stateIs(p, 'ready') && (await sets(p)).join() === `hitl-set-${idOf(dirs.a)}`);
  await p.close();
  p = await launch();
  await booted(p);
  check('the next launch is served by the worker', await p.evaluate(() => !!navigator.serviceWorker.controller) && (await running(p)) === 'a');
  await p.waitForTimeout(9500);
  check('a healthy launch shows no "Loading failed" card', !(await card(p)));

  // ---- an update cut off midway by closing the app, then finished
  root = dirs.b;
  slowDownloads = 400;
  await p.close();
  p = await launch();
  await booted(p);
  await p.waitForFunction(() => { const s = window.__HITL_OFFLINE?.state; return s?.state === 'downloading' && s.netBytes > 0; }, null, { timeout: 90000, polling: 100 }).catch(() => {});
  const midway = await sets(p);
  await p.close();
  check('a launch closed during the update download leaves the old set and no complete new one', midway.includes(`hitl-set-${idOf(dirs.a)}`), midway.join(', '));
  slowDownloads = 0;
  p = await launch();
  await booted(p);
  check('the old build still runs and the next launch finishes the update', (await running(p)) === 'a' && await stateIs(p, 'ready') && (await sets(p)).length === 2);
  check('the finished update asks to restart', await p.waitForSelector('#hitl-update.on', { timeout: 30000 }).then(() => true, () => false));
  const restarted = p.waitForEvent('load', { timeout: 60000 });
  await p.evaluate(() => window.__HITL_OFFLINE.applyUpdate());
  await restarted;
  await booted(p);
  check('Restart runs the new build', (await running(p)) === 'b');
  await p.close();

  // ---- no network (a launch counts as confirmed once the page has reported, so wait for that)
  const tries = (page) => page.evaluate(async () => {
    const r = await (await caches.open('hitl-meta')).match(new URL('/__active', location.origin).href);
    return r ? (await r.json()).tries || 0 : -1;
  });
  const confirmed = async (page) => {
    for (let i = 0; i < 60; i++) { if ((await tries(page)) === 0) return true; await page.waitForTimeout(250); }
    return false;
  };
  p = await launch();
  await booted(p);
  await confirmed(p);
  await p.close();
  down = true;
  p = await launch();
  const upOffline = await booted(p);
  check('a launch with no network boots from the cache', upOffline && (await running(p)) === 'b', `ready ${upOffline}, running ${await running(p)}, controlled ${await p.evaluate(() => !!navigator.serviceWorker.controller)}`);
  await p.close();
  down = false;

  // ---- storage that never answers: a worker whose cache listing hangs is stepped around, not waited on
  stuck = true;
  p = await launch();
  await booted(p);
  await p.waitForTimeout(3000);
  await p.close();
  p = await launch();
  const asked = await p.evaluate(() => new Promise((resolve) => {
    navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.type === 'stuck') resolve(true); });
    navigator.serviceWorker.controller?.postMessage({ type: 'stuck?' });
    setTimeout(() => resolve(false), 4000);
  }));
  check('the hung worker is the one running', asked);
  check('and the page still boots, from the network', await booted(p, 40000) && (await running(p)) === 'b');
  await p.close();
  stuck = false;

  // ---- a build that cannot start. Each case installs a, then takes the update c, whose modules throw.
  const breakUpdate = async () => {
    await ctx.close();
    ctx = await newContext();
    root = dirs.a;
    let page = await launch();
    await booted(page);
    await stateIs(page, 'ready');
    await confirmed(page);
    await page.close();
    root = dirs.c;
    page = await launch();
    await booted(page);
    await stateIs(page, 'ready');
    await page.waitForSelector('#hitl-update.on', { timeout: 60000 });
    const loaded = page.waitForEvent('load', { timeout: 60000 });
    await page.evaluate(() => window.__HITL_OFFLINE.applyUpdate());
    await loaded;
    return page;
  };

  // The fix is published while the broken build is on screen: the page reloads itself onto it.
  p = await breakUpdate();
  check('the broken build runs and never reports ready', (await running(p)) === 'c' && !(await booted(p, 3000)));
  root = dirs.d;
  check('the page reloads itself onto the fixed build over the network', await p.waitForFunction(() => window.__HITL_READY === true, null, { timeout: 40000 }).then(() => true, () => false) && (await running(p)) === 'd');
  await p.close();

  // The network offers nothing better: the second reload lands on the previous complete build.
  p = await breakUpdate();
  check('with the network no better, the page lands on the previous complete build by itself', await p.waitForFunction(() => window.__HITL_READY === true, null, { timeout: 60000 }).then(() => true, () => false) && (await running(p)) === 'a');
  await p.close();

  // Nothing else to fall back on: a card with Retry, never a blank screen.
  p = await breakUpdate();
  await p.evaluate(async () => { for (const k of await caches.keys()) if (k.startsWith('hitl-set-') && !k.includes('v1.0.2')) await caches.delete(k); });
  check('with no earlier build it shows "Loading failed" with Retry', await cardUp(p, 60000) && /Loading failed/.test(await p.evaluate(() => document.querySelector('#hitl-boot-failed')?.textContent || '')));
  root = dirs.d;
  const net = p.waitForEvent('load', { timeout: 60000 });
  await p.click('#hitl-boot-failed button');
  await net;
  check('and Retry reaches the fixed build', await booted(p) && (await running(p)) === 'd');
  await p.close();
} catch (e) {
  if (e.message !== 'no webkit') check('the run finished', false, String(e?.stack || e).split('\n').slice(0, 3).join(' / '));
} finally {
  await browser?.close();
  server?.close();
  cleanup();
}
if (process.exitCode === 2) process.exit(2);
console.log(failures.length ? `pwa-webkit: ${failures.length} failing` : 'pwa-webkit: all checks pass');
process.exit(failures.length ? 1 : 0);
