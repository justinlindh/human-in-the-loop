// Cases for scripts/toolkit.mjs against a stand-in tree. Exit 0 when all pass.
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { check, readEntries, table } from './toolkit.mjs';

let fails = 0;
const expect = (ok, what) => { if (!ok) { fails++; console.log(`FAIL ${what}`); } };
const root = mkdtempSync(join(tmpdir(), 'toolkit-'));
const put = (p, text) => { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), text); };
const entry = (tool, section, covers, body = 'Does a thing | with a pipe.') => `---\ntool: ${tool}\nsection: ${section}\n${covers ? `covers: ${covers}\n` : ''}---\n${body}\n`;
try {
  put('scripts/a.sh', ''); put('scripts/b.mjs', ''); put('scripts/a.test.sh', ''); put('scripts/lib/helper.js', '');
  put('blender/checks/clip.mjs', ''); put('scripts/README.md', '');
  put('docs/toolkit/a.md', entry('`scripts/a.sh`', 'pr', 'scripts/a.sh'));
  put('docs/toolkit/clip.md', entry('`clip.mjs`', 'render', 'blender/checks/clip.mjs'));
  put('docs/toolkit/internal.txt', '# modules\nscripts/lib/helper.js   used by a.sh\n');
  let r = check(root);
  expect(r.problems.length === 1 && r.problems[0].startsWith('scripts/b.mjs has no toolkit entry'), `a script with no entry is named (got ${JSON.stringify(r.problems)})`);
  put('docs/toolkit/b.md', entry('`scripts/b.mjs`', 'run', 'scripts/b.mjs'));
  r = check(root);
  expect(r.problems.length === 0, `every script covered passes (got ${JSON.stringify(r.problems)})`);
  put('docs/toolkit/gone.md', entry('`gone`', 'run', 'scripts/gone.sh'));
  put('docs/toolkit/bad.md', entry('`bad`', 'nowhere', null));
  put('docs/toolkit/nohead.md', 'just text\n');
  r = check(root);
  const has = (s) => r.problems.some((p) => p.includes(s));
  expect(has("gone.md: covers scripts/gone.sh, which doesn't exist"), 'an entry for a missing file is caught');
  expect(has('bad.md: section "nowhere"'), 'an unknown section is caught');
  expect(has('nohead.md: no --- header'), 'a file with no header is caught');
  const t = table(readEntries(join(root, 'docs/toolkit')), 'pr');
  expect(t.includes('| `scripts/a.sh` | Does a thing \\| with a pipe. |'), `a pipe in the text is escaped in the table (got ${t})`);
} finally { rmSync(root, { recursive: true, force: true }); }
console.log(fails ? `toolkit: ${fails} failing` : 'toolkit: all cases pass');
process.exit(fails ? 1 : 0);
