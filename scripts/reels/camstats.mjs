// Camera motion for a captured clip, from the per-frame camera log a capture item pushed as a
// 'camlog' mark (see CAMLOG in scripts/capture-manifest.js):
//
//   node scripts/reels/camstats.mjs <capture dir> <item id> [from seconds] [to seconds]
//
// Prints frames, the largest per-frame step of the look point (metres, x and z), the largest change
// between consecutive steps (jerk), and the largest per-frame zoom change, over [from, to).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, id, fromArg, toArg] = process.argv.slice(2);
if (!dir || !id) { console.error('usage: node scripts/reels/camstats.mjs <capture dir> <item id> [from] [to]'); process.exit(2); }
const item = JSON.parse(readFileSync(join(dir, 'index.json'), 'utf8')).items[id];
const mark = item?.marks?.find((m) => m.label.startsWith('camlog '));
if (!mark) { console.error(`camstats: no camlog for ${id} in ${dir}`); process.exit(1); }
const from = Number(fromArg ?? 0), to = Number(toArg ?? Infinity);
const log = JSON.parse(mark.label.slice(7)).filter(([t]) => t >= from && t < to);
let maxStep = 0, maxJerk = 0, maxZoom = 0, prev = null;
for (let i = 1; i < log.length; i++) {
  const [, x0, , z0, k0] = log[i - 1], [, x1, , z1, k1] = log[i];
  const step = { dx: x1 - x0, dz: z1 - z0 };
  maxStep = Math.max(maxStep, Math.hypot(step.dx, step.dz));
  maxZoom = Math.max(maxZoom, Math.abs(k1 - k0));
  if (prev) maxJerk = Math.max(maxJerk, Math.hypot(step.dx - prev.dx, step.dz - prev.dz));
  prev = step;
}
const f = (n) => n.toFixed(4);
console.log(`${id} [${from}, ${Number.isFinite(to) ? to : 'end'}) s: ${log.length} frames, max step ${f(maxStep)} m, max jerk ${f(maxJerk)} m, max zoom step ${f(maxZoom)}`);
