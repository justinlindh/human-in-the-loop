---
tool: `scripts/with-render-lock.sh`, `scripts/render-lock-held.sh`
section: ci
who: all
covers: scripts/with-render-lock.sh scripts/render-lock-held.sh
---
`with-render-lock.sh --gpu <cmd>` takes one of `HITL_GPU_SLOTS` GPU slots (lifecycle, soak, snap, clip, standup, scene, capture and the trailer run here); `--software <cmd>` (the default mode) takes the single software-GL lock (golden, and anything forced onto SwiftShader). Nested calls go straight through when a caller already holds a lock that covers them (`render-lock-held.sh`); the software lock covers both kinds.
