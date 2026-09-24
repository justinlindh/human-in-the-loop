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

## Rules

- `src/sim/` is pure and deterministic: no `three`, no DOM, no `localStorage`, no `Math.random` or `Date.now`. Randomness goes through `src/sim/rng.js` with its state in game state.
- Render and UI never mutate game state. UI changes state only through `dispatch(state, action)`.
- Every tunable number lives in `src/sim/balance.js`.
- Stay in your lane's paths (see the plan's lane table). Need something elsewhere: message its owner. Need a contract change: message the lead.
- Game text says "company" or "lab", never "startup", except inside a parody joke.
- No em dash characters anywhere (files, commits, messages); a hook blocks them. Do not type the escape sequence for U+2014 either: the hook decodes it.
- Comments describe what non-obvious code does now. No history, dates, or measurements in source.
- Commit on your lane branch in your worktree. Never commit to `main`. The lead merges into `feat/one-shot`.
- Evidence before claims: when reporting a task done, include the commit hash, the test output, and screenshot paths for visual work.
