// Scene measures for pose.mjs --scene, in a harness page: for each person on screen now, how much of
// their head rectangle a speech bubble, label or emote covers, which facial landmarks the camera
// sees and what hides them, their face's angle to the camera, and how big the face is on screen.
//
// measureScene(R, S, { who }) -> [{ id, faceCovered, coveredBy, faceVisible, occluder, faceCam, facePx,
//   anim, moment, beat }]
//   faceCovered  the largest share of the drawn head's screen rectangle under one bubble, label or emote
//                (theirs or anyone's), 0..1
//   facePx       the drawn head's height on screen, in canvas pixels
import { screen, carried, held, overlaps } from './intersect.js';
import { measureHeldRead } from './pose-held.js';
import { getTemplate } from '../../src/render/models.js';
import { faceVisibility } from './pose-visibility.js';
import { projectedSubject, sceneOverlays } from './pose-projection.js';
import { measureCovers } from './pose-cover.js';

const area = (r) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);

// Sweep geometry, without its collision tolerance. Absent props stay null so a missing grip fails.
export function measureHeld(R, id, loads = carried(R), grips = held(R), pose = null) {
  const own = loads.filter((l) => String(l.staffId) === String(id));
  const grip = grips.filter((g) => String(g.staffId) === String(id));
  const depths = own.flatMap(({ thing, body }) => overlaps([thing, body], { tol: 0 }).flatMap((o) => o.parts));
  const depth = (part) => own.length ? Math.max(0, ...depths.filter((p) => p.b === part).map((p) => p.depth)) : null;
  return {
    heldHeadDepth: depth('head'), heldTorsoDepth: depth('torso'),
    heldGap: grip.length ? Math.max(...grip.map((g) => g.gap)) : null,
    ...measureHeldRead(R, id, pose),
  };
}

export function measureScene(R, S, { who = null, cover = [], faceTemplate = getTemplate('chibi') } = {}) {
  R.scene.updateMatrixWorld();
  R.camera.updateMatrixWorld();
  const heads = new Map();
  R.scene.traverseVisible(o => {
    if (o.name !== 'character') return;
    let id = null, head = null;
    // Staff identity lives on the invisible picking proxy.
    o.traverse(c => { if (c.userData.staffId != null) id = String(c.userData.staffId); });
    o.traverseVisible(c => {
      if (c.userData.part === 'head') head = c;
    });
    if (id != null && head) heads.set(id, { root: o, head });
  });
  const sc = screen(R);
  const canvas = document.querySelector('canvas').getBoundingClientRect();
  if (![canvas.left, canvas.top, canvas.width, canvas.height].every(Number.isFinite) || canvas.width <= 0 || canvas.height <= 0) throw new Error('pose: invalid projection canvas');
  const overlays = sceneOverlays(R, sc, canvas, heads);
  const loads = carried(R), grips = held(R);
  const covers = [...sc.labels.map((l) => ({ what: `${l.kind} "${l.text}"`, r: l.r })), ...sc.emotes.map((e) => ({ what: `emote over ${e.id}`, r: e.r }))];
  const out = [];
  for (const f of sc.faces) {
    if (f.id == null || (who && !who.includes(String(f.id)))) continue;
    const character = heads.get(String(f.id));
    if (!character) continue;
    const { head } = character;
    const visibility = faceVisibility(R, head, faceTemplate);
    let covered = 0, by = null;
    for (const c of covers) {
      const w = Math.min(f.r.right, c.r.right) - Math.max(f.r.left, c.r.left), h = Math.min(f.r.bottom, c.r.bottom) - Math.max(f.r.top, c.r.top);
      const share = w > 0 && h > 0 ? (w * h) / Math.max(1, area(f.r)) : 0;
      if (share > covered) { covered = share; by = c.what; }
    }
    const p = R.probe(f.id) ?? {};
    const st = R.moments?.staging?.(f.id) ?? null;
    out.push({
      id: String(f.id), faceCovered: +covered.toFixed(3), coveredBy: covered > 0 ? by : null,
      ...visibility, bodyVisible: p.visible ?? null, bodyOccluder: p.occluder ?? null, faceCam: p.faceCam ?? null,
      facePx: +(f.r.bottom - f.r.top).toFixed(1), anim: p.anim ?? null, moment: st?.moment ?? null, beat: st?.beat ?? null,
      ...measureHeld(R, f.id, loads, grips, p),
      projected: projectedSubject(R, character, faceTemplate, canvas, f.r, overlays),
      ...(cover.length ? (() => { const c = measureCovers(R, character, faceTemplate, cover, overlays, canvas); return { ...c.measures, covers: c.covers }; })() : {}),
    });
  }
  return out;
}
