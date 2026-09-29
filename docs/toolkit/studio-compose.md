---
tool: `node scripts/studio/compare-sweep.mjs --compose <file.json> [--frame 30] [--detail]` (the sweep's collision rows against the engine's on a composed scene, or `--grid coffee_corner,desk,plant,whiteboard` over about 20 positions round each item); `node scripts/studio/scene.mjs --compose <file.json> --from 0 --to 2 --every 0.2 [--facts intersections,...]` (the composed scene through the studio engine); `openScene({ compose })`; `node scripts/studio/compose.mjs <file.json>` prints what a file compiles to
section: render
who: art, tools
covers: scripts/studio/compose.mjs scripts/studio/compare-sweep.mjs tests/tools/studio-compose.test.js
---
A compose file is a small JSON description of a scene (furniture at tiles, people, the office robot) that compiles to `{ state, script }`: a game state the scene engine loads as it loads a save or a mock, and a list of steps a game state cannot say (stand here facing there, play this gesture at t). No seeded game or save is needed. Every problem in a file is reported at once, each naming its entry, and the game's own placement rules apply (`placementCheck`, footprints, the era an item arrives in).

The file: `base` (the mock scenario the state starts from, which fixes the office stage and era; default `floor`, use `incident` or `hq` for the office robot), `items` (`item`, `at: [x, y]` tiles, `rot`, `level`, `id`), `people` (`id`, `build` 0 to 2, `look`, then either `seat` (a desk's id) or `at: [x, y]` with `face` (`north`, `east`, `south`, `west`, degrees, another person's id or `robot`), and `gesture` from `t` seconds) `era` (the era the state is in; the office robot needs `agents`), `keep` (`["office", "staff"]` keeps the base's furniture and people, and items and people add to them), `moments` (`{ "moment": "slap", "fixer": "nearest" }`, see below) and `robot` (`at`, `level`, and a `cause`: spin, stuck, emptyDesk, cone, decaf or unplug, to leave it broken down that way). Tile axes: +x east, +y south.

The slap: a fixer beside a robot that has been unplugged.

```json
{ "base": "incident",
  "items": [
    { "item": "desk", "at": [6, 6], "id": "d1" }
  ],
  "robot": { "at": [4, 4], "cause": "unplug" },
  "people": [
    { "id": "fixer", "build": 1, "at": [5.0, 4.6], "face": "robot", "gesture": "slap", "t": 0.4 }
  ] }
```

The slap as the game stages it: the game's own fix event runs at frame 0, so the game picks the spot, walks the fixer there and slaps, and the composed scene only sets it up (`scripts/studio/examples/slap-moment.json`, the floor mock with the robot as `stage.mjs` places it).

```json
{ "base": "floor", "era": "agents",
  "keep": ["office", "staff"],
  "robot": { "at": [13, 0], "level": 2, "cause": "spin" },
  "moments": [
    { "moment": "slap" }
  ] }
```

Its fixer's right hand reaches within 0.0086 m of the robot head box (the hand point in `person.hands[1]` against the union of the `robot_head` part bounds), which is the `robotContact` `stage.mjs` reads (about 0.008 m) against its 0.06 m rule; the hand-placed slap above is a set-up for looking at the geometry, not a reproduction of the game's slap. `person.hands` carries the two hand points the staging probe uses.

A music night: `{ "moment": "music_night", "genre": "corporate_synthwave", "organiser": "s1", "dancers": ["s2", "s3", "s4"] }` (every key but `moment` optional; `scripts/studio/examples/music-night.json`) raises the incentive event the game raises for one at frame 0, as `checks.js` `setupRobotParty` does: the robot leaves its dock to DJ and the dancers dance. Defaults are the first free person as organiser and the next three as dancers, so the file names people only when a case needs particular ones; it needs a robot (the dock) and refuses a `fixer`.

A seated facepalm beside a monitoring wall:

```json
{ "base": "incident",
  "items": [
    { "item": "desk", "at": [6, 6], "id": "d1" },
    { "item": "monitoring_wall", "at": [6, 3], "id": "w1" }
  ],
  "people": [
    { "id": "ada", "build": 1, "seat": "d1", "gesture": "facepalmsit", "t": 0.5 }
  ] }
```

Both files are in `scripts/studio/examples/`. `scene.mjs --compose` (or `openScene({ compose })`) loads the compiled state into the engine, so `query`, `verify` and the facts run on it unchanged. The runtime then stands each `at` person with the game's own `standAt` hold (teleported, held for the scene), leaves a broken robot in its cause's plan with the game's `robot.force`, lets the scene settle a moment, and plays each `gesture` through the character's own `gesture()`, so a sample at the gesture's frame already shows it. Frames count from the settled scene: frame 0 is when the composed scene starts. A person `at` a spot faces their `face` (`robot` aims at where the robot actually rests after its plan, not at its tile); how close the robot's own tile lets them stand is the compose file's business (the game's own slap stands the fixer about half a metre from the robot).

A perk visit and a timed hold (`scripts/studio/examples/coffee-visit.json`): a person's `use` (`{ "item": "cc", "slot": 0, "dur": 3 }`, the item being a placed item's id) sends them to that item at `t` seconds through the game's own `R.perks.send`, with the item's slot and the visit's length; with any `use` in the file the perk system is held so nobody else wanders in. A person placed with `at` and `until` (seconds) stands there until then and is then released with the game's own `catchFor(id, null, { walk: true })`, so they walk back to their goal or the visit they were sent on. With `use`, `seat` and `at` are optional (`at` is where they stand until sent). A spot in metres is a tile position with fractions (a tile is one metre); the world point is `x = -W/2 + a`, `z = -D/2 + b`. To stand on an item's step-in or step-out point without computing it, `"at": { "stepOut": { "item": "cc", "slot": 0 } }` (with `face` as a compass direction or degrees) asks the game for that point when the scene starts (`R.perks.stepOut`, which includes its nearer-in fallback when something stands beside the item), so the file follows the game's step-in distance. It fails with a message when the item has no step-in, the slot is out of range or the front is blocked. The coffee wait (`scripts/studio/examples/coffee-wait.json`): a visitor walks up to slot 0 of a coffee corner while a second person stands on that slot's step-out point until 6.5 s. The visitor stops short and waits, then gives up the visit and walks off clear of them. `scene.mjs --facts intersections` shows no contact between the two over the whole run (the test reads it from the run, and accepts either a sip or a give-up).

Does the engine give the scene sweep's collision rows? `node scripts/studio/compare-sweep.mjs --compose scripts/studio/examples/overlap.json` loads a composed scene (a person standing with `"free": true` where their body overlaps a coffee corner), then computes people-against-furniture rows twice on the same frame: with the sweep's own check (`blender/checks/intersect.js`: `bodies`, `people`, `crossOverlaps`, the sweep's 2 cm tolerance for people) and from the engine's `depthM` intersections. A row matches when the same person part and item overlap by depths within `--tolerance` (default 5 mm); it exits 1 when a sweep row has no engine row or the reverse. On the example both rows (torso 0.2546 m, head 0.2225 m) match exactly. `--grid coffee_corner,desk,plant,whiteboard [--positions 20]` runs the comparison with a person at a lattice of positions round and inside each item's footprint, one pair being a head or torso and one item part (its material name, as the sweep names it), and exits 1 when the sweep finds a pair the engine misses or a shared pair's depths differ; engine-only pairs are reported, not failed. The sweep's own-furniture rule (a person's seat and the item they use are skipped) is a rule on top of the metric and is not applied here, so a person's own desk is compared like any other.
