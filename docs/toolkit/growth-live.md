---
tool: `node blender/checks/growth-live.mjs --case small|mid|senior|trait|trained|burst`
section: render
who: art, reviewer
covers: blender/checks/growth-live.mjs
---
Loads a seeded company through Continue and observes actual growth producers through main.js and its pacer. Records complete label lifetimes, actor animations, pool counts, draw calls and elapsed frame time with GPU completion. `--capture --out <directory>` saves every third frame for a 10 fps full-loop clip. `--view 1`, `--rig 0` and `--quality low --software` exercise the turned view, procedural characters and constrained renderer. The burst fixture contains 40 staff at speed 4. `--root <worktree> --baseline` observes an unmodified comparison build on identical inputs; alternate baseline and candidate runs. Run under timeout and nice; the tool acquires the existing render lock.
