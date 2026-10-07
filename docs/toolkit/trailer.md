---
tool: `npm run trailer`
section: run
who: integrator, audio
covers: scripts/trailer/build.js scripts/trailer/assertions.js scripts/trailer/reuse.js scripts/trailer/pin.mjs scripts/trailer/pins.js scripts/trailer/pin-manifest.js
---
Builds the trailer from captures, cards and the game's music. See `docs/trailer/README.md`.

`--trailer <name>` picks which trailer to build: `main` (the default, `scripts/trailer/config.js` and `manifest.js`, output `shots/trailer`) or `era` (`scripts/reels/era-trailer/config.js` and `manifest.js`, output `shots/era-trailer`). An unknown name, or a trailer whose two files are missing, exits 1 before anything runs. `--out` still overrides the output directory. The `vo/` tools (`table.mjs`, `screen.py`) read the main config only.

Deferred scenes remain capturable through `DEFERRED_CAPTURES` in the config and are excluded from the cut.

The launch capture opens on a pin of a seeded game one week before a first-version hit on the Office Floor. Both Yak shots use seed 2 with the balanced bot and validate the pre-outage setup. The reaction capture records per-frame camera telemetry for `scripts/reels/camstats.mjs`.

Every clip checks its live subject at the beat’s `from` time and saves a cut-frame still and a `beat-check` mark. An ended game or missing subject fails capture. Build and hire also check that the action completes. The ChatGBT era cut starts after the live era tick; the Plateau shot uses seed 9 with no hiring after Consolidation, so attrition leaves most desks empty.

`--reuse-from <clips>` imports explicitly selected prior footage only when its capture specification matches and its cut subject assertions passed. Imported clips retain their source build and SHA256 in the capture index. Both Yak shots require fresh capture. Yak assertions identify the clicked post and require its decoded picture and replies to fit inside the frame.

`node scripts/trailer/pin.mjs [--trailer main|era] [name ...]` writes the pinned game states the outage, meme, garage, launch, printer, cloud and plateau beats open on (the era segment's five pins live with `--trailer era`) (`scripts/trailer/snapshots/*.snap`, gzipped saves, with `pins.json` naming each source seed and week). The beats load a pin through the game's own save in place of replaying a bot game, so a sim change that moves a bot's game no longer moves the beat. A pin is the state just before the week that raises the subject; the game's tick then raises it live. After a sim change, re-run `pin.mjs` and rebuild. The printer pin is copied from the event index (`scripts/events/find.js`), so it needs an index for the current sim code.

A trailer with its own pins (`--trailer era`) keeps them in the `PIN_DIR` its config exports (for the era trailer, `scripts/reels/era-trailer/snapshots`), reads its `PIN_SOURCES` from `scripts/reels/era-trailer/config.js`, and captures through the `pin-manifest.js` beside that config, which is `export const ITEMS = pinItems(PIN_SOURCES)` using `pinItems` from `scripts/trailer/pin-manifest.js`. Its beats load a pin with `LOAD_PIN(name, PIN_DIR)`. An unknown trailer, a missing config, a config with no `PIN_SOURCES`, a config that exports no `PIN_DIR` of its own (or the main trailer's), or a missing `pin-manifest.js` when a pin needs a replay exits 1, so another trailer can never overwrite the main trailer's pins.
