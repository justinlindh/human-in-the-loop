---
tool: `node blender/checks/scene.mjs --out <png|mp4> ...`
section: run
who: art, reviewer
covers: blender/checks/scene.mjs
---
One scene with one state change, as stills or a clip, from a mock or a seeded week, with `--patch` or `--patch-js` to set it up. The quickest way to show a specific moment.

The harness holds `performance.now()` still between frames. A busy-wait on it inside `--patch-js` never ends. To test code that reads the wall clock, shift it instead: `const f = performance.now.bind(performance); let off = 0; performance.now = () => f() + off;`, then `off += 2000` between the steps. `R` in `--patch-js` is the page's renderer; `--report` doesn't see it, so store what you need on `window` first (`window.__R = R`).
