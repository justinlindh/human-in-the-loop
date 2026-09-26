// Scene measures for pose.mjs --scene, in a harness page: for each person on screen now, how much of
// their face a speech bubble, label or emote covers, how much of them the camera sees and what hides
// the rest (the staging probe), their face's angle to the camera, and how big the face is on screen.
//
// measureScene(R, S, { who }) -> [{ id, faceCovered, coveredBy, faceVisible, occluder, faceCam, facePx,
//   anim, moment, beat }]
//   faceCovered  the largest share of the face's screen rectangle under one bubble, label or emote
//                (theirs or anyone's), 0..1
//   facePx       the face's height on screen, in canvas pixels
import { screen } from './intersect.js';

const area = (r) => Math.max(0, r.right - r.left) * Math.max(0, r.bottom - r.top);

export function measureScene(R, S, { who = null } = {}) {
  R.scene.updateMatrixWorld();
  const sc = screen(R);
  const covers = [...sc.labels.map((l) => ({ what: `${l.kind} "${l.text}"`, r: l.r })), ...sc.emotes.map((e) => ({ what: `emote over ${e.id}`, r: e.r }))];
  const out = [];
  for (const f of sc.faces) {
    if (f.id == null || (who && !who.includes(String(f.id)))) continue;
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
      faceVisible: p.visible ?? null, occluder: p.occluder ?? null, faceCam: p.faceCam ?? null,
      facePx: +(f.r.bottom - f.r.top).toFixed(1), anim: p.anim ?? null, moment: st?.moment ?? null, beat: st?.beat ?? null,
    });
  }
  return out;
}
