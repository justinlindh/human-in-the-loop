// mocap.mjs's sampling pass, run on the studio engine (scripts/studio/page-host.mjs) or in a harness page.
// Playwright sends it to a page as source, so it may use nothing from this module's scope: everything comes
// from window or a dynamic import by site path.
//
// Plays baked clips (hitl-mocap-clip) on the first staff members through R.playMocap, one clock for all of
// them, and for each requested clip frame measures every person:
//   contactMiss  furthest distance, over the contacts held at this frame, from the contact limb's end (the
//                ankle's sole point for a foot, the hand's lowest point for a hand) to its contact point (metres)
//   selfDepth    deepest a limb part sits in another part of the same body, beyond what the rest pose already does
//   pairDepth    deepest this body sits in another clip person's body
//   onScreen     share of the body's projected box inside the viewport, for the camera
//   heightPx     the body's projected height in pixels
//   jitter       mean angular acceleration of the rig's pivots (rad/s^2) over three consecutive frames: the
//                twitch a viewer sees; null on a frame whose two predecessors were not sampled
const PARTS = ['legL', 'legR', 'torso', 'head', 'armL', 'armR'];
const BONES = ['body', 'hips', 'legL', 'legR', 'torso', 'head', 'armL', 'armR'];
const LIMB_OF = { footL: 'legL', footR: 'legR', handL: 'armL', handR: 'armR' };

