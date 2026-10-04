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

**Tuning a facepalm, in order.** The matrix's `pose: tuned by` line prints each `PALM_*` value in source. `PALM_SIT` and `PALM_STAND` pose the same arm, so when one posture is broken the other's array is a good first guess.
1. `[0]` (pitch) and `[2]` (spread) together, as one grid: `--sweep 'PALM_SIT[0]=<5 values a tenth apart>' --sweep 'PALM_SIT[2]=<5 values 0.1 apart>'` (25 runs, under `--max-runs`). They interact: `[2]`'s passing window moves and narrows as `[0]` changes, so sweeping `[0]` alone can show no passing value at all. If the broken value is far off, first sweep `[0]` alone over a wide range in steps of 0.2 and follow the `hand-eye` column down to find where to centre the grid. That column guides until the hand is close; from there it flattens and the pass counts take over.
2. Narrow `[2]` in steps of about 0.05 with the best `[0]` as a `--param`, and finish at the middle of its passing window, not its edge.
3. Leave `[1]` (twist) unless both fail: its window is narrower still. `[3]` (bow) turns the face, which changes `faceCam` and so which frames the rule judges; a `SWEEP warning:` line flags that. `[4]` (lean) barely moves the cover.

`--sweep 'PALM_STAND[2]=0.2,0.27,0.35'` prints one line per value with the cells passing, so the passing range is one command. `--sweep SLAP.aside=0,0.12,0.25,0.4,0.6` does the same for an object const (`NAME.key=v`). The lab's filter box lists every constant a run can move. A name declared in more than one file (`SEAT_HIP_Y` is in `character.js` and `perks.js`) needs its file: `--param src/render/character.js:SEAT_HIP_Y=0.45`, and the same in `--sweep`; the refusal names the files and prints that flag.

The slap plays the robot in a breakdown pose (`cause=unplug` by default, the strictest; `none` is upright), which decides how much room `SLAP.aside` has: about 0.2 with `unplug`, 0.4 with `none`.
