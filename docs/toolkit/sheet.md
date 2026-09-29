---
tool: `scripts/sheet.sh grid|pair|frames ...`
section: pr
covers: scripts/sheet.sh
---
Contact sheets, before-and-after pairs and frame strips sized for a PR comment.

`--crop x,y,w,h` (source pixels) crops every cell before scaling, for a small detail such as one face. `frames` takes `--from S --to S` to draw its K frames from a window of the clip, and refuses a window outside it.
