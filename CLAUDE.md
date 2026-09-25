# Human in the Loop

Kairosoft-style management sim about an AI-era SaaS company. Three.js isometric diorama in the browser, pure JS simulation underneath.

- Spec: `docs/superpowers/specs/2026-09-23-human-in-the-loop-design.md`
- Plan (tasks, lanes, formulas): `docs/superpowers/plans/2026-09-23-human-in-the-loop.md`
- Contract (state, events, actions): `src/contract/contract.md`. Only the lead edits it.

## Commands

- `npm run dev`: Vite dev server on 5173. `?mock=garage|floor|hq|incident|night` runs against the mock sim; `?seed=N` for a reproducible real game.
- `npm test`: Vitest (sim, contract, balance).
- `npm run balance -- --seeds 100`: bot win/loss table.
- `npm run snap -- --scenario floor --out shots/floor.png`: headless screenshot, exits non-zero on console errors.
- `npm run models`: rebuild `public/models/*.glb` from `blender/` scripts (Blender 5.2, headless).

Every other tool (the PR and review scripts, captures, render checks, balance and pacing tools) is listed in `docs/toolkit.md`, with who uses it and for what. Read it at the start of a session. A PR that adds, removes or changes a tool updates `docs/toolkit.md` and, when a role should reach for it, that role's brief in `.claude/agents/`.

Everything the game does for the player (items, perks, staged moments, props, Yak features, jokes, sounds, interface) is catalogued in `docs/features.md`, with the ids it is built from and how to see each one. A PR that adds, changes or removes something a player can see updates its entry in the same PR. A data-backed entry carries its ids (`id: printer_jam`).

## Team

Message teammates by name with SendMessage. Other sessions that ListAgents shows (other projects, cloud sessions, older gamedev sessions) are not on the team; never message them.

| Name | Lane | Worktree | Owns |
|---|---|---|---|
| team-lead | coordination | the main checkout | talks to the user; the plan, spec, contract, and this file; approves merges; writes no code |
| integrator | integration | the main checkout (branch `main`) | `main.js`, `src/pacing.js`, `src/dev/`, `scripts/snap.js`, `scripts/pace.js`, `index.html`, `package.json`, `vite.config.js`, CI, merges approved PRs into `main` |
| sim | simulation | `../gamedev-sim` | `src/sim/`, `src/data/`, `src/save/`, `tests/`, `scripts/balance.js` |
| art | render and art | `../gamedev-art` | `src/render/`, `blender/`, `public/models/` |
| ui | UI and audio | `../gamedev-ui` | `src/ui/`, `src/audio/` |
| reviewer | review and playtest | any (read-only) | nothing |

- Talk directly: sim and ui about state and action semantics, reason strings, and new events; sim and art about moods, assignments, and event timing; art and ui about palette, fonts, label stacking, and character clicks.
- Go through team-lead for contract changes, disagreements between lanes, and blockers. Integration problems (main.js, merges, the snap and pacing tools) go to integrator.
- Anything that needs the user's eyes or ears (a clip, an audio pick, a visual change they asked for, a decision only they can make) goes to team-lead with the media files and the question. team-lead puts it on the user's review desk and tells them it's there. Don't only mention it in a report.
- Wrap long-running commands (renders, ffmpeg, captures, balance runs) in `timeout`, and nice heavy batch jobs (`nice -n 10`). The machine is shared: a runaway job blocks your own turn, so you never see messages about it, and it starves every lane's CI.
- Stop or wait on processes by PID (`$!`, `wait`, `tail --pid`, a lock), never with `pkill -f` or `pgrep -f` on text: the pattern also matches your own shell's command line, so it kills your own command or waits forever.
- When your change alters something other lanes use (a tool or check, a harness, a shared helper, CI, the contract, or a convention), list the affected teammates in the PR's Affects section. When it merges, message each of them: what changed, and what they should do (merge `main`, switch commands, stop a workaround).
- Before starting each new task, merge `origin/main` into your working branch, then skim what changed in the tooling since your last sync (`git log --oneline <last-sync>..origin/main -- scripts blender/checks docs/toolkit.md src/contract`). Reach for new tools before hand-rolled ones.
- Every instruction or status message names the PR and head (or issue) it's about. An update restates the whole current ask rather than adding a delta. Before stopping another agent's job, or when you do, send it a one-line notice.
- Read other worktrees for reference; never edit them. Send short messages and keep working; do not idle waiting for replies.
- Team mailbox messages only arrive between turns. After each task, end your turn with your report as your final message: team-lead receives it automatically when your turn ends. Don't also send the same report with SendMessage, or it arrives twice. Use SendMessage for things that can't wait for the end of your turn, and for messages to other teammates. If a turn produced nothing new (for example, you only acknowledged a message), end it with one short line. team-lead replies with cross-lane news and the go-ahead for the next task.
- Before a report or an action that depends on a PR's state, check it live (`scripts/pr-status.sh`, or `gh pr view <n>`). Messages cross, so an instruction or a status you received may already be out of date. Report only what changed since your last report: new PRs, new results, and decisions you need.

## Rules

- `src/sim/` is pure and deterministic: no `three`, no DOM, no `localStorage`, no `Math.random` or `Date.now`. Randomness goes through `src/sim/rng.js` with its state in game state.
- Render and UI never mutate game state. UI changes state only through `dispatch(state, action)`.
- Every tunable number lives in `src/sim/balance.js`. A balance-test bound over seeded runs rests on evidence from 200 or more seeds, so it sits outside seed-to-seed noise.
- Keep a path open to touch and low-end devices (issue #8): nothing hover-only or keyboard-only in new UI, and new render features must degrade under the Low quality setting.
- Stay in your lane's paths (see the plan's lane table). Need something elsewhere: message its owner. Need a contract change: message the lead.
  - A Claude Code hook (`scripts/hooks/claude/lane-guard.sh`, lanes in `scripts/hooks/claude/lanes.txt`) refuses edits outside your lane. When the owner agrees to a specific edit, add that path to your worktree's exception file, `$(git rev-parse --git-dir)/hitl-lane-allow`, as the refusal message shows. List the owner in the PR's Affects section. The exception file lives in git's own directory, so it never reaches a commit.
