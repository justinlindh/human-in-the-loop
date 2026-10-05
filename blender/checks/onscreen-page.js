// onscreen.mjs's sampling pass. It runs in a harness page (the game's own loop and UI) or, with o.engine, on the
// studio engine (scripts/studio/page-host.mjs: the scene stepped by the renderer alone, no UI and no game loop).
// Both send it as source, so it may use nothing from this module's scope.
//
// o: { warm, patchJs, events, speed, frames, engine } -> one record per frame (see onscreen.mjs). On the engine
// there are no panels, no title screen, and no game clock: `speed` and `frozen` read null and `paused` reads true (the
// page's clock sits at 0 unless --speed sets it, which the engine run refuses).
export const onscreenShots = async (o) => {
  const R = window.__hitlRender, G = window.__HITL, THREE = R.THREE;
  // A loaded snapshot announces its open decision, as the game does after continueGame (the engine does not).
  if (o.engine && o.loaded && G.state.pendingDecision) R.handleEvents([{ type: 'decision' }], G.state);
  window.__settle(o.warm);
  if (o.patchJs) new Function('S', 'R', o.patchJs)(G.state, R);
  if (o.events) R.handleEvents([].concat(o.events), G.state);
  const canvas = document.querySelector('canvas');
  const cr = canvas.getBoundingClientRect();
  const toCanvas = (v) => { const p = v.clone().project(R.camera); return { x: ((p.x + 1) / 2) * cr.width, y: ((1 - p.y) / 2) * cr.height, z: p.z }; };
  const boxOf = (obj) => {
    const b = new THREE.Box3().setFromObject(obj);
    if (b.isEmpty()) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (let i = 0; i < 8; i++) {
      const s = toCanvas(new THREE.Vector3(i & 1 ? b.max.x : b.min.x, i & 2 ? b.max.y : b.min.y, i & 4 ? b.max.z : b.min.z));
      x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
    }
    const on = x1 > 0 && y1 > 0 && x0 < cr.width && y0 < cr.height;
    return { on, rect: [x0, y0, x1 - x0, y1 - y0].map((v) => Math.round(v)) };
  };
  if (o.speed != null) G.setSpeed(o.speed);
  const render = R.render;
  const play = (n) => {
    if (o.engine) { window.__step(n); R.scene.updateMatrixWorld(true); return; }
    R.render = (dt, opt) => render.call(R, dt, { ...opt, draw: false });
    try {
      for (let i = 0; i < n; i++) { window.__tick(1000 / 30); for (const cb of window.__rafQ.splice(0)) cb(performance.now()); }
    } finally { R.render = render; }
  };
  const out = [];
  let at = 0;
  for (const f of o.frames) {
    play(Math.max(0, f - at)); at = f;
    const S = G.state, clock = G.clock ?? {};
    const dir = R.camera.getWorldDirection(new THREE.Vector3());
    const props = (R.props?.current() ?? []).map((p) => ({ prop: p.prop, ...boxOf(p.obj) })).filter((p) => p.on);
    const people = [];
    R.scene.traverse((c) => { if (c.name === 'character' && c.visible) { let id = null; c.traverse((x) => { if (x.userData.staffId !== undefined) id = x.userData.staffId; }); const b = boxOf(c); if (b?.on) people.push({ id: id ?? 'extra', rect: b.rect }); } });
    const sp = R.spotlight?.();
    out.push({
      frame: f,
      title: o.engine ? false : !!document.querySelector('#ui .title-mode'),
      clock: { week: S.week, speed: clock.speed ?? null, paused: !!R.paused || clock.speed === 0 || !!o.engine, frozen: clock.frozen ?? null, spotlight: sp ? `${sp.kind}${sp.key ? ` ${sp.key}` : ''}` : null },
      decision: S.pendingDecision ? { eventId: S.pendingDecision.eventId, subjectId: S.pendingDecision.subjectId ?? null, stage: S.pendingDecision.stage ? `${S.pendingDecision.stage.prop} at ${S.pendingDecision.stage.anchor}${S.pendingDecision.stage.staffId ? ` (${S.pendingDecision.stage.staffId})` : ''}` : null } : null,
      panels: o.engine ? [] : window.__listPanels(true),
      camera: { pos: R.camera.position.toArray().map((v) => +v.toFixed(2)), yawDeg: Math.round((Math.atan2(-dir.x, -dir.z) * 180) / Math.PI), zoom: +R.camera.zoom.toFixed(2) },
      props, people,
    });
  }
  return out;
};
