---
tool: `node blender/checks/mocap.mjs --clip a.json[,b.json] [--mock floor | --seed N [--week W]] [--anchor x,z,yaw] [--camera cx,cy,cz,tx,ty,tz[,fov]] [--frames all|a-b|n,n] [--who s1,s2] [--expect '<measure><op><value>@<share>'] [--no-ik] [--rows] [--json out.json]`
section: render
who: art, tools, tools2, reviewer
covers: blender/checks/mocap.mjs blender/checks/mocap-page.js tests/tools/mocap-check.test.js
---
Geometry checks on a played motion clip (#1397, #1404), on the studio engine with nothing drawn, so a baked clip (`mocap-bake`) gets verified like the rest of the game. It plays each clip through the game's own `R.playMocap` (contact IK on) on the first staff members, one per clip (or `--who`), with the clock driven frame by frame, and measures each person at each clip frame:
- `contactMiss`: the furthest distance, over the contacts held at that frame, from the contact limb's end (a foot's sole point, a hand's lowest point) to the contact's point, in metres (chibi scale). Only frames inside a contact span count.
- `selfDepth`: how deep one body part sits in another of the same body (arm, leg, torso, head) beyond what the rest pose already overlaps, so a limb through the body or head shows and the chibi's normal contacts do not.
- `pairDepth`: how deep this body sits in another clip person's body.
- `onScreen`: the share of the body's projected box inside the 1280x800 viewport, for `--camera` (position, target, optional fov) or the scene's own camera; `heightPx`: the box's height in pixels.

A clip with an `origin` (see `mocap-bake`) stands where its shot puts it: the anchor (`--anchor x,z,yaw`, default where the first person stands, facing +z) turned by its yaw plus `origin.pos`, facing `anchor.yaw + origin.yaw`; clips without one are spread 1.2 m apart. One clip per person; frames past a clip's end are skipped.

Rules read like `pose.mjs --scene`: `--expect 'selfDepth<=0.03@1'` passes when at least that share of the frames that have the measure meet it (`@share` defaults to 1), per person; repeat the flag for several rules. A stage spec can carry the same lines. Without `--expect`: `contactMiss<=0.06@0.9`, `selfDepth<=0.03@1`, `pairDepth<=0.03@1`, `onScreen>=0.9@0.9` (a rule whose measure no frame has is skipped, unless named with `--expect`, which fails it). The thresholds are starting points for art to tune. Output: one `MOCAP <id> ...` summary line per person, `MOCAP ok|FAIL <id> <rule>` per rule with the share and the worst value, `--rows` one `MOCAPROW` line per person and frame, `--json` the rows. Exit 0 when every rule passes, 1 when one fails, 2 on bad input.

Not covered: the furniture and scenery around the anchor (place the anchor in clear floor), the timeline of several shots (`playShot`), and anything about how the clip looks. Tests use synthetic clips, never the reference footage.
