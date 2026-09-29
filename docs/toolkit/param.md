---
tool: `--param [file:]NAME[idx]=value` and `--sweep NAME=a,b,c --measure <m> [--across flag=a,b] [--rows '<js>'] [--pick min|median|max|mean]` on `blender/checks/pose.mjs`; `--param` on `blender/checks/scene.mjs`
section: render
who: art
covers: blender/checks/param.js blender/checks/param-sweep.js tests/tools/param.test.js
---
Tune a render constant without editing source. `--param src/render/character.js:PALM_STAND=[-2.75,0.14,0.27,-0.6,0.08]` overrides that module-level `const` for one run (a bare name is looked up under `src/`; `NAME[2]=0.3` sets one element), in Node for gesture runs and in the page for `--scene` and `scene.mjs`. The declaration must be a top-level `const NAME = ...;`; a name that isn't found, is declared in two files, or has a `;` in the value is refused before anything runs. `--param` does not work with `--serve`.

`--sweep NAME=v1,v2,...` runs the same measurement once per value (values split at top-level commas, so an array is one value; repeat `--sweep` for a grid) and prints one table. `--across flag=a,b,c` varies a pose.mjs flag down the rows (`mock`, `view`, `seed`, `week`; repeat for a grid). `--measure` names the number (a scene row field, a cover measure such as `coverHandEyeNear`, which adds `--cover` itself, or a gesture measure such as `hand0Eye`), `--rows '<js over r>'` keeps some rows (`String(r.anim).startsWith('facepalm') && r.frame >= 12`), `--pick` collapses them to a cell (default min). Each cell is a full run, one after another (about 5 s each in scene mode). A cell that can't be measured prints `-` and says why on stderr, and the exit status is 1.

The facepalm cover matrix, which was a hand-built shell loop over `sed` on `character.js`:

    node blender/checks/pose.mjs --scene --warm 200 --event '{"type":"posted","outcome":"backfired"}' --clip 2 --every 12 \
      --sweep 'PALM_STAND=[-2.75,0.14,0.27,-0.6,0.08],[-2.75,0.14,0.5,-0.6,0.08]' --across mock=floor,hq --across view=0,1,2,3 \
      --measure coverHandEyeNear --rows "String(r.anim).startsWith('facepalm') && r.frame >= 12" --pick min
