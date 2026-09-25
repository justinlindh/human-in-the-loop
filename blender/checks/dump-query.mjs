// Questions about a scene dump (dump.mjs), answered per frame from its dump.json.
//
//   node blender/checks/dump-query.mjs <dir or dump.json> where <thing>
//   node blender/checks/dump-query.mjs <dir or dump.json> dist <thing> <thing>
//   node blender/checks/dump-query.mjs <dir or dump.json> rel <thing> <frame-of>
//   node blender/checks/dump-query.mjs <dir or dump.json> near <thing> [metres]
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
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const [src, cmd, a, b] = process.argv.slice(2);
if (!src || !cmd) { console.error('usage: dump-query.mjs <dir|dump.json> where|dist|rel|near <thing> [thing|metres]'); process.exit(2); }
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

for (const fr of dump.frames) {
  const head = `frame ${String(fr.frame).padStart(4)} t=${fr.t.toFixed(2)}s`;
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
