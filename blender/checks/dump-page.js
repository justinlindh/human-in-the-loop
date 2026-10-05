// dump.mjs's sampling pass, run on the studio engine (scripts/studio/page-host.mjs) or in a harness page:
// the same steps as the browser run, minus the screenshots. It may use nothing from this module's scope.
export const dumpPage = async (o) => {
  const R = window.__hitlRender, S = window.__HITL.state;
  if (o.trace && R.trace) R.trace.on = true;
  R.spotTrace = true;
  // The browser canvas has its pixel size; the engine's stands at the viewport the case was opened with.
  const canvas = document.querySelector('canvas');
  if (o.width && o.height) { canvas.width = o.width; canvas.height = o.height; }
  // Raycasts against per-mesh trees: the camera-turn probes are thousands of rays.
  await window.__fastRaycast();
  const dump = await import('/blender/checks/dump.js');
  await dump.prepare();
  // A loaded snapshot announces its open decision, as the browser run does after continueGame.
  if (o.loaded && S.pendingDecision) R.handleEvents([{ type: 'decision' }], S);
  // A seeded game is played to the week by the bot with the renderer following, as the browser run does.
  if (o.bot && !o.loaded) {
    const { botDecide, botTurn } = await import('/src/sim/bots.js');
    const { tick } = await import('/src/sim/index.js');
    const route = (e) => { if (e?.length) R.handleEvents(e.filter((x) => x.type !== 'chat'), S); };
    while (S.week < o.week && !S.gameOver) {
      botDecide(o.bot, S, { onEvents: route });
      botTurn(o.bot, S, { onEvents: route });
      route(tick(S));
      R.sync(S);
    }
  }
  // A browser run's draw brings every world matrix up to date; here nothing draws, so do it.
  const settle = () => R.scene.updateMatrixWorld(true);
  window.__step(o.warm);
  settle();
  if (o.patchJs) new Function('S', 'R', o.patchJs)(S, R);
  if (o.events) R.handleEvents([].concat(o.events), S);
  const frames = [];
  let at = 0, seen = -1;
  for (const f of o.frames) {
    window.__step(f - at);
    settle();
    at = f;
    const d = dump.dumpFrame(R, S, { views: o.views });
    if (R.trace?.on) { d.trace = R.trace.lines(600).filter((l) => l.seq > seen); if (d.trace.length) seen = d.trace[d.trace.length - 1].seq; }
    frames.push({ frame: f, t: +(f / 30).toFixed(3), ...d });
  }
  return frames;
};
