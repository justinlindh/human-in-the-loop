// One stage scenario in one view (stage.mjs): plays the moment and samples the staging probe for its
// actors every frame. It runs wherever the page globals are: a harness page (stage.mjs --browser), or the
// studio engine in Node (scripts/studio/stage-host.mjs), which gives it the same window.__hitlRender,
// __HITL, __step, __tool and __fastRaycast.
//
// No static imports: a module that makes three.js objects when it loads takes UUIDs from Math.random, so
// what loads, and when, stays as the scenario says.
export async function playStage({ moment, patch, steps, setup, seconds, turns, arrive, arriveSeconds, beatSeconds, robotActor }) {
  const R = window.__hitlRender, S = window.__HITL.state;
  const THREE = R.THREE;
  // The probe raycasts every actor every frame; a tree per mesh makes that cheap (harness.mjs).
  await window.__fastRaycast();
  // The held-prop module allocates three.js objects, so loading it affects the seeded scene.
  const measureHeld = moment === 'hammer' ? (await import('/blender/checks/pose-scene.js')).measureHeld : null;
  if (!R.moments?.kinds?.includes(moment)) return { skip: `the ${moment} moment is not in this build` };
  R.perks.hold = true;
  R.moments.full = true;
  R.spotTrace = true;
  // The specs hold staging to the default and the turned view, so the moment camera stays put.
  window.dispatchEvent(new CustomEvent('hitl:cameraSettings', { detail: { momentCamera: false } }));
  for (let i = 0; i < turns; i++) { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' })); window.dispatchEvent(new KeyboardEvent('keyup', { key: 'e' })); }
  window.__step(90);
  Object.assign(S, JSON.parse(JSON.stringify(patch)));
  if (setup) await new Function('R', 'S', `return (async () => { ${setup}; })()`)(R, S);
  const robotContact = moment === 'robot' ? (await import('/blender/checks/robot-contact.js')).robotContact : null;
  const petProbe = moment === 'pet' || moment === 'robot' ? (await import('/src/render/probe.js')).createProbe({ scene: R.scene, camera: R.camera, office: R.office }) : null;
  const samples = [];
  // Everyone the moment takes part, each sampled every frame until the moment is over for all.
  const actors = new Set();
  // A scenario with `arrive` scores a fixed beatSeconds window starting once that role reaches
  // its beat, rather than over the whole run: how long the walk there takes must not change how
  // much of the beat gets scored. arriveSeconds bounds the wait; past it, nobody arrived.
  // A role's beat can read as the arrival beat before it starts walking (staged, but not yet
  // sent off): only count arriving once that role has actually been seen walking first.
  let arrivedAt = null, sawWalk = false;
  const cap = arrive ? (arriveSeconds + beatSeconds) * 30 : seconds * 30;
  let f = 0;
  for (; f < cap; f++) {
    for (const st of steps ?? []) if (st.at === f) new Function('S', 'R', st.js)(S, R);
    window.__step(1);
    for (const [id, m] of R.moments.active) if (m === moment) actors.add(id);
    // The moment's own actors (visitors) are staged too.
    for (const e of R.moments.extras?.() ?? []) if (e.stage.moment === moment) actors.add(e.id);
    let live = 0;
    for (const actor of actors) {
      const m = R.probe(actor);
      if (!m?.moment) continue;
      live++;
      // Held prop against the hands and the head, for the hold rules.
      const st = R.moments.staging(actor);
      if (moment === 'hammer' && R.moments.hammer?.phase !== 'fetch') {
        Object.assign(m, measureHeld(R, actor, undefined, undefined, m));
        if (R.moments.hammer?.phase === 'carry') m.beat = 'carry';
      }
      if (m.held) {
        const c = new THREE.Box3().setFromObject(st.held).getCenter(new THREE.Vector3());
        m.heldHand = Math.min(...m.hands.map((h) => Math.hypot(h[0] - c.x, h[1] - c.y, h[2] - c.z)));
        m.heldAbove = c.y - (m.headY + 0.3);
        m.heldDrop = m.headY - c.y;
      }
      if (moment === 'pet') {
        const pet = R.pets.peek().find(p => p.petter === actor);
        let root = null, petRoot = null, head = null;
        R.scene.traverse(o => { if (o.userData.staffId === actor) root = o.parent; if (o.name === 'pet') petRoot = o; });
        root?.traverse(o => { if (o.userData.part === 'head') head = o; });
        m.petHeadVisible = head ? petProbe.seen(head)[0].visible : 0;
        m.petVisible = petRoot ? petProbe.seen(petRoot)[0].visible : 0;
        m.petContact = pet?.contact ? Math.hypot(...m.hands[1].map((v, i) => v - pet.contact[i])) : Infinity;
      }
      if (moment === 'robot' && R.robot?.root) {
        m.robotVisible = petProbe.seen(R.robot.root)[0].visible;
        m.robotContact = robotContact(R.robot.root, m.hands[1]);
      }
      samples.push({ t: f / 30, actor, role: st?.role ?? null, ...m });
      if (arrive && st?.role === arrive.role) {
        if (arrivedAt === null && sawWalk && m.beat === arrive.beat) arrivedAt = f;
        if (m.beat === 'walk') sawWalk = true;
      }
    }
    // The robot as the actor (a party it joins): its post is its beat once it has turned to face
    // the way it will; the way there and the turn are 'walk'.
    const rp = robotActor && R.robot?.peek();
    if (rp?.party && R.robot.root) {
      live++;
      const root = R.robot.root, at = root.getWorldPosition(new THREE.Vector3());
      const fwd = { x: Math.sin(rp.yaw), z: Math.cos(rp.yaw) };
      const deg = (x, z) => { const l = Math.hypot(x, z) || 1; return Math.acos(Math.max(-1, Math.min(1, (fwd.x * x + fwd.z * z) / l))) * 180 / Math.PI; };
      const cam = R.camera.getWorldPosition(new THREE.Vector3());
      samples.push({ t: f / 30, actor: 'robot', role: 'robot', beat: rp.settled ? rp.party : 'walk',
        robotVisible: petProbe.seen(root)[0].visible, robotFaceCam: deg(cam.x - at.x, cam.z - at.z),
        robotFaceTarget: rp.partyFace ? deg(rp.partyFace.x - at.x, rp.partyFace.z - at.z) : null });
    }
    if (arrive && arrivedAt === null && f >= arriveSeconds * 30 - 1) return { actors: [...actors], samples, spots: R.debug?.spots ?? {}, arriveTimedOut: true };
    if (arrive && arrivedAt !== null && f >= arrivedAt + beatSeconds * 30 - 1) break;
    if (samples.length && !live) break;
  }
  return { actors: [...actors], samples, spots: R.debug?.spots ?? {} };
}
