# Toolkit

Every tool the team uses, what it's for, and who reaches for it. Each script's header comment has the full usage; this page is the map. A PR that adds, removes or changes a tool updates this page in the same PR.

The machine is shared by every lane's CI. Wrap long runs in `timeout`, `nice -n 10` heavy ones, and run any headless browser work under a render lock. Stop processes by PID, never with `pkill -f` or `pgrep -f`.

## GPU or software GL

Headless browsers render on the GPU by default: `scripts/lib/gl.js` picks the mode (`--software` or `--gpu`, else `HITL_GL=software|gpu`, else the GPU) and every launcher prints it as `<tool>: GL <mode> (<renderer>)`. A run that asked for the GPU and got software GL fails instead of silently burning CPU; set `HITL_GL=software` on a machine without one.

Software GL (SwiftShader) renders on the CPU, often at many times the CPU cost. Use it only where it's needed: the golden images, which compare exact pixels; the GitHub runners, which have no GPU (the workflow sets `HITL_GL=software`); and runs that stand in for a weak device.

Render locks, through `scripts/with-render-lock.sh`:
- `scripts/with-render-lock.sh --gpu <cmd>` takes one of `HITL_GPU_SLOTS` GPU slots. Lifecycle, soak, snap, clip, standup, scene, capture and the trailer run here.
- `scripts/with-render-lock.sh --software <cmd>` (the default mode) takes the single software-GL lock. Golden runs here, as does anything forced onto SwiftShader.
- Nested calls go straight through when a caller already holds a lock that covers them. The software lock covers both kinds.

## Pull requests and the merge gate

Everyone uses these. The flow itself is in `CLAUDE.md` under Rules.

| Tool | What it does |
|---|---|
| `scripts/main-guard.sh [--sha <c>] [--no-post] [--loop <s>]` | Checks the newest commit of `main` with the full local suite (balance forced on) and one strict scene sweep. Sets the `main-guard` status on it; when main is red it opens or comments on one `main-red` issue, bisecting the merges skipped since the last green commit to name the first red one, and the next green commit closes it. New sweep violations seen only in seeded games go to a `sweep-finding` issue (art), and timing regressions against the previous main commit (checked at most hourly, filed after two bad runs in a row) to `perf-regression`; neither marks main red. It runs at the lowest priority, waits while others queue for the software render lock, and keeps the shared checkout fast-forwarded when that is clean and idle. `pr-status.sh` shows its verdict first. It runs every 5 minutes as a systemd user timer from its own clone: run `scripts/systemd/install.sh` from the shared checkout to install it; `systemctl --user list-timers 'hitl-main-guard*'` and `journalctl --user -u hitl-main-guard` show it; `systemctl --user disable --now hitl-main-guard.timer` (or `install.sh --remove`) stops it. |
| `scripts/pr-status.sh` | One live row per open PR: merge state, what holds it (`awaiting-user`, draft), review verdict and local-ci for the current head, and any failing check; then the issues awaiting the user. Check it before reporting on or acting on a PR, and don't build on a held item. Anything waiting on a user decision gets the `awaiting-user` label (a PR also stays a draft). |
| `scripts/ci-pr.sh <pr>` | Local CI for a PR: it merges the head into freshly fetched `main` in a throwaway worktree and runs that tree's own `ci-local.sh`; the trust list and helper scripts come from `main` too, so the checkout you start it from doesn't matter (a clean one on `main` updates itself first). It refuses when your local copy of the branch has commits the PR lacks: push first. Posts the Local CI comment and the `local-ci` status. `--allow-bot` is for reviewed Dependabot PRs only. A verdict of **ERROR (the machine, not the code)**, with an `error` status, means steps failed twice on the machine (out of disk, memory or GPU) and nothing failed on the code: run it again later. |
| `npm run ci` (`scripts/ci-local.sh`) | The same checks in the current worktree, with a summary table. |
| `npm run gates -- [--moment <name>] [--only test,clip,stage,sweep] [--keep]` | Quick gates while you iterate: a snapshot of your working tree (HEAD plus uncommitted and untracked changes) in a throwaway worktree, with test:fast, clip, stage and the sweep running there side by side on GPU slots, so later edits can't leak into the run. `--moment printer` narrows clip (`--only`, where clip.mjs has it), stage (`--only=printer`) and the sweep (that moment's indexed decision only). Logs go to `~/.cache/hitl-ci/gates/<time>/`. |
| `scripts/review-verdict.sh <pr> pass\|changes <body> --head <sha>` | The reviewer's verdict: a PR review plus the `review` status on that head. team-lead uses it for lead and integrator PRs. |
| `scripts/review-carry.sh <pr>` | Carries a review pass to a new head that only merges `main` in (ci-pr runs it). |
| `scripts/merge-pr.sh <pr> [--check]` | A manual merge that refuses unless both gates pass. Auto-merge normally does this. |
| `scripts/pr-media.sh [--comment] [--issue] [--repo <r>] <n> <files>` | Puts screenshots and clips on a PR, or with `--issue` on an issue (a playtest report, say), without local paths, stored on the `pr-media` branch. |
| `scripts/sheet.sh grid\|pair\|frames ...` | Contact sheets, before-and-after pairs and frame strips sized for a PR comment. |
| `scripts/check-commits.sh` | The Conventional Commits check that CI runs. |
| `scripts/hooks/pre-push` (`npm run hooks`) | Refuses pushes to a branch whose PR has already merged or closed. |

