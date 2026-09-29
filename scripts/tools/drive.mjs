// Drive the real game in a browser and take screenshots: the generic form of the one-off
// playwright scripts (start vite, launch Chromium, load a mock or a seeded game, get it into a state,
// click through the UI, screenshot at several sizes). Exits 1 on a console error or a failed expect.
//
//   node scripts/tools/drive.mjs --seed 11 --play squads:90 --sizes desktop,phone --out shots/x \
//     --steps '[{"click":".menu button","text":"Staff"},{"shot":"staff"}]'
//
// Game:    --mock <name> | --seed <N> [--query 'k=v&k=v'] [--quality high] [--wait 1500] [--speed 0] [--settle 1500]
// State:   --play <bot>:<weeks> [--until '<js over s>']   bot plays a seeded game (real game only)
//          --setup '<js>' | --setup-file <f>   async body run in the page with H (window.__HITL) and s
//                                              (its state); dynamic import('/src/...') works
// Steps:   --steps '<json array>' | --steps-file <f>, run in order at every size:
//   {"click": "<css>", "text": "<regex>", "nth": 0, "optional": true, "timeout": ms}   the visible matches; tap on touch, click otherwise
//   {"dismiss": true} closes toasts and info cards and takes an open decision's first choice
//   {"wait": ms}   {"waitFor": "<js>", "timeout": ms}   {"press": "Escape"}   {"dismiss": true}
//   {"eval": "<js>", "as": "key"}   {"count": "<css>", "as": "key"}   {"expect": "<js>", "msg": "..."}
//   {"dispatch": {<action>}}   {"tick": n}   {"speed": n}   {"shot": "name"}
// Sizes:   --sizes desktop,laptop,small,hd720,phone (default desktop) or WxH, WxHt for touch
//          desktop 1920x1080, laptop 1440x900, small 1024x640, hd720 1280x720, phone 390x844 touch
// Output:  --out <dir> (shots/drive) --name <prefix> (drive): <name>-<step>-<size>.png; --clip records
//          a WebM per size; --json <file> writes the collected eval, count and expect results.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { glMode, holdRenderLock, launchChromium } from '../lib/gl.js';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

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
const SIZES = { desktop: [1920, 1080, false], laptop: [1440, 900, false], small: [1024, 640, false], hd720: [1280, 720, false], phone: [390, 844, true] };
export function parseSize(name) {
  if (SIZES[name]) return { name, w: SIZES[name][0], h: SIZES[name][1], touch: SIZES[name][2] };
  const m = /^(\d+)x(\d+)(t?)$/.exec(name);
  if (!m) throw new Error(`drive: unknown size "${name}" (desktop, laptop, small, hd720, phone, WxH or WxHt)`);
  return { name, w: Number(m[1]), h: Number(m[2]), touch: m[3] === 't' };
}
const STEP_KEYS = ['click', 'wait', 'waitFor', 'press', 'dismiss', 'eval', 'count', 'expect', 'dispatch', 'tick', 'speed', 'shot'];
export function checkSteps(steps) {
  if (!Array.isArray(steps)) throw new Error('drive: --steps must be a JSON array');
  steps.forEach((st, i) => { if (!st || !STEP_KEYS.some((k) => k in st)) throw new Error(`drive: step ${i} (${JSON.stringify(st)}) has none of ${STEP_KEYS.join(', ')}`); });
  return steps;
}

const DISMISS = /^(Got it|Onward|Close|Nice!|Back to work)$/;

async function play(page, { bot, weeks, until }) {
  return page.evaluate(async ({ bot, weeks, until }) => {
    const bots = await import('/src/sim/bots.js');
    const H = window.__HITL; const on = { onEvents: (ev) => H.emit(ev) };
    const stop = until ? new Function('s', `return (${until});`) : null;
    for (let i = 0; i < 2000 && !H.state.gameOver && H.state.week < weeks; i++) {
      bots.botDecide(bot, H.state, on); bots.botTurn(bot, H.state, on); H.tickN(1);
      if (H.state.pendingDecision) H.dispatch({ type: 'resolveDecision', choice: 0 });
      if (stop && stop(H.state)) break;
    }
    if (H.state.pendingDecision) H.dispatch({ type: 'resolveDecision', choice: 0 });
    return { week: H.state.week, gameOver: !!H.state.gameOver };
  }, { bot, weeks, until });
}

