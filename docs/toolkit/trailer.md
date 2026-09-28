---
tool: `npm run trailer`
section: run
who: integrator, audio
covers: scripts/trailer/build.js scripts/trailer/assertions.js scripts/trailer/reuse.js
---
Builds the trailer from captures, cards and the game's music. See `docs/trailer/README.md`.

Deferred scenes remain capturable through `DEFERRED_CAPTURES` in the config and are excluded from the cut.

The launch capture selects a seed that reaches a first-version hit on the Office Floor. Both Yak shots use seed 2 with the balanced bot and validate the pre-outage setup. The reaction capture records per-frame camera telemetry for `scripts/reels/camstats.mjs`.

Every clip checks its live subject at the beat’s `from` time and saves a cut-frame still and a `beat-check` mark. An ended game or missing subject fails capture. Build and hire also check that the action completes. Era cuts start after the live era tick; the Plateau shot uses seed 9 with no hiring after Consolidation, so attrition leaves most desks empty.

`--reuse-from <clips>` imports explicitly selected prior footage only when its capture specification matches and its cut subject assertions passed. Imported clips retain their source build and SHA256 in the capture index. Both Yak shots require fresh capture. Yak assertions identify the clicked post and require its decoded picture and replies to fit inside the frame.