- Game text says "company" or "lab", never "startup", except inside a parody joke.
- No em dash characters anywhere (files, commits, messages); a hook blocks them. Do not type the escape sequence for U+2014 either: the hook decodes it.
- Comments describe what non-obvious code does now. No history, dates, or measurements in source.
- Commit on a topic branch in your worktree. Never commit to `main`.
- Changes reach `main` only through pull requests, one per batch, each from a fresh branch named `<lane>/<topic>` cut from `origin/main` (`gh pr create --base main --head <lane>/<topic>`). The pre-push hook (`npm run hooks` installs it) refuses pushes to a branch whose PR has merged or closed.
  - The description lists the task, the commits, the evidence (test output, screenshots or clips) and `Fixes #n` lines. A visual change always has a screenshot, and a change to motion or timing has a clip.
  - Turn on auto-merge when you open the PR: `gh pr merge <n> --auto --merge`. GitHub merges it once every required check passes.
  - A PR that depends on a decision the user hasn't made yet is opened as a draft (`--draft`) with the `awaiting-user` label, without auto-merge, until team-lead confirms the answer.
  - Authors run the gates that fit their change before asking for review (the sweep and stage specs for render work, paired balance runs for sim work, a clip of the whole path for motion) and paste the output into the PR. Once review starts, push only after a verdict, unless the reviewer asks. Reviewers put every nit in the first review.
  - `scripts/ci-pr.sh <pr>` tests the PR merged into its base and posts a Local CI comment. `npm run ci` runs the same checks in any worktree.
  - Branch protection requires, on the PR's current head: the GitHub checks, `local-ci` (posted by `scripts/ci-pr.sh`), and `review` (posted by the reviewer's verdict).
  - The reviewer posts each verdict with `scripts/review-verdict.sh`. It writes the PR review and sets the `review` status on the head. A verdict judged from the code alone says so; visual PRs are judged from a screenshot, and motion from a clip.
  - When a new head only merges `main` into an already passed PR, `scripts/review-carry.sh` (run by ci-pr) carries the pass forward. Any other change needs a fresh verdict.
  - team-lead approves by posting the verdict on lead and integrator PRs, and settles disagreements.
  - Merges are merge commits (never squash). Conflicts are resolved on the PR branch by merging `main` into it.
  - Small integrator-only changes (main.js, tooling, CI) go through a PR from an `integ/<topic>` branch as well.
  - If PRs start costing real velocity, tell team-lead rather than bypassing them.
  - Never push to a PR's branch after it merges: those commits never reach `main`. Check `gh pr view <n> --json state` before pushing a follow-up, and put post-merge work on a fresh branch from `origin/main` with its own PR.
- Dependabot PRs (author `dependabot[bot]`) are never in `scripts/ci-trusted`: local CI would run the new packages' install scripts. The reviewer reads the diff and the changelogs first (`gh pr diff <n>`, with no install) and posts the verdict. Then they run `scripts/ci-pr.sh <n> --allow-bot --head <sha>` and turn on auto-merge. `--allow-bot` refuses any PR that isn't a same-repo Dependabot PR with only Dependabot's commits, that changes anything other than `package.json`, `package-lock.json` or `.github/workflows/`, or whose head has no review pass.
- The repo is public. Never fetch, install, build, run or open the code of a PR from a fork or an author outside `scripts/ci-trusted`: check `gh pr view <n> --json isCrossRepository,author` first. Report such PRs to team-lead instead. `scripts/ci-pr.sh` enforces this for local CI.
- PR descriptions and comments never contain local paths (`/home/...`, `/tmp/...`, scratchpad paths). Evidence media goes on the PR through `scripts/pr-media.sh <pr> <files>`, which stores it on the `pr-media` branch and posts markdown that renders on GitHub.
- Commits and PR titles follow Conventional Commits: `type(scope): summary`, imperative, lower case after the colon, no trailing period.
  - Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`.
  - Scopes: `sim`, `art`, `ui`, `audio`, `integ`, `contract`, `pacing`, `capture`, `docs`, or a feature name.
  - Breaking contract changes add `!` (`feat(contract)!: ...`).
  - No `@name` in commit subjects or bodies (write `officebot`, not `@officebot`): release notes turn them into GitHub mentions that can ping real accounts.
  - Merges to `main` cut releases automatically (semantic-release, 0.x while pre-alpha), and each release deploys to GitHub Pages, so the commit type decides the version bump: `feat` bumps minor, `fix` and `perf` bump patch.
- PR descriptions follow `.github/pull_request_template.md`.
- Commits and PRs carry no Claude attribution: no Co-Authored-By or session lines (`.claude/settings.json` sets both empty).
- Gate every commit and push on the test command's exit code (`npm run test:fast && git commit ...`, or `set -e`), never on grepping its output. A pass means exit 0. Use the full `npm test` (which adds the several-minute balance run) only when the change touches `src/sim/`, `src/data/`, `src/save/`, `tests/sim/` or `scripts/balance.js`; local CI runs everything on the PR regardless.
- Evidence before claims: when reporting a task done, include the commit hash, the test output, and screenshot paths for visual work.
