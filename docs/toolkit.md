# Toolkit

Every tool the team uses, what it's for, and who reaches for it: `npm run toolkit` prints them as tables by section, from one file per tool in `docs/toolkit/` (`npm run toolkit -- --grep <word>` to find one, `--section <s>` for one section). Each script's header comment has the full usage; the toolkit is the map. A PR that adds, removes or changes a tool adds or edits that tool's own file, `docs/toolkit/<name>.md`, in the same PR: a header of `tool`, `section`, optional `who` and `covers` (the files it documents), then what it does. Local CI's `toolkit` step fails when a script or check has no entry. This page has the guidance around the tools, which changes rarely.

## When you need to...

| Task | Reach for | Page |
|---|---|---|
| Know where a person will stand or walk, or what blocks a tile | `dump.mjs --moment '<query>'`, then `dump-query path <id>` or `nav <x,z>` | [dump](toolkit/dump.md) |
| Know whether a face, prop or person reads on screen, and what hides it | `R.probe(id)` (a staff id, `'visitor:0'`, or a prop; reports `occluder`), `R.probeViews(id)`, `dump.mjs --views 0,1,2,3` then `dump-query visible <thing>` | [probe](toolkit/probe.md), [dump](toolkit/dump.md) |
| Know why a moment didn't start or was cut short | `dump.mjs --trace`, `dump-query trace <id>`; a failing `loop.mjs` or `clip.mjs` case prints the worst actor and their trace on its own | [dump](toolkit/dump.md), [loop](toolkit/loop.md), [clip](toolkit/clip.md) |
| Jump to any event or moment in a real game | `node scripts/events/find.js <event>`, then `--moment '<query>'` or `--snapshot <path>` on a tool | [events](toolkit/events.md) |
| Check a moment plays through the real game loop, or the spotlight hold | `blender/checks/loop.mjs` (queries, `party:<decision>`) | [loop](toolkit/loop.md) |
| Tune a pose or gesture on numbers, without rendering (a hand reaching an eye or brow, the face's angle to the camera) | `node blender/checks/pose.mjs --gesture <name> --under <anim> --expect '...'`, `--root <worktree>` | [pose](toolkit/pose.md) |
| Check a bubble or emote doesn't cover a face, and who hides whom, in a staged scene | `node blender/checks/pose.mjs --scene --moment '<query>' --who <ids> --expect 's3:faceCovered<=0.1'` | [pose](toolkit/pose.md) |
| Check a moment reads on screen | `stage.mjs --only=<moment>`: every staged role needs a spec; `known: <issue>` excuses a failure only while the issue is open | [stage](toolkit/stage.md) |
| Check nothing overlaps, floats, leaves the room or clutters the screen | `sweep.mjs`, `clip.mjs --only=<pattern>` | [sweep](toolkit/sweep.md), [clip](toolkit/clip.md) |
| Iterate on one moment without half-edited runs | `npm run gates -- --moment <kind>` | [gates](toolkit/gates.md) |
| Record a clip or still through the real game | `npm run capture` (camera keyframes, per-item size and fps) | [capture](toolkit/capture.md) |
| Make reels and landing page media | `scripts/reels/` (the kit and `docs/reels.md`), `npm run feature-media` | [reels guide](reels.md), [feature-media](toolkit/feature-media.md) |
| Keep the feature inventory in step with the data | `docs/features.md`, `node scripts/features-ids.mjs` | [features-ids](toolkit/features-ids.md) |
| Gate, review and merge a PR | `scripts/ci-pr.sh <pr>`, `scripts/pr-status.sh`, `scripts/review-verdict.sh`; the main guard watches `main` | [ci-pr](toolkit/ci-pr.md), [pr-status](toolkit/pr-status.md), [review-verdict](toolkit/review-verdict.md), [main-guard](toolkit/main-guard.md) |
| Know what the Claude Code hooks refuse, and record an agreed cross-lane edit | the bash and lane guards; an exception goes in `$(git rev-parse --git-dir)/hitl-lane-allow` | [bash-guard](toolkit/bash-guard.md), [lane-guard](toolkit/lane-guard.md) |

The machine is shared by every lane's CI. Wrap long runs in `timeout`, `nice -n 10` heavy ones, and run any headless browser work under a render lock. Stop processes by PID, never with `pkill -f` or `pgrep -f`.

Scene pose checks require every selected subject at every requested frame. Run `pose.mjs --scene` from the checkout being measured; it rejects a differing `--root`.

## GPU or software GL

Headless browsers render on the GPU by default: `scripts/lib/gl.js` picks the mode (`--software` or `--gpu`, else `HITL_GL=software|gpu`, else the GPU) and every launcher prints it as `<tool>: GL <mode> (<renderer>)`. A run that asked for the GPU and got software GL fails instead of silently burning CPU; set `HITL_GL=software` on a machine without one.

Software GL (SwiftShader) renders on the CPU, often at many times the CPU cost. Use it only where it's needed: the golden images, which compare exact pixels; the GitHub runners, which have no GPU (the workflow sets `HITL_GL=software`); and runs that stand in for a weak device. The render locks (`scripts/with-render-lock.sh`, in the toolkit's CI internals) keep heavy browser work queued instead of piled onto the machine.

## Claude Code hooks

The repo's `.claude/settings.json` runs the hooks in `scripts/hooks/claude/` for every session here (their entries are in the toolkit's hooks section). Each matches cheaply before doing any work, takes a few milliseconds, and lets the action through if the hook itself fails, so a broken hook never blocks work.

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
   - Actors who aren't staff (the visitors) are listed by the moments module's `extras()` as `{ id: 'visitor:0', char, stage }`; `staging(id)` and `R.probe(id)` take those ids, and the check samples them too.
   - Every role the moment stages needs a spec; `stage.mjs` fails a role with none.
2. **Set it up (`SCENARIOS` in `blender/checks/stage.mjs`).** A mock query, a state `patch` that starts the moment (usually a `pendingDecision` with a `stage` prop), and how many seconds to watch. `steps: [{ at, js }]` runs a script with `S` and `R` at frame `at`, for a moment that starts on a later event (the printer's `decisionResolved`).
3. **Say what reading means (`SPECS` in the same file).** A spec that fails because of a staging bug nobody has fixed yet lands with `known: <issue>` on the failing rules (`{ ...share(...), known: 601 }`) and an issue naming the numbers; the fix removes the marker. One entry per beat, `'<moment>.<beat>': { moment, beat, role?, rules }`. Most rules are shares: `share(metric, want, sample => condition, minShare)` passes when enough of the beat's frames meet the condition. Custom rules are `{ metric, want, test(beatSamples, allSamples) -> value, pass(value) }`.

What `R.probe(id)` measures per frame (`src/render/probe.js` has the full list):
- `gaze.hit`: what the line of sight from the eyes meets first: `'held'`, a staged prop id, a placed item id, `'furniture'`, `'floor'`, `'wall'` or `'none'`.
- `targetAngle`: degrees between the face's direction and the target.
- `faceCam`: degrees between the face's direction and the camera. The face reads within about 60 to 70.
- `visible`: the share of the body the camera sees unblocked, walls and wall stubs included; `occluder` names what hides most of the rest (a staff id, `'prop <kind>'`, `'<id> <item>'`, `'column'` or `'wall'`).
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
