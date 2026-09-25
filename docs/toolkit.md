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
| `scripts/pr-status.sh` | One live row per open PR: merge state, review verdict and local-ci for the current head, and any failing check. Check it before reporting on or acting on a PR. |
| `scripts/ci-pr.sh <pr>` | Local CI for a PR, run on the PR merged into `main` in a throwaway worktree. Posts the Local CI comment and the `local-ci` status. `--allow-bot` is for reviewed Dependabot PRs only. |
| `npm run ci` (`scripts/ci-local.sh`) | The same checks in the current worktree, with a summary table. |
| `scripts/review-verdict.sh <pr> pass\|changes <body> --head <sha>` | The reviewer's verdict: a PR review plus the `review` status on that head. team-lead uses it for lead and integrator PRs. |
| `scripts/review-carry.sh <pr>` | Carries a review pass to a new head that only merges `main` in (ci-pr runs it). |
| `scripts/merge-pr.sh <pr> [--check]` | A manual merge that refuses unless both gates pass. Auto-merge normally does this. |
| `scripts/pr-media.sh [--comment] [--repo <r>] <pr> <files>` | Puts screenshots and clips on a PR without local paths, stored on the `pr-media` branch. |
| `scripts/sheet.sh grid\|pair\|frames ...` | Contact sheets, before-and-after pairs and frame strips sized for a PR comment. |
| `scripts/check-commits.sh` | The Conventional Commits check that CI runs. |
| `scripts/hooks/pre-push` (`npm run hooks`) | Refuses pushes to a branch whose PR has already merged or closed. |

CI internals, which rarely need touching:
- `scripts/ci-classify.sh` with `scripts/ci-skip-paths` gives docs-only changes the light gate.
- `scripts/ci-balance-skip-paths` skips the balance suite for changes that can't move balance.
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
| `npm run capture -- --only <id> \| --group <g>` | art, integrator | Deterministic, frame-exact clips and stills from `scripts/capture-manifest.js`, on the GPU. The README media comes from here. |
| `npm run trailer` | integrator, audio | Builds the trailer from captures, cards and the game's music. See `docs/trailer/README.md`. |
| `scripts/preview.sh` | team-lead, reviewer | A local build of `main` plus every lane's current branch, on port 5174, for playtesting unmerged work together. |

## Simulation and balance

| Tool | Who | What it does |
|---|---|---|
| `npm test`, `npm run test:fast` | all | Vitest. `test:fast` skips the slow balance suite; use the full `npm test` when the sim changes. |
| `npm run balance -- --seeds N [--bots a,b]` | sim, reviewer | Seeded bot games with a win and exit table, plus era by era arrival stats. Use paired runs on the same seeds to compare two builds. |
| `node scripts/pace.js ...` | sim, integrator | Plays the real sim through the pacer with a simulated player and reports what a person would see, and when, in real time. |

## Browser health

| Tool | What it does |
|---|---|
| `npm run lifecycle` | The real UI end to end: title, founding, play, save, reload, Continue. Fails on any page error. CI runs `--quality low --no-shots`. |
| `npm run soak` | Advances many weeks with every event routed through render, UI and audio. Catches crashes that only fire on events. |

## Render checks (art owns these; local CI runs them)

All run through `blender/checks/harness.mjs`: a seeded page with a frozen clock, stepped frame by frame, so results depend only on the code. They render on the GPU, except golden, which always uses SwiftShader. Local CI runs clip and standup as `render-checks` on a GPU slot, and golden as `golden` under the software lock.

| Check | What it guards |
|---|---|
| `blender/checks/clip.mjs [--rig]` | Characters against real furniture: seated poses in every mood, perk poses, and named prop moments (`moment:*`) sampled along their whole path. |
| `blender/checks/golden.mjs [--update]` | Close-up renders compared with stored reference images. Update the references only deliberately, in the PR that changes the look. |
| `blender/checks/standup.mjs` | Standups gather everyone inside the walls and clear of furniture, in every office. |

Planned additions to this toolkit:
- **The staging probe (#350):** gaze, facing, visibility and gesture measured in code, with a readability spec per moment.
- **The scene integrity sweep (#352):** overlaps, floating props and label collisions across many states.
- **The performance harness (`scripts/perf/`):** frame times, draw calls and memory per scene.

Each gets its row here when it lands.

## Models and assets

| Tool | Who | What it does |
|---|---|---|
| `npm run models` (`scripts/build-models.sh`) | art | Rebuilds `public/models/*.glb` from the Blender scripts, headless. Reports z-fighting and renders five-view contact sheets into `shots/sheets/` for review. |
| `public/audio/LICENSES.md` | audio | Every audio file and its source and licence. Update it with any new file. |

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