## Claude Code hooks

The repo's `.claude/settings.json` runs these for every session here (scripts in `scripts/hooks/claude/`). Each matches cheaply before doing any work, takes a few milliseconds, and lets the action through if the hook itself fails.
- **Before each Bash command** (`bash-guard.sh`): blocks `pkill -f` and `pgrep -f` (stop processes by PID), `git stash` other than `list` and `show` (all worktrees share one stash stack: commit to a scratch branch or copy to your scratchpad), any push to `main` or forced push, and `gh pr create/comment/review/edit` text or body files that contain a local path.
- **Before each Edit or Write** (`lane-guard.sh`): the branch prefix (`<lane>/<topic>`) must own the file, per `scripts/hooks/claude/lanes.txt`; the shared checkout on `main` is team-lead's. A cross-lane edit the owner agreed to goes in `$(git rev-parse --git-dir)/hitl-lane-allow`, one path per line.
- **At session start and each turn** (`behind-main.sh`): says when the checkout is behind `origin/main` and which tooling or contract commits it lacks; silent when current.
- **After `gh pr create`** (`pr-create-check.sh`): turns on auto-merge when a non-draft PR was created without it, and flags a missing Affects section, Gates run line or `Fixes #n`.

CI internals, which rarely need touching:
- `scripts/ci-local.sh` runs golden (software GL) in the background while the GPU steps run one after another, and runs the tooling self-tests only when a change touches `scripts/` or `.claude/` (the main guard runs them all).
- At most `HITL_CI_SLOTS` (default 3) ci-local runs go at once on the machine, the main guard's and `npm run ci` included; a run past the cap waits and says so (`scripts/lib/ci-capacity.sh`). Vitest gets the cores the load leaves free, shared among the runs going (2 to a third of the cores; `VITEST_WORKERS` overrides).
- A step that fails with a machine signature (ERR_INSUFFICIENT_RESOURCES, ENOSPC, no WebGL2, a GPU crash, a lock wait that ran out, or failing in under a second with no output) runs once more after a pause. Failing that way again records `error: machine (...)`: the run exits 3, ci-pr posts an `error` status instead of a failure, and the main guard gives no verdict instead of marking main red. Only a log's last 40 lines count. A commit the main guard can't judge twice in a row is recorded as checked and filed in a `main-unjudged` issue, and a PR whose re-run fails the same way is told the code may be the cause.
- `scripts/ci-classify.sh` with `scripts/ci-skip-paths` gives docs-only changes the light gate.
- `node scripts/features-ids.mjs` checks `docs/features.md` against the data, both ways. Every staged event (a `stage`, `grant` or `leaves`), item, perk, moment kind, quick post, prompt template, music night genre and era needs a bullet ending in its `id: <x>`, unless a bullet in "Ids left out on purpose" names it in its subject (before the first colon). Every `id: <x>` in the file must exist somewhere in the data. Local CI runs it on every PR, and the light gate runs it on a PR that changes the file.
- `scripts/ci-balance-skip-paths` skips the balance suite for changes that can't move balance. A pass is also recorded under a hash of the suite's inputs (the sim, its data, the balance test, the test config, the lockfile and Node), so the same inputs skip it later. `HITL_NO_CHECK_CACHE=1` turns this off.
- `scripts/lib/run-parallel.sh` runs commands side by side, each with its own vite dependency cache (`HITL_VITE_CACHE`), and prints their output in order.
- `scripts/ci-trusted` is the allowlist of PR authors that local CI will run.
- `scripts/ci-bot-check.sh` guards the Dependabot path.
- `scripts/render-lock-held.sh` lets nested jobs share a render lock.
- `blender/checks/cache.mjs` skips a render check whose inputs haven't changed since it last passed.

