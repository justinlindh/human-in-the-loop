---
tool: `node blender/checks/walkers.mjs --cases 1:104,1:328,1:535,3:204 --seconds 30 --out shots/walkers`
section: render
who: art, reviewer
covers: blender/checks/walkers.mjs
---
Counts people intersecting chairs/desks, plants, coffee furniture, other furniture and each other in the actual game loop. The balanced bot builds each seeded save and continues playing after the tool loads it through Continue and dismisses the recap. The normal frame loop advances the clock, simulation, renderer and UI. Samples use the sweep's exact mesh tests and 2 cm tolerance every 0.2 seconds. Each count is one intersecting pair at one sample, with a walking subset and maximum depth; intended contact with the person's own seat or used item is excluded as in the sweep.

The report includes walking sample counts, starting and ending weeks, errors and paths at collisions. A missing walk or stopped clock fails the run. `--max N` also fails when the total overlap count exceeds N; `--max-furniture N` bounds world contacts while still reporting people against people. The first furniture collision in each case gets a scene dump for `dump-query.mjs path` and `nav`. `--record` saves every canvas frame of the first case as PNGs, for a before/after clip at 30 fps. Run the same cases, duration and tool on both revisions. This check supplements the broader sweep and staged-motion gates.
