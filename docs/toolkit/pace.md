---
tool: `node scripts/pace.js ...`
section: sim
who: sim, integrator
covers: scripts/pace.js
---
Plays the real sim through the pacer with a simulated player and reports what a person would see, and when, in real time.

Reports `spotlight.count`, `skipped`, `byKind`, and `addedSeconds`/`addedMinutes` in JSON, plus a summary line. These are presentation estimates from the render lane's `src/render/spotlight-kinds.js`, not browser measurements: travel, absent actors, manual skips and player camera input are not simulated. Only spotlight time outside decisions and menus counts as added time. At 4x scenes are counted as skipped. `--no-spotlights` removes modelled holds for comparison; `--weeks 1040 --seed 1 --speed 1` models a full run.
