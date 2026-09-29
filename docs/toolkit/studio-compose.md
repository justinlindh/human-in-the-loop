---
tool: `node scripts/studio/compose.mjs <file.json>` (prints what a compose file compiles to); `compose(file)` in `scripts/studio/compose.mjs` for the scene engine's `--compose`
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
    { "id": "fixer", "build": 1, "at": [5.5, 4.5], "face": "robot", "gesture": "slap", "t": 0.4 }
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

Both files are in `scripts/studio/examples/`. The steps are applied by the engine's runtime after each step, through the game's own character and robot calls.
