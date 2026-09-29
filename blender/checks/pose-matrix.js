// The pose matrix: one gesture played in every camera view x posture x build x rig, each cell judged by
// the same rules, in Node with no browser (pose.mjs --matrix). Runs under Vite's module loader beside
// pose-measure.js, whose playPose it calls once per cell.
//
//   --matrix views=all,postures=stand,sit,lie,builds=all,rig=on,off[,accessory=none,glasses]
//     views     0..3 (the person's heading off the camera, 90 degrees a step), or all
//     postures  stand (idle), sit (typing), lie (lie), or all
//     builds    0..2 (the character's body build), or all
//     rig       on, off (the authored clips against the procedural poses), or both by default
//     accessory none glasses headphones beanie cap (default: none)
// Measures: a gesture measure (hand0Face, hand1Eye..., faceCam), a screen cover (cover<A><B>, pose-cover.js)
// or clearance (the smaller of either hand's distance to the head surface).

export const POSTURES = { stand: 'idle', sit: 'typing', lie: 'lie' };
const ACCESSORIES = ['none', 'glasses', 'headphones', 'beanie', 'cap'];

const list = (v, all) => (v === 'all' ? all : v);

// "views=all,postures=stand,sit,builds=0,1" into axes; a value list runs until the next name=.
export function parseMatrix(spec) {
  const raw = {};
  let key = null;
  for (const tok of String(spec).split(',').map((s) => s.trim()).filter(Boolean)) {
    const eq = tok.indexOf('=');
    if (eq > 0) { key = tok.slice(0, eq); raw[key] = [tok.slice(eq + 1)]; } else if (key) raw[key].push(tok); else throw new Error(`pose: --matrix wants name=v1,v2 (got "${tok}")`);
  }
  const known = ['views', 'postures', 'builds', 'rig', 'accessory'];
  for (const k of Object.keys(raw)) if (!known.includes(k)) throw new Error(`pose: --matrix axis "${k}" is not one of ${known.join(', ')}`);
  const pick = (k, all, d) => list((raw[k] ?? [d]).flatMap((v) => (v === 'all' ? all : [v])), all);
  const views = pick('views', ['0', '1', '2', '3'], 'all').map(Number);
  const postures = pick('postures', Object.keys(POSTURES), 'all');
  const builds = pick('builds', ['0', '1', '2'], 'all').map(Number);
  const rig = (raw.rig ?? ['on', 'off']).flatMap((v) => (v === 'all' ? ['on', 'off'] : [v]));
  const accessory = pick('accessory', ACCESSORIES, 'none');
  if (views.some((v) => !(v >= 0 && v <= 3))) throw new Error('pose: --matrix views are 0 to 3');
  for (const p of postures) if (!POSTURES[p]) throw new Error(`pose: --matrix posture "${p}" is not one of ${Object.keys(POSTURES).join(', ')}`);
  if (builds.some((b) => !(b >= 0 && b <= 2))) throw new Error('pose: --matrix builds are 0 to 2');
  for (const r of rig) if (r !== 'on' && r !== 'off') throw new Error('pose: --matrix rig is on or off');
  for (const a of accessory) if (!ACCESSORIES.includes(a)) throw new Error(`pose: --matrix accessory "${a}" is not one of ${ACCESSORIES.join(', ')}`);
  return { views, postures, builds, rig, accessory };
}

export const cellsOf = (axes) => axes.postures.flatMap((posture) => axes.builds.flatMap((build) => axes.rig.flatMap((rig) => axes.accessory.flatMap((accessory) => axes.views.map((view) => ({ posture, build, rig, accessory, view }))))));

export const rowLabel = (c, axes) => [c.posture, `b${c.build}`, `rig ${c.rig}`, ...(axes.accessory.length > 1 || axes.accessory[0] !== 'none' ? [c.accessory] : [])].join(' ');

export const COVER = /^cover(HandL|HandR|Hand|Bubble)(EyeNear|EyeFar|EyeL|EyeR|Face)$/;
export const isCover = (m) => COVER.test(m);

export function valueOf(f, m) {
  if (m === 'faceCam') return f.faceCam;
  if (m === 'clearance') { const v = [f.contact?.hand0Head, f.contact?.hand1Head].filter(Number.isFinite); return v.length ? Math.min(...v) : null; }
  if (isCover(m)) return f.cover?.[m] ?? null;
  return f.contact?.[m] ?? null;
}

