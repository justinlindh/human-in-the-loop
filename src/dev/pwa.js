// The installed game's offline support (public build only).
//
// A normal browser visit loads exactly as it always did: the worker (scripts/pwa/sw.template.js) steps
// aside until a whole build has been downloaded. The download starts only when the game runs as an
// installed app (display-mode standalone, navigator.standalone on iOS) or when the player asks for it in
// Settings (window.__HITL_OFFLINE.start()). It fetches every file of the build (pwa-assets.json lists
// them with a content hash) into a cache named for the build, a few at a time, skips files an earlier
// try already stored, and writes a completion marker last, so an interrupted download resumes next
// launch and a build counts only when whole.
//
// On every launch of an installed app (or of a browser that has the set) it looks for a newer build.
// When there is one it builds the new set in the background: a file whose hash matches one in the set it
// replaces is copied from there, so only the changed files cross the network. Then it asks to restart;
// until the player agrees, the running build and its own set keep serving. A failed look (offline) is
// silent. With the browser's data saver on, an update waits for the player's say-so in Settings.
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
const manifestUrl = (win) => new URL(`${BASE}__manifest`, win.location.origin).href;
const absolute = (win, p) => new URL(`${BASE}${p}`, win.location.origin).href;

export function createOffline({ win = globalThis, nav = globalThis.navigator, doc = globalThis.document, build = BUILD_VERSION } = {}) {
  const listeners = new Set();
  const state = {
    state: 'off', installed: isInstalledApp(win), done: 0, total: 0, files: 0, filesDone: 0,
    needBytes: 0, netBytes: 0, copiedBytes: 0, newVersion: null, newId: null,
    updateReady: false, updatePending: false, justFinished: false, error: '', canDownload: true,
  };
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

  // Every set in storage: { name, id, version, complete }.
  async function allSets() {
    const out = [];
    for (const name of await win.caches.keys()) {
      if (!name.startsWith(PREFIX)) continue;
      const cache = await win.caches.open(name);
      const mark = await cache.match(markUrl(win));
      let version = null;
      if (mark) { try { version = (await mark.json()).version; } catch { /* unreadable marker */ } }
      out.push({ name, id: name.slice(PREFIX.length), version, complete: !!mark, cache });
    }
    return out;
  }

  // The worker answers a message with one of its own; resolves null if it stays silent.
  async function ask(msg, reply, ms = 3000) {
    try {
      const worker = nav.serviceWorker.controller || (await nav.serviceWorker.ready).active;
      if (!worker) return null;
      return await new Promise((resolve) => {
        const timer = win.setTimeout(() => { nav.serviceWorker.removeEventListener('message', on); resolve(null); }, ms);
        const on = (e) => { if (e.data?.type === reply) { win.clearTimeout(timer); nav.serviceWorker.removeEventListener('message', on); resolve(e.data); } };
        nav.serviceWorker.addEventListener('message', on);
        worker.postMessage(msg);
      });
    } catch { return null; }
  }
  const tell = async (msg) => { try { (nav.serviceWorker.controller || (await nav.serviceWorker.ready).active)?.postMessage(msg); } catch { /* no worker */ } };

  // The files of the set to build that a complete set already holds with the same content.
  async function plan(m, want, sets) {
    const sources = [];
    for (const s of sets) {
      if (!s.complete || s.id === m.id) continue;
      try {
        const mf = await s.cache.match(manifestUrl(win));
        if (mf) sources.push({ cache: s.cache, hashes: new Map((await mf.json()).files.map((f) => [f.p, f.h])) });
      } catch { /* a set without a readable manifest copies nothing */ }
    }
    const target = sets.find((s) => s.id === m.id);
    const copy = [];
    const net = [];
    let stored = 0;
    for (const f of want) {
      if (target && await target.cache.match(absolute(win, f.p))) { stored += f.s; continue; }
      const src = f.h && sources.find((s) => s.hashes.get(f.p) === f.h);
      if (src) copy.push({ f, src }); else net.push(f);
    }
    return { copy, net, stored, needBytes: net.reduce((n, f) => n + f.s, 0) };
  }

  async function download(m, want, p) {
    const cache = await win.caches.open(`${PREFIX}${m.id}`);
    await cache.put(manifestUrl(win), new Response(JSON.stringify({ id: m.id, version: m.version, files: want.map((f) => ({ p: f.p, h: f.h })) }), { headers: { 'Content-Type': 'application/json' } }));
    set({ state: 'downloading', done: p.stored, total: want.reduce((n, f) => n + f.s, 0), files: want.length, filesDone: want.length - p.copy.length - p.net.length, needBytes: p.needBytes, netBytes: 0, copiedBytes: 0, error: '' });
    // Unchanged files come from the build being replaced, not the network.
    for (const { f, src } of p.copy) {
      const res = await src.cache.match(absolute(win, f.p));
      if (res) { await cache.put(absolute(win, f.p), res); set({ done: state.done + f.s, copiedBytes: state.copiedBytes + f.s, filesDone: state.filesDone + 1 }); } else p.net.push(f);
    }
    let next = 0;
    let failed = null;
    const worker = async () => {
      while (next < p.net.length && !failed) {
        const f = p.net[next++];
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
        set({ done: state.done + f.s, netBytes: state.netBytes + f.s, filesDone: state.filesDone + 1 });
      }
    };
    await Promise.all(Array.from({ length: PARALLEL }, worker));
    if (failed === 'quota') { set({ state: 'error', error: 'Not enough storage on this device to play offline.' }); return false; }
    if (failed) { set({ state: 'paused', error: 'Download paused. It resumes when the connection is back.' }); return false; }
    await cache.put(markUrl(win), new Response(JSON.stringify({ id: m.id, version: m.version, at: Date.now(), files: want.length }), { headers: { 'Content-Type': 'application/json' } }));
    await ask({ type: 'refresh' }, 'refreshed');
    return true;
  }

  // Deletes every set that is neither the build running nor the newest published one: partial downloads of
  // releases that were superseded, and complete sets of builds already replaced.
  async function cleanup(m) {
    try {
      const keep = new Set([m.id]);
      for (const s of await allSets()) if (s.complete && s.version === build) keep.add(s.id);
      for (const s of await allSets()) if (!keep.has(s.id)) await win.caches.delete(s.name);
    } catch { /* storage trouble must not stop the game */ }
  }

  // Looks for the current build's list, downloads whatever is missing, and reports the result. Silent
  // when the list can't be fetched (offline): the game starts from what it has.
  async function run({ manual = false } = {}) {
    if (running) return running;
    running = (async () => {
      try {
        if (!win.caches) { set({ state: 'unsupported', canDownload: false }); return; }
        if (state.state === 'off') set({ state: 'checking' });
        const sets = await allSets();
        const have = sets.filter((s) => s.complete).map((s) => s.id);
        // A plain browser visit that never asked for the offline set (and holds none) makes no request.
        if (!manual && !state.installed && !optedIn() && !have.length) { set({ state: 'off' }); return; }
        const m = await fetchList();
        if (!m) { set({ state: have.length ? 'ready' : 'off' }); return; }
        const want = pickFiles(m.files, opus);
        const bytes = want.reduce((n, f) => n + f.s, 0);
        const outdated = m.version !== build;
        set({ total: bytes, files: want.length, newVersion: outdated ? m.version : null, newId: m.id, updatePending: false });
        if (have.includes(m.id)) {
          set({ state: 'ready', done: bytes, filesDone: want.length, updateReady: outdated });
          if (!outdated) await cleanup(m);
          return;
        }
        const p = await plan(m, want, sets);
        set({ needBytes: p.needBytes });
        // The data saver defers an update (or a first download nobody asked for) until the player says so.
        if (!manual && nav.connection?.saveData) { set({ state: have.length ? 'ready' : 'off', updatePending: have.length > 0 }); return; }
        try {
          const est = await nav.storage?.estimate?.();
          if (est?.quota && est.quota - (est.usage || 0) < p.needBytes * 1.1) { set({ state: 'error', error: 'Not enough storage on this device to play offline.' }); return; }
        } catch { /* no estimate: try anyway */ }
        try { await nav.storage?.persist?.(); } catch { /* best effort */ }
        if (!(await download(m, want, p))) return;
        if (!outdated) {
          // This page already runs the build whose set just completed: make it the active one, healthy.
          await ask({ type: 'activate', id: m.id }, 'activated');
          await tell({ type: 'healthy', version: build });
        }
        set({ state: 'ready', updateReady: outdated, justFinished: !outdated });
        await cleanup(m);
      } catch (e) {
        set({ state: 'error', error: String(e?.message || e) });
      } finally {
        running = null;
      }
    })();
    return running;
  }

  // Makes the new set the one to run from, then reloads onto it.
  async function applyUpdate() {
    if (state.newId) await ask({ type: 'activate', id: state.newId }, 'activated');
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
      set({ total: want.reduce((n, f) => n + f.s, 0), files: want.length, needBytes: want.reduce((n, f) => n + f.s, 0) });
      return state;
    },
    run,
    optedIn,
    attach(r) { reg = r; void reg; },
    // The page has booted: tells the worker, which counts launches that never got this far.
    reportHealthy() { return tell({ type: 'healthy', version: build }); },
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
  // Once the game has booted, tell the worker this build starts: a release that cannot never says so,
  // and the worker then looks for a fix on the network.
  let waited = 0;
  const watch = win.setInterval(() => {
    waited += 500;
    if (win.__HITL_BOOT_ERROR || waited > 120000) { win.clearInterval(watch); return; }
    if (win.__HITL_READY) { win.clearInterval(watch); offline.reportHealthy(); }
  }, 500);
  // A connection that comes back resumes a paused download.
  win.addEventListener('online', () => { if (offline.state.state === 'paused') offline.run(); });
  return offline;
}