export const mocapPage = async (o) => {
  const R = window.__hitlRender;
  const T = R.THREE;
  const { overlaps } = await import('/blender/checks/intersect.js');
  await window.__fastRaycast();
  window.__sample(30);

  // People: the first staff members (or the named ones), one per clip.
  const found = new Map();
  R.scene.traverse((c) => {
    if (c.name !== 'character') return;
    let id = null;
    c.traverse((x) => { if (x.userData.staffId !== undefined) id = x.userData.staffId; });
    if (id != null) found.set(String(id), c);
  });
  const ids = o.who?.length ? o.who.map(String) : [...found.keys()].slice(0, o.clips.length);
  if (ids.length < o.clips.length || ids.some((id) => !found.has(id))) return { error: `the scene has ${found.size} people (${[...found.keys()].join(', ')}); the clips need ${o.clips.length}${o.who?.length ? ` named ${o.who.join(', ')}` : ''}` };

  const partsOf = (root) => {
    const out = Object.fromEntries(PARTS.map((p) => [p, []]));
    root.traverse((c) => { if (c.isMesh && out[c.userData.part]) out[c.userData.part].push(c); });
    return out;
  };
  const body = (key, meshes) => {
    const box = new T.Box3();
    for (const m of meshes) { if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); box.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld)); }
    return { key, kind: 'person', label: key, meshes, box };
  };

  // The group stands at the anchor (default: where the first person stands, facing +z); R.playShot places
  // each clip from its origin and widens the gaps by `spread`. A clip without an origin stands at the anchor,
  // so those are spread out here.
  const anchor = o.anchor ?? (() => { const p = found.get(ids[0]).position; return { x: p.x, z: p.z, yaw: 0 }; })();
  const VFPS = 30;
  const starts = o.clips.map((c) => c.source?.start ?? 0);
  const first = Math.min(...starts);
  let shotT = first / VFPS;
  const shotOpts = { ...(o.shot ?? {}), at: anchor, clock: () => shotT, videoFps: VFPS, ik: o.ik !== false, ...(o.spread != null ? { spread: o.spread } : {}) };
  const entries = (clips) => clips.map((clip, i) => ({ id: ids[i], clip: clip.origin ? clip : { ...clip, origin: { pos: [i * 1.2, 0, 0], yaw: 0 } } }));
  const playAll = (clips) => R.playShot(entries(clips), shotOpts).players;
  const settle = () => { for (let k = 0; k < 20; k++) window.__sample(1); R.scene.updateMatrixWorld(true); };

  // The rest pose first: what the parts of each body already overlap there is not a self-intersection.
  const identity = { format: 'hitl-mocap-clip', version: 1, fps: 30, frames: 2, bones: BONES, tracks: Object.fromEntries(BONES.map((b) => [b, { quat: [[0, 0, 0, 1], [0, 0, 0, 1]] }])), contacts: [] };
  identity.tracks.body.pos = [[0, 0, 0], [0, 0, 0]];
  playAll(o.clips.map((c) => ({ ...identity, origin: c.origin, source: c.source })));
  settle();
  const selfPairs = (root, key) => {
    const parts = partsOf(root);
    const list = PARTS.filter((p) => parts[p].length).map((p) => body(p, parts[p]));
    const out = new Map();
    for (const r of overlaps(list, { tol: 0 })) out.set([r.a.key, r.b.key].sort().join('~'), r.depth);
    return out;
  };
  const rest = ids.map((id) => selfPairs(found.get(id), id));

  const players = playAll(o.clips);
  settle();
  const placed = ids.map((id) => { const r = found.get(id); return { x: r.position.x, z: r.position.z, yaw: r.rotation.y }; });

  // Limb ends in the character's own frame.
  const limbInfo = ids.map((id) => {
    const parts = partsOf(found.get(id));
    const bodyG = found.get(id).children.find((c) => c.isGroup);
    const info = {};
    for (const [contact, bone] of Object.entries(LIMB_OF)) {
      const pivot = parts[bone][0]?.parent;
      if (!pivot) continue;
      let hip = 0;
      for (let x = pivot; x && x !== bodyG; x = x.parent) hip += x.position.y;
      // The lowest point of everything under the pivot, in the pivot's own frame.
      pivot.updateMatrixWorld(true);
      const inv = pivot.matrixWorld.clone().invert();
      let low = 0;
      pivot.traverse((m) => { if (!m.isMesh) return; if (!m.geometry.boundingBox) m.geometry.computeBoundingBox(); const b = m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld).applyMatrix4(inv); low = Math.min(low, b.min.y); });
      info[contact] = { pivot, reach: contact.startsWith('foot') ? hip : -low };
    }
    return info;
  });

  // The rig's pivots by bone, for the angular acceleration of what is actually shown.
  const pivotsOf = ids.map((id) => {
    const root = found.get(id);
    const parts = partsOf(root);
    const bodyG = root.children.find((c) => c.isGroup);
    const out = { body: bodyG, hips: bodyG?.children.find((c) => c.isGroup) };
    for (const b of PARTS) if (parts[b][0]) out[b] = parts[b][0].parent;
    return Object.fromEntries(Object.entries(out).filter(([, v]) => v));
  });
  const history = ids.map(() => ({ last: null, q1: null, q2: null }));
  const W = o.width ?? 1280, H = o.height ?? 800;
  const down = new T.Vector3(0, -1, 0), q = new T.Quaternion(), end = new T.Vector3(), goal = new T.Vector3();
  const rows = [];
  const frames = o.frames?.length ? o.frames : Array.from({ length: Math.max(...o.clips.map((c, i) => c.frames + Math.round((starts[i] - first)))) }, (_, i) => i);
  for (const sf of frames) {
    shotT = first / VFPS + sf / 30;
    window.__sample(1);
    R.scene.updateMatrixWorld(true);
    if (o.camera) {
      R.camera.position.set(...o.camera.slice(0, 3));
      R.camera.lookAt(...o.camera.slice(3, 6));
      if (o.camera[6]) { R.camera.fov = o.camera[6]; R.camera.updateProjectionMatrix(); }
    }
    R.camera.updateMatrixWorld(true);
    const whole = ids.map((id) => { const p = partsOf(found.get(id)); return body(id, PARTS.flatMap((k) => p[k])); });
    const between = new Map();
    for (const r of overlaps(whole, { tol: 0 })) {
      between.set(r.a.key, Math.max(between.get(r.a.key) ?? 0, r.depth));
      between.set(r.b.key, Math.max(between.get(r.b.key) ?? 0, r.depth));
    }
    ids.forEach((id, i) => {
      const clip = o.clips[i];
      // Angular acceleration from the pivots now and the two frames before (even when this clip is off).
      const h = history[i];
      const now = Object.fromEntries(Object.entries(pivotsOf[i]).map(([b, p]) => [b, p.quaternion.clone()]));
      let jitter = null, jitterBone = null;
      if (h.last === sf - 1 && h.q2) {
        let sum = 0, n = 0, worst = -1;
        for (const [b, q] of Object.entries(now)) {
          const a = h.q1[b], c = h.q2[b];
          const s1 = a.dot(q) < 0 ? -1 : 1, s2 = c.dot(a) < 0 ? -1 : 1;
          // q2 - 2*q1 + q0 with each neighbour on the same side as the next.
          const w = [q.x - 2 * s1 * a.x + s1 * s2 * c.x, q.y - 2 * s1 * a.y + s1 * s2 * c.y, q.z - 2 * s1 * a.z + s1 * s2 * c.z, q.w - 2 * s1 * a.w + s1 * s2 * c.w];
          const acc = 2 * Math.hypot(...w) * 900;
          sum += acc; n++;
          if (acc > worst) { worst = acc; jitterBone = b; }
        }
        jitter = n ? +(sum / n).toFixed(2) : null;
      }
      history[i] = { last: sf, q1: now, q2: h.last === sf - 1 ? h.q1 : null };
      // This clip's own frame at this moment of the shot; before its first or past its last, it is not on.
      const f = Math.round((sf / 30 + (first - starts[i]) / VFPS) * clip.fps);
      if (f < 0 || f >= clip.frames) return;
      const row = { frame: sf, clipFrame: f, id, clip: clip.name ?? String(i), contactMiss: null, contacts: [], selfDepth: 0, selfPair: null, pairDepth: between.get(id) ?? 0, onScreen: null, heightPx: null, jitter, jitterBone };
      // Contacts held now: the limb's end against its point.
      const root = found.get(id);
      for (const c of players[i].contactsAt(f)) {
        if (c.w < 1 || !limbInfo[i][c.limb]) continue;
        const { pivot, reach } = limbInfo[i][c.limb];
        pivot.getWorldQuaternion(q);
        pivot.getWorldPosition(end).addScaledVector(down.clone().applyQuaternion(q), reach * root.scale.y);
        // The root travels with the clip's floor motion (rootOffset); the point is where it was set down.
        const off = players[i].rootOffset ?? { x: 0, z: 0 };
        goal.set(c.point[0] - off.x, c.point[1], c.point[2] - off.z);
        root.localToWorld(goal);
        const miss = end.distanceTo(goal);
        row.contacts.push(c.limb);
        if (row.contactMiss == null || miss > row.contactMiss) row.contactMiss = +miss.toFixed(4);
      }
      // Parts of one body in each other beyond the rest pose.
      for (const [pair, depth] of selfPairs(root, id)) {
        const excess = depth - (rest[i].get(pair) ?? 0);
        if (excess > row.selfDepth) { row.selfDepth = +excess.toFixed(4); row.selfPair = pair; }
      }
      // Framing: the body's box through the camera.
      const box = whole[i].box;
      const pts = [];
      for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) pts.push(new T.Vector3(x, y, z).project(R.camera));
      if (pts.some((p) => p.z > 1)) { row.onScreen = 0; row.heightPx = null; } else {
        const xs = pts.map((p) => (p.x + 1) / 2 * W), ys = pts.map((p) => (1 - p.y) / 2 * H);
        const r = { l: Math.min(...xs), r: Math.max(...xs), t: Math.min(...ys), b: Math.max(...ys) };
        const area = (r.r - r.l) * (r.b - r.t);
        const inter = Math.max(0, Math.min(r.r, W) - Math.max(r.l, 0)) * Math.max(0, Math.min(r.b, H) - Math.max(r.t, 0));
        row.onScreen = area > 0 ? +(inter / area).toFixed(3) : 0;
        row.heightPx = +(r.b - r.t).toFixed(1);
      }
      rows.push(row);
    });
  }
  return { rows, anchor, placed, ids };
};
