// Vite plugin that makes the build installable and playable offline: a web app manifest, the tags that
// point at it, a service worker (scripts/pwa/sw.template.js) and the list of files that make up this
// build. Build only; the dev server serves no worker.
//   dist/manifest.webmanifest  name, icons, colours and standalone display, scoped to the build's base
//   dist/sw.js                 the worker, with this build's id
//   dist/pwa-assets.json       { id, version, bytes, files: [{ p, s, h }] }: every file of the build with its size
//                              and content hash, which the page downloads into the offline set (src/dev/pwa.js)
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

const THEME = '#efe6d6';
const NAME = 'Human in the Loop';
// Files that are not part of the offline set: the worker and the list itself, and notes.
const SKIP = /^(sw\.js|pwa-assets\.json)$|\.md$/;

function walk(dir, root, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, root, out);
    else out.push(relative(root, p).split(sep).join('/'));
  }
  return out;
}

export function pwa({ version = 'dev' } = {}) {
  let base = '/';
  let outDir = 'dist';
  let root = process.cwd();
  return {
    name: 'hitl-pwa',
    apply: 'build',
    configResolved(config) {
      base = config.base.endsWith('/') ? config.base : `${config.base}/`;
      outDir = resolve(config.root, config.build.outDir);
      root = config.root;
    },
    transformIndexHtml() {
      const watchdog = readFileSync(join(root, 'scripts/pwa/boot-watchdog.js'), 'utf8').replace(/^\/\/.*\n/gm, '');
      const link = (attrs) => ({ tag: 'link', attrs, injectTo: 'head' });
      const meta = (name, content) => ({ tag: 'meta', attrs: { name, content }, injectTo: 'head' });
      return [
        { tag: 'script', children: watchdog, injectTo: 'head-prepend' },
        link({ rel: 'manifest', href: `${base}manifest.webmanifest` }),
        link({ rel: 'apple-touch-icon', href: `${base}pwa/apple-touch-icon.png` }),
        meta('theme-color', THEME),
        meta('apple-mobile-web-app-capable', 'yes'),
        meta('mobile-web-app-capable', 'yes'),
        meta('apple-mobile-web-app-title', NAME),
        meta('apple-mobile-web-app-status-bar-style', 'default'),
      ];
    },
    closeBundle() {
      writeFileSync(join(outDir, 'manifest.webmanifest'), `${JSON.stringify({
        id: base,
        name: NAME,
        short_name: NAME,
        description: 'A management sim about an AI-era company.',
        start_url: base,
        scope: base,
        display: 'standalone',
        orientation: 'any',
        background_color: THEME,
        theme_color: THEME,
        categories: ['games'],
        lang: 'en',
        icons: [
          { src: `${base}pwa/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}pwa/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: `${base}pwa/icon-maskable-512.png`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      }, null, 2)}\n`);
      // Every file with its size and a hash of its content: an update downloads only the files whose hash
      // changed and copies the rest from the build it replaces.
      const files = walk(outDir, outDir).filter((f) => !SKIP.test(f)).map((p) => {
        const bytes = readFileSync(join(outDir, p));
        return { p, s: bytes.length, h: createHash('sha1').update(bytes).digest('hex').slice(0, 16) };
      });
      // The build's own version when the release sets one, plus a hash of its files, so two different
      // builds never share an id (and so never share a set).
      const hash = createHash('sha1');
      for (const f of files) hash.update(`${f.p}:${f.h}\n`);
      const id = `${version}-${hash.digest('hex').slice(0, 8)}`;
      const template = readFileSync(join(root, 'scripts/pwa/sw.template.js'), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), template
        .replace('__VERSION__', () => id)
        .replace('__BASE__', () => base));
      writeFileSync(join(outDir, 'pwa-assets.json'), `${JSON.stringify({ id, version, bytes: files.reduce((n, f) => n + f.s, 0), files })}\n`);
    },
  };
}
