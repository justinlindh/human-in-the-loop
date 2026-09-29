---
tool: `node blender/checks/pose.mjs --gesture <name> [--under <anim>] [--expect '<measure><op><value>@<share>'] [--root <checkout>] [--check-browser]`, or `--scene [--moment '<query>' | --mock m] [--who s3] [--frames a,b] [--serve]`
section: render
who: art
covers: blender/checks/pose.mjs blender/checks/pose-measure.js blender/checks/pose-scene.js blender/checks/pose-held.js blender/checks/pose-rules.js blender/checks/pose-landmarks.js blender/checks/pose-visibility.js blender/checks/pose-projection.js blender/checks/pose-cover.js blender/checks/pose-cover-controls.mjs blender/checks/draw-audit.js blender/checks/pose-nodraw.mjs
---
Standalone pose checks from geometry, with no rendering: `pose.mjs` plays a character through an animation (or a gesture over one) and measures each frame in well under a second, or stages a scene and measures who hides whom. Pick the task; each page is short and stands alone (files in `docs/toolkit/pose/`).

Tune a gesture:
- [gesture](pose/gesture.md): one gesture run, its measures (hand to face and eye distances, face angle) and `--expect` rules.
- [matrix](pose/matrix.md): `--matrix` over views, postures, builds, rig and side; `--param`, `--sweep`, `--crop`.
- [constants map](pose/constants-map.md): which constant moves which measure.

Check a staged scene (a bubble or emote over a face, a held prop):
- [scene](pose/scene.md): `--scene`, `--serve`, `--seed`, rules and their denominators.
- [held props](pose/scene-held.md): `heldGap`, `heldHeadDepth`, `heldTorsoDepth` and named eye targets.
- [scene sampling and performance](pose/scene-perf.md): the raycast trees, no-draw sampling, `--profile`.

Measures reference:
- [scene metrics](pose/measures-scene.md): `faceVisible`, `occluder`, `bodyVisible`, `faceCovered`, `facePx`, `faceCam`.
- [screen cover](pose/measures-cover.md): `cover<A><B>` (does the hand hide the eye from the camera).
- [projected scene JSON](pose/scene-json.md) and [its parts](pose/scene-json-parts.md): what `--json` carries per frame.

The pose lab (`lab.md`) runs the gesture and matrix pages in a browser with sliders on the constants; the robot slap (`--gesture slap`) is described there.
