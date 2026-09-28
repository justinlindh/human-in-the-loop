#!/usr/bin/env node
// Run negative controls against the real outage post, after its image and replies reach the UI.
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

function negativeControls() {
  const check = () => window.__assertYak();
  const good = check();
  const { root, image, messages, panel } = window.__yakThread();
  const passed = [];
  const rejects = (name, change, restore, options) => {
    change();
    let failed = false;
    try { window.__assertYak(options); } catch { failed = true; }
    restore();
    if (!failed) throw new Error('yak negative control accepted ' + name);
    check(); passed.push(name);
  };
  rejects('missing image', () => image.remove(), () => root.querySelector('.ymeme').append(image));
  rejects('undecoded image', () => Object.defineProperty(image, 'naturalWidth', { configurable: true, value: 0 }), () => delete image.naturalWidth);
  const fallback = document.createElement('div'); fallback.className = 'ymeme-alt'; fallback.textContent = image.alt;
  rejects('alt text fallback', () => image.replaceWith(fallback), () => fallback.replaceWith(image));
  rejects('wrong image', () => Object.defineProperty(image, 'currentSrc', { configurable: true, value: new URL('/memes/tabs_chart.webp', location.href).href }), () => delete image.currentSrc);
  const style = panel.getAttribute('style');
  rejects('hidden ancestor', () => panel.style.opacity = '0', () => panel.setAttribute('style', style));
  rejects('outside viewport', () => panel.style.transform = 'translateX(-4000px)', () => panel.setAttribute('style', style));
  rejects('outside delivery crop', () => {}, () => {}, { crop: [0.8, 0, 0.2, 1] });
  rejects('unreadable image size', () => {}, () => {}, { minImageWidth: 2000 });
  const reply = messages.find(m => m !== root), next = reply.nextSibling, parent = reply.parentElement;
  rejects('missing thread reply', () => reply.remove(), () => parent.insertBefore(reply, next));
  const list = root.parentElement, listStyle = list.getAttribute('style');
  rejects('scroll clipping', () => { list.style.height = '20px'; list.style.overflow = 'hidden'; }, () => { if (listStyle === null) list.removeAttribute('style'); else list.setAttribute('style', listStyle); });
  const saved = window.__yakMeme;
  rejects('wrong post identity', () => window.__yakMeme = { ...saved, id: 'absent-post' }, () => window.__yakMeme = saved);
  // A decoy with matching caption and image must not replace the clicked post.
  const decoy = root.cloneNode(true); decoy.dataset.id = 'decoy'; decoy.dataset.root = 'decoy';
  root.before(decoy);
  if (window.__yakThread().root !== root) throw new Error('yak: selector chose a decoy');
  decoy.remove(); check(); passed.push('identity ignores matching decoy');
  (window.__captureMarks ??= []).push({ label: 'yak-regressions', passed, good });
}

const dir = mkdtempSync(join(tmpdir(), 'yak-capture-check-'));
const out = resolve('shots/yak-check');
try {
  const manifest = join(dir, 'manifest.mjs');
  const source = pathToFileURL(resolve('scripts/feature-media/manifest.js')).href;
  writeFileSync(manifest, `import { ITEMS } from ${JSON.stringify(source)};
const base = ITEMS.find(i => i.id === 'site-yak-backfire');
export const probes = [{ ...base, id: 'yak-regressions', screenshots: [60.2], actions: [...base.actions, { at: 60.15, js: ${JSON.stringify(`(${negativeControls.toString()})()`)} }] }];
export { probes as ITEMS };\n`);
  const result = spawnSync('timeout', ['300', 'nice', '-n', '10', 'node', 'scripts/capture.js', '--manifest', manifest, '--out', out, '--size', '1920x1080', '--fps', '30', '--no-webm'], { stdio: 'inherit' });
  assert.equal(result.status, 0, 'real-game capture and negative controls');
  const record = JSON.parse(readFileSync(join(out, 'index.json'))).items['yak-regressions'];
  const checks = record.marks.find(m => m.label === 'yak-regressions');
  assert.equal(record.errors, 0); assert.equal(checks.passed.length, 12);
  console.log(`yak-check: real outage Share a meme, decoded image, two replies and ${checks.passed.length} regression controls PASS`);
} finally { rmSync(dir, { recursive: true, force: true }); }
