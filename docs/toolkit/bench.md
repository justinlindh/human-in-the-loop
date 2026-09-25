---
tool: `node scripts/perf/bench.js --refs origin/main,<branch>`
section: perf
who: art, ui, reviewer
covers: scripts/perf/bench.js
---
Builds each ref and measures the scenes garage, floor, hq, music (a staged music night) and late (a bot-played save at week 400) at Low and High. It prints one line per build and scene: frame time p50 and p95, main-thread and render time with the GPU wait included, the fastest run, draw calls, triangles, meshes, geometries, textures, programs, JS heap, DOM nodes and DOM mutations per second. Builds alternate run by run, so compare builds from one invocation, never across invocations. Main flags: `--scenes`, `--quality low,high`, `--runs` (default 3), `--size` (default 1280x720), `--json <file>`, `--profile` (top main-thread functions per scene, on an unminified build).
