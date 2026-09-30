// Waits for the game's boot to finish. src/main.js sets window.__HITL_READY even when boot throws
// (so a waiter never hangs to its timeout) and records the failure in window.__HITL_BOOT_ERROR; this
// rejects with that message instead of letting the check crash later on a missing window.__HITL.
export async function waitForBoot(page, { timeout = 60000 } = {}) {
  await page.waitForFunction(() => window.__HITL_READY === true, null, { timeout });
  const err = await page.evaluate(() => window.__HITL_BOOT_ERROR || null);
  if (err) throw new Error(`the game failed to boot: ${err}`);
}
