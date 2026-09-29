---
tool: `node scripts/events/prewarm.js [--list] [--force] [--quiet]`
section: sim
who: integrator, video, art, sim
covers: scripts/events/prewarm.js scripts/events/prewarm.txt tests/tools/prewarm.test.js
---
Keeps the event index and the queries lanes reuse warm for the current sim code, so `find.js`, `scene.mjs --moment` and capture's `moment` items answer from cache instead of building or scanning while someone waits. It builds the index when this checkout's sim hash has none (niced), then runs each line of `scripts/events/prewarm.txt` (a `find.js` argument line; blank lines and `#` comments skipped) niced, which fills the per-sim-hash query cache. A stamp beside the index records the list that was answered for that hash, so a run with nothing changed reads the hash and returns without starting `find.js`. `--force` ignores the stamp, `--list` prints the queries. Exit 0: warm (a query with no match still counts as answered). Exit 1: the index is warm but a query could not be answered, named on stderr. Exit 2: the index could not be built. A second run for the same sim code while one is going exits 0 at once. Add a line to `prewarm.txt` when a lane reruns a query after sim merges, and hook the command after merges that touch the sim.

    node scripts/events/prewarm.js
    node scripts/events/prewarm.js --list
