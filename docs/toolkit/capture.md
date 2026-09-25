---
tool: `npm run capture -- --only <id> | --group <g>`
section: run
who: art, integrator
covers: scripts/capture.js scripts/capture-manifest.js
---
Deterministic, frame-exact clips and stills from `scripts/capture-manifest.js`, on the GPU. The README media comes from here. An item with `moment` (a find query) opens at that indexed moment, loaded through the game's save, and `index.json` records the seed, bot and week it used, plus any `window.__captureMarks` the page pushed. With `pre: true` it opens the save from just before the week that raises the decision, and the game's own tick raises it.
