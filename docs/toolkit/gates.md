---
tool: `npm run gates -- [--moment <name>] [--only test,clip,stage,sweep] [--keep]`
section: pr
covers: scripts/gates.sh
---
Quick gates while you iterate: a snapshot of your working tree (HEAD plus uncommitted and untracked changes) in a throwaway worktree, with test:fast, clip, stage and the sweep running there side by side on GPU slots, so later edits can't leak into the run. `--moment printer` narrows clip (`--only`, where clip.mjs has it), stage (`--only=printer`) and the sweep (that moment's indexed decision only). Logs go to `~/.cache/hitl-ci/gates/<time>/`.
