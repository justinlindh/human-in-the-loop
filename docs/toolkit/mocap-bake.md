---
tool: `node scripts/tools/mocap/bake.mjs --shot <shot-n.json> --out <clip.json|dir> [--person <id>] [--name <name>] [--from <frame>] [--to <frame>] [--shot-index <n>]`
section: models
who: tools, tools2, art (plays the clips), anyone baking motion
covers: scripts/tools/mocap/bake.mjs scripts/tools/mocap/bake-lib.mjs tests/tools/mocap-bake.test.js
---
The bake stage of the motion pipeline (#1404): one person of a tracked shot (`mocap-track` output) in, one named clip for the chibi rig out. Without `--person` every person is baked, one file each, into the `--out` directory; `--out` ending in `.json` takes one person. `--from` and `--to` cut a range of the shot's frames (source rate). It reads the rig's pivot heights from `public/models/chibi_rig.glb` and takes the bone list from the same names as `src/render/rig.js`; nothing else from the game.

Clip, schema `hitl-mocap-clip` version 1, JSON:
- `name`, `fps` (30, resampled from the shot with slerp), `frames`, `bones` (`body, hips, legL, legR, torso, head, armL, armR`), `scale` (the chibi's leg length over the source person's: multiply source metres by it), `source: { shot, trackId, start, end }` (frames of the video; no paths).
- `tracks[bone].quat`: per frame `[x, y, z, w]`, the change from rest in the parent's frame, as `rig.js` convert() builds it. `tracks.body.pos`: metres at chibi scale, y up, relative to frame 0.
- Space: origin on the floor under the hips at frame 0 (floor is the 2nd percentile of the toe height), +y up, +z the way the hips face at frame 0, +x to the left of a body facing +z. The rig's `L` limb is at -x, so it is the person's anatomical right limb. The body bone carries the heading (yaw of the hips); hips, torso and head carry the rest.
- Limbs are single segments: a leg is the hip-to-ankle direction, an arm shoulder-to-wrist (the swing from hanging straight down, no twist). `bend` per limb (`legL, legR, armL, armR`, 0..1) keeps the knee or elbow flexion (150 degrees reads as 1).
- `look`: per frame a point 1.5 chibi metres ahead of the head, along the head's facing, in clip space.
- `conf`: per bone and frame, 0..1, the lowest 2D trust over the joints that define the bone, 0 on frames the detector did not see the person.
- `contacts`: `[{ limb: footL|footR|handL|handR, from, to, point }]`, `[from, to)` in clip frames, `point` in clip space (the ankle or wrist at chibi scale, averaged over the span). A foot is planted when its toe is within 6 cm of the floor and the ankle moves under 0.5 m/s for 3 frames or more; a hand holds when it moves under 0.2 m/s for 0.3 s with the arm at least 40 degrees off hanging. Both are heuristics from joint motion alone (no scene), so a hand at rest in the air counts as a hold.

Not covered: twist of a limb, fingers, face, and the scene the contacts touch. Tests use a synthetic skeleton, never the reference footage.
