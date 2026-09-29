// Exercise char-lineup identity with Fredoka arriving before or after the text emote is painted.
//   node blender/checks/golden-font-controls.mjs [--runs=N] [--without-repaint]
// --without-repaint disables the emote's repaint in the served module as a negative control.
// Run under timeout and nice; startHarness takes the software render lock.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { startHarness } from './harness.mjs';

const runs = Number(process.argv.find(a => a.startsWith('--runs='))?.slice(7) ?? 2);
assert.ok(Number.isInteger(runs) && runs > 0, '--runs must be a positive integer');
const withoutRepaint = process.argv.includes('--without-repaint');
const out = resolve(process.env.HITL_GOLDEN_OUT || 'shots/golden-font-controls');
mkdirSync(out, { recursive: true });
const H = await startHarness({ gpu: false });
const newPage = H.browser.newPage.bind(H.browser);
let schedule;
H.browser.newPage = async (...args) => {
  const page = await newPage(...args);
  await page.addInitScript(() => {
    window.__fontPaints = [];
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (text, ...rest) {
      if (text === 'Z' && this.font.includes('Fredoka')) {
        window.__fontPaints.push(document.fonts.check('800 40px Fredoka'));
      }
      return fill.call(this, text, ...rest);
    };
  });
  if (withoutRepaint) {
    await page.route('**/src/render/emotes.js', async route => {
      const response = await route.fetch();
      const body = await response.text();
      const call = 'repaintWhenFontLoads(kind, ctx, t);';
      assert.ok(body.includes(call), 'negative control must remove the repaint call');
      await route.fulfill({ response, body: body.replace(call, '') });
    });
  }
  if (schedule === 'early') {
    await page.route('**/models/chibi.glb', async route => {
      await page.evaluate(() => document.fonts.load('800 40px Fredoka'));
      await route.continue();
    });
  } else {
    await page.route('**/fonts/fredoka-latin.woff2', async route => {
      await page.waitForFunction(() => window.__fontPaints.length > 0, null, { polling: 25 });
      await route.continue();
    });
  }
  return page;
};

async function shot(order, settle, firstOnly) {
  schedule = order;
  const { page, errors } = await H.openScene('quality=medium&chars=1', { width: 960, height: 640 });
  try {
    const result = await page.evaluate(({ settle, firstOnly }) => {
      const step = settle ? window.__settle : window.__step;
      // Match golden's char-lineup warm-up and pose without yielding between frames.
      if (firstOnly) step(1);
      else { step(10); step(20); }
      return { png: document.querySelector('canvas').toDataURL(), paints: window.__fontPaints,
        fontReady: document.fonts.check('800 40px Fredoka') };
    }, { settle, firstOnly });
    assert.deepEqual(errors, [], `page errors in ${order}`);
    assert.equal(result.fontReady, true, `font must be ready at capture in ${order}`);
    assert.ok(result.paints.length > 0, 'the real lineup must paint the sleepy emote');
    assert.equal(result.paints[0], order === 'early', `font schedule was not exercised: ${order}`);
    if (!withoutRepaint) assert.equal(result.paints.at(-1), true, 'the shared text texture must repaint with its loaded font');
    return result.png;
  } finally { await page.close(); }
}

async function compare(a, b) {
  const page = await newPage();
  try {
    return await page.evaluate(async ([a, b]) => {
      const pixels = async src => {
        const img = new Image(); img.src = src; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        return g.getImageData(0, 0, c.width, c.height).data;
      };
      const [x, y] = await Promise.all([pixels(a), pixels(b)]);
      let count = 0;
      for (let i = 0; i < x.length; i += 4) if ([0, 1, 2, 3].some(c => x[i + c] !== y[i + c])) count++;
      return count;
    }, [a, b]);
  } finally { await page.close(); }
}

let failures = 0;
try {
  for (let i = 1; i <= runs; i++) {
    const orders = i % 2 ? ['early', 'late'] : ['late', 'early'];
    const stepped = await shot(orders[0], false, false);
    const settled = await shot(orders[1], true, false);
    if (stepped === settled) {
      console.log(`run ${i}: byte-identical (${orders.join('/')})`);
      continue;
    }
    failures++;
    const pixels = await compare(stepped, settled);
    // A fresh prefix capture locates bootstrap divergence without adding a draw to the identity run.
    const firstA = await shot(orders[0], false, true);
    const firstB = await shot(orders[1], true, true);
    const firstPixels = await compare(firstA, firstB);
    for (const [name, png] of Object.entries({ stepped, settled, firstA, firstB })) {
      writeFileSync(resolve(out, `${i}.${name}.png`), Buffer.from(png.split(',')[1], 'base64'));
    }
    console.log(`run ${i}: FAIL (${orders.join('/')}), frame 30: ${pixels} pixels; ${firstPixels ? `first differing frame 1: ${firstPixels} pixels` : 'frame 1 matches; first differing frame not located'}`);
  }
} finally { await H.close(); }
console.log(`golden-font-controls: ${failures} failures in ${runs} runs${withoutRepaint ? ' (repaint disabled)' : ''}`);
process.exitCode = failures ? 1 : 0;
