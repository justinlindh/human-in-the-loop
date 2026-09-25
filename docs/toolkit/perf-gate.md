---
tool: `node scripts/perf/bench.js --scenes garage,floor,hq,music --quality low,high --runs 1 --warmup 2 --seconds 1 --json <f>` then `budget.js <f> --counts-only`
section: perf
who: integrator (local CI)
covers: scripts/perf/bench.js
---
The PR gate: exact renderer counts on the GPU, about 40 s.
