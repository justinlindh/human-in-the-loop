// Cases for scripts/lib/boot.js: a page whose boot threw fails the wait with the boot error. Exit 0 when all pass.
import assert from 'node:assert/strict';
import { waitForBoot } from './boot.js';

// A fake page that evaluates the waiter's functions against a stand-in window.
const pageWith = (win) => ({
  waitForFunction: async (fn) => { globalThis.window = win; assert.ok(fn()); },
  evaluate: async (fn) => { globalThis.window = win; return fn(); },
});
let fails = 0;
for (const [name, fn] of [
  ['a booted page passes', async () => { await waitForBoot(pageWith({ __HITL_READY: true })); }],
  ['a failed boot rejects with its message', async () => {
    await assert.rejects(waitForBoot(pageWith({ __HITL_READY: true, __HITL_BOOT_ERROR: 'renderer exploded' })), /failed to boot: renderer exploded/);
  }],
  ['a page that never becomes ready still times out in the page wait', async () => {
    const page = { waitForFunction: async () => { throw new Error('Timeout 5ms exceeded'); }, evaluate: async () => null };
    await assert.rejects(waitForBoot(page), /Timeout/);
  }],
]) {
  try { await fn(); } catch (e) { fails++; console.log(`FAIL ${name}: ${e.message}`); }
}
console.log(fails ? `boot: ${fails} failing` : 'boot: all cases pass');
process.exit(fails ? 1 : 0);
