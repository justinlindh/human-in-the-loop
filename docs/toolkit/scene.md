---
tool: `node blender/checks/scene.mjs --out <png|mp4> ...`
section: run
who: art, reviewer
covers: blender/checks/scene.mjs
---
One scene with one state change, as stills or a clip, from a mock or a seeded week, with `--patch` or `--patch-js` to set it up. The quickest way to show a specific moment.

`--patch-js` is the body of an async function with `S` and `R`: it can `await import('/src/render/checks.js')` (a setup helper), and the still, `--focus-on`, `--crop-around` and `--report` wait for it to finish; `window.__advance(n)` steps the world without drawing, as the setup helpers expect.

The harness holds `performance.now()` still between frames. A busy-wait on it inside `--patch-js` never ends. To test code that reads the wall clock, shift it instead: `const f = performance.now.bind(performance); let off = 0; performance.now = () => f() + off;`, then `off += 2000` between the steps. `R` in `--patch-js` is the page's renderer; `--report` doesn't see it, so store what you need on `window` first (`window.__R = R`).
