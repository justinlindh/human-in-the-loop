#!/usr/bin/env node
// Decides whether a PR head that merges main by hand only kept both sides of each conflict, so a
// review pass can carry across it (scripts/review-carry.sh). The rules, in order:
//   1. the head is a merge whose first parent is <passed> and whose second parent is on <base>;
//   2. the head differs from git's own merge (merge-tree) only in conflicted regions, and each region
//      resolves to ours then theirs, or theirs then ours, verbatim. In src/sim/balance.js the one
//      allowed region is a single line whose key: value set is the union of both sides' lines, with
//      no key given two values. In src/data/*.js no object key may appear twice in a region, and in
//      tests no test name may appear twice in the file;
//   3. conflicted files are only docs/, *.md (not src/contract/), src/data/*.js, tests, or that one
//      balance.js line;
//   4. main changed none of the PR's own src/ files outside those conflicted files.
// Usage: node scripts/merge-union-check.mjs <passed> <head> <base-ref> [--repo <dir>]
// Prints the verdict; exit 0 when the pass may carry, 1 with the rule that failed, 2 on errors.
import { execFileSync } from 'node:child_process';

const argv = process.argv.slice(2);
const ri = argv.indexOf('--repo');
const repo = ri >= 0 ? argv.splice(ri, 2)[1] : process.cwd();
const [passed, head, base] = argv;
if (!passed || !head || !base) { console.log('usage: merge-union-check.mjs <passed> <head> <base-ref> [--repo <dir>]'); process.exit(2); }
const git = (args, ok = [0]) => {
  try { return execFileSync('git', ['-C', repo, '-c', 'merge.conflictStyle=merge', ...args], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'pipe'] }); }
  catch (e) { if (ok.includes(e.status)) return e.stdout; throw e; }
};
const fail = (rule, why) => { console.log(`merge-union-check: rule ${rule}: ${why}`); process.exit(1); };

