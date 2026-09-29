Which constant moves which measure, for tuning with `--param FILE:NAME[i]=v` or `--sweep`. The lab (`lab.md`) has a slider for each.

| Measure | Moved by | File |
|---|---|---|
| `hand0Face`, `hand1Face`, `hand0Eye*`, `hand1Eye*`, `clearance` (facepalm, standing) | `PALM_STAND[0..4]`: three arm angles (index 2 is the one the build offset adds to), then the head bow and the body lean | `src/render/character.js` |
| the same, seated (over `typing`) | `PALM_SIT[0..4]` | `src/render/character.js` |
| the same, per build | `PALM_BUILD_K` (how much a wider build's shoulder shifts the reach) and `PALM_SHOULDER_REF` | `src/render/character.js` |
| `coverHandEyeNear`, `coverHandEyeL`, `coverHandEyeR`, `coverHandFace` | the same `PALM_*` numbers, and the view (`faceCam`) | `src/render/character.js` |
| `faceCam` | the heading of the person (the matrix `views`), not a constant | |

`--sweep 'PALM_STAND[2]=0.2,0.27,0.35'` prints one line per value with the cells passing, so the passing range is one command. The robot slap measures (`robotDepth` and the rest) are added with the slap gesture. The lab's filter box lists every constant a run can move.