const cmp = { '<=': (a, b) => a <= b, '>=': (a, b) => a >= b, '<': (a, b) => a < b, '>': (a, b) => a > b };

// '<measure><op><value>[@share]' (share: the fraction of judged frames that must satisfy it, default 1).
// An optional ' if <measure><op><value>' keeps only the frames where that holds first
// ('coverHandEyeNear>=0.5@0.7 if faceCam<=80'). Measures a rule names are added to `measures`.
export function parseRule(s, measures) {
  const term = /^(\w+)\s*(<=|>=|<|>)\s*(-?[\d.]+)$/;
  const [main, cond] = String(s).split(/\s+if\s+/);
  const m = /^(\w+)(<=|>=|<|>)(-?[\d.]+)(?:@([\d.]+))?$/.exec(main.replace(/\s+/g, ''));
  const w = cond ? term.exec(cond.trim()) : null;
  if (!m || (cond && !w)) throw new Error(`pose: can't read rule "${s}" (want e.g. coverHandEyeNear>=0.5@0.7 [if faceCam<=80])`);
  for (const name of [m[1], w?.[1]].filter(Boolean)) if (!measures.includes(name)) measures.push(name);
  return { text: s, measure: m[1], op: m[2], value: Number(m[3]), share: m[4] ? Number(m[4]) : 1, ...(w ? { when: { measure: w[1], op: w[2], value: Number(w[3]) } } : {}) };
}

const median = (v) => v[v.length >> 1];
export function stats(vals) {
  const v = vals.filter(Number.isFinite).sort((a, b) => a - b);
  return v.length ? { min: v[0], median: median(v), max: v[v.length - 1] } : null;
}

// One cell's verdicts: per rule the share of judged frames that hold, and the measure's range.
export function judgeCell(frames, rules, measures) {
  const judged = frames.filter((f) => f.phase === 'gesture' || f.phase === 'pose');
  const stat = Object.fromEntries(measures.map((m) => [m, stats(judged.map((f) => valueOf(f, m)))]));
  const verdicts = rules.map((r) => {
    // `if` keeps only the frames where the condition holds (a face turned away has nothing to cover);
    // a cell with none of them has nothing to judge: it fails nothing and is marked n/a, not a pass.
    const mine = r.when ? judged.filter((f) => { const v = valueOf(f, r.when.measure); return Number.isFinite(v) && cmp[r.when.op](v, r.when.value); }) : judged;
    if (r.when && !mine.length) return { rule: r.text, measure: r.measure, share: 1, want: r.share, pass: true, na: true, gap: 0, frames: 0 };
    const vals = mine.map((f) => valueOf(f, r.measure)).filter(Number.isFinite);
    const share = mine.length ? vals.filter((v) => cmp[r.op](v, r.value)).length / mine.length : 0;
    // How far the best frame is from the bound: positive when no frame reaches it.
    const gap = !vals.length ? Infinity : r.op[0] === '>' ? r.value - Math.max(...vals) : Math.min(...vals) - r.value;
    // The gesture time of the frame farthest from passing, for a picture of the cell at its worst.
    const extreme = mine.filter((f) => Number.isFinite(valueOf(f, r.measure))).reduce((w, f) => (!w || (r.op[0] === '>' ? valueOf(f, r.measure) < valueOf(w, r.measure) : valueOf(f, r.measure) > valueOf(w, r.measure)) ? f : w), null);
    return { rule: r.text, measure: r.measure, share: +share.toFixed(3), want: r.share, pass: mine.length > 0 && share >= r.share, gap: +Math.max(0, gap).toFixed(4), frames: mine.length, worstT: extreme?.t ?? null };
  });
  // na: every rule had no frame to judge (a cell is n/a only when nothing in it was measured).
  return { judged: judged.length, stat, verdicts, pass: verdicts.every((v) => v.pass), na: verdicts.length > 0 && verdicts.every((v) => v.na) };
}

