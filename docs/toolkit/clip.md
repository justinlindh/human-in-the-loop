---
tool: `blender/checks/clip.mjs [--rig] [--only=<pattern>[,<pattern>]]`
section: render
covers: blender/checks/clip.mjs, blender/checks/clip-exact.js
---
**Overlap measure.** Every overlap share is the larger of two: the share of sampled vertices inside the furniture, and the exact share of a body part's triangles that cross a furniture surface (`clip-exact.js`, three-mesh-bvh, worst part). The vertex count alone misses a thin slab, such as a head through a desk top, because no vertex lands inside it. `control:head-through-slab` plants a 4 mm slab through a head and requires the vertex share to read 0 and the exact share to flag it.

Characters against real furniture: seated poses in every mood, perk poses, and named prop moments (`moment:*`) sampled along their whole path, and pair games (`pairs:floor`, `pairs:garage`): the start rules allow one by a new table, and two people sent there get to play. A failing moment case prints its worst actor as they stood at the worst sample (position, facing, path, goal, the temp and who set it) and their last ownership-trace lines. `--only` runs just the cases whose names contain a pattern (`--only=printer` runs `moment:printer` in about a quarter of the time) and exits 1 when none matches; a narrowed pass is never recorded as a full pass, so the full run stays the gate.

`prop:pivotBoard` checks that a front-edge board sends the writing to a framed back-wall board, a board facing open room keeps it, and the shared picker records the face rejections and selection.

`moment:letter-claim` checks that a letter's named reader reaches the reading pose when the decision freeze catches them walking, in a standup, or celebrating.

`moment:letter-lifecycle` checks claim release on cancellation, Low-quality completion, and away transitions, plus the full tight-row fallback read, slump, and return under the decision freeze. Both letter fixtures arrange a reader per case and run with and without the rig.

`moment:growth` checks the honoree and nearby coworkers through the walk and cheer; `moment:company_party` checks the whole company cheer. Both require actors to finish and stay clear of furniture.

`moment:pet:` samples dog and cat clearance on every frame through approach, turning, head scratching and resumed movement. It includes incoming yaw 2.104, a full circle at 15-degree intervals, near contact, approaching walkers and opposing pet headings. Each case requires a complete scratch and actual resumed travel. Removal of either actor, absence, priority interruption, decisions and Low-quality release are checked in each greeting phase. Collision limits and furniture checks also apply to the first frame. `setupPetPasser(R, S, species, yaw, distance, petYaw)` places an idle pet beside a walker without forcing the greeting; its optional headings are fixture inputs.

`moment:printer` checks that an ambient carrier line is dropped during the carry and that a tagged printer line appears after the render dialogue queue releases it.
