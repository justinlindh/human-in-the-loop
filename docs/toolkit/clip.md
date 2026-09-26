---
tool: `blender/checks/clip.mjs [--rig] [--only=<pattern>[,<pattern>]]`
section: render
covers: blender/checks/clip.mjs
---
Characters against real furniture: seated poses in every mood, perk poses, and named prop moments (`moment:*`) sampled along their whole path, and pair games (`pairs:floor`, `pairs:garage`): the start rules allow one by a new table, and two people sent there get to play. A failing moment case prints its worst actor as they stood at the worst sample (position, facing, path, goal, the temp and who set it) and their last ownership-trace lines. `--only` runs just the cases whose names contain a pattern (`--only=printer` runs `moment:printer` in about a quarter of the time) and exits 1 when none matches; a narrowed pass is never recorded as a full pass, so the full run stays the gate.

`moment:letter-claim` checks that a letter's named reader reaches the reading pose when the decision freeze catches them walking, in a standup, or celebrating.

`moment:letter-lifecycle` checks claim release on cancellation, Low-quality completion, and away transitions, plus the full tight-row fallback read, slump, and return under the decision freeze. Both letter fixtures arrange a reader per case and run with and without the rig.

`moment:printer` checks that an ambient carrier line is dropped during the carry and that a tagged printer line appears after the render dialogue queue releases it.
