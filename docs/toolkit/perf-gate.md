---
tool: `node scripts/perf/bench.js --scenes garage,floor,hq,music,floor-eras,floor-dotcom,floor-web2,hq-eras,hq-dotcom,hq-web2 --quality low,high --runs 1 --warmup 2 --seconds 1 --json <f>` then `budget.js <f> --counts-only`
section: perf
who: integrator (local CI)
covers: scripts/perf/bench.js
---
The PR gate: exact renderer counts on the GPU, about 75 s. It covers the era art scenes (floor and hq in the classic, dotcom, web2 and eras looks) against their ceilings in `scripts/perf/budget.json`.
