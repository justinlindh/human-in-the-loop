---
tool: `npm run trailer`
section: run
who: integrator, audio
covers: scripts/trailer/build.js
---
Builds the trailer from captures, cards and the game's music. See `docs/trailer/README.md`.

Deferred scenes remain capturable through `DEFERRED_CAPTURES` in the config and are excluded from the cut.

The launch capture selects a seed that reaches a first-version hit on the Office Floor. Both Yak shots use seed 2 with the balanced bot and validate the pre-outage setup. The reaction capture records per-frame camera telemetry for `scripts/reels/camstats.mjs`.