try {
  // Rule 1.
  const parents = git(['rev-list', '--parents', '-n', '1', head]).trim().split(/\s+/).slice(1);
  if (parents.length !== 2) fail(1, `${head.slice(0, 7)} is not a two-parent merge`);
  const [p1, p2] = parents;
  const full = (r) => git(['rev-parse', r]).trim();
  if (p1 !== full(passed)) fail(1, `the merge's first parent ${p1.slice(0, 7)} is not the head that passed (${passed.slice(0, 7)})`);
  try { git(['merge-base', '--is-ancestor', p2, base]); } catch { fail(1, `the merge's second parent ${p2.slice(0, 7)} is not on ${base}`); }

  // Git's own merge of the same parents: its tree, and the paths it left conflicted.
  const out = git(['merge-tree', '--write-tree', '-z', p1, p2], [0, 1]);
  const [first, ...rest] = out.split('\0');
  const autoTree = first.trim();
  const conflicted = new Set();
  for (const f of rest) { const m = f.match(/^\d+ [0-9a-f]+ [123]\t(.+)$/); if (m) conflicted.add(m[1]); else if (!f) break; }
  // Main split docs/features.md into docs/features/<area>.md while the PR edited the old file: the one
  // hand change allowed is moving the PR's own line edits there verbatim. The lines the PR removed and
  // added in docs/features.md must be exactly the lines the merge removes and adds under docs/features/.
  const INV = 'docs/features.md', AREAS = 'docs/features/';
  const has = (rev, f) => { try { git(['cat-file', '-e', `${rev}:${f}`]); return true; } catch { return false; } };
  const edits = (a, b, path) => {
    const rm = [], add = [];
    for (const l of git(['diff', '-U0', a, b, '--', path]).split('\n')) {
      if (/^(---|\+\+\+) /.test(l)) continue;
      if (l.startsWith('-')) rm.push(l.slice(1)); else if (l.startsWith('+')) add.push(l.slice(1));
    }
    return { rm: rm.sort(), add: add.sort() };
  };
  let ported = false;
  if (conflicted.has(INV) && !has(p2, INV) && !has(head, INV)) {
    const own = edits(git(['merge-base', p1, p2]).trim(), p1, INV), moved = edits(p2, head, AREAS);
    const same = (x, y) => x.length === y.length && x.every((l, i) => l === y[i]);
    if (!same(own.rm, moved.rm) || !same(own.add, moved.add)) {
      fail(2, `docs/features.md: the PR's own line edits weren't moved verbatim into docs/features/ (the PR removed ${own.rm.length} and added ${own.add.length} line(s); the merge removes ${moved.rm.length} and adds ${moved.add.length} there)`);
    }
    conflicted.delete(INV); ported = true;
  }
  const changed = git(['diff', '--name-only', autoTree, head]).split('\n').filter(Boolean)
    .filter((f) => !(ported && (f === INV || f.startsWith(AREAS))));
  for (const f of changed) if (!conflicted.has(f)) fail(2, `${f} differs from git's own merge but had no conflict: a hand edit`);

  // Rule 3.
  const isTest = (f) => f.startsWith('tests/') || /\.test\.m?js$/.test(f);
  const allowed = (f) => !f.startsWith('src/contract/') && (f.startsWith('docs/') || f.endsWith('.md') || /^src\/data\/[^/]+\.js$/.test(f) || isTest(f) || f === 'src/sim/balance.js');
  for (const f of conflicted) if (!allowed(f)) fail(3, `${f} had a conflict, and only docs, *.md (not src/contract/), src/data/*.js, tests and one balance.js line can carry`);

  // Rule 2, file by file.
  const blob = (tree, f) => { try { return git(['cat-file', 'blob', `${tree}:${f}`]); } catch { return null; } };
  // A balance line's `key: value` pieces, split on top-level commas (not those inside [], {}, () or
  // quotes), so each value is its whole text. null when a piece isn't a pair or a key repeats.
  const pairs = (line) => {
    const pieces = []; let depth = 0, quote = null, cur = '';
    for (const ch of line.replace(/\/\/.*$/, '')) {
      if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
      if (ch === "'" || ch === '"' || ch === '`') quote = ch;
      else if ('[{('.includes(ch)) depth++;
      else if (']})'.includes(ch)) depth--;
      else if (ch === ',' && depth === 0) { pieces.push(cur); cur = ''; continue; }
      cur += ch;
    }
    pieces.push(cur);
    const map = new Map();
    for (const piece of pieces.map((x) => x.trim()).filter(Boolean)) {
      const m = piece.match(/^([A-Za-z_$][\w$]*)\s*:\s*([\s\S]+)$/);
      if (!m || map.has(m[1])) return null;
      map.set(m[1], m[2].replace(/\s+/g, ' ').trim());
    }
    return map;
  };
  let regions = 0;
  for (const f of conflicted) {
    const marked = blob(autoTree, f), resolved = blob(head, f);
    if (marked === null || resolved === null) fail(2, `${f}: a conflict other than a content one (a delete or a rename)`);
    // Split git's marked file into plain text and conflict blocks.
    const segs = []; let text = '', block = null;
    for (const line of marked.split(/(?<=\n)/)) {
      if (line.startsWith('<<<<<<< ')) { segs.push({ text }); text = ''; block = { ours: '', theirs: '', side: 'ours' }; }
      else if (block && line.startsWith('=======') && line.trim() === '=======') block.side = 'theirs';
      else if (block && line.startsWith('>>>>>>> ')) { segs.push(block); block = null; }
      else if (block) block[block.side] += line;
      else text += line;
    }
    segs.push({ text });
    const blocks = segs.filter((s) => s.ours !== undefined);
    regions += blocks.length;
    if (f === 'src/sim/balance.js' && blocks.length !== 1) fail(3, `src/sim/balance.js has ${blocks.length} conflicted regions; one line can carry`);
    for (const b of blocks) {
      if (/^src\/data\/[^/]+\.js$/.test(f)) {
        const keys = [...(b.ours + b.theirs).matchAll(/^\s*([A-Za-z_$][\w$]*|'[^']+'|"[^"]+")\s*:/gm)].map((m) => m[1].replace(/^['"]|['"]$/g, ''));
        const dup = keys.find((k, i) => keys.indexOf(k) !== i);
        if (dup) fail(2, `${f}: both sides define the key ${dup}, and JS would keep only the later one`);
      }
    }
    // Match the resolved file against the segments, each block taking an allowed resolution.
    const options = (b) => {
      if (f === 'src/sim/balance.js') {
        if (b.ours.split('\n').length !== 2 || b.theirs.split('\n').length !== 2) return [];
        return [{ balance: true }];
      }
      return [...new Set([b.ours + b.theirs, b.theirs + b.ours])].map((s) => ({ s }));
    };
    const seen = new Set();
    const match = (i, pos) => {
      if (i === segs.length) return pos === resolved.length;
      const key = `${i}:${pos}`; if (seen.has(key)) return false; seen.add(key);
      const seg = segs[i];
      if (seg.ours === undefined) return resolved.startsWith(seg.text, pos) && match(i + 1, pos + seg.text.length);
      for (const o of options(seg)) {
        if (o.balance) {
          const end = resolved.indexOf('\n', pos);
          const line = resolved.slice(pos, end < 0 ? resolved.length : end + 1);
          const a = pairs(seg.ours), b = pairs(seg.theirs), r = pairs(line);
          if (!a || !b || !r) continue;
          const clash = [...a].some(([k, v]) => b.has(k) && b.get(k) !== v);
          const union = new Map([...a, ...b]);
          const same = r.size === union.size && [...union].every(([k, v]) => r.get(k) === v);
          if (!clash && same && match(i + 1, pos + line.length)) return true;
        } else if (resolved.startsWith(o.s, pos) && match(i + 1, pos + o.s.length)) return true;
      }
      return false;
    };
    if (!match(0, 0)) {
      fail(2, f === 'src/sim/balance.js'
        ? 'src/sim/balance.js: the resolved line is not the union of both sides\' keys, a key has two values, or something else changed'
        : `${f}: a conflict wasn't resolved by keeping both sides verbatim (ours then theirs, or theirs then ours)`);
    }
    if (isTest(f)) {
      const names = [...resolved.matchAll(/\b(?:it|test|describe)(?:\.each\([^)]*\))?\(\s*(['"`])(.*?)\1/g)].map((m) => m[2]);
      const inRegions = blocks.flatMap((b) => [...(b.ours + b.theirs).matchAll(/\b(?:it|test|describe)(?:\.each\([^)]*\))?\(\s*(['"`])(.*?)\1/g)].map((m) => m[2]));
      const dup = inRegions.find((n) => names.filter((x) => x === n).length > 1);
      if (dup) fail(2, `${f}: the test name "${dup}" appears twice`);
    }
  }

  // Rule 4.
  const mb = git(['merge-base', p1, p2]).trim();
  const files = (a, b) => new Set(git(['diff', '--name-only', a, b]).split('\n').filter(Boolean));
  const mine = files(mb, p1), theirs = files(mb, p2);
  for (const f of mine) if (f.startsWith('src/') && theirs.has(f) && !conflicted.has(f)) fail(4, `main also changed ${f}, one of this PR's own src files`);

  console.log(`merge-union-check: ok: ${regions} conflicted region(s) kept both sides${conflicted.size ? ` in ${[...conflicted].join(', ')}` : ''}${ported ? '; docs/features.md edits moved verbatim into docs/features/' : ''}`);
  process.exit(0);
} catch (e) {
  console.log(`merge-union-check: error: ${String(e.stderr || e.message).trim().split('\n')[0]}`);
  process.exit(2);
}
