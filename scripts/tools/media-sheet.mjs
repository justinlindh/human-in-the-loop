#!/usr/bin/env node
// One labelled contact sheet for a batch of rendered media: every still in one grid, then one row of evenly
// spaced frames per clip, each row titled with its file name, all stacked into a single PNG and its path printed.
//
//   node scripts/tools/media-sheet.mjs <out.png> <file|dir>... [--count 6] [--per-row 6] [--crop x,y,w,h] [--base <dir>]
//
// A directory is searched for .webp .png .jpg .mp4 .webm .mov (hidden folders such as .publish are skipped). The
// cells come from scripts/sheet.sh; rows of different widths are padded with white, so a clip row and a short row
// of stills stack without a size mismatch. Exit 0 on success, 2 on bad input, 1 when a row cannot be made.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolTmp } from './tmp.mjs';

const SHEET = fileURLToPath(new URL('../sheet.sh', import.meta.url));
const STILL = /\.(webp|png|jpe?g)$/i, CLIP = /\.(mp4|webm|mov)$/i;
const USAGE = 'usage: node scripts/tools/media-sheet.mjs <out.png> <file|dir>... [--count 6] [--per-row 6] [--crop x,y,w,h] [--base <dir>]';
const fail = (msg, code = 2) => { console.error(`media-sheet: ${msg}${code === 2 ? `\n${USAGE}` : ''}`); process.exit(code); };

const args = process.argv.slice(2);
const files = [];
const opt = { count: 6, 'per-row': 6, crop: null, base: null };
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--count' || a === '--per-row' || a === '--crop' || a === '--base') {
    if (args[i + 1] === undefined) fail(`${a} needs a value`);
    opt[a.slice(2)] = a === '--crop' || a === '--base' ? args[++i] : Number(args[++i]);
  } else if (a.startsWith('--')) fail(`unknown option ${a}`);
  else files.push(a);
}
const [out, ...inputs] = files;
if (!out || !inputs.length) fail('an output file and at least one input are required');
if (!/\.png$/i.test(out)) fail('the output must be a .png');
for (const k of ['count', 'per-row']) if (!Number.isInteger(opt[k]) || opt[k] < 1 || opt[k] > 12) fail(`--${k} wants a whole number from 1 to 12`);

const found = [];
const walk = (p) => {
  if (!existsSync(p)) fail(`no such file or directory: ${p}`);
  if (statSync(p).isDirectory()) {
    for (const name of readdirSync(p).sort()) if (!name.startsWith('.')) walk(join(p, name));
  } else if (STILL.test(p) || CLIP.test(p)) found.push(resolve(p));
};
for (const p of inputs) walk(p);
if (!found.length) fail('no stills or clips among the inputs', 1);

// Titles are paths from --base, else the first input's directory, so two clips named alike in different folders stay apart.
const base = opt.base ? resolve(opt.base) : statSync(inputs[0]).isDirectory() ? resolve(inputs[0]) : dirname(resolve(inputs[0]));
const tmp = mkdtempSync(join(toolTmp(), 'media-sheet-'));
// Each step runs async so a signal is handled at once: the whole process group is signalled, so the running step
// ends too, and the temp folder goes before the exit.
const run = (cmd, argv) => new Promise((done, reject) => {
  const p = spawn('nice', ['-n', '10', 'timeout', '300', cmd, ...argv], { stdio: ['ignore', 'pipe', 'pipe'] });
  let err = '';
  p.stderr.on('data', (d) => { err += d; });
  p.on('close', (status) => (status === 0 ? done() : reject(new Error(`${basename(cmd)} ${argv.slice(0, 2).join(' ')} failed: ${err.trim().split('\n').pop()}`))));
});
let code = 0;
const stop = (c) => () => { rmSync(tmp, { recursive: true, force: true }); process.exit(c); };
process.on('SIGINT', stop(130));
process.on('SIGTERM', stop(143));
process.on('SIGHUP', stop(129));
try {
  const crop = opt.crop ? ['--crop', opt.crop] : [];
  const rows = [];
  const stills = found.filter((f) => STILL.test(f)), clips = found.filter((f) => CLIP.test(f));
  if (stills.length) {
    const file = join(tmp, `row-${rows.length}.png`);
    await run(SHEET, ['grid', file, '--cols', String(opt['per-row']), ...crop, ...stills]);
    rows.push({ file, title: `${stills.length} still${stills.length === 1 ? '' : 's'}` });
  }
  for (const clip of clips) {
    const file = join(tmp, `row-${rows.length}.png`);
    await run(SHEET, ['frames', file, clip, '--count', String(opt.count), '--cols', String(opt.count), ...crop]);
    rows.push({ file, title: relative(base, clip) });
  }
  // A title band over each row; rows of different widths are padded on the right with white.
  const titled = [];
  for (const [i, r] of rows.entries()) {
    const file = join(tmp, `titled-${i}.png`);
    // The title comes from a file (label:@file), so a path that starts with @ or holds % or \ is plain text.
    const text = join(tmp, `title-${i}.txt`);
    writeFileSync(text, r.title);
    await run('magick', ['(', '-background', 'white', '-fill', 'black', '-font', 'DejaVu-Sans', '-pointsize', '22', `label:@${text}`, '-bordercolor', 'white', '-border', '8x4', ')', r.file, '-background', 'white', '-gravity', 'west', '-append', '-depth', '8', '+repage', file]);
    titled.push(file);
  }
  await run('magick', [...titled, '-background', 'white', '-gravity', 'west', '-append', '-depth', '8', '+repage', resolve(out)]);
  console.log(resolve(out));
} catch (e) {
  code = 1;
  console.error(`media-sheet: ${e.message}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
process.exit(code);
