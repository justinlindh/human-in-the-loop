---
tool: `scripts/hooks/claude/lane-guard.sh`
section: hooks
who: all
covers: scripts/hooks/claude/lane-guard.sh scripts/hooks/claude/lanes.txt
---
Runs before each Edit or Write: the branch prefix (`<lane>/<topic>`) must own the file, per `scripts/hooks/claude/lanes.txt`; the shared checkout on `main` is team-lead's. A cross-lane edit the owner agreed to goes in `$(git rev-parse --git-dir)/hitl-lane-allow`, one path per line. A refusal names every lane whose paths match the file, the longest matching prefix first (`tests/tools/` before `tests/`), so the owner to ask is the first one listed.
