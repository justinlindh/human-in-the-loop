// Registers the service worker (public build only) and keeps an installed game current without costing
// the player anything: a new build waits until the page is hidden, or until a fresh load that has
// shown nothing yet, then takes over and the page reloads once. Idle time on the first visit fills the
// cache with the models, icons and short sounds, so the game also works offline from the second launch.
const BASE = import.meta.env?.BASE_URL ?? '/';
const CHECK_EVERY_MS = 60 * 60 * 1000;

export function registerPwa({ nav = globalThis.navigator, doc = globalThis.document, win = globalThis } = {}) {
  if (!import.meta.env?.PROD || !nav || !('serviceWorker' in nav) || !doc) return null;
  let reg = null;
  let hadController = !!nav.serviceWorker.controller;
  let reloading = false;
  let lastCheck = Date.now();

  const takeOver = () => reg?.waiting?.postMessage({ type: 'skip-waiting' });

  nav.serviceWorker.addEventListener('controllerchange', () => {
    // The first worker claiming a page that had none is not an update.
    if (!hadController) { hadController = true; warm(); return; }
    if (reloading) return;
    reloading = true;
    win.location.reload();
  });

  doc.addEventListener('visibilitychange', () => {
    if (doc.hidden) takeOver();
    else if (reg && Date.now() - lastCheck > CHECK_EVERY_MS) { lastCheck = Date.now(); reg.update().catch(() => {}); }
  });

  async function warm() {
    try {
      if (nav.connection?.saveData) return;
      const res = await fetch(`${BASE}pwa-assets.json`, { cache: 'no-cache' });
      if (!res.ok) return;
      const { warm: list = [] } = await res.json();
      const media = await win.caches.open('hitl-media');
      const idle = win.requestIdleCallback ? (fn) => win.requestIdleCallback(fn, { timeout: 400 }) : (fn) => win.setTimeout(fn, 400);
      let i = 0;
      // Progress, for the offline check to wait on.
      const progress = win.__HITL_PWA_WARM = { total: list.length, done: 0 };
      const next = async () => {
        progress.done = i;
        if (i >= list.length) return;
        if (doc.hidden) { doc.addEventListener('visibilitychange', () => idle(next), { once: true }); return; }
        // A few at a time, skipping what is already cached, keeps the game's own loading ahead of the fill.
        const batch = [];
        while (batch.length < 6 && i < list.length) {
          const url = `${BASE}${list[i++]}`;
          if (!(await media.match(url))) batch.push(url);
        }
        await Promise.allSettled(batch.map((u) => fetch(u)));
        idle(next);
      };
      idle(next);
    } catch { /* offline or no list: nothing to warm */ }
  }

  win.addEventListener('load', async () => {
    try {
      reg = await nav.serviceWorker.register(`${BASE}sw.js`, { scope: BASE });
    } catch { return; }
    // An update that arrived during an earlier visit: this load has shown nothing yet, so take it now.
    if (reg.waiting && nav.serviceWorker.controller) takeOver();
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && nav.serviceWorker.controller && doc.hidden) takeOver();
      });
    });
    if (nav.serviceWorker.controller) warm();
    reg.update().catch(() => {});
  });
  return { check: () => reg?.update() };
}
