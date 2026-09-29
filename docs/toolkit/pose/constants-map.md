Which constant moves which measure, for tuning with `--param FILE:NAME[i]=v` or `--sweep` (`NAME.key=v` for a key of an object const such as `SLAP`). The lab (`lab.md`) has a slider for each.

| Measure | Moved by | File |
|---|---|---|
| `hand0Face`, `hand1Face`, `hand0Eye*`, `hand1Eye*`, `clearance` (facepalm, standing) | `PALM_STAND[0..4]`: three arm angles (index 2 is the one the build offset adds to), then the head bow and the body lean | `src/render/character.js` |
| the same, seated (over `typing`) | `PALM_SIT[0..4]` | `src/render/character.js` |
| the same, per build | `PALM_BUILD_K` (how much a wider build's shoulder shifts the reach) and `PALM_SHOULDER_REF` | `src/render/character.js` |
| `coverHandEyeNear`, `coverHandEyeL`, `coverHandEyeR`, `coverHandFace` | the same `PALM_*` numbers, and the view (`faceCam`) | `src/render/character.js` |
| `faceCam` | the heading of the person (the matrix `views`), not a constant | |
| `robotContact` (slap) | `SLAP.aside` (the fixer's turn to the robot), `SLAP.radii` (how far away the fixer stands, first ring), `SLAP.cringe` (the robot's head tip); the hit time is `SLAP_AT` | `src/render/robot.js`, `src/render/character.js` |
| `robotDepth` (slap: metres the fixer is inside the robot) | `SLAP.aside` and `SLAP.radii`. A larger `aside` swings the fixer's body into the robot, a smaller `radii` walks it in. Raise `radii[0]` or lower `aside` to clear it | `src/render/robot.js` |
| `robotAngle` (slap: degrees the fixer's face is off the robot head) | `SLAP.aside` | `src/render/robot.js` |
| `faceVisible` (slap) | `SLAP.aside` and the view | `src/render/robot.js` |

`--sweep SLAP.aside=0.05,0.12,0.2` prints one line per value with the cells passing, so the passing range is one command. The lab's filter box lists every constant a run can move.
