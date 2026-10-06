// Service worker for the installed game. scripts/vite-pwa.mjs fills in the placeholders at build time and
// writes the result to the build's root as sw.js.
//
// The worker does nothing until the page has downloaded a whole build into an offline set (a cache named
// hitl-set-<build id>, filled by src/dev/pwa.js and marked complete by a last entry). Before that every
// request goes to the network exactly as without a worker. Once a complete set exists:
//   - the ACTIVE set serves everything it holds, pages included, so the game starts without a network.
//     The first complete set becomes active by itself; a later one becomes active only when the page asks
//     (the player chose "Restart now"), so a release never takes over silently and a download that is
//     still going (no marker yet) is never served;
//   - anything the set lacks goes to the network.
// A launch that cannot start leaves a way out that does not depend on the page: a page this worker served
// from a set carries a watchdog (scripts/pwa/boot-watchdog.js) that reports a stall when the page has been
// visible for a while without booting, and the worker counts the stalls since the page last reported
// healthy. After one stall the next launch fetches the page from the network first (so a fixed release
// replaces a broken one); after two, the previous complete set becomes the active one. The pages the
// worker answers that way carry a Server-Timing entry named hitl-set, which tells the watchdog to arm.
// A cache that does not answer in time is treated as absent, so a launch never waits on storage.
const ID = '__VERSION__';
const BASE = '__BASE__';
const PREFIX = 'hitl-set-';
const META = 'hitl-meta';
const ORIGIN = self.location.origin;
const MARK = new URL(`${BASE}__complete`, ORIGIN).href;
const ACTIVE = new URL(`${BASE}__active`, ORIGIN).href;
const NET_WAIT_MS = 5000;
const CACHE_WAIT_MS = 4000;
// A set's file (audio and models can be large) gets longer than a page does.
const FILE_WAIT_MS = 20000;

// The promise's value, or undefined when it has not settled in time.
function within(promise, ms) {
  return Promise.race([promise, new Promise((r) => setTimeout(r, ms))]);
}

// The complete sets, newest first. A set counts only with its marker, which the page writes last.
async function completeSets() {
  const out = [];
  for (const name of await caches.keys()) {
    if (!name.startsWith(PREFIX)) continue;
    const mark = await (await caches.open(name)).match(MARK);
    if (!mark) continue;
    let info = {};
    try { info = await mark.json(); } catch { /* a marker without a time sorts last */ }
    out.push({ name, id: name.slice(PREFIX.length), at: info.at || 0, version: info.version });
  }
  return out.sort((a, b) => b.at - a.at);
}

async function readActive() {
  try { return await (await (await caches.open(META)).match(ACTIVE)).json(); } catch { return null; }
}
async function writeActive(a) {
  await (await caches.open(META)).put(ACTIVE, new Response(JSON.stringify(a), { headers: { 'Content-Type': 'application/json' } }));
}

// The sets in the order they answer: the active one first, then the rest newest first. The first complete
// set ever downloaded becomes active here.
let state; // { list, active } once looked at; undefined while looking
let looking = null;
function look() {
  state = undefined;
  looking = (async () => {
    const list = await completeSets();
    let active = await readActive();
    if (list.length && !list.some((s) => s.id === active?.id)) {
      const s = list[0];
      active = { id: s.id, version: s.version, stalls: 0 };
      await writeActive(active);
    }
    state = { list, active: list.length ? active : null };
    return state;
  })().catch(() => { state = { list: [], active: null }; return state; });
  return looking;
}
look();

self.addEventListener('install', () => {});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const pending = look();
    await self.clients.claim();
    await within(pending, CACHE_WAIT_MS);
  })());
});

