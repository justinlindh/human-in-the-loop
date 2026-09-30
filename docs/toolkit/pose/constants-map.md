Which constant moves which measure, for tuning with `--param FILE:NAME[i]=v` or `--sweep`. `NAME.key=v` reaches a key of an object const such as `SLAP`. The lab (`lab.md`) has a slider for each.

| Measure | Moved by | File |
|---|---|---|
| `hand0Face`, `hand1Face`, `hand0Eye*`, `hand1Eye*`, `clearance` (facepalm, standing and lying) | `PALM_STAND[0..4]`: three arm angles (index 2 is the one the build offset adds to), then the head bow and the body lean | `src/render/character.js` |
| the same, seated (over `typing`) | `PALM_SIT[0..4]`, the same five numbers with no build offset: every build reaches with the same index 2 | `src/render/character.js` |
| the same, per build (standing and lying only) | `PALM_BUILD_K` (how much a wider build's shoulder shifts the reach) and `PALM_SHOULDER_REF` | `src/render/character.js` |
| `coverHandEyeNear`, `coverHandEyeL`, `coverHandEyeR`, `coverHandFace` | the same `PALM_*` numbers, and the view (`faceCam`) | `src/render/character.js` |
| `robotContact` (slap: hand to robot head, metres) | `SLAP.aside`, `SLAP.radii` (first ring: how far the fixer stands), `SLAP_AT` (when the hand lands) | `src/render/robot.js`, `src/render/character.js` |
| `robotDepth` (slap: metres the fixer is inside the robot) | `SLAP.aside` and `SLAP.radii`: a larger `aside` swings the body into the robot, a smaller `radii[0]` walks it in. Lower `aside` or raise `radii[0]` to clear it | `src/render/robot.js` |
| `robotAngle` (slap: degrees the fixer's face is off the robot head) | `SLAP.aside` (the stage rule wants 35 or less on 80% of frames) | `src/render/robot.js` |
| `faceVisible` (slap) | `SLAP.aside` and the view | `src/render/robot.js` |
| `faceCam` | the heading of the person (the matrix `views`), not a constant | |

`--sweep 'PALM_STAND[2]=0.2,0.27,0.35'` prints one line per value with the cells passing, so the passing range is one command. `--sweep SLAP.aside=0,0.12,0.25,0.4,0.6` does the same for an object const (`NAME.key=v`). The lab's filter box lists every constant a run can move. A name declared in more than one file (`SEAT_HIP_Y` is in `character.js` and `perks.js`) needs its file: `--param src/render/character.js:SEAT_HIP_Y=0.45`, and the same in `--sweep`; the refusal names the files and prints that flag.

The slap plays the robot in a breakdown pose (`cause=unplug` by default, the strictest; `none` is upright), which decides how much room `SLAP.aside` has: about 0.2 with `unplug`, 0.4 with `none`.
