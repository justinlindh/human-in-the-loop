// Questions about a scene dump (dump.mjs), answered per frame from its dump.json.
//
//   node blender/checks/dump-query.mjs <dir or dump.json> where <thing>
//   node blender/checks/dump-query.mjs <dir or dump.json> dist <thing> <thing>
//   node blender/checks/dump-query.mjs <dir or dump.json> rel <thing> <frame-of>
//   node blender/checks/dump-query.mjs <dir or dump.json> near <thing> [metres]
//   node blender/checks/dump-query.mjs <dir or dump.json> nav <x,z> [metres]
//   node blender/checks/dump-query.mjs <dir or dump.json> path <person>
//   node blender/checks/dump-query.mjs <dir or dump.json> trace [person]
//
// A thing is a person's staff id, an item's placed id, or a prop's id (a prop name also works),
// optionally with a point: .pos (default), .center (of its bounds), .head, .eyes, .hand0, .hand1,
// .foot0, .foot1, .held. For example s3.hand1, f10.center, pizza_boxes. hand1 is the hand that holds
// things (a mug, the hammer): character.js's arms[1], on the model's +x side.
// In rel, right is the thing's own right as it faces forward (a person facing +z has +x on their
// left), so hand1 reads as a small negative right.
//   where   the point, the yaw, the animation or moment, and the screen box
//   dist    the distance between the two points, and the vector from the first to the second
//   rel     the first point in the second thing's own frame: right (+x), up (+y), ahead (+z)
//   near    everything within the radius (default 1 m) of the thing, nearest first
//   nav     the walk grid's cells within the radius (default 0.4 m) of a floor point: blocked, free,
//           or walkable under furniture, and why: the room's edge, the obstacle rects that block it
//           (an item's, a staged prop's, a pillar's), what stands over it, who is there
//   trace   the moment ownership trace (dump.mjs --trace): per frame, every start, end, interrupt,
//           replacement and refusal of someone's temp with the function behind it, and the
//           decision freeze; with a person, only theirs
//   path    a person's walk: every path point, the goal, what sent them (moment, perk, goal key), and
//           the first furniture their body passes through on the way
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [src, cmd, a, b] = process.argv.slice(2);
if (!src || !cmd) { console.error('usage: dump-query.mjs <dir|dump.json> where|dist|rel|near <thing> [thing|metres] | nav <x,z> [metres] | path <person> | trace [person]'); process.exit(2); }
const file = statSync(src).isDirectory() ? join(src, 'dump.json') : src;
const dump = JSON.parse(readFileSync(file, 'utf8'));

function find(frame, spec) {
  const [id, point = 'pos'] = spec.split('.');
  const p = frame.people.find((x) => x.id === id);
  if (p) {
    const pt = { pos: p.pos, center: p.bounds && mid(p.bounds), head: p.head?.world, eyes: p.eyes, hand0: p.hands[0]?.world, hand1: p.hands[1]?.world, foot0: p.feet[0]?.world, foot1: p.feet[1]?.world, held: p.held?.world }[point];
    return { kind: 'person', thing: p, point: pt, yaw: p.yaw };
  }
  const it = frame.items.find((x) => x.id === id) ?? frame.props.find((x) => x.id === id || x.prop === id);
  if (it) return { kind: it.itemId ? 'item' : 'prop', thing: it, point: point === 'center' ? it.bounds && mid(it.bounds) : it.pos, yaw: it.yaw };
  return null;
}
const mid = (b) => b.min.map((v, i) => +((v + b.max[i]) / 2).toFixed(3));
const sub = (p, q) => p.map((v, i) => v - q[i]);
const len = (v) => Math.hypot(...v);
const f3 = (v) => (v ? `(${v.map((x) => x.toFixed(3)).join(', ')})` : 'none');

