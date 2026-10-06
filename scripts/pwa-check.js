// Checks the installable, offline build in a phone-sized Chrome. Builds two versions of the game, serves
// them from one local server (the "published" version can be switched), and exits non-zero when a check
// fails:
//   plain browser   a normal visit makes no request the page didn't make before (no offline download)
//   installed app   Chrome reports no installability errors; the whole build downloads in the background
//                   with a progress pill and "Ready to play offline"; a download cut off midway resumes on
//                   the next launch; with the network off the game boots, starts a new game in an era,
//                   plays its music files from the cache and runs weeks of game time
//   updates         a new release downloads in the background, the running version keeps going, then a
//                   "Restart" prompt takes it live; a save from the old version loads; a launch with the
//                   network off shows no prompt and no error; an update cut off midway leaves the old
//                   version working and resumes later
// npm run pwa-check -- [--out shots/pwa] [--keep]
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { createReadStream, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
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
// --real [<from> <to>]: also update between two real consecutive commits of the game (default: the two
// newest first-parent commits of origin/main). Each is checked out, given this tree's offline files (the
// plugin, the worker, the page code, the icons and the three lines that wire them in), and built.
const realAt = argv.indexOf('--real');
if (realAt >= 0) {
  const rev = (i, d) => (argv[realAt + i] && !argv[realAt + i].startsWith('--') ? argv[realAt + i] : d);
  const from = rev(1, 'origin/main~1');
  const to = rev(2, 'origin/main');
  const repoDir = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
  const buildRev = (ref, name, version) => {
    const wt = join(work, `rev-${name}`);
    execFileSync('git', ['-C', repoDir, 'worktree', 'add', '--detach', '-q', wt, ref], { stdio: 'inherit' });
    try {
      // The repository's checkout hook already links node_modules into a new worktree.
      if (!existsSync(join(wt, 'node_modules'))) execFileSync('ln', ['-s', join(repoDir, 'node_modules'), join(wt, 'node_modules')]);
      mkdirSync(join(wt, 'scripts/pwa'), { recursive: true });
      mkdirSync(join(wt, 'public/pwa'), { recursive: true });
      for (const f of ['scripts/vite-pwa.mjs', 'scripts/pwa/sw.template.js', 'src/dev/pwa.js', 'src/dev/pwa-ui.js', 'public/pwa/icon-192.png', 'public/pwa/icon-512.png', 'public/pwa/icon-maskable-512.png', 'public/pwa/apple-touch-icon.png']) {
        execFileSync('cp', [join(repoDir, f), join(wt, f)]);
      }
      const edit = (file, fn) => { const p = join(wt, file); writeFileSync(p, fn(readFileSync(p, 'utf8'))); };
      edit('vite.config.js', (s) => s.replace(/(import [^\n]*\n)(?!import)/, "$1import { pwa } from './scripts/vite-pwa.mjs';\n").replace('define: {', 'plugins: [pwa({ version: buildVersion() })],\n  define: {'));
      edit('src/main.js', (s) => `import { registerPwa } from './dev/pwa.js';\n${s}`.replace(/\nboot\(\)\.catch/, '\nregisterPwa();\nboot().catch'));
      execFileSync('npx', ['vite', 'build', '--outDir', join(work, name), '--emptyOutDir', '--logLevel', 'error'], { cwd: wt, env: { ...process.env, HITL_VERSION: version }, stdio: 'inherit' });
    } finally {
      execFileSync('git', ['-C', repoDir, 'worktree', 'remove', '--force', wt], { stdio: 'inherit' });
    }
  };
  buildRev(from, 'r1', 'v2.0.0');
  buildRev(to, 'r2', 'v2.0.1');
  dirs.r1 = join(work, 'r1');
  dirs.r2 = join(work, 'r2');
  dirs.realRefs = [from, to];
}
// A release whose entry throws when its modules load (before the page can look for a fix), and the fix.
const repo = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
// The config sits in the repository (it imports vite from there) and is removed with the other leftovers.
const brokenConfig = join(repo, `vite.pwa-broken-${process.pid}.config.js`);
writeFileSync(brokenConfig, `import { mergeConfig } from 'vite';
import base from ${JSON.stringify(join(repo, 'vite.config.js'))};
export default mergeConfig(base, { root: ${JSON.stringify(repo)}, plugins: [{ name: 'break-main', transform(code, id) { if (id.split('?')[0].endsWith('/src/main.js')) return { code: 'throw new Error("boom");\\n' + code, map: null }; } }] });
`);
dirs.c = join(work, 'c');
dirs.d = join(work, 'd');
try {
  execFileSync('npx', ['vite', 'build', '--config', brokenConfig, '--outDir', dirs.c, '--emptyOutDir', '--logLevel', 'error'], { env: { ...process.env, HITL_VERSION: 'v1.0.2' }, stdio: 'inherit' });
} finally { rmSync(brokenConfig, { force: true }); }
build(dirs.d, 'v1.0.3');

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.glb': 'model/gltf-binary', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.webp': 'image/webp' };
let root = dirs.a;
// A pause on audio files makes a download slow enough to cut off midway.
let slowAudio = 0;
// Every request the page makes as part of a download carries X-Hitl-Download; those are counted, and can be
// slowed too, which is what makes a small update catchable midway.
let slowDownloads = 0;
const dl = { files: 0, bytes: 0, paths: [], seq: 0 };
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(root, path);
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) { res.writeHead(404); res.end('not found'); return; }
  const isDl = !!req.headers['x-hitl-download'];
  const send = () => {
    if (isDl) { dl.files++; dl.bytes += statSync(file).size; dl.paths.push(path); }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    createReadStream(file).pipe(res);
  };
  // Each slowed download waits longer than the one before, so they finish one after another.
  if (isDl && slowDownloads) setTimeout(send, slowDownloads * ++dl.seq);
  else if (slowAudio && /\.(ogg|m4a)$/.test(file)) setTimeout(send, slowAudio);
  else send();
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const { browser } = await launchChromium(chromium, { mode: GL, label: 'pwa-check' });
const failures = [];
const check = (label, ok, detail) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}${detail ? `: ${detail}` : ''}`); if (!ok) failures.push(label); };
const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };
const state = (page) => page.evaluate(() => window.__HITL_OFFLINE && { ...window.__HITL_OFFLINE.state });
const waitState = (page, name, timeout = 240000) => page.waitForFunction((n) => window.__HITL_OFFLINE?.state.state === n, name, { timeout, polling: 250 })
  .catch(async (e) => { throw new Error(`waiting for state ${name}: ${JSON.stringify(await state(page))} ${e.message.split('\n')[0]}`); });
const setNames = (page) => page.evaluate(async () => (await caches.keys()).filter((k) => k.startsWith('hitl-set-')));
const setSize = (page, name) => page.evaluate(async (n) => (await (await caches.open(n)).keys()).length, name);
const openPage = async (ctx, installed) => {
  const page = await ctx.newPage();
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(`pageerror ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|ERR_FAILED/.test(m.text())) page.errors.push(m.text()); });
  // Chrome can't emulate display-mode, so an installed app is the page's matchMedia saying standalone.
  if (installed) {
    await page.addInitScript(() => {
      const mm = window.matchMedia.bind(window);
      window.matchMedia = (q) => (/display-mode:\s*standalone/.test(q) ? { ...mm('all'), matches: true, media: q } : mm(q));
    });
  }
  page.cdp = await ctx.newCDPSession(page);
  return page;
};
const launch = async (page, query = '') => { await page.goto(base + query, { waitUntil: 'domcontentloaded', timeout: 90000 }); await waitForBoot(page); };
const reload = async (page) => { await page.reload({ waitUntil: 'domcontentloaded', timeout: 90000 }); await waitForBoot(page); };

