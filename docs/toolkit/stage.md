---
tool: `blender/checks/stage.mjs [--only=letter,fumes] [--jobs=N]`
section: render
covers: blender/checks/stage.mjs
---
The staging probe (#350): does each character moment read on screen? Plays every moment from the default camera and a turned view, samples `R.probe(id)` every frame, splits the samples by beat and holds each beat to its readability spec. Prints a per-beat table (check, view, beat, metric, value, want) and writes `shots/stage/report.json`. A moment this build doesn't play is skipped. It fails any role a moment stages (a staff role or a visitor) that no spec covers, so an actor nobody wrote a rule for cannot pass unchecked. A rule marked `known: <issue>` fails as KNOWN without failing the run while that issue is open (checked with `gh` once per run, and part of the check cache's key; unreachable counts as open), fails the run again once the issue is closed, and says so when it passes again. Local CI runs it on a GPU slot for PRs that touch `src/render/`, `public/models/` or the staging check and its helpers. See "Writing a readability spec" below.
