---
tool: `scripts/vite-pwa.mjs`, `scripts/pwa/sw.template.js`, `src/dev/pwa.js`, `npm run pwa-check`, `scripts/pwa-icons.sh`
section: build
who: integrator, ui, anyone who adds large assets
covers: scripts/vite-pwa.mjs scripts/pwa/sw.template.js scripts/pwa-check.js scripts/pwa-plugin.test.sh scripts/pwa-icons.sh src/dev/pwa.js
---
Makes the public build installable and playable offline. `vite build` runs the `pwa` plugin, which adds the manifest and icon tags to `index.html` and writes three files beside it: `manifest.webmanifest` (standalone, scoped to the build's base), `sw.js` (the service worker, filled in with this build's version and file list from `scripts/pwa/sw.template.js`) and `pwa-assets.json` (the warm list). The dev server serves no worker.

What gets cached, and when:
- **Shell**, precached when the worker installs (about 2.8 MB: the page, bundles, styles, fonts, app icons), in a cache named for the build. Pages are fetched network first (a 4 s wait) and fall back to the cached page offline, so an online player always gets the newest build.
- **Media** (`audio/`, `models/`, `icons/`, `memes/`): cached when first used, in one cache that survives releases; served from it while a fresh copy is revalidated (a conditional request, so an unchanged file costs no download). A range request (an audio element seeking) is answered from a cached whole file. Music and voice not yet played are simply missing offline and the game synthesizes sounds.
- **Warm list**: on a first visit, `src/dev/pwa.js` fetches the models, the icons and the short sounds (ui, sfx, stingers; about 10 MB) a few at a time in idle time, skipping what is cached and everything when the browser asks to save data. Music and voice (70+ MB) are never warmed. `window.__HITL_PWA_WARM` shows its progress.

Updates: a new worker installs beside the running one and waits. `src/dev/pwa.js` tells it to take over when the page goes to the background, or on a fresh load that has shown nothing yet, and reloads the page once onto the new build; a game in progress is never reloaded under the player. The old build's shell cache is deleted when the new worker activates. The page checks for a new worker at load and at most hourly when it returns to the foreground.

`npm run pwa-check` builds two versions into the cache directory and drives a phone-sized Chrome (GPU slot): Chrome's installability errors (none), the worker takes control, the shell and warm cache fill, the game boots and runs weeks of game time with the network off, a new build waits and takes over when the page is hidden (shell cache replaced, media cache kept), and no console errors. Screenshots go to `--out` (default `shots/pwa`). `scripts/pwa-plugin.test.sh` builds with two bases and checks the generated files.

`scripts/pwa-icons.sh` rebuilds `public/pwa/` (192, 512, maskable 512 and the iOS touch icon) from `docs/readme/logo-square.png`.

A new top-level folder under `public/` that must work offline goes in the media pattern in `sw.template.js` (`isMedia`) and the warm filter in `vite-pwa.mjs`.
