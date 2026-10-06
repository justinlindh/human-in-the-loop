// Service worker for the installed game. scripts/vite-pwa.mjs fills in the placeholders at build time and
// writes the result to the build's root as sw.js.
//   Shell     the page, scripts, styles, fonts and app icons: precached on install, in a cache named for the
//             build, so a new build never reuses an old one's files. Hashed files come from the cache first.
//   Pages     network first (a short wait), the cached page when offline, so an online player always gets
//             the newest build and an offline one still gets the game.
//   Media     models, audio, icons and memes: kept in one cache that outlives builds, served from it while
//             a fresh copy is fetched for next time. Anything not played yet is simply not there offline;
//             missing audio is synthesized by the game.
//   Updates   a new worker installs beside the running one and waits; the page tells it to take over at a
//             moment that costs the player nothing (src/pwa.js).
const VERSION = '__VERSION__';
const SHELL = __SHELL__;
const BASE = '__BASE__';
const SHELL_CACHE = `hitl-shell-${VERSION}`;
const MEDIA_CACHE = 'hitl-media';
const NAV_WAIT_MS = 4000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL.map((p) => BASE + p))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('hitl-shell-') && key !== SHELL_CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'skip-waiting') self.skipWaiting();
  if (event.data?.type === 'version') event.source?.postMessage({ type: 'version', version: VERSION });
});

const isMedia = (path) => /^(audio|models|icons|memes)\//.test(path);

async function page(request) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), NAV_WAIT_MS);
    const res = await fetch(request, { signal: ctl.signal });
    clearTimeout(timer);
    if (res.ok) return res;
  } catch { /* offline or slow: the cached page */ }
  return (await cache.match(BASE + 'index.html')) || (await cache.match(BASE)) || Response.error();
}

async function shellFile(request) {
  const hit = await (await caches.open(SHELL_CACHE)).match(request);
  return hit || fetch(request);
}

// A range request (an audio element seeking) is answered from a cached whole file when there is one.
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

async function media(event) {
  const request = event.request;
  const cache = await caches.open(MEDIA_CACHE);
  const hit = await cache.match(request.url);
  // no-cache revalidates with the server (a 304 when the file is unchanged), so keeping the copy fresh
  // costs a request, not the download.
  const refresh = () => fetch(request.url, { cache: 'no-cache' }).then((res) => {
    if (res.ok && res.status === 200) cache.put(request.url, res.clone());
    return res;
  });
  if (hit) {
    event.waitUntil(refresh().catch(() => {}));
    return request.headers.has('range') ? fromRange(request, hit) : hit;
  }
  // A range request with nothing cached goes to the network as asked; a whole-file request is kept.
  if (request.headers.has('range')) return fetch(request);
  return refresh();
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin || !url.pathname.startsWith(BASE)) return;
  const path = url.pathname.slice(BASE.length);
  if (request.mode === 'navigate') return event.respondWith(page(request));
  if (path === 'sw.js') return;
  if (SHELL.includes(path)) return event.respondWith(shellFile(request));
  if (isMedia(path)) return event.respondWith(media(event));
});