self.addEventListener('message', (event) => {
  const msg = event.data || {};
  if (msg.type === 'skip-waiting') self.skipWaiting();
  if (msg.type === 'version') event.source?.postMessage({ type: 'version', id: ID });
  // The page finished a set.
  if (msg.type === 'refresh') event.waitUntil(look().then((s) => event.source?.postMessage({ type: 'refreshed', sets: s.list.map((x) => x.id) })));
  // The player chose a set (a complete one) to run from the next page load.
  if (msg.type === 'activate') {
    event.waitUntil((async () => {
      const s = await look();
      const set = s.list.find((x) => x.id === msg.id);
      if (set) { await writeActive({ id: set.id, version: set.version, stalls: 0 }); await look(); }
      event.source?.postMessage({ type: 'activated', id: msg.id, ok: !!set });
    })());
  }
  // The page booted: the stalls are over.
  if (msg.type === 'healthy') {
    event.waitUntil((async () => {
      const a = await readActive();
      if (a && a.stalls) { await writeActive({ ...a, stalls: 0 }); await look(); }
    })());
  }
  // The page's watchdog gave up waiting for the game to boot: the next launch looks elsewhere.
  if (msg.type === 'stalled') {
    event.waitUntil((async () => {
      const a = await readActive();
      if (a) { await writeActive({ ...a, stalls: (a.stalls || 0) + 1 }); await look(); }
      event.ports[0]?.postMessage('ok');
    })());
  }
});

// A range request (an audio element seeking) is answered from the cached whole file.
async function fromRange(request, hit) {
  const m = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (!m) return hit;
  const buf = await hit.arrayBuffer();
  const start = m[1] === '' ? Math.max(0, buf.byteLength - Number(m[2])) : Number(m[1]);
  const end = m[1] !== '' && m[2] !== '' ? Math.min(Number(m[2]), buf.byteLength - 1) : buf.byteLength - 1;
  if (start > end) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${buf.byteLength}` } });
  return new Response(buf.slice(start, end + 1), {
    status: 206,
    headers: {
      'Content-Type': hit.headers.get('Content-Type') || 'application/octet-stream',
      'Content-Range': `bytes ${start}-${end}/${buf.byteLength}`,
      'Content-Length': String(end - start + 1),
    },
  });
}

async function fromNetwork(request) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), NET_WAIT_MS);
  try {
    const res = await fetch(request, { signal: ctl.signal });
    return res.ok ? res : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

// The page answer with the entry that arms the page's watchdog.
function marked(res, tag) {
  const headers = new Headers(res.headers);
  headers.append('Server-Timing', `hitl-set;desc="${tag}"`);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// The newest complete set other than the active one that holds the page.
async function previousSet(list, active, key) {
  for (const s of list) {
    if (s.id === active.id) continue;
    if (await (await caches.open(s.name)).match(key)) return s;
  }
  return null;
}

async function fromSets(request, list, active, key) {
  const ordered = [...list.filter((s) => s.id === active?.id), ...list.filter((s) => s.id !== active?.id)];
  for (const s of ordered) {
    const hit = await (await caches.open(s.name)).match(key);
    if (hit) return request.headers.has('range') ? fromRange(request, hit) : hit;
  }
  return null;
}

async function serve(request) {
  const seen = await within(state ?? looking, CACHE_WAIT_MS);
  if (!seen) return fetch(request);
  const { list, active } = seen;
  const navigating = request.mode === 'navigate';
  // A page is the build's index whatever its query (?seed=, ?mock=).
  const key = navigating ? `${ORIGIN}${BASE}index.html` : request.url;
  const answer = async () => {
    if (navigating && active) {
      // Stalls the page's watchdog reported since a launch last booted.
      const stalls = active.stalls || 0;
      if (stalls >= 2) {
        const prev = await previousSet(list, active, key);
        if (prev) {
          const next = { id: prev.id, version: prev.version, stalls: 0 };
          await writeActive(next);
          state = { list, active: next };
          const res = await fromSets(request, list, next, key);
          if (res) return marked(res, next.id);
        }
      }
      if (stalls >= 1) {
        const fresh = await fromNetwork(request);
        if (fresh) return marked(fresh, 'network');
      }
    }
    const res = await fromSets(request, list, active, key);
    return navigating && res ? marked(res, active.id) : res;
  };
  const res = await within(answer(), navigating ? NET_WAIT_MS + CACHE_WAIT_MS * 2 : FILE_WAIT_MS);
  return res || fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== ORIGIN || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length);
  if (path === 'sw.js' || path === 'pwa-assets.json') return;
  // The page's own downloads of a new build must reach the network, not the old build's copy.
  if (request.headers.has('x-hitl-download')) return;
  // Known to hold no complete set: leave the request to the browser.
  if (state && state.list.length === 0) return;
  event.respondWith(serve(request));
});
