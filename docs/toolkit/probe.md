---
tool: `R.probe(id)` (`src/render/probe.js`)
section: render
covers: src/render/probe.js
---
The staging probe (#350), in the page: how an actor reads on screen this frame (gaze, face to camera, visibility and the `occluder` hiding most of the rest, fades, hands, held prop, lean, smoke on the line of sight). `id` is a staff id or a moment's own actor (`'visitor:0'`); for a staged prop, by id or kind (`'stapler'`), it gives `visible` and `occluder`. `R.probeViews(id, [0, 1, 2, 3])` gives `{ view, visible, occluder, blocked }` for each camera turn (n presses of E), to pick the view a clip or still should use. Use them in `scene.mjs --report` or a check.
