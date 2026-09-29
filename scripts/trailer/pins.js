// Saved game states the trailer's live beats start from, so a beat opens on the same company without
// replaying a bot game to find it. A pin is the game state just before the week that raises the beat's
// subject, stored gzipped under scripts/trailer/snapshots/ and loaded through the game's own save, as
// capture's `moment` items are. `node scripts/trailer/pin.mjs` writes them; `pins.json` records where
// each one came from.
export const PIN_DIR = 'scripts/trailer/snapshots';

// Page JS: loads the pinned state as a player would load a save, then presents the recent Yak history
// and closes any card the load left open, as the replay it stands in for did at its end.
export const LOAD_PIN = (name) => `(async () => {
  const res = await fetch('/${PIN_DIR}/${name}.snap');
  if (!res.ok) throw new Error('trailer: no pinned state ${name}');
  const state = JSON.parse(await new Response(res.body.pipeThrough(new DecompressionStream('gzip'))).text());
  const { saveGame } = await import('/src/save/save.js');
  if (!saveGame(state, localStorage)) throw new Error('trailer: could not save pinned state ${name}');
  const r = window.__HITL.controls.continueGame();
  if (!r.ok) throw new Error('trailer: the game refused pinned state ${name}: ' + (r.reason ?? ''));
  window.__HITL.setSpeed?.(1);
  window.__HITL.emit((window.__HITL.state.chatLog ?? []).slice(-15));
  for (let i = 0; i < 12 && window.__HITL.clock.busy; i++) dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }));
})()`;

// Page JS: hands the live state to the capture index, for pin.mjs to store.
export const DUMP_STATE = `(window.__captureMarks ??= []).push({ t: 0, label: 'state ' + JSON.stringify(window.__HITL.state) })`;
