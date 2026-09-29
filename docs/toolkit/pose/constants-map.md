Which constant moves which measure, for tuning with `--param FILE:NAME[i]=v` or `--sweep`. `NAME.key=v` reaches a key of an object const such as `SLAP`. The lab (`lab.md`) has a slider for each.

| Measure | Moved by | File |
|---|---|---|
| `hand0Face`, `hand1Face`, `hand0Eye*`, `hand1Eye*`, `clearance` (facepalm, standing) | `PALM_STAND[0..4]`: three arm angles (index 2 is the one the build offset adds to), then the head bow and the body lean | `src/render/character.js` |
| the same, seated (over `typing`) | `PALM_SIT[0..4]` | `src/render/character.js` |
| the same, per build | `PALM_BUILD_K` (how much a wider build's shoulder shifts the reach) and `PALM_SHOULDER_REF` | `src/render/character.js` |
| `coverHandEyeNear`, `coverHandEyeL`, `coverHandEyeR`, `coverHandFace` | the same `PALM_*` numbers, and the view (`faceCam`) | `src/render/character.js` |
| `robotContact` (slap: hand to robot head, metres) | `SLAP.aside`, `SLAP.radii` (first ring: how far the fixer stands), `SLAP_AT` (when the hand lands) | `src/render/robot.js`, `src/render/character.js` |
| `robotDepth` (slap: metres the fixer is inside the robot) | `SLAP.aside` and `SLAP.radii`: a larger `aside` swings the body into the robot, a smaller `radii[0]` walks it in. Lower `aside` or raise `radii[0]` to clear it | `src/render/robot.js` |
| `robotAngle` (slap: degrees the fixer's face is off the robot head) | `SLAP.aside` (the stage rule wants 35 or less on 80% of frames) | `src/render/robot.js` |
| `faceVisible` (slap) | `SLAP.aside` and the view | `src/render/robot.js` |
| `faceCam` | the heading of the person (the matrix `views`), not a constant | |

`--sweep 'PALM_STAND[2]=0.2,0.27,0.35'` prints one line per value with the cells passing, so the passing range is one command. `--sweep SLAP.aside=0,0.12,0.25,0.4,0.6` does the same for an object const (`NAME.key=v`). The lab's filter box lists every constant a run can move.
