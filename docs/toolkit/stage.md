---
tool: `blender/checks/stage.mjs [--only=letter,fumes] [--jobs=N]`
section: render
covers: blender/checks/stage.mjs
---
The staging probe (#350): does each character moment read on screen? Plays every moment from the default camera and a turned view, samples `R.probe(id)` every frame, splits the samples by beat and holds each beat to its readability spec. Prints a per-beat table (check, view, beat, metric, value, want) and writes `shots/stage/report.json`. A moment this build doesn't play is skipped. See "Writing a readability spec" below.
