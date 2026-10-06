// Service worker for the installed game. scripts/vite-pwa.mjs fills in the placeholders at build time and
// writes the result to the build's root as sw.js.
// The worker does nothing until the page has downloaded a whole build into an offline set (a cache named
// hitl-set-<build id>, filled by src/dev/pwa.js and marked complete by a last entry). Before that every
// request goes to the network exactly as without a worker. Once a complete set exists:
//   - the newest complete set serves everything it holds, pages included, so the game starts without a
//     network, and a release whose download is still going (or was cut off) has no marker yet, so the
//     previous complete set keeps serving: the player never sees a half-updated game;
//   - anything the sets lack goes to the network.
// Which worker is live does not matter for what is served, so a new build takes over the moment its set is
// complete, at the next page load; a page already running keeps the files it has. The page asks for the
// sets older than its own build to be deleted once it is running (prune).
const ID = '__VERSION__';
const BASE = '__BASE__';
const PREFIX = 'hitl-set-';
const MARK = new URL(`${BASE}__complete`, self.location.origin).href;

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

// undefined until the first look; [] means no complete set, and the worker steps aside.
let sets;
let looking = null;
function look() {
  // Until the new look finishes, a request waits for it rather than using the last answer.
  sets = undefined;
  looking = completeSets().then((s) => { sets = s; return s; }, () => { sets = []; return sets; });
  return looking;
}
look();

self.addEventListener('install', () => {});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const pending = look();
    await self.clients.claim();
    await pending;
  })());
});

self.addEventListener('message', (event) => {
  const type = event.data?.type;
  if (type === 'skip-waiting') self.skipWaiting();
  if (type === 'version') event.source?.postMessage({ type: 'version', id: ID });
  // The page finished a set: look again.
  if (type === 'refresh') {
    event.waitUntil(look().then((s) => event.source?.postMessage({ type: 'refreshed', sets: s.map((x) => x.id) })));
  }
  // The page is running build <version>: delete the sets older than that build's, if it has a complete one.
  if (type === 'prune') {
    event.waitUntil((async () => {
      const list = await completeSets();
      const mine = list.find((s) => s.version === event.data.version);
      if (mine) for (const o of list) if (o.at < mine.at) await caches.delete(o.name);
      await look();
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

async function serve(request) {
  const list = sets ?? (await looking);
  // A page is the build's index whatever its query (?seed=, ?mock=).
  const key = request.mode === 'navigate' ? `${self.location.origin}${BASE}index.html` : request.url;
  for (const s of list) {
    const hit = await (await caches.open(s.name)).match(key);
    if (hit) return request.headers.has('range') ? fromRange(request, hit) : hit;
  }
  return fetch(request);
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length);
  if (path === 'sw.js' || path === 'pwa-assets.json') return;
  // The page's own downloads of a new build must reach the network, not the old build's copy.
  if (request.headers.has('x-hitl-download')) return;
  // Known to hold no complete set: leave the request to the browser.
  if (sets && sets.length === 0) return;
  event.respondWith(serve(request));
});
