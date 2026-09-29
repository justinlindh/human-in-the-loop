---
tool: `node scripts/scene-engine/scene.mjs --mock floor --from 0 --to 2 --every 0.2 --facts occupancy,projections --json`
section: render
who: tools, art, reviewer, video
covers: scripts/scene-engine/scene.mjs scripts/scene-engine/batch.mjs scripts/scene-engine/index.mjs scripts/scene-engine/worker.mjs scripts/scene-engine/runtime.mjs scripts/scene-engine/platform.mjs scripts/scene-engine/presentation.mjs scripts/scene-engine/loader.mjs scripts/scene-engine/instrument.mjs scripts/scene-engine/state.mjs scripts/scene-engine/model.mjs scripts/scene-engine/geometry.mjs scripts/scene-engine/provenance.mjs scripts/scene-engine/compare.mjs scripts/scene-engine/controls.mjs scripts/scene-engine/verify.mjs scripts/scene-engine/bench.mjs
---

Independent, experimental Node scene engine. Read [the design and frame contract](../proposals/scene-engine.md) before using its output. It runs the game's render update code with presentation adapters, local assets and an isolated worker. The engine path starts no Vite server, browser, GPU or render slot. Node must provide synchronous `registerHooks`.

Input is one of `--mock floor`, `--snapshot state.json.gz` (plain JSON also works), or `--seed 1 --week 112` using the balanced bot. Render time advances over a frozen input state from epoch zero. `--from`, `--to` and `--every` use seconds on 1/30-second boundaries. `--rig` enables authored clips at Low quality. `--who s1,s3` selects subjects. `--facts intersections,clearances,visibility,projections,occupancy` enables requested geometry facts. Standard output is NDJSON; `--profile file.json` writes timings separately. Exit 2 indicates invalid input or an unavailable operation.

Each record includes semantic owners, build-scoped part ids, transforms, conservative bounds, the real character joints, activity/target/held ids, the active camera, provenance and explicit capabilities. Check those capabilities before applying a rule. Exact general mesh depth, universal byte identity, per-instance export and multiple simultaneous views are not implemented. `depthM: null` must not count as zero. DOM bubble/label layout and cover remain browser checks.

For parallel states, `node scripts/scene-engine/batch.mjs --input requests.json --jobs 2` takes an array of library requests and emits frames in input order. Example: `[{"mock":"floor","frame":60,"facts":["occupancy"]},{"seed":1,"week":112,"frame":60}]`. The library exports `openScene` and `sampleMany` from `scripts/scene-engine/index.mjs`; library sample times are integer frames. Always close a scene in `finally`.

`controls.mjs --out controls.json` checks planted geometry cases. `verify.mjs` checks observer independence, worker isolation and API failures. `compare.mjs --mock floor --out parity.json` uses the existing browser harness with drawing disabled, records every field difference at tolerance 1e-5, and exits 1 on a mismatch. It takes the normal render lock. A snapshot path can replace `--mock`. `--control-perk-delay 3` is an explicitly modified in-memory diagnostic on both sides; it does not establish parity of unmodified production code. `--trace-random` captures call stacks for diagnosis and should not be used for timings.

`bench.mjs --runs 3 --frames 15 --out benchmark.json` compares native and browser queries, with separate setup, step, sample, round-trip and lock costs. Wrap long commands in `timeout` and `nice -n 10`. No existing gate or lane workflow switches to this prototype automatically; the role-brief changes are deferred to the migration described in the proposal.
