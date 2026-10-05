---
tool: `scripts/hooks/claude/lane-guard.sh`
section: hooks
who: all
covers: scripts/hooks/claude/lane-guard.sh scripts/hooks/claude/lanes.txt
---
Runs before each Edit or Write: the branch prefix (`<lane>/<topic>`) must own the file, per `scripts/hooks/claude/lanes.txt`; the shared checkout on `main` is team-lead's. A cross-lane edit the owner agreed to goes in `$(git rev-parse --git-dir)/hitl-lane-allow`, one path per line. Only the lanes owning the longest matching prefix may edit a path (`tests/tools/` beats `tests/`, so sim needs an exception for `tests/tools/`); the `*` line and the exception file allow a path outright. A refusal names every lane whose paths match the file, the longest prefix first, so the owner to ask is the first one listed.
