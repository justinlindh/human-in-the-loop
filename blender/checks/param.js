// --param for the render checks: override a module-level const in game code for one run, with no
// source edit. A Vite plugin rewrites the declaration as the module loads, in Node (pose.mjs) and in
// the page (the harness), so both see the same value.
//
//   --param src/render/character.js:PALM_STAND=[-2.75,0.14,0.27,-0.6,0.08]   the whole value
//   --param PALM_STAND[2]=0.3        one element (an assignment after the declaration)
//   --param SWIVEL=0.4               a bare name is looked up in src/
// The declaration must be `const NAME = <value>;` starting in column 0 of one file, ending at the
// first semicolon outside brackets, strings and comments; a trailing comment is kept. A name that isn't found, or found twice, is an error
// before anything runs.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const SPEC = /^(?:(.+?):)?([A-Za-z_$][\w$]*)(?:\[(\d+)\]|\.([A-Za-z_$][\w$]*))?=(.+)$/s;

const headRe = (name) => new RegExp(`^(?:export\\s+)?const\\s+${name.replace(/\$/g, '\\$')}\\s*=\\s*`, 'm');

// Where a declaration's value starts and ends: the first `;` outside brackets, strings, template
// literals and comments. Null when the file ends first (no semicolon).
function valueSpan(code, name) {
  const m = headRe(name).exec(code);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 0;
  for (let i = start; i < code.length; i++) {
    const c = code[i];
    if (c === '/' && code[i + 1] === '/') { i = code.indexOf('\n', i); if (i < 0) return null; continue; }
    if (c === '/' && code[i + 1] === '*') { i = code.indexOf('*/', i + 2); if (i < 0) return null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < code.length && code[i] !== c; i++) if (code[i] === '\\') i++;
      continue;
    }
    if ('([{'.includes(c)) depth++;
    else if (')]}'.includes(c)) depth--;
    else if (c === ';' && depth === 0) return { head: m.index, start, end: i };
  }
  return null;
}

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
    if (!m) throw new Error(`param: can't read "${spec}" (want [file:]NAME[index]=value or NAME.key=value)`);
    const [, file, name, index, key, value] = m;
    if (/[\n]/.test(value) || value.includes(';')) throw new Error(`param: the value of ${name} can't hold a newline or a semicolon`);
    const has = (f) => headRe(name).test(readFileSync(f, 'utf8'));
    const candidates = file ? [resolve(root, file)] : [...jsFiles(join(root, 'src'))].filter(has);
    if (!candidates.length) throw new Error(`param: no top-level "const ${name} =" found${file ? ` in ${file}` : ' under src/'}`);
    if (candidates.length > 1) throw new Error(`param: ${name} is declared in ${candidates.length} files (${candidates.map((c) => c.slice(root.length + 1)).join(', ')}): name one, like src/render/x.js:${name}=...`);
    let text;
    try { text = readFileSync(candidates[0], 'utf8'); } catch { throw new Error(`param: can't read ${file}`); }
    if (!headRe(name).test(text)) throw new Error(`param: no top-level "const ${name} =" found in ${file}`);
    const p = { file: candidates[0], name, index: index === undefined ? null : Number(index), ...(key === undefined ? {} : { key }), value };
    applyParams(text, [p]);
    return p;
  });
}

// The specs a command line carries (each --param takes one).
export function paramSpecs(argv) {
  return argv.flatMap((a, i) => (a === '--param' ? [argv[i + 1]] : []));
}

export function applyParams(code, params) {
  let out = code;
  const whole = (p) => p.index === null && p.key === undefined;
  for (const p of [...params].sort((a, b) => (whole(a) ? 0 : 1) - (whole(b) ? 0 : 1))) {
    const span = valueSpan(out, p.name);
    if (!span) throw new Error(`param: can't find where ${p.name}'s declaration ends (does it end in a semicolon?)`);
    if (/\n(?:const|let|var|function|export|import|class)\b/.test(out.slice(span.start, span.end))) throw new Error(`param: can't find where ${p.name}'s declaration ends (does it end in a semicolon?)`);
    if (whole(p)) { out = `${out.slice(0, span.start)}${p.value}${out.slice(span.end)}`; continue; }
    const eol = out.indexOf('\n', span.end);
    const at = eol < 0 ? out.length : eol;
    out = `${out.slice(0, at)}\n${p.name}${p.key === undefined ? `[${p.index}]` : `.${p.key}`} = ${p.value};${out.slice(at)}`;
  }
  return out;
}

// The numeric top-level consts of a file, as { name, value } where value is a number, an array of
// numbers, or an object of its numeric members (a flat `{ aside: 0.12, radii: [...] }`, reached as
// NAME.aside): what --param can reach and a slider can drive. Anything else (strings, calls) is left out.
export function listConsts(code) {
  const out = [];
  for (const m of code.matchAll(/^(?:export\s+)?const\s+([A-Za-z_$][\w$]*)\s*=\s*/gm)) {
    const span = valueSpan(code, m[1]);
    if (!span || span.head !== m.index) continue;
    let text = code.slice(span.start, span.end).trim();
    const isObject = /^\{[\w$\s:,.[\]+-]*\}$/.test(text);
    if (!isObject && !/^[-+\d.eE,\s[\]]+$/.test(text)) continue;
    if (isObject) text = text.replace(/([A-Za-z_$][\w$]*)\s*:/g, '"$1":');
    try {
      let value = JSON.parse(text);
      if (isObject) { value = Object.fromEntries(Object.entries(value).filter(([, v]) => typeof v === 'number')); if (!Object.keys(value).length) continue; }
      if (typeof value === 'number' || isObject || (Array.isArray(value) && value.length && value.every((v) => typeof v === 'number'))) out.push({ name: m[1], value });
    } catch { /* not plain JSON numbers (a leading + or a bare .5) */ }
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
