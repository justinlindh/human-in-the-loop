---
tool: `scripts/trailer/vo/render.sh`, `scripts/trailer/vo/pick.py`
section: run
who: audio, integrator
covers: scripts/trailer/vo/render.sh scripts/trailer/vo/pick.py
---
The trailer's narration. `render.sh` renders takes of every line in the approved narrator voice (the voice-clone server on the GPU, always with the synthetic reference voice), and `pick.py` picks the best take of each line and masters it for the trailer. Each voice line is approved by the user before a build uses it.
