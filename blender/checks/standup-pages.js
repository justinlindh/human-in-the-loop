// The standup check's page function, run by blender/checks/standup.mjs in a harness page and on the
// studio engine (scripts/studio/page-host.mjs). Playwright sends it to a page as source, so it may use
// nothing from this module's scope: everything comes from window or a dynamic import by site path.
export const standupPage = async ({ strip, weeks, speech, table, quality }) => {
  const R = window.__hitlRender, S = window.__HITL.state;
  if (speech) {
    const { checkStandupSpeech } = await import('/blender/checks/standup-speech.mjs');
    return checkStandupSpeech(R, S, speech);
  }
  const C = await import('/src/render/checks.js');
  if (weeks) {
    const sim = await import('/src/sim/index.js');
    const b = await import('/src/sim/bots.js');
    for (let i = 0; i < weeks && !S.gameOver; i++) { b.botDecide('balanced', S); b.botTurn('balanced', S); sim.tick(S); }
    b.botDecide('balanced', S);
    S.lockdown = null; S.workPolicy = 'office'; for (const p of S.staff) { p.remote = false; p.call = null; }
    R.setSpeed(1); R.setPaused(false);
  }
  R.perks.hold = true;
  const drop = strip === 'none' ? [] : strip === 'meeting' ? ['meeting_table'] : ['meeting_table', 'whiteboard', 'whiteboard_wall'];
  S.office.placed = S.office.placed.filter((p) => !drop.includes(p.itemId));
  for (let i = 0; i < 60; i++) { window.__tick(1000 / 30); R.sync(S); R.advance(1 / 30); }
  if (table) return C.runStandupTableCheck(R, S, { low: quality === 'low' });
  return C.runStandupCheck(R, S);
};
