---
tool: `scripts/nice10.sh <command...>` (behind `npm test`, `npm run test:fast`, `npm run test:balance` and `npm run ci`)
section: ci
who: all
covers: scripts/nice10.sh scripts/nice10.test.sh
---
Runs a command at nice 10 or lower priority, so a lane's test or CI run doesn't starve the others on the shared machine. A process already niced to 10 or beyond keeps its level, so wrapping twice never stacks. The pre-push gate runs `npm run test:fast`, so it goes through it too.

vitest's worker count is capped at 4 in `vite.config.js` (`HITL_TEST_WORKERS=<n>` changes it, `--maxWorkers=<n>` on the command line overrides both; local CI passes its own share of the cores).
