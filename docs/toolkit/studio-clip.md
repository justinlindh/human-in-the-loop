---
tool: `node scripts/studio/clip.mjs [--group seats,perks,...] [--jobs N]` (the clip check's floor-office groups on the studio engine, no browser)
section: render
who: art, tools, reviewer
covers: scripts/studio/clip.mjs tests/tools/studio-clip.test.js
---
The same page function `blender/checks/clip.mjs` runs in the browser, hosted on a Node scene from the studio engine: no Vite server, browser, GPU or render slot. Each group (`seats perks dance walk pets robot props pairs use party`; default all) runs in its own process, `--jobs` at a time (default an eighth of the cores), so no group starts from another's state. It prints the same `CLIP ok|FAIL <name> {...}` lines and exits 1 if any case fails.

On the floor office at the current code, all 150 lines are identical to the browser run's (`node blender/checks/clip.mjs`), numbers included. Not covered, and still browser checks: `sky` (it reads pixels back from a 2D canvas) and the checks that open their own pages (garage, celebrations, respond, control). The browser run stays the gate until those move; use this one for a quick answer on a group, or to see a case's numbers without a render slot. The page function is read from `clip.mjs` itself, so a check added there runs here with no change, and a change to what it needs from the page (a new global the harness gives it) shows up as an error naming it.
