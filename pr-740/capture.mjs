import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const { IDLE } = await import(pathToFileURL(resolve('scripts/capture-manifest.js')));
const label = process.env.YAK_BUILD_LABEL ?? 'After';
export const ITEMS = [{
  id: `yak-expiry-${label.toLowerCase()}-4x`, title: `${label}: queued Yak at 4x`,
  query: 'seed=1&speed=4&time=day', seed: 12345, seconds: 28, fps: 30,
  size: '1280x800', warmup: 0, screenshots: [3, 13, 20, 26],
  setup: `(async () => {
    const H = window.__HITL, s = H.state;
    const { addProduct, addDesks } = await import('/tests/sim/helpers.js');
    const { makeCtx } = await import('/src/sim/registry.js');
    const { emitChat } = await import('/src/sim/chat.js');
    const { startOutage, clearOutage } = await import('/src/sim/incidents.js');
    s.week = 20; s.cash = 1000000;
    addDesks(s, 2);
    const product = addProduct(s, { model: null, name: 'Inboxer' });
    for (const goal of Object.values(s.goals)) goal.done = true;
    ${IDLE}
    H.setSpeed(4);
    dispatchEvent(new CustomEvent('hitl:cameraSettings', { detail: { momentCamera: false } }));
    const style = document.createElement('style');
    style.textContent = '.chat.yak { position: fixed !important; left: 16px !important; bottom: 90px !important; width: 560px !important; } .chat-body { height: 330px !important; }';
    document.head.append(style);
    const banner = document.createElement('div');
    banner.style.cssText = 'position:fixed;left:16px;top:95px;width:548px;background:#fff9e9;padding:12px;border:3px solid #43363b;border-radius:12px;z-index:10000;font:18px monospace;color:#332b31';
    document.body.append(banner);
    const c = makeCtx(s);
    emitChat(c, { id: 'capture-reading', from: '@officebot', channel: 'general', text: 'Please read this company update while the team works. We have a full queue of messages today. This notice keeps its normal reading time at every game speed, so everyone has enough time to finish reading before the next post.' });
    H.emit(c.events);
    const t0 = window.__capture.now;
    window.__captureMarks = [];
    const seen = new Set();
    const watch = () => {
      const t = (window.__capture.now - t0) / 1000;
      banner.textContent = '${label} | 4x | ' + t.toFixed(1) + ' seconds | week ' + s.week + '\\nOutage: ' + (s.outage ? 'ACTIVE' : 'RESOLVED') + '\\nQueued at 0.2s: outage post + routine post';
      banner.style.whiteSpace = 'pre-line';
      for (const id of ['capture-reading', 'capture-outage', 'capture-routine']) {
        if (!seen.has(id) && document.querySelector('.msg[data-id="' + id + '"]')) {
          seen.add(id); window.__captureMarks.push({ t: +t.toFixed(3), label: 'shown ' + id, week: s.week, outage: !!s.outage });
        }
      }
      requestAnimationFrame(watch);
    };
    requestAnimationFrame(watch);
    window.yakQueueBurst = () => {
      const c = makeCtx(s);
      startOutage(c, { productId: product.id, kind: 'ransomware', severity: 1 });
      s.outage.unrecoverable = false; s.pendingDecision = null;
      emitChat(c, { id: 'capture-outage', person: s.staff[0], text: 'Inboxer is down. Investigating the outage now.', outage: true });
      emitChat(c, { id: 'capture-routine', person: s.staff[1], text: 'The week 20 standup starts now. See you there.' });
      H.emit(c.events.filter(e => e.type === 'chat'));
    };
    window.yakResolve = () => {
      const c = makeCtx(s); clearOutage(c, '');
      H.emit(c.events);
      window.__captureMarks.push({ t: +((window.__capture.now - t0) / 1000).toFixed(3), label: 'outage resolved', week: s.week });
    };
  })()`,
  actions: [
    { at: 0.2, js: 'window.yakQueueBurst()' },
    { at: 1.0, js: 'window.yakResolve()' },
  ],
}];
