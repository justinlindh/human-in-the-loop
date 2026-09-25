---
tool: `node scripts/perf/bench.js --software --cores 2 --quality low`
section: perf
who: art, reviewer
covers: scripts/perf/bench.js
---
The weak-device stand-in: SwiftShader with the browser pinned to two cores. GL follows `scripts/lib/gl.js` like every other tool, so without `--software` it runs on the GPU. It takes a GPU slot or the software lock one scene at a time, so run it under `timeout`, not under a lock.
