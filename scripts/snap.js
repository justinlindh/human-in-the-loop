// Headless screenshot of the game. Exits non-zero if the page logs any console error.
// npm run snap -- --scenario floor --out shots/floor.png [--width 1920 --height 1080]
//   [--quality high] [--time night] [--speed 4] [--wait 2500] [--query "kit=1"]
//   [--real --seed 1 --weeks 20] [--eval "expr"]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { glMode, holdRenderLock, launchChromium } from './lib/gl.js';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[key] = true;
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
// Renders under the render lock for its GL mode (a GPU slot, or the software lock).
const GL = glMode();
holdRenderLock(GL);
const scenario = args.scenario ?? 'floor';
const outPath = resolve(args.out ?? `shots/${args.real ? `real-s${args.seed ?? 1}` : scenario}.png`);
const width = Number(args.width ?? 1920);
const height = Number(args.height ?? 1080);
const wait = Number(args.wait ?? 2500);

const q = new URLSearchParams({ snap: '1' });
if (args.real) {
  q.set('seed', String(args.seed ?? 1));
  if (args.weeks) q.set('weeks', String(args.weeks));
} else {
  q.set('mock', scenario);
}
// Shots render High unless asked, whatever GL the headless browser has.
q.set('quality', String(args.quality ?? 'high'));
for (const k of ['time', 'speed']) if (args[k]) q.set(k, String(args[k]));
if (typeof args.query === 'string') for (const [k, v] of new URLSearchParams(args.query)) q.set(k, v);

const server = await createServer({ server: { port: 0, strictPort: false }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const url = `${base}?${q}`;

const { browser } = await launchChromium(chromium, { mode: GL, label: 'snap' });
const errors = [];
let exitCode = 0;
try {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__HITL_READY === true, null, { timeout: 60000 });
  await page.waitForTimeout(wait);
  if (typeof args.eval === 'string') {
    const val = await page.evaluate(args.eval);
    console.log('eval:', JSON.stringify(val));
  }
  mkdirSync(dirname(outPath), { recursive: true });
  await page.screenshot({ path: outPath });
  console.log(`snap: ${outPath}`);
  console.log(`url: ${url}`);
} catch (e) {
  errors.push(`snap failed: ${e.message}`);
} finally {
  await browser.close();
  await server.close();
}
if (errors.length) {
  console.error(`console errors (${errors.length}):`);
  for (const e of errors) console.error(`  ${e}`);
  exitCode = 1;
}
process.exit(exitCode);