async function runStep(page, st, ctx) {
  if (st.click) {
    let loc = page.locator(st.click).filter({ visible: true });
    if (st.text) loc = loc.filter({ hasText: new RegExp(st.text) });
    loc = loc.nth(st.nth ?? 0);
    if (st.optional && !(await loc.count())) return;
    const to = { timeout: st.timeout ?? 10000 };
    if (ctx.touch) await loc.tap(to); else await loc.click(to);
    await page.waitForTimeout(st.after ?? 300);
  } else if (st.wait != null) await page.waitForTimeout(st.wait);
  else if (st.waitFor) await page.waitForFunction(st.waitFor, null, { timeout: st.timeout ?? 15000 });
  else if (st.press) { await page.keyboard.press(st.press); await page.waitForTimeout(150); }
  else if (st.dismiss) {
    for (let k = 0; k < 4; k++) {
      await page.evaluate((re) => {
        [...document.querySelectorAll('button')].filter((x) => new RegExp(re).test(x.textContent.trim()) && x.offsetWidth).forEach((x) => x.click());
        // An open decision: the first choice the game accepts.
        const H = window.__HITL;
        for (let c = 0; c < 4 && H.state.pendingDecision; c++) H.dispatch({ type: 'resolveDecision', choice: c });
      }, DISMISS.source);
      await page.waitForTimeout(120);
    }
  } else if ('eval' in st) { const v = await page.evaluate(st.eval); ctx.results[st.as ?? `eval${ctx.results._n++}`] = v; }
  else if ('count' in st) ctx.results[st.as ?? st.count] = await page.locator(st.count).count();
  else if ('expect' in st) {
    const ok = await page.evaluate(st.expect);
    if (!ok) ctx.fails.push(`expect failed: ${st.msg ?? st.expect}`);
    ctx.results[st.msg ?? st.expect] = !!ok;
  } else if ('dispatch' in st) ctx.results[`dispatch${ctx.results._n++}`] = await page.evaluate((a) => window.__HITL.dispatch(a), st.dispatch);
  else if (st.tick) await page.evaluate((n) => window.__HITL.tickN(n), st.tick);
  else if ('speed' in st) await page.evaluate((n) => window.__HITL.setSpeed(n), st.speed);
  else if (st.shot) await page.screenshot({ path: `${ctx.out}/${ctx.name}-${st.shot}-${ctx.size}.png` });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = parseArgs(process.argv.slice(2));
  let sizes, steps;
  try {
    sizes = String(args.sizes ?? 'desktop').split(',').map(parseSize);
    steps = checkSteps(args.steps ? JSON.parse(args.steps) : args['steps-file'] ? JSON.parse(readFileSync(args['steps-file'], 'utf8')) : []);
    if (args.play && !/^[\w-]+:\d+$/.test(String(args.play))) throw new Error('drive: --play wants <bot>:<weeks>, like squads:90');
    if (args.play && !args.seed) throw new Error('drive: --play needs --seed (a real game)');
    if (args.play && args.mock) throw new Error('drive: --play and --mock are exclusive');
  } catch (e) { console.error(e.message); process.exit(2); }
  const GL = glMode();
  holdRenderLock(GL);
  const q = new URLSearchParams(args.seed ? { seed: String(args.seed) } : { mock: String(args.mock ?? 'floor') });
  q.set('quality', String(args.quality ?? 'high'));
  if (typeof args.query === 'string') for (const [k, v] of new URLSearchParams(args.query)) q.set(k, v);
  const out = resolve(String(args.out ?? 'shots/drive'));
  const name = String(args.name ?? 'drive');
  mkdirSync(out, { recursive: true });
  const setupCode = typeof args.setup === 'string' ? args.setup : args['setup-file'] ? readFileSync(args['setup-file'], 'utf8') : null;
  const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
  await server.listen();
  const url = `${server.resolvedUrls.local[0]}?${q}`;
  const { browser } = await launchChromium(chromium, { mode: GL, label: 'drive' });
  const summary = {}; let code = 0;
  try {
    for (const sz of sizes) {
      const c = await browser.newContext({ viewport: { width: sz.w, height: sz.h }, hasTouch: sz.touch, isMobile: sz.touch, deviceScaleFactor: 1, ...(args.clip ? { recordVideo: { dir: out, size: { width: sz.w, height: sz.h } } } : {}) });
      const page = await c.newPage(); page.setDefaultTimeout(10000);
      const errors = [];
      page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
      page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
      const ctx = { touch: sz.touch, out, name, size: sz.name, results: { _n: 0 }, fails: [] };
      try {
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => window.__HITL_READY === true, null, { timeout: 60000 });
        await page.waitForTimeout(Number(args.wait ?? 1500));
        await page.evaluate((speed) => { window.__HITL_UI?.hideTitle?.(); window.__HITL.setSpeed(speed); }, Number(args.speed ?? 0));
        if (args.play) { const [bot, weeks] = String(args.play).split(':'); ctx.results.play = await play(page, { bot, weeks: Number(weeks), until: args.until }); }
        if (setupCode) ctx.results.setup = await page.evaluate(async ({ code }) => new (Object.getPrototypeOf(async () => {}).constructor)('H', 's', code)(window.__HITL, window.__HITL.state), { code: setupCode });
        if (args.play || setupCode) await page.waitForTimeout(Number(args.settle ?? 1500));
        for (const st of steps) await runStep(page, st, ctx);
      } catch (e) { ctx.fails.push(`${sz.name}: ${String(e.message).split('\n').slice(0, 12).join(' | ')}`); }
      delete ctx.results._n;
      const vid = page.video(); await c.close();
      const problems = [...ctx.fails, ...errors.map((e) => `console: ${e.slice(0, 200)}`)];
      summary[sz.name] = { ...ctx.results, video: vid ? await vid.path() : undefined, problems };
      console.log(`drive ${sz.name} ${sz.w}x${sz.h}: ${problems.length ? 'FAIL' : 'ok'}${problems.length ? `\n  ${problems.join('\n  ')}` : ''}`);
      for (const [k, v] of Object.entries(ctx.results)) console.log(`  ${k}: ${JSON.stringify(v)}`);
      if (problems.length) code = 1;
    }
  } finally { await browser.close(); await server.close(); }
  if (args.json) writeFileSync(String(args.json), JSON.stringify(summary, null, 1));
  console.log(`drive: images in ${out}`);
  process.exit(code);
}
