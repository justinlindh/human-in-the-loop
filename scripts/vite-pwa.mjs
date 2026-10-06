// Vite plugin that makes the build installable and playable offline: a web app manifest, the tags that
// point at it, and a service worker (scripts/pwa/sw.template.js) with its precache list. Build only; the
// dev server serves no worker.
//   dist/manifest.webmanifest  name, icons, colours and standalone display, scoped to the build's base
//   dist/sw.js                 the worker, with this build's version and shell file list
//   dist/pwa-assets.json       { version, warm }: what the page fetches in idle time so a first visit works
//                              offline too (models, glyph icons, short UI sounds)
// The shell (precached on install) is the page, the bundles and styles, the fonts and the app icons; the
// large files (music, voice, models) are cached as they are used.
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { createHash } from 'node:crypto';

const THEME = '#efe6d6';
const NAME = 'Human in the Loop';

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
      const link = (attrs) => ({ tag: 'link', attrs, injectTo: 'head' });
      const meta = (name, content) => ({ tag: 'meta', attrs: { name, content }, injectTo: 'head' });
      return [
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
      const files = walk(outDir, outDir);
      const shell = files.filter((f) => f === 'index.html' || f.startsWith('assets/') || f.startsWith('fonts/') || f.startsWith('pwa/'));
      // In the order the game needs them: models first, then the short sounds, then the icons.
      const rank = (f) => (f.startsWith('models/') ? 0 : f.startsWith('audio/') ? 1 : 2);
      const warm = files.filter((f) => f.startsWith('models/') || f.startsWith('icons/') || /^audio\/(ui|sfx|stingers)\//.test(f))
        .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : 1));
      // The build's own version when the release sets one; otherwise a hash of the shell, so two different
      // builds never share a cache name.
      const hash = createHash('sha1');
      for (const f of shell) hash.update(`${f}:${statSync(join(outDir, f)).size}\n`);
      const id = `${version}-${hash.digest('hex').slice(0, 8)}`;
      const template = readFileSync(join(root, 'scripts/pwa/sw.template.js'), 'utf8');
      writeFileSync(join(outDir, 'sw.js'), template
        .replace('__VERSION__', () => id)
        .replace('__SHELL__', () => JSON.stringify(shell))
        .replace('__BASE__', () => base));
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
      writeFileSync(join(outDir, 'pwa-assets.json'), `${JSON.stringify({ version: id, warm })}\n`);
    },
  };
}
