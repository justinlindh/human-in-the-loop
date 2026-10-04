// pose.mjs --scene's sampling pass, run in a harness page (page.evaluate) and on the studio engine
// (scripts/studio/page-host.mjs). Playwright sends it to a page as source, so it may use nothing from
// this module's scope: everything comes from window or a dynamic import by site path.
//
// Turn to the requested view (a delta from the camera's current step, which is always 0 on the fresh
// page each request gets), warm up, reseed and sample every requested frame.
export const scenePage = async (o) => {
  const R = window.__hitlRender, S = window.__HITL.state;
  // The visibility probes raycast every person every frame; a tree per mesh makes that cheap and
  // finds the same hits. --slow-raycast keeps three.js's own raycast.
  await window.__fastRaycast({ install: !o.slowRaycast });
  const M = await import('/blender/checks/pose-scene.js');
  const wanted = ((o.view % 4) + 4) % 4, have = ((R.yawStep ?? 0) % 4 + 4) % 4;
  for (let i = 0, n = (wanted - have + 4) % 4; i < n; i++) R.rotateView(1);
  const initialization = window.__drawAudit();
  const warmStart = window.__wallNow();
  // A real draw allocates lazy Three.js resources whose UUIDs draw from the seeded stream, so
  // --render-reference (the only mode that samples by drawing every frame, for comparison) keeps
  // its warmup draw; the default, no-draw mode never draws at all. Either way, reseeding right
  // after puts both on the same stream from here on, so which one drew during warmup can't move a
  // later actor choice. __settle only draws on its last frame, so --warm 0 gives --render-reference
  // zero warmup draws too, pushing its own first draw past the reseed and into the sampled frames.
  (o.renderReference ? window.__settle : window.__sample)(o.warm);
  window.__reseedGame();
  const warmMs = window.__wallNow() - warmStart;
  const warmed = window.__drawAudit();
  const skipDraw = !o.renderReference;
  const sampleStart = window.__wallNow();
  // Async, so a patch can import the sim and play weeks (await sim.tick) before the frames start.
  if (o.patchJs) await new (Object.getPrototypeOf(async () => {}).constructor)('S', 'R', o.patchJs)(S, R);
  if (o.events) R.handleEvents([].concat(o.events), S);
  const out = [];
  let at = 0;
  for (const f of o.frames) {
    (skipDraw ? window.__sample : window.__step)(Math.max(0, f - at)); at = f;
    for (const r of window.__tool(() => M.measureScene(R, S, { who: o.who, cover: o.cover }))) out.push({ frame: f, ...r });
  }
  const sampleMs = window.__wallNow() - sampleStart;
  const total = window.__drawAudit();
  return { rows: out, profile: { initialization, warmupDraws: warmed.total - initialization.total, sampleDraws: total.total - warmed.total, total, warmMs, sampleMs, samplingMode: skipDraw ? 'no-draw' : 'rendered' } };
};

// A staged printer jam played through its resolution, with a camera ease and a chat emote: the rows
// must carry held-prop measures, more than one beat of the printer moment, emotes and a moving camera.
export const printerControl = async ({ frames }) => {
  const R = window.__hitlRender, S = window.__HITL.state;
  await window.__fastRaycast();
  const M = await import('/blender/checks/pose-scene.js');
  window.__sample(30);
  window.__reseedGame();
  S.pendingDecision = { eventId: 'printer_jam', subjectId: 's1', stage: { prop: 'printer_jammed', anchor: 'kitchen', x: 1, y: 1 } };
  R.handleEvents([{ type: 'chat', fromId: 's4', text: 'Pose emote lifetime' }], S);
  const rows = [], cameras = [];
  let at = 0;
  for (const frame of frames) {
    while (at < frame) {
      if (at === 30) {
        S.pendingDecision = null;
        S.office.props = [...(S.office.props ?? []), { id: 'stage_wreck', prop: 'printer_wrecked', x: 1, y: 1, since: S.week, until: { weeks: 4 } }];
        R.handleEvents([{ type: 'decisionResolved', eventId: 'printer_jam', choice: 0, subjectId: 's1' }], S);
      }
      if (at === 6) R.easeTo(0, 0, 1.2, 2);
      window.__sample(1);
      at++;
    }
    rows.push(...window.__tool(() => M.measureScene(R, S)).map((row) => ({ frame, ...row })));
    cameras.push(R.camera.matrixWorld.toArray());
  }
  return { rows, cameras };
};

// A control for faceVisible: from a close camera on someone whose face it sees, a box moved in front of
// the face must hide it, name itself as the occluder, and give the face back once moved away. No frame
// steps between the reads, so each one must come from the live scene.
export const blockerControl = async () => {
  const R = window.__hitlRender, S = window.__HITL.state;
  await window.__fastRaycast();
  const M = await import('/blender/checks/pose-scene.js');
  window.__sample(30);
  return window.__tool(() => {
    const T = R.THREE;
    let clear, eye, forward, selected;
    // Someone may stand behind furniture even from close up: take the first face the camera sees.
    for (const id of S.staff.map((p) => p.id)) {
      const p = R.probe(id);
      if (!p) continue;
      eye = new T.Vector3().fromArray(p.eyes); forward = new T.Vector3().fromArray(p.forward).normalize();
      R.camera.position.copy(eye).addScaledVector(forward, 0.7);
      R.camera.lookAt(eye); R.camera.updateMatrixWorld();
      clear = M.measureScene(R, S, { who: [id] })[0];
      if (clear?.faceVisible > 0) { selected = id; break; }
    }
    if (!selected) return { selected: null };
    const mask = new T.Mesh(new T.BoxGeometry(20, 20, 0.1), new T.MeshBasicMaterial());
    mask.userData.propId = 'pose-test-mask';
    mask.position.copy(eye).addScaledVector(forward, 0.2); mask.quaternion.copy(R.camera.quaternion);
    const read = () => M.measureScene(R, S, { who: [selected] })[0];
    R.scene.add(mask); const blocked = read();
    mask.position.x += 100; const restored = read();
    mask.removeFromParent(); mask.geometry.dispose(); mask.material.dispose();
    return { selected, clear, blocked, restored };
  });
};
