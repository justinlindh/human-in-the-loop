---
tool: `node scripts/events/build.js` and `node scripts/events/find.js <event> [--choice N --stage floor --bot b --era e --weeks a-b --snapshot]`
section: sim
who: all
covers: scripts/events/build.js scripts/events/find.js
---
The seeded event index: bots play seeds 1 to 20 (balanced, sensible, allHumans) in the pure sim in about 25 s, and every decision (with the choice made), era change, office move, incident, launch and so on is indexed by seed, bot, week, era and stage, with a save-state snapshot just before staged decisions, era changes and office moves. `find.js` prints where an event happens and its snapshot. It exits 0 with matches, 1 with none (`--json` prints `[]`), and 2 when it can't answer; with `--json` a refusal prints `{ "error", "kind" }`, where kind is `stale-index` (indexes exist, none for this sim code), `no-index`, `build-failed`, `bad-index` or `no-query`, so a caller never mistakes a stale index for "no such moment". Tools stage straight to it: `scene.mjs` and `dump.mjs` take `--moment '<query>'` or `--snapshot <path>`, and `sweep.mjs` takes `--moments 'q1; q2'`. The index lives in `~/.cache/hitl-ci/events/`, keyed by a hash of the sim, data, save and build code; a tool asked for a moment builds it when the code has changed. Use it instead of playing and scanning seeds by hand.
