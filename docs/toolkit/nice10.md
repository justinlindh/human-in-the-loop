---
tool: `scripts/nice10.sh <command...>` (behind `npm test`, `npm run test:fast`, `npm run test:balance` and `npm run ci`)
section: ci
who: all
covers: scripts/nice10.sh scripts/nice10.test.sh
---
Runs a command at nice 10 or lower priority, so a lane's test or CI run doesn't starve the others on the shared machine. A process already niced to 10 or beyond keeps its level, so wrapping twice never stacks. The pre-push gate runs `npm run test:fast`, so it goes through it too.

The machine runs a process manager (ananicy-cpp) that renices processes by name a moment after they start. Its default rules type `bash`, `chrome` and `chromium` as Doc-View (nice -4), `node` as BG_CPUIO (nice 16, idle I/O), and `ffmpeg` and `blender` as Heavy_CPU (nice 9), so a niced job's shells and browsers can end up above normal priority. While the command runs, a keeper loop puts every process in its tree that sits below nice 10 back at 10, every `HITL_NICE_KEEP` seconds (default 2; 0 turns it off and execs the command directly). Raising a nice value needs no privilege. The command runs as a child with its stdin, exit code and TERM passed through. A process that does its work in its first seconds is not covered, and processes that leave the tree (a daemonized browser) are not either. `heavy.sh`, `auto-ci.sh` (CI runs and installs) and `main-guard.sh` (sweep, golden, prewarm, installs) all go through it.

vitest's worker count is capped at 4 in `vite.config.js` (`HITL_TEST_WORKERS=<n>` changes it, `--maxWorkers=<n>` on the command line overrides both; local CI passes its own share of the cores).

It also moves `TMPDIR` to disk (`~/.cache/hitl-ci/tmp`, or `HITL_TMPDIR`) when the caller has none or it is `/tmp`. vitest creates a module-cache directory of tens of megabytes named by 21 random characters in the temp directory on every run and never removes it when the run is killed; `/tmp` is RAM here, so these filled it. The wrapper clears such directories on disk once they are two hours old.

The same move is `scripts/lib/tmpdir.sh`, sourced at the top of `ci-pr.sh`, `ci-local.sh`, `auto-ci.sh`, `main-guard.sh` and the pre-push hook, and set as `Environment=TMPDIR=` in the auto-ci, main-guard and dashboard units. Everything those start (`mktemp`, Node's `os.tmpdir()`, vitest, Chromium) then works under `~/.cache/hitl-ci/tmp` instead of the RAM-backed `/tmp`. A `TMPDIR` the caller chose is kept; `HITL_TMPDIR` picks another place. A lane shell that exports `TMPDIR=$HOME/.cache/hitl-ci/tmp` gets the same for every command it runs.
