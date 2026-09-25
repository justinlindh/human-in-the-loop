---
tool: `node scripts/reels/camstats.mjs <capture dir> <item id> [from] [to]`
section: run
who: video, integrator
covers: scripts/reels/camstats.mjs
---
Camera motion in a captured clip, from the per-frame camera log a capture item pushed as a `camlog` mark: frames, the largest per-frame step of the look point, the largest change between steps (jerk), and the largest per-frame zoom change, over a time window. Use it to show a camera move is smooth.
