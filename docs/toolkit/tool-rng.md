---
tool: `node blender/checks/tool-rng.mjs`
section: render
who: tools, perf, art
covers: blender/checks/tool-rng.mjs blender/checks/tool-preload.js
---
Checks that a check can't change what it measures by how or when it loads.
- Importing each page-side tool module in `blender/checks/` must take nothing from the game's `Math.random` stream. A module that builds three.js objects when it loads takes one UUID each, which shifts everything the seeded game does afterwards.
- A scene played after a second of idle page time must match one played at once.

The harness loads the known offenders (three-mesh-bvh, under each specifier the tools import it by) on the tool stream when a page opens, from `blender/checks/tool-preload.js`. A new dependency that fails here goes in that file. Local CI runs it (`tool-rng`) for changes to the renderer, the harness, the page-side tool modules or the lockfile. It takes a few seconds.
