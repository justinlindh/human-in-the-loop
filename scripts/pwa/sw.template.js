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
// A launch that cannot start leaves a way out that does not depend on the page: the worker counts the
// launches in a row that never reported healthy (the page reports once it has booted). After one such
// launch the next one fetches the page from the network first (so a fixed release replaces a broken
// one); after two, the previous complete set becomes the active one.
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
const LAUNCH_GRACE_MS = 6000;

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
      active = { id: s.id, version: s.version, tries: 0 };
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
      if (set) { await writeActive({ id: set.id, version: set.version, tries: 0 }); await look(); }
      event.source?.postMessage({ type: 'activated', id: msg.id, ok: !!set });
    })());
  }
  // The page booted: the launch counts as confirmed.
  if (msg.type === 'healthy') {
    event.waitUntil((async () => {
      const a = await readActive();
      if (a && a.tries) { await writeActive({ ...a, tries: 0 }); await look(); }
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
    // A reload soon after a launch is still that launch: the page has had no time to confirm.
    const recent = !!active?.tries && Date.now() - (active.at || 0) < LAUNCH_GRACE_MS;
    if (navigating && active && !recent) {
      // Each launch counts until the page confirms it booted.
      const tries = active.tries || 0;
      active.tries = tries + 1;
      active.at = Date.now();
      await writeActive({ ...active });
      if (tries >= 2) {
        const prev = await previousSet(list, active, key);
        if (prev) {
          const next = { id: prev.id, version: prev.version, tries: 1 };
          await writeActive(next);
          state = { list, active: next };
          return fromSets(request, list, next, key);
        }
      }
      if (tries >= 1) {
        const fresh = await fromNetwork(request);
        if (fresh) return fresh;
      }
    }
    return fromSets(request, list, active, key);
  };
  const res = await within(answer(), navigating ? NET_WAIT_MS + CACHE_WAIT_MS * 2 : CACHE_WAIT_MS);
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