function navAt(fr, x, z, r) {
  const n = fr.nav;
  if (!n) return ['no walk grid in this dump (made before dump.js recorded one)'];
  const [x0, z0] = n.origin, out = [];
  const i0 = Math.max(0, Math.floor((x - r - x0) / n.cell)), i1 = Math.min(n.nx - 1, Math.floor((x + r - x0) / n.cell));
  const k0 = Math.max(0, Math.floor((z - r - z0) / n.cell)), k1 = Math.min(n.nz - 1, Math.floor((z + r - z0) / n.cell));
  for (let k = k0; k <= k1; k++) for (let i = i0; i <= i1; i++) {
    const cx = x0 + (i + 0.5) * n.cell, cz = z0 + (k + 0.5) * n.cell;
    const c = n.rows[k][i], why = [];
    if (c === '#') {
      if (cx < x0 + 0.35 || cz < z0 + 0.35 || cx > -x0 - 0.2 || cz > -z0 - 0.2) why.push('room edge');
      // The grid blocks a cell whose centre is within its 0.12 m clearance of an obstacle rect.
      for (const r of n.obstacles ?? []) if (cx > r.x0 - 0.12 && cx < r.x1 + 0.12 && cz > r.z0 - 0.12 && cz < r.z1 + 0.12) why.push(`${r.by}${r.itemId ? ` ${r.itemId}` : ''} rect x ${r.x0}..${r.x1} z ${r.z0}..${r.z1}`);
    } else if (c === 'o') {
      for (const o of n.occupied) if (o.cell[0] === i && o.cell[1] === k) why.push(`under ${o.by} (${o.part})`);
    }
    const here = fr.people.filter((p) => Math.abs(p.pos[0] - cx) < n.cell / 2 && Math.abs(p.pos[2] - cz) < n.cell / 2).map((p) => p.id);
    out.push(`cell ${i},${k} (${cx.toFixed(2)}, ${cz.toFixed(2)}) ${c === '#' ? 'blocked' : c === 'o' ? 'walkable, under furniture' : 'free'}${why.length ? `: ${why.join('; ')}` : ''}${here.length ? ` [${here.join(', ')} here]` : ''}`);
  }
  return out;
}

