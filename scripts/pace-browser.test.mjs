import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import { presentationMetadata, installObservation, readPresentations, collectPresentations, summarize } from './pace-browser.js';
import { launchChromium, glMode, holdRenderLock } from './lib/gl.js';

holdRenderLock(glMode());

describe('browser pacing presentations', () => {
  let server, browser, page;
  before(async () => {
    server = await createServer({ plugins: [presentationMetadata(), {
      name: 'pace-fixture', configureServer(s) {
        s.middlewares.use('/pace-fixture', (_req, res) => {
          res.setHeader('Content-Type', 'text/html');
          res.end('<html><body><style>body{margin:0} .clip{height:30px;overflow:hidden} button{min-height:20px} .toasts{position:absolute;top:300px} .toast,.dtoast{min-height:20px}</style></body></html>');
        });
      },
    }], server: { port: 0 }, logLevel: 'silent' });
    await server.listen();
    ({ browser } = await launchChromium(chromium, { mode: glMode(), label: 'pace-test' }));
  });
  after(async () => { await browser?.close(); await server?.close(); });

  // A toast's text carries its glyph, so rows are found by the words the test pushed.
  const withText = (rows, words) => rows.find(r => r.text?.includes(words));
  // The toast queue advances on the presentation clock, which the UI ticks once per drawn frame; this
  // fixture draws none, so a wait for a toast to appear ticks the clock by hand, in frame-sized steps.
  const advancePresentation = (ms) => page.evaluate(async (total) => {
    const { pTick } = await import('/src/ui/pclock.js');
    for (let left = total; left > 0; left -= 50) pTick(Math.min(50, left));
  }, ms);

  async function fixture(html = '') {
    await page?.close();
    page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
    await page.addInitScript(installObservation);
    await page.goto(`${server.resolvedUrls.local[0]}pace-fixture`);
    await page.evaluate(({ html, reader }) => {
      document.body.insertAdjacentHTML('beforeend', html);
      window.__HITL = { state: { week: 12, era: { id: 'classic' }, officeStage: 0, chatPrompts: [], pendingDecision: { id: 'd1', eventId: 'event1' } } };
      window.__pace.start = performance.now();
      window.__pace.read = (0, eval)(`(${reader})`);
    }, { html, reader: readPresentations.toString() });
  }

  it('counts visible surfaces, clips Yak, and distinguishes reply controls from reaction totals', async () => {
    await fixture(`
      <div class="modal decision"><h2>A decision</h2><button>Accept</button></div>
      <div class="msg" data-id="c1" data-root="c1"><span class="react">3 hearts</span></div>
      <div class="msg reply" data-id="c2" data-root="c1"><div class="yprompt" data-prompt="p1"><button>Reply</button><button disabled>Unavailable</button></div></div>
      <div class="clip"><div style="height:40px"></div><div class="msg" data-id="offscreen">Hidden</div></div>
      <div style="display:none"><div class="panel"><h2>Hidden panel</h2></div></div>
      <div class="advpeek show" data-pace-id="cash"><button>Advice</button></div>
      <div class="needrow" data-pace-id="office-move-0"><button>Office</button></div>
    `);
    const { fresh } = await page.evaluate(collectPresentations);
    assert.deepEqual(fresh.map(r => r.kind), ['decision', 'yak', 'yak', 'yak-prompt', 'advisor-prompt', 'office-prompt']);
    assert.equal(fresh.find(r => r.id === 'c1').actionable, false);
    assert.partialDeepStrictEqual(fresh.find(r => r.id === 'c2'), { actionable: true, opportunity: 'reply', replyTo: 'c1', rootId: 'c1' });
    assert.partialDeepStrictEqual(fresh.find(r => r.id === 'p1'), { chatId: 'c2', actions: ['Reply'] });
    assert(fresh.every(r => r.week === 12 && r.era === 'classic' && r.officeStage === 0 && r.origin === 'game' && r.t >= 0));
    assert.deepEqual((await page.evaluate(collectPresentations)).fresh, []);
    await page.evaluate(() => {
      const p = document.querySelector('.yprompt'); p.classList.add('done'); p.replaceChildren('You replied');
      window.__HITL.state.chatPrompts = [{ id: 'p1', resolved: { choice: 0 } }];
    });
    const after = (await page.evaluate(collectPresentations)).fresh;
    assert.partialDeepStrictEqual(after.find(r => r.id === 'p1'), { transition: 'hidden', resolution: { choice: 0 } });
    assert.partialDeepStrictEqual(after.find(r => r.id === 'c2'), { transition: 'updated', actionable: false });
  });

  it('retains toast identity through redocking and queued player origin after unrelated game events', async () => {
    await fixture();
    await page.evaluate(async () => {
      const { createToasts } = await import('/src/ui/toasts.js');
      window.testToasts = createToasts(document.body);
      window.__pace.player(() => window.testToasts.push('Player confirmation', 'good'));
      window.testToasts.push('Game warning', 'warn');
    });
    await advancePresentation(800);
    let rows = (await page.evaluate(collectPresentations)).fresh;
    assert.equal(rows.filter(r => r.kind === 'toast').length, 2);
    assert.equal(withText(rows, 'Player confirmation').origin, 'player');
    assert.equal(withText(rows, 'Game warning').origin, 'game');
    const gameId = withText(rows, 'Game warning').id;
    await page.evaluate(() => {
      window.dock = document.createElement('div'); document.body.append(window.dock);
      window.testToasts.setDock(window.dock);
    });
    rows = (await page.evaluate(collectPresentations)).fresh;
    assert.equal(rows.filter(r => r.transition === 'shown').length, 0);
    assert.deepEqual((await page.evaluate(readPresentations)).filter(r => r.kind === 'toast').map(r => r.id), [gameId]);
    await page.evaluate(() => window.testToasts.setDock(null));
    rows = (await page.evaluate(collectPresentations)).fresh;
    assert.equal(rows.filter(r => r.transition === 'shown').length, 1);
    assert.equal(rows.find(r => r.transition === 'shown').origin, 'player');
  });

  it('observes game-pushed panels and exact click follow-through without a recency heuristic', async () => {
    await fixture();
    await page.evaluate(async () => {
      const { h } = await import('/src/ui/dom.js');
      const open = title => document.body.append(h('div.panel', null, h('h2', { text: title }), h('button', { text: 'Close' })));
      const button = h('button', { onclick: () => open('Player panel'), text: 'Show me' });
      document.body.append(button); button.click(); open('Game panel');
    });
    const rows = (await page.evaluate(collectPresentations)).fresh;
    assert.equal(rows.find(r => r.id === 'Player panel').origin, 'player');
    assert.equal(rows.find(r => r.id === 'Game panel').origin, 'game');
  });

  it('includes pushed incident/call panels and the end card', async () => {
    await fixture(`
      <div class="inccard"><b>Product down</b><button>Ops</button></div>
      <div class="callgrid"><b>Everyone is working from home</b><button>Hide</button></div>
      <div class="go-card"><h1>Game over</h1><button>New Game</button></div>
    `);
    await page.evaluate(() => { window.__HITL.state.outage = { productId: 'p1', kind: 'bad_deploy' }; });
    const rows = (await page.evaluate(collectPresentations)).fresh;
    assert.deepEqual(rows.map(r => [r.kind, r.id, r.origin]), [
      ['panel', 'incident:p1:bad_deploy', 'game'],
      ['panel', 'Everyone is working from home', 'game'],
      ['card', 'Game over', 'game'],
    ]);
  });

  it('does not count held toasts until the presentation gate releases them', async () => {
    await fixture();
    await page.evaluate(async () => {
      const { createToasts } = await import('/src/ui/toasts.js');
      window.gateOpen = false;
      window.testToasts = createToasts(document.body, { canShow: () => window.gateOpen });
      window.__pace.player(() => window.testToasts.push('Queued confirmation', 'good'));
      window.testToasts.push('Queued warning', 'warn');
    });
    await advancePresentation(800);
    assert.deepEqual((await page.evaluate(collectPresentations)).fresh, []);
    await page.evaluate(() => { window.gateOpen = true; });
    await advancePresentation(1600);
    const rows = (await page.evaluate(collectPresentations)).fresh;
    assert.equal(rows.length, 2);
    assert.equal(withText(rows, 'Queued confirmation').origin, 'player');
    assert.equal(withText(rows, 'Queued warning').origin, 'game');
  });

  it('fails closed when metadata hooks move', () => {
    const plugin = presentationMetadata();
    for (const file of ['dom', 'toasts', 'chat', 'hud', 'advisor', 'incident']) {
      assert(plugin.transform(readFileSync(`src/ui/${file}.js`, 'utf8'), `/src/ui/${file}.js`).code);
    }
    assert(plugin.transform(readFileSync('src/main.js', 'utf8'), '/src/main.js').code);
    assert.throws(() => plugin.transform('', '/src/ui/toasts.js'), /metadata hook missing/);
  });

  it('uses elapsed exposure and only shown transitions for rates', () => {
    assert.deepEqual(summarize([
      { kind: 'toast', sequence: 1, transition: 'shown', actionable: true, origin: 'player' },
      { kind: 'toast', sequence: 1, transition: 'hidden', actionable: true, origin: 'player' },
      { kind: 'toast', sequence: 2, transition: 'shown', actionable: false, origin: 'game' },
      { kind: 'yak', transition: 'updated', actionable: true, origin: 'game' },
    ], 120).toast, { count: 2, perMinute: 1, actionable: 1, player: 1, game: 1 });
  });
});
