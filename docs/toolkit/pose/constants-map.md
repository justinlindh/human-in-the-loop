Which constant moves which measure, for tuning with `--param FILE:NAME[i]=v` or `--sweep`. `NAME.key=v` reaches a key of an object const such as `SLAP`. The lab (`lab.md`) has a slider for each.

| Measure | Moved by | File |
|---|---|---|
| `hand0Face`, `hand1Face`, `hand0Eye*`, `hand1Eye*`, `clearance` (facepalm, standing and lying) | `PALM_STAND[0..4]`, radians: `[0]` shoulder pitch (more negative raises the arm toward the face), `[1]` shoulder twist, `[2]` spread (swings the hand across the face to the eye; the build offset adds to it), `[3]` head bow (more negative bows into the palm), `[4]` body lean | `src/render/character.js` |
| the same, seated (over `typing`) | `PALM_SIT[0..4]`, the same five numbers with no build offset: every build reaches with the same `[2]` | `src/render/character.js` |
| the same, per build (standing and lying only) | `PALM_BUILD_K` (how much a wider build's shoulder shifts the reach) and `PALM_SHOULDER_REF` | `src/render/character.js` |
| `coverHandEyeNear`, `coverHandEyeL`, `coverHandEyeR`, `coverHandFace` | the same `PALM_*` numbers, and the view (`faceCam`) | `src/render/character.js` |
| `robotContact` (slap: hand to robot head, metres) | `SLAP.aside`, `SLAP.radii` (first ring: how far the fixer stands), `SLAP_AT` (when the hand lands) | `src/render/robot.js`, `src/render/character.js` |
| `robotDepth` (slap: metres the fixer is inside the robot) | `SLAP.aside` and `SLAP.radii`: a larger `aside` swings the body into the robot, a smaller `radii[0]` walks it in. Lower `aside` or raise `radii[0]` to clear it | `src/render/robot.js` |
| `robotAngle` (slap: degrees the fixer's face is off the robot head) | `SLAP.aside` (the stage rule wants 35 or less on 80% of frames) | `src/render/robot.js` |
| `faceVisible` (slap) | `SLAP.aside` and the view | `src/render/robot.js` |
| `faceCam` | the heading of the person (the matrix `views`), not a constant | |

**Tuning a facepalm, in order.** The matrix's `pose: tuned by` line prints each `PALM_*` value in source; sweep around it.
1. `[0]` (pitch) first: it moves the hand most. Sweep it a few tenths either side in steps of about 0.1 and follow the sweep's `hand-eye` column down. The cells only start passing once the hand is close, so with every cell at 0% the column is the only thing that moves.
2. Then `[2]` (spread), in steps of about 0.05 around the best `[0]`, with that `[0]` as a `--param`. Its passing window is narrow, so finish at its middle, not its edge.
3. Leave `[1]` (twist) unless both fail: its window is narrower still. `[3]` (bow) turns the face, which changes `faceCam` and so which frames the rule judges; a `SWEEP warning:` line flags that. `[4]` (lean) barely moves the cover.

A two-param grid (`--sweep 'PALM_SIT[0]=...' --sweep 'PALM_SIT[2]=...'`) does steps 1 and 2 in one command when the run count fits under `--max-runs`.

`--sweep 'PALM_STAND[2]=0.2,0.27,0.35'` prints one line per value with the cells passing, so the passing range is one command. `--sweep SLAP.aside=0,0.12,0.25,0.4,0.6` does the same for an object const (`NAME.key=v`). The lab's filter box lists every constant a run can move. A name declared in more than one file (`SEAT_HIP_Y` is in `character.js` and `perks.js`) needs its file: `--param src/render/character.js:SEAT_HIP_Y=0.45`, and the same in `--sweep`; the refusal names the files and prints that flag.

The slap plays the robot in a breakdown pose (`cause=unplug` by default, the strictest; `none` is upright), which decides how much room `SLAP.aside` has: about 0.2 with `unplug`, 0.4 with `none`.
