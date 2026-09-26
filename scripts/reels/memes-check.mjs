#!/usr/bin/env node
// Exercise real meme posts and image failures with the sim, UI and assets combined.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { startHarness } from '../../blender/checks/harness.mjs';
import { MEMES } from '../../src/data/memes.js';
const out = 'shots/memes'; mkdirSync(out, { recursive: true });
const H = await startHarness();
try {
  for (const width of [1440, 390]) {
    const { page, errors } = await H.openScene('seed=2&quality=medium', { width, height: width === 390 ? 844 : 1000 });
    await page.evaluate(() => { window.__HITL.setSpeed(0); window.__settle(60); window.__HITL_UI.update(window.__HITL.state); });
    assert.equal(await page.evaluate(() => window.__HITL.state.week), 0);
    if (await page.locator('.chat.collapsed').count()) await page.locator('.chat-head .caret').click();
    await page.locator(width === 390 ? '.ypost-hbtn' : '.ypost-btn').click();
    await page.locator('.ypost-opt').filter({ hasText: 'Share a meme' }).click();
    const post = await page.evaluate(() => window.__HITL.state.chatLog.find(m => m.image));
    assert.ok(post?.image && MEMES.some(m => m.id === post.image.id));
    assert.equal(post.text, post.image.alt);
    if (await page.locator('.chat.collapsed').count()) await page.locator('.chat-head .caret').click();
    const pic = page.locator('.ymeme-img').first();
    await pic.waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.querySelector('.ymeme-img')?.naturalWidth === 480, null, { polling: 50 });
    await pic.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/yak-docked-${width}.png` });
    await page.locator('.ymax').click();
    await pic.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/yak-maximized-${width}.png` });
    await pic.click();
    await page.waitForFunction(() => document.querySelector('.memebox-img')?.naturalWidth === 1200, null, { polling: 50 });
    await page.screenshot({ path: `${out}/yak-enlarged-${width}.png` });
    if (width === 390) await page.locator('.memebox').click({ position: { x: 8, y: 8 } });
    else await page.keyboard.press('Escape');
    assert.ok(await page.locator('.chat.max').isVisible());
    assert.ok(await page.locator('.memebox').isHidden());
    assert.deepEqual(errors, []);

    // A missing enlarged file falls back to the actual feed image.
    let failures = 0;
    await page.route('**/memes/*@2x.webp', route => { failures++; return route.fulfill({ status: 404, body: '' }); });
    await pic.click();
    await page.waitForFunction(() => { const i = document.querySelector('.memebox-img'); return i.naturalWidth === 480 && !i.getAttribute('src').includes('@2x'); }, null, { polling: 50 });
    assert.equal(failures, 1);
    await page.keyboard.press('Escape');

    // Both files missing leaves a readable caption and performs only one small-file retry.
    await page.route('**/memes/missing_probe*.webp', route => { failures++; return route.fulfill({ status: 404, body: '' }); });
    await page.evaluate(async () => {
      const { createMemeBox } = await import('/src/ui/memes.js');
      window.__missingBox = createMemeBox(document.querySelector('.hitl'));
      window.__missingBox.open({ id: 'missing_probe', alt: 'Missing image: readable caption' });
    });
    await page.waitForFunction(() => document.querySelectorAll('.memebox-img')[1]?.hidden, null, { polling: 50 });
    assert.equal(failures, 3);
    assert.equal(await page.locator('.memebox-cap').last().textContent(), 'Missing image: readable caption');
    await page.evaluate(() => window.__missingBox.close());
    await page.evaluate(() => window.__HITL.emit([{ type: 'chat', id: 'missing-probe', channel: 'random', from: 'Image check', fromId: null, text: 'Missing image: readable caption', image: { id: 'missing_probe', alt: 'Missing image: readable caption' }, reactions: [] }]));
    await page.locator('.ymeme-alt').waitFor({ state: 'visible' });
    assert.equal(await page.locator('.ymeme-alt').textContent(), '[Missing image: readable caption]');
    await page.locator('.ymeme-alt').scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${out}/yak-fallback-${width}.png` });
    assert.equal(failures, 4);
    assert.equal(errors.filter(e => !e.includes('404')).length, 0);
    await page.close();
    console.log(`memes-check: ${width}: fresh Share a meme, docked, maximized, enlarged, dismiss, large fallback, both missing, feed fallback PASS`);
  }
  const { page, errors } = await H.openScene('seed=1', { width: 480, height: 360 });
  for (const m of MEMES) {
    const dimensions = await page.evaluate(async id => {
      return Promise.all(['', '@2x'].map(async suffix => { const i = new Image(); i.src = `/memes/${id}${suffix}.webp`; await i.decode(); return [i.naturalWidth, i.naturalHeight]; }));
    }, m.image);
    assert.deepEqual(dimensions, [[480, 360], [1200, 900]], m.id);
  }
  assert.deepEqual(errors, []); await page.close();
  console.log(`memes-check: ${MEMES.length} matching IDs, ${MEMES.length * 2} decoded assets PASS`);
} finally { await H.close(); }
