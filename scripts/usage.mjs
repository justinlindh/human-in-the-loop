// Token use per teammate over the current 5-hour window, from Claude Code's session logs.
//
//   npm run usage [-- --hours 5 | --since <ISO time>] [--prefix <project folder prefix>] [--json]
//
// Reads every session and subagent log under $CLAUDE_PROJECTS (default ~/.claude/projects) in the
// project folders of this repository's checkouts (from git worktree list, named as Claude Code
// names them), or in every folder whose name starts with --prefix. Prints per teammate, with a
// teammate's subagents on their own row: messages, output tokens, fresh input (read uncached, cache
// writes included) and cache reads, largest output first, with the window's totals.
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { usageSince } from './usage-lib.mjs';

const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const root = process.env.CLAUDE_PROJECTS ?? join(homedir(), '.claude', 'projects');
// Claude Code names a project folder after its path with every non-alphanumeric character as '-'.
const folder = (p) => p.replace(/[^A-Za-z0-9]/g, '-');
const here = resolve(import.meta.dirname, '..');
let checkouts = [here];
try {
  const list = execFileSync('git', ['worktree', 'list', '--porcelain'], { cwd: here, encoding: 'utf8' });
  checkouts = list.split('\n').filter((l) => l.startsWith('worktree ')).map((l) => l.slice(9));
} catch { /* not a git checkout: this folder only */ }
const prefix = opt('prefix');
const folders = new Set(checkouts.map(folder));
const wanted = prefix ? (d) => d.startsWith(prefix) : (d) => folders.has(d);
const since = opt('since') ? new Date(opt('since')) : new Date(Date.now() - Number(opt('hours', 5)) * 3600e3);
if (Number.isNaN(since.getTime())) { console.error(`usage: can't read --since ${opt('since')}`); process.exit(2); }

let rows;
try { rows = await usageSince(root, wanted, since); } catch (e) { console.error(`usage: can't read ${root}: ${e.message}`); process.exit(2); }
if (argv.includes('--json')) { console.log(JSON.stringify({ since: since.toISOString(), rows }, null, 1)); process.exit(0); }
const n = (v) => v.toLocaleString('en-US');
const w = [24, 9, 12, 13, 14];
const line = (cells) => cells.map((c, i) => (i ? String(c).padStart(w[i]) : String(c).padEnd(w[i]))).join(' ');
console.log(`usage since ${since.toISOString()} (${prefix ? `folders starting ${prefix}` : `${folders.size} checkouts`})`);
console.log(line(['teammate', 'messages', 'output', 'fresh input', 'cache reads']));
for (const r of rows) console.log(line([r.who, n(r.messages), n(r.output), n(r.freshInput), n(r.cacheRead)]));
const sum = (k) => rows.reduce((a, r) => a + r[k], 0);
console.log(line(['total', n(sum('messages')), n(sum('output')), n(sum('freshInput')), n(sum('cacheRead'))]));