try {
  // ---- A normal browser visit: nothing extra is requested.
  {
    const plainUrls = async (blockWorker) => {
      const ctx = await browser.newContext({ ...PHONE, serviceWorkers: blockWorker ? 'block' : 'allow' });
      const page = await openPage(ctx, false);
      const urls = new Set();
      page.on('request', (r) => urls.add(new URL(r.url()).pathname));
      await launch(page);
      await page.waitForTimeout(12000);
      const st = await state(page);
      const sets = blockWorker ? [] : await setNames(page);
      await ctx.close();
      return { urls, st, sets };
    };
    const without = await plainUrls(true);
    const withSw = await plainUrls(false);
    const extra = [...withSw.urls].filter((u) => !without.urls.has(u));
    const allowed = new Set(['/sw.js', '/manifest.webmanifest']);
    check('a plain browser visit requests nothing beyond the worker and the manifest', extra.every((u) => allowed.has(u)) && !withSw.urls.has('/pwa-assets.json'), `extra: ${extra.join(', ') || 'none'}`);
    check('and downloads no offline set', withSw.sets.length === 0 && withSw.st?.state === 'off', JSON.stringify(withSw.sets));
  }

  // ---- A plain browser, on request: the Settings button downloads the game and shows size and progress.
  {
    const ctx0 = await browser.newContext(PHONE);
    const p0 = await openPage(ctx0, false);
    await launch(p0);
    await p0.locator('button', { hasText: /Settings/ }).first().evaluate((el) => el.click());
    const row = p0.locator('.setrow', { hasText: 'Play offline' });
    await row.waitFor({ timeout: 15000 });
    // The size arrives once the build's list has been fetched.
    for (let i = 0; i < 40 && !/Download \(\d+ MB\)/.test(await row.locator('button').first().textContent()); i++) await p0.waitForTimeout(250);
    const label0 = await row.locator('button').first().textContent();
    check('Settings offers "Download" with its size in a plain browser', /Download \(\d+ MB\)/.test(label0), label0);
    await row.locator('button').first().evaluate((el) => el.click());
    await p0.waitForFunction(() => /Downloading|Ready to play offline/.test(document.querySelector('.setrow + .setrow, .settings')?.textContent || document.body.textContent), null, { timeout: 30000 }).catch(() => {});
    await waitState(p0, 'ready');
    check('and shows "Ready to play offline." when done', /Ready to play offline\./.test(await row.textContent()), await row.textContent());
    await row.scrollIntoViewIfNeeded();
    await p0.screenshot({ path: `${OUT}/settings-offline.png` });
    await ctx0.close();
  }

  // ---- The installed app: download, resume, offline play.
  const ctx = await browser.newContext(PHONE);
  let page = await openPage(ctx, true);
  slowAudio = 120;
  await launch(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => window.__HITL_OFFLINE.state.state === 'downloading' && window.__HITL_OFFLINE.state.done > 0, null, { timeout: 60000, polling: 250 });
  const pill = await page.evaluate(() => document.querySelector('#hitl-offline .pill')?.textContent || '');
  check('the installed app shows a download progress pill', /Downloading for offline: \d+% of \d+ MB/.test(pill), pill);
  await page.screenshot({ path: `${OUT}/downloading.png` });
  // The same pill while playing, where it sits near the bottom bar.
  await page.evaluate(() => window.__HITL.controls.newGame({ seed: 3, startEra: 'classic', companyName: 'Pill Co' }));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/downloading-in-game.png` });
  // Cut the network about a fifth of the way in.
  await page.waitForFunction(() => { const s = window.__HITL_OFFLINE.state; return s.total && s.done / s.total > 0.2; }, null, { timeout: 120000, polling: 100 });
  await ctx.setOffline(true);
  await waitState(page, 'paused', 60000);
  const part = await state(page);
  check('a download cut off midway pauses', part.state === 'paused' && part.filesDone > 0 && part.filesDone < part.files, `${part.filesDone} of ${part.files} files`);
  const names1 = await setNames(page);
  check('and leaves no complete set behind', names1.length === 1 && !(await page.evaluate(async (n) => !!(await (await caches.open(n)).match(new URL('/__complete', location.origin).href)), names1[0])));
  await ctx.setOffline(false);
  slowAudio = 0;
  await reload(page);
  const resumed = await page.evaluate(() => window.__HITL_OFFLINE.state);
  await waitState(page, 'ready');
  const st1 = await state(page);
  const afterResume = await page.evaluate(() => window.__HITL_OFFLINE.state.filesDone);
  check('the next launch resumes where it stopped and finishes', afterResume === st1.files && st1.files > 100, `${st1.filesDone} of ${st1.files} files (${resumed.filesDone} on launch)`);
  const pill2 = await page.evaluate(() => document.querySelector('#hitl-offline .pill')?.textContent || '');
  check('it confirms "Ready to play offline"', /Ready to play offline/.test(pill2), pill2);
  await page.screenshot({ path: `${OUT}/ready.png` });
  const names = await setNames(page);
  check('one complete set is stored', names.length === 1 && (await setSize(page, names[0])) === st1.files + 2, `${names[0]}: ${await setSize(page, names[0])} entries`);
  const { installabilityErrors } = await page.cdp.send('Page.getInstallabilityErrors');
  check('Chrome reports no installability errors', installabilityErrors.length === 0, installabilityErrors.map((e) => e.errorId).join(', '));
  const manifest = await (await fetch(`${base}manifest.webmanifest`)).json();
  check('the manifest is standalone with a start URL and a maskable icon', manifest.display === 'standalone' && manifest.start_url === '/' && manifest.icons.some((i) => i.purpose === 'maskable'));

  // The network goes away: relaunch, start a new game in an era, hear its music.
  await ctx.setOffline(true);
  const t0 = Date.now();
  await reload(page);
  const offlineBoot = Date.now() - t0;
  check('the game boots with the network off', !(await page.evaluate(() => window.__HITL_BOOT_ERROR)) && /New Game|Continue/.test(await page.evaluate(() => document.body.innerText)), `${offlineBoot} ms`);
  await page.screenshot({ path: `${OUT}/offline-title.png` });
  // A tap unlocks audio, as a player's first touch does.
  await page.touchscreen.tap(195, 420);
  const era = await page.evaluate(async () => {
    performance.clearResourceTimings();
    window.__HITL.controls.newGame({ seed: 7, startEra: 'dotcom', companyName: 'Offline Co' });
    await new Promise((r) => setTimeout(r, 6000));
    const music = performance.getEntriesByType('resource').filter((e) => /\/audio\/music\//.test(e.name));
    let decoded = 0;
    if (music[0]) {
      const ctxA = new (window.AudioContext || window.webkitAudioContext)();
      const buf = await (await fetch(music[0].name)).arrayBuffer();
      decoded = (await ctxA.decodeAudioData(buf)).duration;
    }
    const h = window.__HITL;
    const week0 = h.state.week;
    h.tickN(1500);
    return { playing: h.playing, era: h.state.era?.id, music: music.map((e) => `${e.name.split('/audio/')[1]}:${e.responseStatus}`), decoded, weeks: h.state.week - week0 };
  });
  check('a new game in an era starts offline and plays that era\'s music from the cache', era.playing && era.music.length > 0 && era.music.every((m) => m.endsWith(':200')) && era.decoded > 1, JSON.stringify(era));
  check('weeks of game time run offline', era.weeks > 0, `${era.weeks} weeks`);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/offline-game.png` });
  await page.evaluate(() => window.__HITL.controls.save?.());
  check('the offline page raised no errors', page.errors.length === 0, page.errors.slice(0, 3).join(' | '));
  await ctx.setOffline(false);

  // ---- A new release.
  root = dirs.b;
  slowDownloads = 700;
  dl.seq = 0; dl.files = 0; dl.bytes = 0; dl.paths = [];
  const v1 = await page.evaluate(() => window.__HITL.version);
  await reload(page);
  await page.waitForFunction(() => window.__HITL_OFFLINE.state.state === 'downloading', null, { timeout: 60000, polling: 100 });
  const upill = await page.evaluate(() => document.querySelector('#hitl-offline .pill')?.textContent || '');
  check('a new release downloads in the background while the old version runs', /Downloading the update: \d+% of \d+ (KB|MB)/.test(upill) && (await page.evaluate(() => window.__HITL.version)) === v1, upill);
  // Cut the update off midway: the old version keeps working.
  await page.waitForFunction(() => { const s = window.__HITL_OFFLINE.state; return s.netBytes > 0 && s.netBytes < s.needBytes; }, null, { timeout: 120000, polling: 50 });
  await ctx.setOffline(true);
  await waitState(page, 'paused', 60000);
  await reload(page);
  check('an update cut off midway leaves the old version working', (await page.evaluate(() => window.__HITL.version)) === v1 && !(await page.evaluate(() => document.querySelector('#hitl-update.on'))));
  const partial = (await setNames(page)).length;
  await ctx.setOffline(false);
  slowDownloads = 0;
  await reload(page);
  await waitState(page, 'ready');
  // Only the files whose content changed crossed the network.
  const listA = JSON.parse(readFileSync(join(dirs.a, 'pwa-assets.json'), 'utf8'));
  const listB = JSON.parse(readFileSync(join(dirs.b, 'pwa-assets.json'), 'utf8'));
  const hashA = new Map(listA.files.map((f) => [f.p, f.h]));
  const wantB = listB.files.filter((f) => !f.p.startsWith('audio/') || f.p.endsWith('.ogg'));
  const changed = wantB.filter((f) => hashA.get(f.p) !== f.h);
  const total = wantB.reduce((n, f) => n + f.s, 0);
  const changedBytes = changed.reduce((n, f) => n + f.s, 0);
  const fetched = new Set(dl.paths);
  check('an update fetches only the files whose content changed', changed.every((f) => fetched.has(`/${f.p}`)) && [...fetched].every((p) => changed.some((f) => `/${f.p}` === p)),
    `${changed.length} of ${wantB.length} files changed; fetched ${fetched.size}; ${(changedBytes / 1e3).toFixed(0)} KB of ${(total / 1e6).toFixed(1)} MB (${dl.files} requests including retries, ${(dl.bytes / 1e3).toFixed(0)} KB served)`);
  check('and the cut-off update left at most the old set and the one being built', partial <= 2, `${partial} sets while paused`);
  await page.waitForSelector('#hitl-update.on', { timeout: 30000 });
  check('when the update is complete the page asks to restart', /A new version is ready\. Restart to update\?/.test(await page.evaluate(() => document.querySelector('#hitl-update').textContent)) && (await page.evaluate(() => window.__HITL.version)) === v1);
  await page.screenshot({ path: `${OUT}/update-prompt.png` });
  // A partial download of a build nobody will finish (an older release cut off midway).
  await page.evaluate(async () => { await (await caches.open('hitl-set-v0.0.1-aaaaaaaa')).put(new URL('/x', location.origin).href, new Response('partial')); });
  const restarted = page.waitForEvent('load', { timeout: 60000 });
  await page.click('#hitl-update .go', { timeout: 10000 }).catch(async (e) => { console.log('click failed', JSON.stringify(await state(page)), await page.evaluate(() => document.querySelector('#hitl-update')?.className)); throw e; });
  await restarted;
  await waitForBoot(page);
  const v2 = await page.evaluate(() => window.__HITL.version);
  check('Restart now runs the new version', v2 === 'v1.0.1' && v2 !== v1, `${v1} -> ${v2}`);
  const cont = await page.evaluate(() => { const r = window.__HITL.controls.continueGame(); return { ok: r.ok, name: window.__HITL.state?.companyName, era: window.__HITL.state?.era?.id }; });
  check('a save made on the old version loads on the new one', cont.ok && cont.name === 'Offline Co', JSON.stringify(cont));
  // The new version prunes the old set once it is running and has confirmed its own is whole.
  for (let i = 0; i < 40 && (await setNames(page)).length !== 1; i++) await page.waitForTimeout(500);
  const after = await setNames(page);
  check('the old version\'s set and every partial one are gone, the new one stands alone', after.length === 1 && after[0] !== names[0], `${names[0]} -> ${after.join(',')}`);

  // ---- A launch with no network after the update: no prompt, no error, no wait.
  await ctx.setOffline(true);
  const t1 = Date.now();
  await reload(page);
  const t2 = Date.now() - t1;
  await page.waitForTimeout(3500);
  const quiet = await page.evaluate(() => ({ prompt: !!document.querySelector('#hitl-update.on'), pill: document.querySelector('#hitl-offline .pill.on')?.textContent || '', version: window.__HITL.version }));
  check('an offline launch shows no prompt, no pill and no error', !quiet.prompt && !quiet.pill && quiet.version === 'v1.0.1' && page.errors.length === 0, `${JSON.stringify(quiet)} errors: ${page.errors.join(' | ')}`);
  check('and starts as quickly as an online one', t2 < offlineBoot * 3 + 2000, `${t2} ms vs ${offlineBoot} ms`);
  await ctx.setOffline(false);
  await ctx.close();

  // ---- The data saver holds an update back until the player asks.
  {
    root = dirs.a;
    const ctxS = await browser.newContext(PHONE);
    const pS = await openPage(ctxS, true);
    await pS.addInitScript(() => { if (localStorage.getItem('__ds') === '1') Object.defineProperty(navigator, 'connection', { value: { saveData: true }, configurable: true }); });
    await launch(pS);
    await waitState(pS, 'ready');
    await pS.evaluate(() => localStorage.setItem('__ds', '1'));
    root = dirs.b;
    dl.files = 0; dl.paths = [];
    await reload(pS);
    await pS.waitForTimeout(6000);
    const held = await state(pS);
    check('with the data saver on, an update is held back and nothing is downloaded', held.updatePending && held.state === 'ready' && dl.files === 0 && !(await pS.evaluate(() => !!document.querySelector('#hitl-update.on'))), `${JSON.stringify({ pending: held.updatePending, need: held.needBytes })}, ${dl.files} downloads`);
    await pS.locator('button', { hasText: /Settings/ }).first().evaluate((el) => el.click());
    const rowS = pS.locator('.setrow', { hasText: 'Play offline' });
    await rowS.waitFor({ timeout: 15000 });
    check('Settings offers the update with its size', /Update \(\d+ (KB|MB)\)/.test(await rowS.locator('button').first().textContent()), await rowS.locator('button').first().textContent());
    await rowS.locator('button').first().evaluate((el) => el.click());
    await pS.waitForSelector('#hitl-update.on', { timeout: 60000 });
    check('and taking it downloads the changed files and asks to restart', dl.files > 0 && dl.files < 40, `${dl.files} files`);
    await ctxS.close();
  }

  // ---- An update between two real consecutive commits (--real).
  if (dirs.r1) {
    root = dirs.r1;
    const ctxR = await browser.newContext(PHONE);
    const pR = await openPage(ctxR, true);
    await launch(pR);
    await waitState(pR, 'ready');
    root = dirs.r2;
    dl.files = 0; dl.bytes = 0; dl.paths = [];
    await reload(pR);
    await waitState(pR, 'ready');
    await pR.waitForSelector('#hitl-update.on', { timeout: 60000 });
    const l1 = JSON.parse(readFileSync(join(dirs.r1, 'pwa-assets.json'), 'utf8'));
    const l2 = JSON.parse(readFileSync(join(dirs.r2, 'pwa-assets.json'), 'utf8'));
    const h1 = new Map(l1.files.map((f) => [f.p, f.h]));
    const want2 = l2.files.filter((f) => !f.p.startsWith('audio/') || f.p.endsWith('.ogg'));
    const changed2 = want2.filter((f) => h1.get(f.p) !== f.h);
    const fetched2 = new Set(dl.paths);
    const full = want2.reduce((n, f) => n + f.s, 0);
    check(`an update between ${dirs.realRefs[0]} and ${dirs.realRefs[1]} fetches only what changed`, changed2.every((f) => fetched2.has(`/${f.p}`)) && fetched2.size === changed2.length,
      `${changed2.length} of ${want2.length} files; ${(dl.bytes / 1e3).toFixed(0)} KB transferred of ${(full / 1e6).toFixed(1)} MB (${((dl.bytes / full) * 100).toFixed(1)}%): ${changed2.slice(0, 6).map((f) => f.p).join(', ')}${changed2.length > 6 ? ', ...' : ''}`);
    await ctxR.close();
  }

  // ---- A release that cannot start does not trap an installed player.
  {
    root = dirs.a;
    const ctxB = await browser.newContext(PHONE);
    const pB = await openPage(ctxB, true);
    await launch(pB);
    await waitState(pB, 'ready');
    root = dirs.c;
    await reload(pB);
    await waitState(pB, 'ready');
    await pB.waitForSelector('#hitl-update.on', { timeout: 60000 });
    const gone = pB.waitForEvent('load', { timeout: 60000 });
    await pB.click('#hitl-update .go', { timeout: 10000 });
    await gone;
    await pB.waitForTimeout(3000);
    check('the broken release runs and fails before the game starts', (await pB.evaluate(() => typeof window.__HITL)) === 'undefined' && pB.errors.some((e) => /boom/.test(e)), pB.errors.slice(-1).join(''));
    // A fixed release is published; the next launch with a network reaches it without the broken page's help.
    root = dirs.d;
    await pB.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
    await waitForBoot(pB);
    check('the next launch online reaches the fixed release', (await pB.evaluate(() => window.__HITL.version)) === 'v1.0.3', await pB.evaluate(() => window.__HITL?.version));
    await waitState(pB, 'ready');
    await ctxB.setOffline(true);
    await reload(pB);
    check('and the fixed release then starts offline', (await pB.evaluate(() => window.__HITL.version)) === 'v1.0.3' && !(await pB.evaluate(() => window.__HITL_BOOT_ERROR)));
    await ctxB.setOffline(false);
    await ctxB.close();
  }
} catch (e) {
  check('the run finished', false, String(e?.stack || e).split('\n').slice(0, 3).join(' / '));
} finally {
  await browser.close();
  server.close();
  if (!argv.includes('--keep')) rmSync(work, { recursive: true, force: true });
}
console.log(failures.length ? `pwa-check: ${failures.length} failing` : 'pwa-check: all checks pass');
process.exit(failures.length ? 1 : 0);
