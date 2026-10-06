// Saved game states the trailer's live beats start from, so a beat opens on the same company without
// replaying a bot game to find it. A pin is the game state just before the week that raises the beat's
// subject, stored gzipped under scripts/trailer/snapshots/ and loaded through the game's own save, as
// capture's `moment` items are. `node scripts/trailer/pin.mjs` writes them; `pins.json` records where
// each one came from.
export const PIN_DIR = 'scripts/trailer/snapshots';

// Page JS: loads the pinned state as a player would load a save, then presents the recent Yak history
// and closes any card the load left open, as the replay it stands in for did at its end.
// `dir` is the snapshot directory under the repo root (a trailer with its own pins passes its own).
export const LOAD_PIN = (name, dir = PIN_DIR) => `(async () => {
  const res = await fetch('/${dir}/${name}.snap');
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

// Page JS for a pin's source game: plays it with the balanced bot until the next week would raise an event
// matching `match` (a JS predicate on e), checked on a copy of the state so the game stops the week before.
// Everyone is staged in the office each week, before the look-ahead, so the live week plays out as the copy did.
export const BEFORE_EVENT = (match, weeks = 1000) => `(async () => {
  const sim = await import('/src/sim/index.js');
  const b = await import('/src/sim/bots.js');
  const s = window.__HITL.state;
  const match = ${match};
  let found = false;
  for (let i = 0; i < ${weeks} && !s.gameOver; i++) {
    b.botDecide('balanced', s);
    b.botTurn('balanced', s);
    s.lockdown = null; s.workPolicy = 'office'; for (const p of s.staff) { p.remote = false; p.call = null; }
    const ahead = structuredClone(s);
    if ((sim.tick(ahead) ?? []).some((e) => match(e, ahead))) { found = true; break; }
    sim.tick(s);
  }
  if (!found) console.error('trailer: the seeded game never reached its event');
})()`;

// Page JS: hands the live state to the capture index, for pin.mjs to store.
export const DUMP_STATE = `(window.__captureMarks ??= []).push({ t: 0, label: 'state ' + JSON.stringify(window.__HITL.state) })`;
