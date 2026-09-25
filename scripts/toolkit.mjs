#!/usr/bin/env node
// The toolkit: one file per tool in docs/toolkit/ (a header of `key: value` lines between --- lines,
// then what the tool does), printed as tables grouped by section. Each tool has its own file so
// PRs that add or change different tools never conflict. docs/toolkit.md has the prose around them.
//   npm run toolkit                          every section's table (markdown)
//   npm run toolkit -- --section render      one section
//   npm run toolkit -- --grep <text>         entries whose tool or text mentions <text>
//   npm run toolkit -- --check               every script and check has an entry, and every entry is well formed
//                                            (scripts/, its tool folders, the reel kit, the git and Claude hooks, blender/checks/)
// Header keys: tool (how it's run, in backticks), section (one of SECTIONS), who (optional), and
// covers (the files the entry documents, space-separated; --check matches them against the tree).
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const DIR = join(ROOT, 'docs/toolkit');
export const SECTIONS = {
  pr: 'Pull requests and the merge gate',
  hooks: 'Claude Code hooks',
  ci: 'CI internals',
  run: 'Running and watching the game',
  sim: 'Simulation and balance',
  browser: 'Browser health',
  render: 'Render checks',
  perf: 'Performance',
  timing: 'The timing log',
  models: 'Models and assets',
};
// What --check expects an entry for: runnable scripts and checks, not their tests.
const TOOL_GLOBS = [
  ['scripts', /\.(sh|js|mjs)$/], ['scripts/perf', /\.js$/], ['scripts/events', /\.js$/], ['scripts/hooks/claude', /\.sh$/],
  ['scripts/lib', /\.(sh|js|mjs)$/], ['scripts/trailer', /\.js$/], ['scripts/systemd', /\.sh$/], ['scripts/feature-media', /\.(sh|js|mjs)$/],
  ['scripts/hooks', /^[^.]+$|\.(sh|js)$/], ['scripts/trailer/vo', /\.(sh|py|js)$/], ['scripts/reels', /\.(sh|js|mjs)$/],
  ['blender/checks', /\.(mjs|js)$/],
];

export function readEntries(dir = DIR) {
  const out = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.md')).sort()) {
    const text = readFileSync(join(dir, f), 'utf8');
    const m = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    const e = { file: f, body: '', covers: [], problems: [] };
    if (!m) { e.problems.push('no --- header'); out.push(e); continue; }
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/);
      if (kv) e[kv[1]] = kv[2].trim(); else if (line.trim()) e.problems.push(`unreadable header line: ${line}`);
    }
    e.body = m[2].trim();
    e.covers = typeof e.covers === 'string' && e.covers ? e.covers.split(/\s+/) : [];
    if (!e.tool) e.problems.push('no tool');
    if (!SECTIONS[e.section]) e.problems.push(`section "${e.section}" is not one of ${Object.keys(SECTIONS).join(', ')}`);
    if (!e.body) e.problems.push('no description');
    out.push(e);
  }
  return out;
}

const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n+/g, ' ');
export function table(entries, section) {
  const list = entries.filter((e) => e.section === section);
  if (!list.length) return '';
  const who = list.some((e) => e.who);
  const head = who ? '| Tool | Who | What it does |\n|---|---|---|' : '| Tool | What it does |\n|---|---|';
  const rows = list.map((e) => (who ? `| ${cell(e.tool)} | ${cell(e.who)} | ${cell(e.body)} |` : `| ${cell(e.tool)} | ${cell(e.body)} |`));
  return `## ${SECTIONS[section]}\n\n${head}\n${rows.join('\n')}\n`;
}

export function check(root = ROOT, dir = join(root, 'docs/toolkit')) {
  const entries = readEntries(dir);
  const problems = [];
  for (const e of entries) for (const p of e.problems) problems.push(`${e.file}: ${p}`);
  const covered = new Map();
  for (const e of entries) for (const c of e.covers) {
    covered.set(c, e.file);
    if (!existsSync(join(root, c))) problems.push(`${e.file}: covers ${c}, which doesn't exist`);
  }
  const internal = new Set();
  const internalFile = join(dir, 'internal.txt');
  if (existsSync(internalFile)) {
    for (const line of readFileSync(internalFile, 'utf8').split('\n')) {
      const p = line.replace(/#.*/, '').trim().split(/\s+/)[0];
      if (!p) continue;
      internal.add(p);
      if (!existsSync(join(root, p))) problems.push(`internal.txt: ${p} doesn't exist`);
    }
  }
  for (const [sub, re] of TOOL_GLOBS) {
    const d = join(root, sub);
    if (!existsSync(d)) continue;
    for (const n of readdirSync(d)) {
      const p = `${sub}/${n}`;
      if (!re.test(n) || /\.test\.[a-z]+$/.test(n) || !statSync(join(d, n)).isFile()) continue;
      if (!covered.has(p) && !internal.has(p)) problems.push(`${p} has no toolkit entry: add docs/toolkit/<name>.md (or list it in docs/toolkit/internal.txt if it is a module the tools use)`);
    }
  }
  return { entries: entries.length, problems };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : null; };
  if (argv.includes('--check')) {
    const r = check();
    for (const p of r.problems) console.log(`toolkit: ${p}`);
    console.log(r.problems.length ? `toolkit: ${r.problems.length} problem(s) in ${r.entries} entries` : `toolkit: ok: ${r.entries} entries, every script and check covered`);
    process.exit(r.problems.length ? 1 : 0);
  }
  let entries = readEntries();
  const g = opt('grep')?.toLowerCase();
  if (g) entries = entries.filter((e) => `${e.tool} ${e.body} ${e.covers.join(' ')}`.toLowerCase().includes(g));
  const only = opt('section');
  const sections = only ? [only] : Object.keys(SECTIONS);
  console.log(sections.map((s) => table(entries, s)).filter(Boolean).join('\n'));
}
