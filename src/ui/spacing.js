// Keeps pausing popups apart: after one closes, the next non-urgent one (launch results, unlock
// and milestone cards) waits for GAP_MS of unpaused play. Decisions come from the sim, which spaces
// them itself; they count as pausing popups here, so a card never lands right after one.
// Play time only runs while the game is running, so a paused player never finds a queue waiting.
export const GAP_MS = 30000;

export function createSpacing({ gap = GAP_MS } = {}) {
  let playMs = 0;
  let lastClose = -Infinity; // playMs when the last pausing popup closed
  let wasOpen = false;
  let first = true; // the game's very first popup is never held

  return {
    // Once a frame: how long the frame was, whether the game ran, and whether a pausing popup is up.
    tick(dtMs, running, anyOpen) {
      if (running && !anyOpen) playMs += dtMs;
      if (wasOpen && !anyOpen) lastClose = playMs;
      if (anyOpen) first = false;
      wasOpen = anyOpen;
    },
    // True when a non-urgent popup may open now.
    // Never on a frame that still had a popup up: the close is only counted on the next tick.
    ready() { return !wasOpen && (first || playMs - lastClose >= gap); },
    // Seconds of play still to wait (for debugging and tests).
    get waitMs() { return first ? 0 : Math.max(0, gap - (playMs - lastClose)); },
    get playMs() { return playMs; },
    reset() { playMs = 0; lastClose = -Infinity; wasOpen = false; first = true; },
  };
}
