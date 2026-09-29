---
tool: `node scripts/studio/scene.mjs --compose <file.json> --from 0 --to 2 --every 0.2 [--facts intersections,...]` (the composed scene through the studio engine); `openScene({ compose })`; `node scripts/studio/compose.mjs <file.json>` prints what a file compiles to
section: render
who: art, tools
covers: scripts/studio/compose.mjs tests/tools/studio-compose.test.js
---
A compose file is a small JSON description of a scene (furniture at tiles, people, the office robot) that compiles to `{ state, script }`: a game state the scene engine loads as it loads a save or a mock, and a list of steps a game state cannot say (stand here facing there, play this gesture at t). No seeded game or save is needed. Every problem in a file is reported at once, each naming its entry, and the game's own placement rules apply (`placementCheck`, footprints, the era an item arrives in).

The file: `base` (the mock scenario the state starts from, which fixes the office stage and era; default `floor`, use `incident` or `hq` for the office robot), `items` (`item`, `at: [x, y]` tiles, `rot`, `level`, `id`), `people` (`id`, `build` 0 to 2, `look`, then either `seat` (a desk's id) or `at: [x, y]` with `face` (`north`, `east`, `south`, `west`, degrees, another person's id or `robot`), and `gesture` from `t` seconds) and `robot` (`at`, and a `cause`: spin, stuck, emptyDesk, cone, decaf or unplug, to leave it broken down that way). Tile axes: +x east, +y south.

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
