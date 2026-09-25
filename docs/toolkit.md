# Toolkit

Every tool the team uses, what it's for, and who reaches for it: `npm run toolkit` prints them as tables by section, from one file per tool in `docs/toolkit/` (`npm run toolkit -- --grep <word>` to find one, `--section <s>` for one section). Each script's header comment has the full usage; the toolkit is the map. A PR that adds, removes or changes a tool adds or edits that tool's own file, `docs/toolkit/<name>.md`, in the same PR: a header of `tool`, `section`, optional `who` and `covers` (the files it documents), then what it does. Local CI's `toolkit` step fails when a script or check has no entry. This page has the guidance around the tools, which changes rarely.

The machine is shared by every lane's CI. Wrap long runs in `timeout`, `nice -n 10` heavy ones, and run any headless browser work under a render lock. Stop processes by PID, never with `pkill -f` or `pgrep -f`.

## GPU or software GL

Headless browsers render on the GPU by default: `scripts/lib/gl.js` picks the mode (`--software` or `--gpu`, else `HITL_GL=software|gpu`, else the GPU) and every launcher prints it as `<tool>: GL <mode> (<renderer>)`. A run that asked for the GPU and got software GL fails instead of silently burning CPU; set `HITL_GL=software` on a machine without one.

Software GL (SwiftShader) renders on the CPU, often at many times the CPU cost. Use it only where it's needed: the golden images, which compare exact pixels; the GitHub runners, which have no GPU (the workflow sets `HITL_GL=software`); and runs that stand in for a weak device. The render locks (`scripts/with-render-lock.sh`, in the toolkit's CI internals) keep heavy browser work queued instead of piled onto the machine.

## Render checks

All run through `blender/checks/harness.mjs`: a seeded page with a frozen clock, stepped frame by frame, so results depend only on the code. Two traps when writing a check: three.js takes a UUID from `Math.random` for every object it makes, and the page's `Math.random` is the game's seeded stream, so tool code that makes three.js objects mid-run (a crop, an overlay, a camera copy) runs inside `window.__tool(fn)`, which gives it a stream of its own; and `R.advance()` never refreshes world matrices, so step without drawing through `window.__advance(n)`, which does. They render on the GPU, except golden, which always uses SwiftShader. Local CI runs clip (with and without the rig), standup, loop and the sweep (fast mode) side by side as `render-checks` on one GPU slot, and golden as `golden` under the software lock.

### Writing a readability spec

Every new character moment ships with one. Three places change:

1. **Tag the actors (`src/render/moments.js`).** Give the moment's `r.temp` a `stage` record: `{ beat, role, target, held, source }`.
   - `beat` names the part of the moment playing now (`'read'`, `'fan'`); update it from the temp's `tick` as the moment moves on. While the actor walks, `staging()` reports `'walk'` on its own.
   - `target` is what they deal with: a `Vector3` or an `Object3D` (its box centre is used).
   - `held` is a prop in their hand (an `Object3D`).
   - `source` is an effect whose sprites should sit between them and the target (smoke).
   - `role` tells actors of one moment apart (the printer's `'carrier'` and `'bat'`). Every actor is sampled each frame, and a spec with a `role` reads only that role's samples.
   - Add the moment's name to `KINDS`, so the check knows the build plays it.
2. **Set it up (`SCENARIOS` in `blender/checks/stage.mjs`).** A mock query, a state `patch` that starts the moment (usually a `pendingDecision` with a `stage` prop), and how many seconds to watch. `steps: [{ at, js }]` runs a script with `S` and `R` at frame `at`, for a moment that starts on a later event (the printer's `decisionResolved`).
3. **Say what reading means (`SPECS` in the same file).** One entry per beat, `'<moment>.<beat>': { moment, beat, role?, rules }`. Most rules are shares: `share(metric, want, sample => condition, minShare)` passes when enough of the beat's frames meet the condition. Custom rules are `{ metric, want, test(beatSamples, allSamples) -> value, pass(value) }`.

What `R.probe(id)` measures per frame (`src/render/probe.js` has the full list):
- `gaze.hit`: what the line of sight from the eyes meets first: `'held'`, a staged prop id, a placed item id, `'furniture'`, `'floor'`, `'wall'` or `'none'`.
- `targetAngle`: degrees between the face's direction and the target.
- `faceCam`: degrees between the face's direction and the camera. The face reads within about 60 to 70.
- `visible`: the share of the body the camera sees unblocked, walls and wall stubs included.
- `fadeOver`: faded columns in front of the character whose screen box meets theirs.
- `held.dist`, `held.ahead`: the held prop's distance from the eyes, and its angle off the face.
- `handsRel`: the hands relative to the eyes in the face's heading. `stage.mjs`'s `motion()` turns them into a gesture's frequency and amplitude (fanning is fast and small; a wave is slow and wide).
- `lean`: metres the head sits ahead of the feet toward the target (negative means away).
- `between`: `source` sprites near the line from the eyes to the target.
- `headY`, `eyes`, `forward`, `anim`.

`stage.mjs` turns the moment camera off (`hitl:cameraSettings`), so every spec reads the default and the turned view as a player would set them; a moment that should follow its actors does so through `momentcam.js`, which players can switch off.

Run `node blender/checks/stage.mjs --only=<moment>` while staging (under the render lock), and fix the staging until the table passes before recording clips. A turned view matters: staging that picks a spot relative to the room rather than the camera usually fails there.

## Performance

The machine and the GPU are shared, so single numbers are noisy. Trust relative numbers from one interleaved run, and treat renderer counts (calls, triangles, programs) as exact.

## Team process

| What | Where |
|---|---|
| Lanes, owned paths, and who to message | `CLAUDE.md`, Team |
| State shape, events and actions | `src/contract/contract.md` (team-lead edits it) |
| Game design and the build plan | `docs/superpowers/specs/` and `docs/superpowers/plans/` |
| Voice and humor | `docs/superpowers/specs/2026-09-24-humor-notes.md` |
| Role briefs and skills | `.claude/agents/` and `.claude/skills/` |
| Ideas and priorities | GitHub issues labelled `idea` with `when:*`, ranked in #6. `tooling` marks toolkit work, and `fork-idea` marks separate projects. |
| Anything the user must see or decide | Send it to team-lead with the media; team-lead puts it on the user's review desk. |
