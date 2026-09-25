---
tool: `node scripts/perf/budget.js <result.json> [--counts-only]`
section: perf
who: reviewer, integrator
covers: scripts/perf/budget.js
---
Checks a bench result against `scripts/perf/budget.json`. Each scene's draw calls, triangles, programs and textures must stay under their ceilings (the baseline plus 20%, and at least 4 more programs and textures). With two builds in the result, the head's Low render time in garage and floor may be at most 1.4x the base's. `--counts-only` skips the timing check. Exits 1 on a breach, or when the result holds no budgeted scene.
