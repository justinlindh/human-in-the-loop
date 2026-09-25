---
tool: `node scripts/perf/loop-report.js [--since 24h]`
section: timing
who: perf, integrator, team-lead
covers: scripts/perf/loop-report.js
---
Where the team's time goes: total, median and p90 per tool and CI step; time per worktree; lock waits per job, with timeouts; cache hit rates; repeated runs on identical inputs (the caching candidates); and the slowest runs. `--json` adds the numbers as JSON.