## Running and watching the game

| Tool | Who | What it does |
|---|---|---|
| `npm run dev` | all | Vite on 5173. `?mock=garage\|floor\|hq\|incident\|night` for canned scenes, `?seed=N` for a real game. |
| `npm run snap -- --scenario <s> --out <png>` | art, ui, reviewer | Headless screenshot. Fails on console errors. `--real --seed N --weeks W` for a real game state. |
| `node blender/checks/scene.mjs --out <png\|mp4> ...` | art, reviewer | One scene with one state change, as stills or a clip, from a mock or a seeded week, with `--patch` or `--patch-js` to set it up. The quickest way to show a specific moment. |
| `node blender/checks/dump.mjs --out <dir> [--mock m \| --seed N --week W] [--patch-js ...] [--frames a,b \| --clip s]` | art, reviewer | The scene dump: exact world position, facing, bounds and screen box of every person, item and staged prop, each person's animation, moment and beat, head, eyes, hands, feet, held prop, gaze hit and what they sit at or use, per frame, as `dump.json`, with a clean and an annotated PNG (ids, boxes, facing arrows, gaze rays, the walk grid, paths, goals, and a cross where a path passes through furniture) per frame. Walking data too: the walk grid (blocked cells, walkable cells under furniture such as meeting chairs, and the obstacle rects behind each), the door, coffee, lounge and meeting spots and every item's front cells, and each person's path, goal, what sent them (moment, perk, goal key) and the first furniture their body passes through along the path. `node blender/checks/dump-query.mjs <dir> where\|dist\|rel\|near ...` answers "where is X", "how far is A from B", "where is X's hand in Y's frame" per frame; `nav <x,z> [r]` says what each grid cell there is and why it's blocked; `path <id>` prints a person's whole walk and what it passes through. With `--trace`, the dump records the moment ownership trace: who set each person's temp (the pose or errand overriding their goal), every start, end, interrupt, replacement and refusal with the function behind it, and the decision freeze; `dump-query <dir> trace [id]` prints it. Reach for it when a moment doesn't start or is cut short. Reach for `path` when someone walks through furniture or never arrives. State positions from the dump, never from estimates off an image. Seeded games are played to the week by the balanced bot. |
| `npm run capture -- --only <id> \| --group <g>` | art, integrator | Deterministic, frame-exact clips and stills from `scripts/capture-manifest.js`, on the GPU. The README media comes from here. An item with `moment` (a find query) opens at that indexed moment, loaded through the game's save, and `index.json` records the seed, bot and week it used, plus any `window.__captureMarks` the page pushed. With `pre: true` it opens the save from just before the week that raises the decision, and the game's own tick raises it. |
| `npm run capture -- --group nods --out shots/nods --size 1920x1080 --fps 30 --audio --no-webm`, then `scripts/nods-reel.sh shots/nods shots/nods-reel.mp4` | video | The Office Space nods reel. Each nod loads the save from the week before its decision (`moment` with `pre: true`), so the game's own tick raises it, card and freeze included, with the side overlays hidden and the camera held on what the nod stages. The script trims each beat to its decision, crops a 1280x720 window round the action and the card, and titles the beats; the sound is the game's own, the printer's cue included. |
| `npm run feature-media -- [--only id,id] [--out <dir>] [--compare <dir>]` | video, integrator, ui | Media from `scripts/feature-media/manifest.js` (rendered by `scripts/feature-media/render.mjs`): capture.js items recorded through the real game loop at 1920x1080 (or an item's `record` size, say 3840x2160 for a tight still at native pixels), each with the files to make from it (`out`: a path, a size, an optional crop, a start and length for clips). Stills become WebP; clips become MP4 (plus WebM and a WebP poster), cut to length and blended end into start so they loop without a jump. Paths mirror the landing page's `img/` and `media/`, so `--out` can be a checkout of the site repo; `--compare` prints each file's size next to the same path in another folder. Clips log the camera every frame: `node scripts/reels/camstats.mjs <raw dir> <id> [from] [to]` (with `--keep-raw`) prints a cut's largest camera step and jerk. |
| `npm run trailer` | integrator, audio | Builds the trailer from captures, cards and the game's music. See `docs/trailer/README.md`. |
| `scripts/preview.sh` | team-lead, reviewer | A local build of `main` plus every lane's current branch, on port 5174, for playtesting unmerged work together. |

## Simulation and balance

| Tool | Who | What it does |
|---|---|---|
| `npm test`, `npm run test:fast` | all | Vitest. `test:fast` skips the slow balance suite; use the full `npm test` when the sim changes. |
| `npm run balance -- --seeds N [--bots a,b]` | sim, reviewer | Seeded bot games with a win and exit table, plus era by era arrival stats. Use paired runs on the same seeds to compare two builds. |
| `node scripts/events/build.js` and `node scripts/events/find.js <event> [--choice N --stage floor --bot b --era e --weeks a-b --snapshot]` | all | The seeded event index: bots play seeds 1 to 20 (balanced, sensible, allHumans) in the pure sim in about 25 s, and every decision (with the choice made), era change, office move, incident, launch and so on is indexed by seed, bot, week, era and stage, with a save-state snapshot just before staged decisions, era changes and office moves. `find.js` prints where an event happens and its snapshot. Tools stage straight to it: `scene.mjs` and `dump.mjs` take `--moment '<query>'` or `--snapshot <path>`, and `sweep.mjs` takes `--moments 'q1; q2'`. The index lives in `~/.cache/hitl-ci/events/`, keyed by a hash of the sim, data, save and build code; a tool asked for a moment builds it when the code has changed. Use it instead of playing and scanning seeds by hand. |
| `node scripts/pace.js ...` | sim, integrator | Plays the real sim through the pacer with a simulated player and reports what a person would see, and when, in real time. |

## Browser health

| Tool | What it does |
|---|---|
| `npm run lifecycle` | The real UI end to end: title, founding, play, save, reload, Continue. Fails on any page error. CI runs `--quality low --no-shots`. |
| `npm run soak` | Advances many weeks with every event routed through render, UI and audio. Catches crashes that only fire on events. |
| `node scripts/phone-check.js [--devices ...] [--checks ...]` | Plays the real game on phone and tablet device descriptors (iPhone 14 portrait and landscape, a 360x800 Android, iPad Mini; also iPhone SE and Android landscape, and desktop for layout) with real multi-touch, and fails on anything that blocks play by finger: pinch zoom and pan, HUD overlaps, panels and decision cards that don't fit or can't be tapped, toasts, tap placement, pinch-safe taps, Yak expanding and maximizing without covering the HUD, and audio unlock under an iOS-like gesture rule. Screenshots go to `--out` (default `shots/phone/`). Run it on any change to the HUD, panels, camera input or audio unlock. `--query mock=hq` exercises all nine panels. Local CI runs it (step `phone-check`, on a GPU slot) when a PR touches `src/ui/`, `src/audio/`, `index.html`, `src/main.js`, `src/quality.js`, or the render code that takes pointer input or picks (`src/render/build.js`, `camera.js`, `index.js`); the main guard runs it hourly on main. |

## Render checks (art owns these; local CI runs them)

All run through `blender/checks/harness.mjs`: a seeded page with a frozen clock, stepped frame by frame, so results depend only on the code. Two traps when writing a check: three.js takes a UUID from `Math.random` for every object it makes, and the page's `Math.random` is the game's seeded stream, so tool code that makes three.js objects mid-run (a crop, an overlay, a camera copy) runs inside `window.__tool(fn)`, which gives it a stream of its own; and `R.advance()` never refreshes world matrices, so step without drawing through `window.__advance(n)`, which does. They render on the GPU, except golden, which always uses SwiftShader. Local CI runs clip (with and without the rig), standup and the sweep (fast mode) side by side as `render-checks` on one GPU slot, and golden as `golden` under the software lock.

| Check | What it guards |
|---|---|
| `blender/checks/clip.mjs [--rig] [--only=<pattern>[,<pattern>]]` | Characters against real furniture: seated poses in every mood, perk poses, and named prop moments (`moment:*`) sampled along their whole path, and pair games (`pairs:floor`, `pairs:garage`): the start rules allow one by a new table, and two people sent there get to play. A failing moment case prints its worst actor as they stood at the worst sample (position, facing, path, goal, the temp and who set it) and their last ownership-trace lines. `--only` runs just the cases whose names contain a pattern (`--only=printer` runs `moment:printer` in about a quarter of the time) and exits 1 when none matches; a narrowed pass is never recorded as a full pass, so the full run stays the gate. |
| `blender/checks/golden.mjs [--update]` | Close-up renders compared with stored reference images. Update the references only deliberately, in the PR that changes the look. |
| `scripts/golden-resolve.sh [--no-sheets]` | When `git merge` stops on conflicted golden images, regenerates just those scenes from the merged code (`golden.mjs --update --only=...`, on the software lock) and stages them, instead of picking a side. It refuses while other files still conflict. It writes a sheet per scene (this branch, merged in, regenerated) to `shots/golden-resolve/`; post them with `scripts/pr-media.sh` so the change is reviewed as an image diff. ci-pr points to it when only golden images conflict. |
| `blender/checks/standup.mjs` | Standups gather everyone inside the walls and clear of furniture, in every office. |
| `R.probe(id)` (`src/render/probe.js`) | The staging probe (#350), in the page: how staff member `id` reads on screen this frame (gaze, face to camera, visibility, fades, hands, held prop, lean, smoke on the line of sight). Use it in `scene.mjs --report` or a check. |
| `blender/checks/stage.mjs [--only=letter,fumes] [--jobs=N]` | The staging probe (#350): does each character moment read on screen? Plays every moment from the default camera and a turned view, samples `R.probe(id)` every frame, splits the samples by beat and holds each beat to its readability spec. Prints a per-beat table (check, view, beat, metric, value, want) and writes `shots/stage/report.json`. A moment this build doesn't play is skipped. A rule marked `known: <issue>` fails as KNOWN without failing the run, and says so when it passes again. Local CI runs it on a GPU slot for PRs that touch `src/render/`, `public/models/` or the staging check and its helpers. See "Writing a readability spec" below. |
| `blender/checks/loop.mjs [--moments 'q1; q2'] [--seconds 10] [--no-spotlight]` | Decision moments through the real game loop: loads the state just before the tick that raises an indexed decision (its `preTick` snapshot) into a normal page with the full UI, lets `main.js` tick into the decision on virtual time, and fails if nobody takes the moment or its actors don't move while the decision is open. Every other check stages decisions directly and skips `main.js`'s decision freeze. A query `party:<decision>` finds the first indexed decision raised in a launch or award week, whose company party lands just as the game freezes; the default list includes `party:hearing_summons`. A failure prints the actors who should have taken the moment (position, walk, the temp and who set it) and the last lines of the ownership trace. It also checks the spotlight hold in `main.js`: with the renderer reporting a spotlight (stood in for), no week passes while the office keeps rendering, the weeks resume once it ends, and a spotlight held past the cap is let go. |
| `blender/checks/sweep.mjs [--full] [--gpu]` | The scene integrity sweep: walks every mock and bot-played seeded games (every few weeks, each stage and era, each staged decision while its moment plays) and tests all pairs with exact mesh intersection (three-mesh-bvh). Reports overlaps, floating props and furniture, held props away from the hand, anything outside the room, people inside furniture, walls or each other along real walks and poses, what someone holds or carries inside their own head or torso, models reaching past the sim's footprint tiles (every item, level and rotation, except onto the front row the sim keeps clear for an item with a front zone; desks' seats on the sim's chair tile), speech bubbles or stat labels covering each other, a face or an emote on screen for more than a few drawn frames, and tooltips off screen or covering what they explain; every moment (each captioned or staged decision, and each ambient prop moment) is played on purpose in the floor mock, so a new moment is checked even if no seeded game fires it, with the state, time, both things, the depth or gap, and a crop of each. New violations fail it, except that in fast mode ones seen only in the seeded game are advisory (any sim change replays it differently; `--full` or `--strict` fails on them). `blender/checks/sweep-baseline.json` lists accepted ones; `--update-baseline` adds what the run found and keeps the rest unless `--prune`. Each accepted entry names the issue tracking it (`"issue": n`, printed beside the violation); a fix PR removes its entries. Writes `report.json`, `report.md` and crops to `--out` (default `shots/sweep/`). Fast mode by default; `--full` for more seeds, longer windows and denser sampling. Each seed runs in its own browser with a time limit (`--seed-limit`, 300 s fast and 1200 s full); a seed past it is skipped and fails the run with the week it reached. Narrow a run with `--mocks a,b` and `--seeds 1,2`. |

Planned additions to this toolkit:

Each gets its row here when it lands.

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
3. **Say what reading means (`SPECS` in the same file).** A spec that fails because of a staging bug nobody has fixed yet lands with `known: <issue>` on the failing rules (`{ ...share(...), known: 601 }`) and an issue naming the numbers; the fix removes the marker. One entry per beat, `'<moment>.<beat>': { moment, beat, role?, rules }`. Most rules are shares: `share(metric, want, sample => condition, minShare)` passes when enough of the beat's frames meet the condition. Custom rules are `{ metric, want, test(beatSamples, allSamples) -> value, pass(value) }`.

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

| Tool | Who | What it does |
|---|---|---|
| `node scripts/perf/bench.js --refs origin/main,<branch>` | art, ui, reviewer | Builds each ref and measures the scenes garage, floor, hq, music (a staged music night) and late (a bot-played save at week 400) at Low and High. It prints one line per build and scene: frame time p50 and p95, main-thread and render time with the GPU wait included, the fastest run, draw calls, triangles, meshes, geometries, textures, programs, JS heap, DOM nodes and DOM mutations per second. Builds alternate run by run, so compare builds from one invocation, never across invocations. Main flags: `--scenes`, `--quality low,high`, `--runs` (default 3), `--size` (default 1280x720), `--json <file>`, `--profile` (top main-thread functions per scene, on an unminified build). |
| `node scripts/perf/bench.js --software --cores 2 --quality low` | art, reviewer | The weak-device stand-in: SwiftShader with the browser pinned to two cores. GL follows `scripts/lib/gl.js` like every other tool, so without `--software` it runs on the GPU. It takes a GPU slot or the software lock one scene at a time, so run it under `timeout`, not under a lock. |
| `node scripts/perf/budget.js <result.json> [--counts-only]` | reviewer, integrator | Checks a bench result against `scripts/perf/budget.json`. Each scene's draw calls, triangles, programs and textures must stay under their ceilings (the baseline plus 20%, and at least 4 more programs and textures). With two builds in the result, the head's Low render time in garage and floor may be at most 1.4x the base's. `--counts-only` skips the timing check. Exits 1 on a breach, or when the result holds no budgeted scene. |
| `node scripts/perf/bench.js --scenes garage,floor,hq,music --quality low,high --runs 1 --warmup 2 --seconds 1 --json <f>` then `budget.js <f> --counts-only` | integrator (local CI) | The PR gate: exact renderer counts on the GPU, about 40 s. |
| `node scripts/perf/sim.js --seeds 5 --weeks 1040` | sim | Times `tick()` alone, bucketed by year, across bot-played seeds. No browser. |

The machine and the GPU are shared, so single numbers are noisy. Trust relative numbers from one interleaved run, and treat renderer counts (calls, triangles, programs) as exact.

### The team's timing log

Every common tool logs itself to `~/.cache/hitl-ci/timings.jsonl`, one JSON line per event, with no setup:
- ci-pr runs, with the PR number;
- each ci-local step, with wall and CPU time, and each run with the load average at its start and end, the runs going when it started, and its wait for a run slot;
- each machine failure a step retried (`kind=infra`), and the vitest workers chosen (`kind=vitest`);
- every browser tool that launches through `scripts/lib/gl.js` (snap, lifecycle, soak, capture, the render checks, bench);
- balance and build-models runs;
- every render-lock wait, labelled with the job that waited;
- every render-check cache lookup (hit or miss, with the input hash).

Each line also records the worktree, branch, commit and exit code. The log never fails a run, and `HITL_TIMINGS=off` turns it off (tests do). New tools get it by calling `trackRun` from `scripts/lib/timing.js`, or `timing_log` from `scripts/lib/timing.sh` in shell.

| Tool | Who | What it does |
|---|---|---|
| `node scripts/perf/loop-report.js [--since 24h]` | perf, integrator, team-lead | Where the team's time goes: total, median and p90 per tool and CI step; time per worktree; lock waits per job, with timeouts; cache hit rates; repeated runs on identical inputs (the caching candidates); and the slowest runs. `--json` adds the numbers as JSON. |

## Models and assets

| Tool | Who | What it does |
|---|---|---|
| `npm run models` (`scripts/build-models.sh`) | art | Rebuilds `public/models/*.glb` from the Blender scripts, headless. Reports z-fighting and renders five-view contact sheets into `shots/sheets/` for review. |
| `node src/ui/tools/build-glyphs.js` | ui | Writes the UI glyph SVGs in `public/icons/glyphs/` and their manifest from `src/ui/tools/glyphs.js`. |
| `node src/ui/tools/icon-coverage.js [--strict]` | ui | Lists icon names that still use an emoji stand-in and fails on a manifest entry with no file. `src/ui/icons.test.js` (in `npm test`) fails when game data can ask for an icon name that has neither art nor an entry, such as a new marketing channel. |
| `public/audio/LICENSES.md` | audio | Every audio file and its source and licence. Update it with any new file. |
| `audio-masters-<n>` releases (use the newest) | audio | Lossless FLAC masters of every shipped audio file, plus a manifest mapping each to its shipped file with SHA-256 checksums. Re-encode from these, never from `public/audio/`. |

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
