// --param for the render checks: override a module-level const in game code for one run, with no
// source edit. A Vite plugin rewrites the declaration as the module loads, in Node (pose.mjs) and in
// the page (the harness), so both see the same value.
//
//   --param src/render/character.js:PALM_STAND=[-2.75,0.14,0.27,-0.6,0.08]   the whole value
//   --param PALM_STAND[2]=0.3        one element (an assignment after the declaration)
//   --param SWIVEL=0.4               a bare name is looked up in src/
// The declaration must be `const NAME = <value>;` at the top level of one file, and the value can't
// contain a newline-terminated semicolon. A name that isn't found, or found twice, is an error
// before anything runs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SPEC = /^(?:(.+?):)?([A-Za-z_$][\w$]*)(?:\[(\d+)\])?=(.+)$/s;

const declRe = (name) => new RegExp(`((?:^|\\n)[ \\t]*(?:export\\s+)?const\\s+${name.replace(/\$/g, '\\$')}\\s*=\\s*)([\\s\\S]*?);(?=[ \\t]*(?:\\r?\\n|$))`);

function* jsFiles(dir) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) yield* jsFiles(p);
    else if (/\.(m?js)$/.test(n)) yield p;
  }
}

// Specs like the ones above into { file (absolute), name, index, value }, checking each one.
export function resolveParams(specs, root) {
  return specs.map((spec) => {
    const m = SPEC.exec(spec);
    if (!m) throw new Error(`param: can't read "${spec}" (want [file:]NAME[index]=value)`);
    const [, file, name, index, value] = m;
    if (/[\n]/.test(value) || value.includes(';')) throw new Error(`param: the value of ${name} can't hold a newline or a semicolon`);
    const re = declRe(name);
    const candidates = file ? [resolve(root, file)] : [...jsFiles(join(root, 'src'))].filter((f) => re.test(readFileSync(f, 'utf8')));
    if (!candidates.length) throw new Error(`param: no top-level "const ${name} =" found${file ? ` in ${file}` : ' under src/'}`);
    if (candidates.length > 1) throw new Error(`param: ${name} is declared in ${candidates.length} files (${candidates.map((c) => c.slice(root.length + 1)).join(', ')}): name one, like src/render/x.js:${name}=...`);
    let text;
    try { text = readFileSync(candidates[0], 'utf8'); } catch { throw new Error(`param: can't read ${file}`); }
    if (!re.test(text)) throw new Error(`param: no top-level "const ${name} =" found in ${file}`);
    return { file: candidates[0], name, index: index === undefined ? null : Number(index), value };
  });
}

// The specs a command line carries (each --param takes one).
export function paramSpecs(argv) {
  return argv.flatMap((a, i) => (a === '--param' ? [argv[i + 1]] : []));
}

export function applyParams(code, params) {
  let out = code;
  for (const p of [...params].sort((a, b) => (a.index === null ? 0 : 1) - (b.index === null ? 0 : 1))) {
    out = out.replace(declRe(p.name), (all, head, val) => (p.index === null ? `${head}${p.value};` : `${head}${val};\n${p.name}[${p.index}] = ${p.value};`));
  }
  return out;
}

// A Vite plugin applying the params to their files.
export function paramPlugin(params) {
  if (!params?.length) return null;
  const by = new Map();
  for (const p of params) by.set(p.file, [...(by.get(p.file) ?? []), p]);
  return {
    name: 'hitl-param', enforce: 'pre',
    transform(code, id) {
      const mine = by.get(id.split('?')[0]);
      return mine ? { code: applyParams(code, mine), map: null } : null;
    },
  };
}