const fmtTrace = (l) => `t=${l.t}s ${l.id ?? '-'} ${l.what}${l.from || l.to ? ` ${l.from ?? '-'} -> ${l.to ?? '-'}` : ''}${l.by ? ` by ${l.by}` : ''}${l.why ? ` (${l.why})` : ''}${l.decision ? ` [${l.decision}]` : ''}`;
for (const fr of dump.frames) {
  const head = `frame ${String(fr.frame).padStart(4)} t=${fr.t.toFixed(2)}s`;
  if (cmd === 'nav') {
    const [x, z] = String(a ?? '').split(',').map(Number);
    if (!Number.isFinite(x) || !Number.isFinite(z)) { console.error('dump-query: nav wants a floor point as x,z'); process.exit(2); }
    console.log(`${head}  around (${x}, ${z}):`);
    for (const line of navAt(fr, x, z, Number(b ?? 0.4))) console.log(`  ${line}`);
    continue;
  }
  if (cmd === 'trace') {
    if (!fr.trace) { console.log(`${head}  no trace in this dump (dump.mjs --trace)`); continue; }
    const lines = fr.trace.filter((l) => !a || l.id === a || l.id === null);
    for (const l of lines) console.log(`${head}  ${fmtTrace(l)}`);
    continue;
  }
  if (cmd === 'path') {
    const p = fr.people.find((q) => q.id === a);
    if (!p) { console.log(`${head}  ${a}: not in this frame`); continue; }
    const w = p.walk;
    if (!w) { console.log(`${head}  ${a}: no walk data (a visitor, or a dump made before dump.js recorded walks)`); continue; }
    const why = [w.temp?.moment && `moment ${w.temp.moment}`, w.temp?.perk && `perk ${w.temp.perk}`, w.temp && !w.temp.moment && !w.temp.perk && `temp ${w.temp.anim}`, w.goal?.key && `goal ${w.goal.key}`].filter(Boolean).join(', ');
    console.log(`${head}  ${a} at (${p.pos[0].toFixed(2)}, ${p.pos[2].toFixed(2)}) mode ${w.mode}${w.hidden ? ' hidden' : ''}; ${why || 'no goal'}${w.temp?.by ? `; temp set by ${w.temp.by}` : ''}`);
    if (w.temp?.goal) console.log(`  temp goal (${w.temp.goal.x.toFixed(2)}, ${w.temp.goal.z.toFixed(2)})${w.temp.delay > 0 ? ` after ${w.temp.delay.toFixed(2)} s` : ''}, ${w.temp.t?.toFixed(2)} s left${w.temp.back ? ', then back' : ''}`);
    if (w.goal) console.log(`  goal (${w.goal.x.toFixed(2)}, ${w.goal.z.toFixed(2)}) ${w.goal.anim ?? ''}${w.goal.seated ? ' seated' : ''}${w.goal.hidden ? ' hidden (out of the office)' : ''}`);
    console.log(`  path: ${w.path.length ? w.path.map((q) => `(${q.x.toFixed(2)}, ${q.z.toFixed(2)})`).join(' ') : 'none (standing, or settling onto the goal)'}`);
    console.log(`  passes through: ${p.pathHits?.length ? p.pathHits.map((h) => `${h.id} ${h.label} (${h.part}) at (${h.at[0]}, ${h.at[1]}), segment ${h.segment}`).join('; ') : 'nothing'}`);
    continue;
  }
  const A = a && find(fr, a);
  if (!A) { console.log(`${head}  ${a}: not in this frame`); continue; }
  if (cmd === 'where') {
    const t = A.thing;
    console.log(`${head}  ${a} ${f3(A.point)} yaw ${A.yaw?.toFixed(3)}${t.anim ? ` anim ${t.anim}` : ''}${t.moment ? ` moment ${t.moment}/${t.beat}` : ''}${t.screen ? ` screen [${t.screen.join(', ')}]` : ''}`);
  } else if (cmd === 'dist' || cmd === 'rel') {
    const B = find(fr, b ?? '');
    if (!B || !A.point || !B.point) { console.log(`${head}  ${b}: not in this frame`); continue; }
    const d = sub(B.point, A.point);
    if (cmd === 'dist') console.log(`${head}  ${len(d).toFixed(3)} m, ${a} -> ${b} ${f3(d)}`);
    else {
      // A's point in B's frame. B faces (sin yaw, 0, cos yaw); its right is (-cos yaw, 0, sin yaw).
      const v = sub(A.point, B.point), c = Math.cos(B.yaw), s = Math.sin(B.yaw);
      const local = [-v[0] * c + v[2] * s, v[1], v[0] * s + v[2] * c];
      console.log(`${head}  ${a} in ${b}'s frame: right ${local[0].toFixed(3)}, up ${local[1].toFixed(3)}, ahead ${local[2].toFixed(3)} m`);
    }
  } else if (cmd === 'near') {
    const r = Number(b ?? 1);
    const all = [...fr.people.map((p) => ({ id: p.id, pos: p.pos })), ...fr.items.map((i) => ({ id: `${i.id} ${i.itemId}`, pos: i.bounds ? mid(i.bounds) : i.pos })), ...fr.props.map((p) => ({ id: p.prop, pos: p.bounds ? mid(p.bounds) : p.pos }))];
    const hits = all.filter((x) => !x.id.startsWith(`${A.thing.id} `) && x.id !== A.thing.id).map((x) => ({ ...x, d: len(sub(x.pos, A.point)) })).filter((x) => x.d <= r).sort((x, y) => x.d - y.d);
    console.log(`${head}  ${hits.map((x) => `${x.id} ${x.d.toFixed(2)} m`).join(', ') || 'nothing'}`);
  } else { console.error(`dump-query: unknown command ${cmd}`); process.exit(2); }
}
