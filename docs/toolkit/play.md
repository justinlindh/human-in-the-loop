---
tool: `node blender/checks/play.mjs --snapshot <path> | --moment '<query>' [--focus ...] [--until '<js>'] [--out clip.mp4] [--log log.json]`
section: run
who: art, video, reviewer
covers: blender/checks/play.mjs blender/checks/loop-page.mjs
---
The snapshot player: plays a saved state forward through the game's real loop and writes a clip and a per-frame log, so a candidate moment can be judged, or rejected without looking, instead of hand-writing a loop. It loads the snapshot (a find.js snapshot path, or `--moment '<find query>'` for the state just before an indexed decision) through the title screen's Continue path and runs `main.js`'s own frame loop on virtual time (`loop-page.mjs`, the page `loop.mjs` uses), so decision freezes, spotlights and the full UI behave as for a player.

Each frame it answers decisions (`--choose 'event_id=1,other=0'`, else `--default-choice`, after `--decision-hold` seconds so the card shows), dismisses "Got it" cards, and follows `--focus`: `rack`, `hub` (the outage rack, else the first responder), a staff id (`s3` or `staff:s3`, followed), `item:<placed id or item id>`, `pos:x,z` or `js:<expr over S, R>` (a point or a staff id), at `--zoom`. It stops when `--until '<js over S>'` has held and `--tail` seconds have passed, or after `--weeks` weeks or `--max-seconds` of game time. Exit 0 when done (and `--until` held, if given), 1 when `--until` never held, 2 when it could not run.

`--out clip.mp4` records every `--every`-th frame (frames in `<out>-frames/`, 30 fps). `--log log.json` writes one row per frame: week, clock (frozen, spotlight, busy), the open decision and the answer given, the outage (kind, weeks, eta, responders), the camera zoom, the focus point on screen, the people on screen with their boxes (pixels, as `onscreen.mjs` reports them), and whatever `--log-js '<js over S, R>'` returns (an object merged into the row). Pair it with `scripts/events/find.js --where ...` (its snapshot path goes to `--snapshot`) to go from a state query to a clip in two commands. It takes the render lock for its GL mode (`--software` for SwiftShader); use `timeout` and `nice`.
