// Failure detail shared by the checks (loop.mjs, clip.mjs): trace lines from the renderer's moment
// ownership trace (R.trace, sync.js) and an actor's state from R.walkOf, as printable lines.

// One trace entry: time, who, what happened, from and to which temp, the function behind it, why.
export const fmtTrace = (l) => `t=${l.t}s ${l.id ?? '-'} ${l.what}${l.from || l.to ? ` ${l.from ?? '-'} -> ${l.to ?? '-'}` : ''}${l.by ? ` by ${l.by}` : ''}${l.why ? ` (${l.why})` : ''}${l.repeats ? ` x${l.repeats}` : ''}${l.decision ? ` [${l.decision}]` : ''}`;

// An actor's state: { id, pos: [x, z], yaw, walk } with walk from R.walkOf(id).
export function fmtActor(a) {
  if (!a?.pos) return `${a?.id ?? '?'}: not in the scene`;
  const w = a.walk, p = (q) => (q ? `(${q.x.toFixed(2)}, ${q.z.toFixed(2)})` : 'none');
  const temp = w?.temp ? `${w.temp.moment ?? w.temp.perk ?? w.temp.anim}${w.temp.by ? ` set by ${w.temp.by}` : ''}, ${w.temp.t?.toFixed(1)} s left${w.temp.delay > 0 ? `, waiting ${w.temp.delay.toFixed(1)} s` : ''}` : 'none';
  return `${a.id} at (${a.pos[0].toFixed(2)}, ${a.pos[1].toFixed(2)}) yaw ${a.yaw?.toFixed(2)}; mode ${w?.mode}${w?.hidden ? ' hidden' : ''}; temp ${temp}; path ${w?.path?.length ? `${w.path.length} points to ${p(w.path[w.path.length - 1])}` : 'none'}; goal ${p(w?.goal)}${w?.goal?.key ? ` ${w.goal.key}` : ''}`;
}

// In the page: the state fmtActor prints, for staff ids.
export const ACTOR_JS = `(ids) => ids.map((id) => {
  const R = window.__hitlRender; let root = null;
  R.scene.traverse((o) => { if (o.userData.staffId === id) root = o.parent; });
  return root && { id, pos: [root.position.x, root.position.z], yaw: root.rotation.y, walk: R.walkOf?.(id) ?? null };
}).filter(Boolean)`;
