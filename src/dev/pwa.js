// The installed game's offline support (public build only).
//
// A normal browser visit loads exactly as it always did: the worker (scripts/pwa/sw.template.js) steps
// aside until a whole build has been downloaded. The download starts only when the game runs as an
// installed app (display-mode standalone, navigator.standalone on iOS) or when the player asks for it in
// Settings (window.__HITL_OFFLINE.start()). It fetches every file of the build (pwa-assets.json lists
// them) into a cache named for the build, a few at a time, skips files an earlier try already stored, and
// writes a completion marker last, so an interrupted download resumes next launch and a build counts
// only when whole.
//
// On every launch of an installed app (or of a browser that has the set) it looks for a newer build, and
// when it finds one, downloads that set in the background and then asks to restart; the running build
// and its own set keep working until the new set is complete. A failed look (offline) is silent.
import { mountOfflineUi } from './pwa-ui.js';

const BASE = import.meta.env?.BASE_URL ?? '/';
const BUILD_VERSION = typeof __HITL_VERSION__ === 'string' ? __HITL_VERSION__ : 'dev';
const PREFIX = 'hitl-set-';
const OPT_KEY = 'hitl.offline';
const PARALLEL = 4;
const TRIES = 3;

// The files this browser needs: one twin of each sound (Ogg Opus where the browser plays it, else m4a).
export function pickFiles(files, opus) {
  return files.filter((f) => !(f.p.startsWith('audio/') && f.p.endsWith(opus ? '.m4a' : '.ogg')));
}

export function isInstalledApp(win = globalThis) {
  try {
    return !!(win.matchMedia?.('(display-mode: standalone)').matches || win.navigator?.standalone === true);
  } catch { return false; }
}

const markUrl = (win) => new URL(`${BASE}__complete`, win.location.origin).href;
const absolute = (win, p) => new URL(`${BASE}${p}`, win.location.origin).href;

