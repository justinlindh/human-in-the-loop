// Checks on a played motion clip, on the studio engine (nothing drawn, no browser): plays baked clips
// (hitl-mocap-clip, from scripts/tools/mocap/bake.mjs) through the game's own R.playMocap and measures
// each person at each clip frame (mocap-page.js): how far a contact limb is from its contact point,
// whether a limb is through its own body, whether two people are through each other, and whether a
// person is on screen and how big, for a camera.
//
//   node blender/checks/mocap.mjs --clip a.json[,b.json,...] [--mock floor | --seed N [--week W]]
//        [--anchor x,z,yaw] [--spread k] [--camera cx,cy,cz,tx,ty,tz[,fov]] [--frames all | 0-90 | 0,30,60] [--who s1,s2]
//        [--expect '<measure><op><value>@<share>'] [--no-ik] [--rows] [--json out.json]
//
// One clip per person, played on the first staff members (or --who) through R.playShot: the group's centre
// stands at the anchor (default where the first person stands, facing +z), each clip is placed from its
// `origin` and the gaps between people are widened by --spread (default the game's, so pairDepth measures the
// staged spacing); a clip without an origin is put 1.2 m from the previous. Frames are shot frames (30 a
// second from the earliest clip's first source frame).
//
// Rules: --expect 'selfDepth<=0.03@1' passes when at least that share of the frames that have the measure
// meet it (@share defaults to 1). Without --expect these run:
//   contactMiss<=0.06@0.9   selfDepth<=0.03@1   pairDepth<=0.03@1   onScreen>=0.9@0.9
// Exit 0 when every rule passes, 1 when one fails, 2 on bad input.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const MEASURES = ['contactMiss', 'selfDepth', 'pairDepth', 'onScreen', 'heightPx'];
export const DEFAULT_RULES = ['contactMiss<=0.06@0.9', 'selfDepth<=0.03@1', 'pairDepth<=0.03@1', 'onScreen>=0.9@0.9'];
const USAGE = "usage: node blender/checks/mocap.mjs --clip a.json[,b.json] [--mock floor | --seed N [--week W]] [--anchor x,z,yaw] [--spread k] [--camera cx,cy,cz,tx,ty,tz[,fov]] [--frames all|a-b|n,n] [--who s1,s2] [--expect '<measure><op><value>@<share>'] [--no-ik] [--rows] [--json out.json]";
const fail = (msg) => { console.error(`mocap: ${msg}\n${USAGE}`); process.exit(2); };

export function parseRule(text) {
  const m = /^(\w+)\s*(<=|>=|<|>)\s*(-?[\d.]+)(?:@([\d.]+))?$/.exec(text.trim());
  if (!m || !MEASURES.includes(m[1])) throw new Error(`can't read rule "${text}" (want <measure><op><value>@<share>, measure one of ${MEASURES.join(', ')})`);
  const share = m[4] == null ? 1 : Number(m[4]);
  if (!(share > 0 && share <= 1)) throw new Error(`rule "${text}": the share must be above 0 and at most 1`);
  return { text: text.trim(), measure: m[1], op: m[2], value: Number(m[3]), share };
}
const ok = (v, r) => (r.op === '<=' ? v <= r.value : r.op === '>=' ? v >= r.value : r.op === '<' ? v < r.value : v > r.value);

// Verdicts per person and rule over the rows.
export function judge(rows, rules, explicit) {
  const out = [];
  for (const id of [...new Set(rows.map((r) => r.id))]) {
    for (const rule of rules) {
      const vals = rows.filter((r) => r.id === id && r[rule.measure] != null).map((r) => r[rule.measure]);
      if (!vals.length) { if (explicit.has(rule.text)) out.push({ id, rule, pass: false, none: true }); continue; }
      const share = vals.filter((v) => ok(v, rule)).length / vals.length;
      out.push({ id, rule, share, n: vals.length, pass: share >= rule.share, worst: rule.op[0] === '<' ? Math.max(...vals) : Math.min(...vals) });
    }
  }
  return out;
}

function parseFrames(spec, max) {
  if (!spec || spec === 'all') return null;
  const out = [];
  for (const part of spec.split(',')) {
    const m = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (!m) throw new Error(`--frames wants all, a-b or n,n,..., not "${spec}"`);
    for (let f = Number(m[1]); f <= Number(m[2] ?? m[1]); f++) out.push(f);
  }
  return out;
}

