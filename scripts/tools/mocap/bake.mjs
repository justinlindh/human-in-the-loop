#!/usr/bin/env node
// Bakes one person of a tracked shot (track.mjs output) into a hitl-mocap-clip for the chibi rig.
//   node scripts/tools/mocap/bake.mjs --shot <shot-n.json> --out <clip.json|dir> [--person <id>] [--name <name>]
//        [--from <frame>] [--to <frame>] [--shot-index <n>]
// Without --person every person in the shot is baked, one clip each; --out is then a directory. --from and --to
// are frames of the shot (source rate). The format and its space are described in docs/toolkit/mocap-bake.md.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RIG_BONES, bakeShot } from './bake-lib.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const USAGE = 'usage: node scripts/tools/mocap/bake.mjs --shot <shot-n.json> --out <clip.json|dir> [--person <id>] [--name <name>] [--from <frame>] [--to <frame>] [--shot-index <n>]';
const fail = (msg, code = 2) => { console.error(`bake: ${msg}\n${USAGE}`); process.exit(code); };

const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (!a.startsWith('--')) fail(`unexpected argument ${a}`);
  const k = a.slice(2);
  if (!['shot', 'out', 'person', 'name', 'from', 'to', 'shot-index'].includes(k)) fail(`unknown option ${a}`);
  if (argv[i + 1] === undefined) fail(`--${k} needs a value`);
  opts[k] = argv[++i];
}
if (!opts.shot) fail('--shot is required');
if (!opts.out) fail('--out is required');
const int = (k) => { if (opts[k] === undefined) return undefined; const n = Number(opts[k]); if (!Number.isInteger(n) || n < 0) fail(`--${k} takes a whole number`); return n; };
const person = int('person'), from = int('from'), to = int('to');
const shotIndex = int('shot-index') ?? Number(/shot-(\d+)\.json$/.exec(opts.shot)?.[1] ?? 0);

let shot;
try { shot = JSON.parse(readFileSync(opts.shot, 'utf8')); } catch (e) { fail(`cannot read ${opts.shot}: ${e.message}`); }
if (shot.format !== 'hitl-mocap-shot' || shot.version !== 1) fail(`${opts.shot} is not a hitl-mocap-shot version 1 file`);

// Pivot positions come from the rig model itself, as rig.js does.
async function rigPivots() {
  const b = readFileSync(join(ROOT, 'public/models/chibi_rig.glb'));
  const gltf = await new Promise((ok, no) => new GLTFLoader().parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', ok, no));
  gltf.scene.updateMatrixWorld(true);
  const out = {};
  gltf.scene.traverse((o) => { if (RIG_BONES.includes(o.name) && !out[o.name]) out[o.name] = o.getWorldPosition(o.position.clone()).toArray(); });
  return out;
}

const pivots = await rigPivots();
const ids = person === undefined ? shot.people.map((p) => p.id) : [person];
const asFile = opts.out.endsWith('.json');
if (asFile && ids.length !== 1) fail(`the shot has ${ids.length} people: pass --person <id>, or make --out a directory`);
for (const id of ids) {
  const name = opts.name ? (ids.length > 1 ? `${opts.name}_p${id}` : opts.name) : `${basename(opts.shot, '.json')}_p${id}`;
  let clip;
  try { clip = bakeShot(shot, id, { pivots, name, from, to, shotIndex }); } catch (e) { fail(e.message, 1); }
  const dest = asFile ? resolve(opts.out) : join(resolve(opts.out), `${name}.json`);
  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(clip));
  console.log(`bake: ${name}: ${clip.frames} frames, ${clip.contacts.length} contact(s) -> ${dest}`);
}