export function createOffline({ win = globalThis, nav = globalThis.navigator, doc = globalThis.document, build = BUILD_VERSION } = {}) {
  const listeners = new Set();
  const state = { state: 'off', installed: isInstalledApp(win), done: 0, total: 0, files: 0, filesDone: 0, newVersion: null, updateReady: false, error: '', canDownload: true };
  const emit = () => { for (const fn of listeners) { try { fn(state); } catch { /* a listener must not stop the download */ } } };
  const set = (patch) => { Object.assign(state, patch); emit(); };
  let running = null;
  let reg = null;
  const opus = (() => { try { return !!doc.createElement('audio').canPlayType('audio/ogg; codecs="opus"'); } catch { return true; } })();
  const optedIn = () => { try { return win.localStorage.getItem(OPT_KEY) === '1'; } catch { return false; } };
  const remember = () => { try { win.localStorage.setItem(OPT_KEY, '1'); } catch { /* blocked storage */ } };

  async function fetchList() {
    try {
      const res = await win.fetch(`${BASE}pwa-assets.json`, { cache: 'no-store' });
      if (!res.ok) return null;
      const m = await res.json();
      return m && Array.isArray(m.files) && m.id ? m : null;
    } catch { return null; }
  }

  async function sets() {
    const out = [];
    for (const name of await win.caches.keys()) {
      if (!name.startsWith(PREFIX)) continue;
      const mark = await (await win.caches.open(name)).match(markUrl(win));
      if (mark) out.push(name.slice(PREFIX.length));
    }
    return out;
  }

  async function tell(msg) {
    try { (nav.serviceWorker.controller || (await nav.serviceWorker.ready).active)?.postMessage(msg); } catch { /* no worker */ }
  }

  async function download(m, want) {
    const cache = await win.caches.open(`${PREFIX}${m.id}`);
    const todo = [];
    let done = 0;
    for (const f of want) {
      if (await cache.match(absolute(win, f.p))) done += f.s; else todo.push(f);
    }
    set({ state: 'downloading', done, total: want.reduce((n, f) => n + f.s, 0), files: want.length, filesDone: want.length - todo.length, error: '' });
    let next = 0;
    let failed = null;
    const worker = async () => {
      while (next < todo.length && !failed) {
        const f = todo[next++];
        let ok = false;
        for (let t = 0; t < TRIES && !ok; t++) {
          try {
            // The header tells the worker to let this one through to the network (an update must not be
            // filled from the build it replaces).
            const res = await win.fetch(absolute(win, f.p), { cache: 'no-cache', headers: { 'X-Hitl-Download': '1' } });
            if (!res.ok) throw new Error(`${res.status}`);
            await cache.put(absolute(win, f.p), res);
            ok = true;
          } catch (e) {
            if (e?.name === 'QuotaExceededError') { failed = 'quota'; return; }
            await new Promise((r) => win.setTimeout(r, 500 * (t + 1)));
          }
        }
        if (!ok) { failed = failed || 'network'; return; }
        set({ done: state.done + f.s, filesDone: state.filesDone + 1 });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    if (failed === 'quota') { set({ state: 'error', error: 'Not enough storage on this device to play offline.' }); return false; }
    if (failed) { set({ state: 'paused', error: 'Download paused. It resumes when the connection is back.' }); return false; }
    await cache.put(markUrl(win), new Response(JSON.stringify({ id: m.id, version: m.version, at: Date.now(), files: want.length }), { headers: { 'Content-Type': 'application/json' } }));
    await tell({ type: 'refresh' });
    return true;
  }

  // Looks for the current build's list, downloads whatever is missing, and reports the result. Silent
  // when the list can't be fetched (offline): the game starts from what it has.
  async function run({ manual = false } = {}) {
    if (running) return running;
    running = (async () => {
      try {
        if (!win.caches) { set({ state: 'unsupported', canDownload: false }); return; }
        if (state.state === 'off') set({ state: 'checking' });
        const have = await sets();
        // A plain browser visit that never asked for the offline set (and holds none) makes no request.
        if (!manual && !state.installed && !optedIn() && !have.length) { set({ state: 'off' }); return; }
        const m = await fetchList();
        if (!m) { set({ state: have.length ? 'ready' : 'off' }); return; }
        const want = pickFiles(m.files, opus);
        const bytes = want.reduce((n, f) => n + f.s, 0);
        const outdated = m.version !== build;
        set({ total: bytes, files: want.length, newVersion: outdated ? m.version : null });
        if (have.includes(m.id)) {
          set({ state: 'ready', done: bytes, filesDone: want.length, updateReady: outdated });
          // Running the newest build: the sets of the builds before it are no longer needed.
          if (!outdated) tell({ type: 'prune', version: build });
          return;
        }
        if (!manual && nav.connection?.saveData && !have.length) { set({ state: 'off' }); return; }
        try {
          const est = await nav.storage?.estimate?.();
          if (est?.quota && est.quota - (est.usage || 0) < bytes * 1.1) { set({ state: 'error', error: 'Not enough storage on this device to play offline.' }); return; }
        } catch { /* no estimate: try anyway */ }
        try { await nav.storage?.persist?.(); } catch { /* best effort */ }
        const ok = await download(m, want);
        if (ok) set({ state: 'ready', updateReady: outdated, justFinished: !outdated });
      } catch (e) {
        set({ state: 'error', error: String(e?.message || e) });
      } finally {
        running = null;
      }
    })();
    return running;
  }

  // The worker serves the newest complete set, so a reload is the whole restart. The new build's own worker
  // is nudged to take over too (it only gets to once the running one is idle, which does not matter).
  async function applyUpdate() {
    try {
      reg = reg || (await nav.serviceWorker.getRegistration());
      reg?.waiting?.postMessage({ type: 'skip-waiting' });
    } catch { /* the reload below is what matters */ }
    win.location.reload();
  }

  const api = {
    get state() { return state; },
    subscribe(fn) { listeners.add(fn); fn(state); return () => listeners.delete(fn); },
    // The player asked for it: remembered, so every launch keeps the set current.
    start() { remember(); return run({ manual: true }); },
    applyUpdate,
    dismissUpdate() { set({ updateReady: false }); },
    // The size of the download, for the Settings row, without starting it.
    async peek() {
      const m = await fetchList();
      if (!m) return state;
      const want = pickFiles(m.files, opus);
      set({ total: want.reduce((n, f) => n + f.s, 0), files: want.length });
      return state;
    },
    run,
    optedIn,
    attach(r) { reg = r; },
  };
  return api;
}

export function registerPwa({ nav = globalThis.navigator, doc = globalThis.document, win = globalThis } = {}) {
  if (!import.meta.env?.PROD || !nav || !('serviceWorker' in nav) || !doc) return null;
  const offline = createOffline({ win, nav, doc });
  win.__HITL_OFFLINE = offline;

  // The page may already have finished loading by the time the game's modules get here.
  const whenLoaded = (fn) => (doc.readyState === 'complete' ? fn() : win.addEventListener('load', fn, { once: true }));
  whenLoaded(() => {
    mountOfflineUi(offline, { doc, win });
    // Not awaited: while an update's worker is waiting to take over, registering can take a while, and
    // the download does not need the registration.
    nav.serviceWorker.register(`${BASE}sw.js`, { scope: BASE }).then((reg) => offline.attach(reg), () => {});
    // Installed, or the player asked for it before: keep the offline set whole and current. The game
    // gets a few seconds to start first.
    if (offline.state.installed || offline.optedIn()) win.setTimeout(() => { offline.run(); }, 3000);
    else offline.run().catch(() => {}); // a browser holding a set keeps it current; one without makes no request
  });
  // A connection that comes back resumes a paused download.
  win.addEventListener('online', () => { if (offline.state.state === 'paused') offline.run(); });
  return offline;
}