// The three-way count of a matrix: cells that held, cells that failed, and cells with nothing to judge.
export function tally(cells) {
  const fail = cells.filter((c) => !c.pass).length, na = cells.filter((c) => c.pass && c.na).length;
  return { pass: cells.length - fail - na, fail, na, total: cells.length };
}
export const tallyText = (cells) => { const t = tally(cells); return `${t.pass} pass, ${t.fail} fail, ${t.na} n/a (${t.total} cells)`; };

// How far a cell is from passing its worst rule: negative when it fails (share short of the want),
// with the distance of its best frame from the bound as the tie-break among cells at the same share.
export const margin = (cell) => Math.min(Infinity, ...cell.verdicts.map((v) => v.share - v.want));
export const gapOf = (cell) => Math.max(0, ...cell.verdicts.filter((v) => !v.pass).map((v) => v.gap ?? 0));
export const worseThan = (a, b) => margin(a) < margin(b) || (margin(a) === margin(b) && gapOf(a) > gapOf(b));
export const worstOf = (cells) => cells.reduce((w, c) => (!w || worseThan(c, w) ? c : w), null);

// Plays every cell: { cells: [{ ...cell, ...judgement, error? }] }. onCell(cell) is called as each finishes.
export async function runMatrix({ playPose, gesture, axes, measures, rules, seconds = 2.2, warm = 1, fps = 30, onCell = () => {} }) {
  const covers = measures.filter(isCover);
  const contact = measures.some((m) => !isCover(m) && m !== 'faceCam');
  const out = [];
  for (const cell of cellsOf(axes)) {
    let result;
    try {
      const { frames } = await playPose({
        under: POSTURES[cell.posture], gesture, seconds, warm, fps, view: 0, yawToCamera: cell.view * 90, rig: cell.rig === 'on',
        look: { build: cell.build, ...(cell.accessory !== 'none' ? { accessory: cell.accessory } : {}) }, covers, contact,
      });
      result = { ...cell, ...judgeCell(frames, rules, measures) };
    } catch (e) {
      result = { ...cell, error: e.message, pass: false, verdicts: rules.map((r) => ({ rule: r.text, measure: r.measure, share: 0, want: r.share, pass: false })), stat: {}, judged: 0 };
    }
    out.push(result);
    onCell(result);
  }
  return { axes, cells: out };
}

// The grids and the summary: per rule one table (rows are posture, build, rig; columns the views) of
// the share of judged frames that hold, failing cells starred and the worst cell marked, then a line
// naming the worst cell with its measure ranges.
export function formatMatrix({ axes, cells }, rules, gesture) {
  const lines = [];
  const rowKeys = [...new Set(cells.map((c) => rowLabel(c, axes)))];
  const at = (row, view) => cells.find((c) => rowLabel(c, axes) === row && c.view === view);
  const worst = worstOf(cells);
  for (const [i, r] of rules.entries()) {
    lines.push(`MATRIX ${r.text} (share of judged frames that hold, want ${(r.share * 100).toFixed(0)}%)`);
    const w = Math.max(...rowKeys.map((k) => k.length));
    lines.push(`MATRIX ${''.padEnd(w)}  ${axes.views.map((v) => `view ${v}`.padStart(9)).join(' ')}`);
    for (const row of rowKeys) {
      lines.push(`MATRIX ${row.padEnd(w)}  ${axes.views.map((v) => {
        const c = at(row, v);
        if (!c) return ''.padStart(9);
        const ver = c.verdicts[i];
        const txt = c.error ? 'error' : ver.na ? 'n/a' : `${Math.round(ver.share * 100)}%${ver.pass ? '' : '*'}${c === worst ? '<' : ''}`;
        return txt.padStart(9);
      }).join(' ')}`);
    }
  }
  lines.push(`MATRIX ${gesture ?? 'pose'}: ${tallyText(cells)}`);
  if (worst && !worst.pass) {
    const ver = worst.verdicts.filter((v) => !v.pass).map((v) => `${v.rule}: ${Math.round(v.share * 100)}%`).join('; ');
    const ranges = Object.entries(worst.stat).filter(([, s]) => s).map(([m, s]) => `${m} ${s.min}..${s.max}`).join(', ');
    lines.push(`MATRIX worst cell: ${rowLabel(worst, axes)} view ${worst.view}: ${worst.error ?? ver}${ranges ? ` (${ranges})` : ''}`);
  }
  return lines;
}