async function main() {
  const argv = process.argv.slice(2);
  const opt = {};
  const flags = new Set(['no-ik', 'rows']);
  const multi = new Set(['expect']);
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) fail(`unexpected argument ${a}`);
    const k = a.slice(2);
    if (flags.has(k)) opt[k] = true;
    else if (['clip', 'mock', 'seed', 'week', 'anchor', 'spread', 'camera', 'frames', 'who', 'expect', 'json'].includes(k)) {
      if (argv[i + 1] === undefined) fail(`--${k} needs a value`);
      if (multi.has(k)) (opt[k] ??= []).push(argv[++i]); else opt[k] = argv[++i];
    } else fail(`unknown option ${a}`);
  }
  if (!opt.clip) fail('--clip is required');
  const clips = [];
  for (const file of opt.clip.split(',').filter(Boolean)) {
    let c;
    try { c = JSON.parse(readFileSync(file, 'utf8')); } catch (e) { fail(`cannot read ${file}: ${e.message.split('\n')[0]}`); }
    if (c.format !== 'hitl-mocap-clip' || c.version !== 1 || !c.tracks || !(c.frames >= 1)) fail(`${file} is not a hitl-mocap-clip version 1 file`);
    clips.push(c);
  }
  const nums = (key, n) => { if (opt[key] == null) return undefined; const v = opt[key].split(',').map(Number); if (v.length < n || v.some((x) => !Number.isFinite(x))) fail(`--${key} wants ${n} numbers separated by commas`); return v; };
  let anchor, camera, frames, rules;
  const a = nums('anchor', 3);
  if (a) anchor = { x: a[0], z: a[1], yaw: a[2] };
  camera = nums('camera', 6);
  const spread = opt.spread == null ? undefined : Number(opt.spread);
  if (spread !== undefined && !(spread > 0)) fail('--spread wants a number above 0');
  try {
    frames = parseFrames(opt.frames);
    rules = (opt.expect ?? DEFAULT_RULES).map(parseRule);
  } catch (e) { fail(e.message); }
  const { MOCK_SCENARIOS } = await import('../../src/dev/mockSim.js');
  if (opt.mock != null && !MOCK_SCENARIOS.includes(opt.mock)) fail(`no mock scenario "${opt.mock}" (want one of ${MOCK_SCENARIOS.join(', ')})`);
  const who = opt.who ? opt.who.split(',').filter(Boolean) : null;

  const t0 = performance.now();
  const { runCases } = await import('../../scripts/studio/page-host.mjs');
  const source = opt.seed != null ? { seed: Number(opt.seed), weeks: opt.week ? Number(opt.week) : 0 } : { mock: opt.mock ?? 'floor' };
  const arg = { clips, anchor, spread, camera, frames, who, ik: !opt['no-ik'], width: 1280, height: 800 };
  const [r] = await runCases([{ page: { ...source, quality: 'medium', rig: 1, width: 1280, height: 800 }, module: fileURLToPath(new URL('./mocap-page.js', import.meta.url)), fn: 'mocapPage', arg }], { jobs: 1 });
  if (r.error) { console.error(`mocap: engine: ${r.error}`); process.exit(2); }
  if (r.value.error) fail(r.value.error);
  const { rows, placed } = r.value;
  const ids = r.value.ids;

  console.log(`mocap: ${clips.length} clip(s) on ${ids.join(', ')}${anchor ? '' : ' at the first person'}, ${new Set(rows.map((x) => x.frame)).size} frames, studio engine, nothing drawn`);
  ids.forEach((id, i) => {
    const mine = rows.filter((x) => x.id === id);
    const col = (m) => mine.map((x) => x[m]).filter((v) => v != null);
    const mx = (m) => (col(m).length ? Math.max(...col(m)) : null), mn = (m) => (col(m).length ? Math.min(...col(m)) : null);
    const worst = mine.reduce((b, x) => (x.selfDepth > (b?.selfDepth ?? 0) ? x : b), null);
    const f = (v) => (v == null ? '-' : String(+v.toFixed(4)));
    console.log(`MOCAP ${id} ${clips[i].name ?? i} at ${placed[i].x.toFixed(2)},${placed[i].z.toFixed(2)} yaw ${placed[i].yaw.toFixed(2)}: ${mine.length} frames; contactMiss max ${f(mx('contactMiss'))} over ${col('contactMiss').length} contact frames; selfDepth max ${f(mx('selfDepth'))}${worst?.selfPair ? ` (${worst.selfPair} at frame ${worst.frame})` : ''}; pairDepth max ${f(mx('pairDepth'))}; onScreen min ${f(mn('onScreen'))}; heightPx ${f(mn('heightPx'))} to ${f(mx('heightPx'))}`);
  });
  if (opt.rows) for (const x of rows) console.log(`MOCAPROW ${x.frame} ${x.id} miss=${x.contactMiss ?? '-'} [${x.contacts.join(',')}] self=${x.selfDepth}${x.selfPair ? ` ${x.selfPair}` : ''} pair=${x.pairDepth} on=${x.onScreen ?? '-'} px=${x.heightPx ?? '-'}`);
  const verdicts = judge(rows, rules, new Set(opt.expect ?? []));
  for (const v of verdicts) {
    console.log(v.none ? `MOCAP FAIL ${v.id} ${v.rule.text}: no frame has ${v.rule.measure}` : `MOCAP ${v.pass ? 'ok  ' : 'FAIL'} ${v.id} ${v.rule.text}: ${(v.share * 100).toFixed(0)}% of ${v.n} frames (want ${(v.rule.share * 100).toFixed(0)}%); worst ${+v.worst.toFixed(4)}`);
  }
  if (opt.json) writeFileSync(opt.json, JSON.stringify(rows, null, 1));
  const bad = verdicts.filter((v) => !v.pass).length;
  console.log(`mocap: ${verdicts.length - bad} of ${verdicts.length} rule(s) passed in ${(performance.now() - t0).toFixed(0)} ms`);
  process.exit(bad ? 1 : 0);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await main();
