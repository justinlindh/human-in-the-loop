---
tool: `npm run capture -- --only <id> | --group <g>`
section: run
who: art, integrator
covers: scripts/capture.js scripts/capture-manifest.js
---
Deterministic, frame-exact clips and stills from `scripts/capture-manifest.js`, on the GPU. The README media comes from here. An item with `moment` (a find query) opens at that indexed moment, loaded through the game's save, and `index.json` records the seed, bot and week it used, plus any `window.__captureMarks` the page pushed. With `pre: true` it opens the save from just before the week that raises the decision, and the game's own tick raises it. An item's own `size` and `fps` override the run's (a 3840x2160 still to crop tight beside 1920x1080 clips). An item's `camera`, a list of `{ at, target, zoom, ease }` keys in time order, moves the camera along that path in the render for push-ins and pans: a target is a point `[x, z]`, `{ prop }`, `{ staff }` or `{ js }`, found again every frame; `ease` is `inOut` (the default), `in`, `out` or `linear`; the first zoom is 1.5 when no key gives one, and keys out of order fail the item before it starts.

`PRE_UNTIL` accepts a `turn` expression to limit the bot's expansion while it searches for an event. Decisions still resolve each week. The trailer launch setup keeps only the hit's project so a later update cannot share its results card.
