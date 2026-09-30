---
tool: `scripts/lib/boot.js`
section: ci
who: all
covers: scripts/lib/boot.js scripts/lib/boot.test.mjs
---
`waitForBoot(page, { timeout })` waits for `window.__HITL_READY` and throws `the game failed to boot: <message>` when `window.__HITL_BOOT_ERROR` is set. `src/main.js` sets the ready flag even when boot throws, so a waiter never hangs to its timeout, and records the error there. snap, lifecycle, soak, pace-browser, drive and the perf bench use it; a new launcher should too, instead of waiting on `__HITL_READY` alone.
