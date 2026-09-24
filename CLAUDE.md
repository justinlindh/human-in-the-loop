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
- Read other worktrees for reference; never edit them. Send short messages and keep working; do not idle waiting for replies.
- Team mailbox messages only arrive between turns. After each task, end your turn with your report as your final message: team-lead receives it automatically when your turn ends. Don't also send the same report with SendMessage, or it arrives twice. Use SendMessage for things that can't wait for the end of your turn, and for messages to other teammates. If a turn produced nothing new (for example, you only acknowledged a message), end it with one short line. team-lead replies with cross-lane news and the go-ahead for the next task.
- Before a report or an action that depends on a PR's state, check it live (`scripts/pr-status.sh`, or `gh pr view <n>`). Messages cross, so an instruction or a status you received may already be out of date. Report only what changed since your last report: new PRs, new results, and decisions you need.

## Rules

- `src/sim/` is pure and deterministic: no `three`, no DOM, no `localStorage`, no `Math.random` or `Date.now`. Randomness goes through `src/sim/rng.js` with its state in game state.
- Render and UI never mutate game state. UI changes state only through `dispatch(state, action)`.
- Every tunable number lives in `src/sim/balance.js`.
- Keep a path open to touch and low-end devices (issue #8): nothing hover-only or keyboard-only in new UI, and new render features must degrade under the Low quality setting.
- Stay in your lane's paths (see the plan's lane table). Need something elsewhere: message its owner. Need a contract change: message the lead.
- Game text says "company" or "lab", never "startup", except inside a parody joke.
- No em dash characters anywhere (files, commits, messages); a hook blocks them. Do not type the escape sequence for U+2014 either: the hook decodes it.
- Comments describe what non-obvious code does now. No history, dates, or measurements in source.
- Commit on a topic branch in your worktree. Never commit to `main`.
- Changes reach `main` only through pull requests, one per batch, each from a fresh branch named `<lane>/<topic>` cut from `origin/main` (`gh pr create --base main --head <lane>/<topic>`). The pre-push hook (`npm run hooks` installs it) refuses pushes to a branch whose PR has merged or closed.
  - The description lists the task, the commits, the evidence (test output, screenshots or clips) and `Fixes #n` lines. A visual change always has a screenshot, and a change to motion or timing has a clip.
  - Turn on auto-merge when you open the PR: `gh pr merge <n> --auto --merge`. GitHub merges it once every required check passes.
  - `scripts/ci-pr.sh <pr>` tests the PR merged into its base and posts a Local CI comment. `npm run ci` runs the same checks in any worktree.
  - Branch protection requires, on the PR's current head: the GitHub checks, `local-ci` (posted by `scripts/ci-pr.sh`), and `review` (posted by the reviewer's verdict).
  - The reviewer posts each verdict with `scripts/review-verdict.sh`. It writes the PR review and sets the `review` status on the head. A verdict judged from the code alone says so; visual PRs are judged from a screenshot, and motion from a clip.
  - When a new head only merges `main` into an already passed PR, `scripts/review-carry.sh` (run by ci-pr) carries the pass forward. Any other change needs a fresh verdict.
  - team-lead approves by posting the verdict on lead and integrator PRs, and settles disagreements.
  - Merges are merge commits (never squash). Conflicts are resolved on the PR branch by merging `main` into it.
  - Small integrator-only changes (main.js, tooling, CI) go through a PR from an `integ/<topic>` branch as well.
  - If PRs start costing real velocity, tell team-lead rather than bypassing them.
  - Never push to a PR's branch after it merges: those commits never reach `main`. Check `gh pr view <n> --json state` before pushing a follow-up, and put post-merge work on a fresh branch from `origin/main` with its own PR.
- PR descriptions and comments never contain local paths (`/home/...`, `/tmp/...`, scratchpad paths). Evidence media goes on the PR through `scripts/pr-media.sh <pr> <files>`, which stores it on the `pr-media` branch and posts markdown that renders on GitHub.
- Commits and PR titles follow Conventional Commits: `type(scope): summary`, imperative, lower case after the colon, no trailing period.
  - Types: `feat`, `fix`, `perf`, `refactor`, `test`, `docs`, `build`, `ci`, `chore`, `style`, `revert`.
  - Scopes: `sim`, `art`, `ui`, `audio`, `integ`, `contract`, `pacing`, `capture`, `docs`, or a feature name.
  - Breaking contract changes add `!` (`feat(contract)!: ...`).
  - No `@name` in commit subjects or bodies (write `officebot`, not `@officebot`): release notes turn them into GitHub mentions that can ping real accounts.
  - Merges to `main` cut releases automatically (semantic-release, 0.x while pre-alpha), and each release deploys to GitHub Pages, so the commit type decides the version bump: `feat` bumps minor, `fix` and `perf` bump patch.
- PR descriptions follow `.github/pull_request_template.md`.
- Commits and PRs carry no Claude attribution: no Co-Authored-By or session lines (`.claude/settings.json` sets both empty).
- Gate every commit and push on the test command's exit code (`npm test && git commit ...`, or `set -e`), never on grepping its output. A pass means exit 0.
- Evidence before claims: when reporting a task done, include the commit hash, the test output, and screenshot paths for visual work.
