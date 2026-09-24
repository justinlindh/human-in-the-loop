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
| team-lead | coordination | `/home/justin/src/gamedev` | talks to the user; the plan, spec, contract, and this file; approves merges; writes no code |
| integrator | integration | `/home/justin/src/gamedev` (branch `feat/one-shot`) | `main.js`, `src/pacing.js`, `src/dev/`, `scripts/snap.js`, `scripts/pace.js`, `index.html`, `package.json`, `vite.config.js`, CI, merges approved PRs into `feat/one-shot` |
| sim | simulation | `/home/justin/src/gamedev-sim` | `src/sim/`, `src/data/`, `src/save/`, `tests/`, `scripts/balance.js` |
| art | render and art | `/home/justin/src/gamedev-art` | `src/render/`, `blender/`, `public/models/` |
| ui | UI and audio | `/home/justin/src/gamedev-ui` | `src/ui/`, `src/audio/` |
| reviewer | review and playtest | any (read-only) | nothing |

- Talk directly: sim and ui about state and action semantics, reason strings, and new events; sim and art about moods, assignments, and event timing; art and ui about palette, fonts, label stacking, and character clicks.
- Go through team-lead for contract changes, disagreements between lanes, and blockers. Integration problems (main.js, merges, the snap and pacing tools) go to integrator.
- Read other worktrees for reference; never edit them. Send short messages and keep working; do not idle waiting for replies.
- Team mailbox messages only arrive between turns. After each task: send your report to team-lead, then end your turn. team-lead replies with cross-lane news and the go-ahead for the next task.

## Rules

- `src/sim/` is pure and deterministic: no `three`, no DOM, no `localStorage`, no `Math.random` or `Date.now`. Randomness goes through `src/sim/rng.js` with its state in game state.
- Render and UI never mutate game state. UI changes state only through `dispatch(state, action)`.
- Every tunable number lives in `src/sim/balance.js`.
- Keep a path open to touch and low-end devices (issue #8): nothing hover-only or keyboard-only in new UI, and new render features must degrade under the Low quality setting.
- Stay in your lane's paths (see the plan's lane table). Need something elsewhere: message its owner. Need a contract change: message the lead.
- Game text says "company" or "lab", never "startup", except inside a parody joke.
- No em dash characters anywhere (files, commits, messages); a hook blocks them. Do not type the escape sequence for U+2014 either: the hook decodes it.
- Comments describe what non-obvious code does now. No history, dates, or measurements in source.
- Commit on your lane branch in your worktree. Never commit to `main`.
- Changes reach `feat/one-shot` only through pull requests (`gh pr create --base feat/one-shot --head lane/<lane>`), one per batch:
  - The description lists the task, the commits, the evidence (test output, screenshots or clips) and `Fixes #n` lines.
  - CI runs on the PR.
  - The reviewer posts findings as a PR review (`gh pr review`).
  - team-lead approves.
  - The integrator merges with a merge commit (never squash) and resolves cross-lane conflicts on the PR.
  - Small integrator-only changes (main.js, tooling, CI) go through a PR from an `integ/<topic>` branch as well.
  - If PRs start costing real velocity, tell team-lead rather than bypassing them.
- Evidence before claims: when reporting a task done, include the commit hash, the test output, and screenshot paths for visual work.
