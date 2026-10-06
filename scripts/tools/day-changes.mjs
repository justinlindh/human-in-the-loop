// The player-visible changes of a day (or a range of days), as JSON: the raw material for a per-day
// changelog. Reads the pull requests merged into main, keeps those that changed something players
// see, and for each gives the title, a trimmed body, the docs/features entries it added, changed or
// removed (the text, ids and media links), and any media in the PR body.
//
//   node scripts/tools/day-changes.mjs <YYYY-MM-DD | YYYY-MM-DD..YYYY-MM-DD | --since-first>
//        [--tz <zone>] [--scopes art,ui,...] [--types feat,fix] [--body-chars 600] [--no-fetch]
//
// A PR is player-visible when its Conventional Commits type is in --types (default feat, fix) and its
// scope is in --scopes (default art, ui, sim, audio, capture, pacing), or when it touched
// docs/features/ at all. Every other PR is listed under `skipped` with the reason, so nothing is lost
// silently. Days follow --tz (default the machine's zone); --since-first starts at 2026-09-23 and
// ends today. The docs/features entries come from the PR's merge commit against its first parent, so
// they are what the PR changed on main; a merge commit missing locally is fetched once (--no-fetch
// skips that) and, if still missing, the PR carries `featuresUnavailable`.
//
// The early history was merged by hand, with no pull requests: commits on main's first-parent line
// that are not PR merges come out as `direct` (subject, trimmed body, the player-facing areas they
// touched, their docs/features entries), or as `skipped` when they touched none of those paths.
//
// Output: { tz, from, to, days: [{ date, prs, direct, skipped }] }, PRs in merge order. Exit 0;
// 2 on bad input; 1 when GitHub or git cannot be read.
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

export const FIRST_DAY = '2026-09-23';
export const DEFAULT_SCOPES = ['art', 'ui', 'sim', 'audio', 'capture', 'pacing'];
export const DEFAULT_TYPES = ['feat', 'fix'];
const DAY_MS = 86400000;

// --- days -------------------------------------------------------------------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (s) => DAY_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
const addDays = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10);

// The calendar day of an ISO timestamp in a time zone.
export function dayOf(iso, tz) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

// "2026-10-05", "2026-10-01..2026-10-05" or the since-first range, as { from, to }; throws on bad input.
export function parseRange(arg, { sinceFirst = false, today } = {}) {
  if (sinceFirst) return { from: FIRST_DAY, to: today };
  const [a, b = a] = String(arg ?? '').split('..');
  if (!validDay(a) || !validDay(b)) throw new Error(`not a day or a range of days: ${arg ?? '(none)'} (use YYYY-MM-DD or YYYY-MM-DD..YYYY-MM-DD)`);
  if (a > b) throw new Error(`the range runs backwards: ${arg}`);
  return { from: a, to: b };
}

export function eachDay({ from, to }) {
  const out = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// --- classification ---------------------------------------------------------------------------

// "feat(art)!: x" -> { type: 'feat', scope: 'art', breaking: true }; null when not Conventional.
export function parseTitle(title) {
  const m = /^(\w+)(?:\(([^)]*)\))?(!)?:\s/.exec(title || '');
  return m ? { type: m[1], scope: m[2] ?? null, breaking: !!m[3] } : null;
}

// Whether a PR is player-visible, and why or why not.
export function classify({ title, touchesFeatures }, { scopes = DEFAULT_SCOPES, types = DEFAULT_TYPES } = {}) {
  const t = parseTitle(title);
  if (t && types.includes(t.type) && t.scope && scopes.includes(t.scope)) return { visible: true, reason: `${t.type}(${t.scope})` };
  if (touchesFeatures) return { visible: true, reason: 'docs/features' };
  if (!t) return { visible: false, reason: 'not a Conventional Commits title' };
  if (!types.includes(t.type)) return { visible: false, reason: `type ${t.type}` };
  return { visible: false, reason: t.scope ? `scope ${t.scope}` : 'no scope' };
}

// --- body -------------------------------------------------------------------------------------

const SKIP_SECTIONS = /^(checklist|gates run|affects|changes to how the game plays)\b/i;

// The PR body without its template boilerplate (author line, checklist, gates, affects, closing
// keywords, comments, the checklist, gates and affects sections), cut at a line or sentence end.
export function trimBody(body, max = 600) {
  let text = String(body || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\r/g, '');
  const parts = text.split(/^(?=##+\s)/m);
  const kept = [];
  for (const p of parts) {
    const head = /^##+\s+(.*)/.exec(p);
    if (head && SKIP_SECTIONS.test(head[1].trim())) continue;
    kept.push(head ? p.replace(/^##+\s+.*\n?/, (h) => (/^(changes|what|summary)\b/i.test(head[1].trim()) ? '' : h)) : p);
  }
  text = kept.join('\n')
    .split('\n')
    .filter((l) => !/^\s*(author:|affects:|fixes #|closes #|resolves #|co-authored-by:|claude-session:|signed-off-by:|https:\/\/claude\.ai\/|- \*\*gates run:\*\*|- \[[ x]\])/i.test(l))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const at = Math.max(cut.lastIndexOf('\n'), cut.lastIndexOf('. '));
  return `${(at > max * 0.5 ? cut.slice(0, at + 1) : cut).trim()} ...`;
}

const MEDIA_EXT = /\.(png|jpe?g|gif|webp|mp4|webm|mov)(\?[^\s)]*)?$/i;

// Image and video links in a PR body (markdown images and links, or bare URLs), first-seen order.
export function extractMedia(body) {
  const seen = new Set(), out = [];
  const add = (url, label) => {
    if (!/^https?:\/\//.test(url) || !MEDIA_EXT.test(url.replace(/\?raw=true$/, '')) || seen.has(url)) return;
    seen.add(url);
    out.push({ label: label || '', url, kind: /\.(mp4|webm|mov)(\?|$)/i.test(url) ? 'clip' : 'still' });
  };
  const text = String(body || '');
  for (const m of text.matchAll(/!?\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) add(m[2], m[1]);
  for (const m of text.matchAll(/(?<![(\w])(https?:\/\/[^\s)<>"]+)/g)) add(m[1]);
  return out;
}

// --- docs/features entries --------------------------------------------------------------------

const keyOf = (line) => {
  const bold = /\*\*(.+?)\*\*/.exec(line);
  return bold ? bold[1] : line.slice(0, 60);
};

// One docs/features bullet: its text, the `id:` values, the media links and the media note.
export function parseEntry(line, file) {
  const text = line.replace(/^- /, '').trim();
  const ids = [...text.matchAll(/`id: ([^`]+)`/g)].map((m) => m[1]);
  const media = [...text.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)].map((m) => ({ label: m[1], url: m[2], kind: /\.(mp4|webm|mov)(\?|$)/i.test(m[2]) ? 'clip' : /\.gif(\?|$)/i.test(m[2]) ? 'preview' : 'still' }));
  const note = /\bmedia: (none|pending)\b[^\n]*/i.exec(text);
  return { file, title: keyOf(text), text, ids, media, mediaNote: note ? note[0] : null };
}

// The entries a unified diff of docs/features added, changed or removed: a bullet gone and a bullet
// with the same bold title back is "changed" (the new text is given); only one side is added or removed.
export function entriesFromDiff(diff) {
  const added = [], removed = [];
  let file = null;
  for (const line of String(diff).split('\n')) {
    const f = /^\+\+\+ b\/(.+)$/.exec(line);
    if (f) { file = f[1]; continue; }
    if (/^--- (a\/|\/dev\/null)/.test(line)) continue;
    // A bullet is "- text", so an added one is "+- text" and a removed one "-- text".
    if (line.startsWith('+- ')) added.push(parseEntry(line.slice(1), file));
    else if (line.startsWith('-- ')) removed.push(parseEntry(line.slice(1), file));
  }
  const removedKeys = new Map(removed.map((e) => [`${e.file}\n${e.title}`, e]));
  const addedKeys = new Set(added.map((e) => `${e.file}\n${e.title}`));
  const out = [];
  for (const e of added) out.push({ status: removedKeys.has(`${e.file}\n${e.title}`) ? 'changed' : 'added', ...e });
  for (const e of removed) if (!addedKeys.has(`${e.file}\n${e.title}`)) out.push({ status: 'removed', ...e });
  return out;
}

// --- docs/effects -----------------------------------------------------------------------------

const cells = (line) => line.split(/(?<!\\)\|/).slice(1, -1).map((c) => c.trim().replace(/\\\|/g, '|'));

// The generated effects docs, indexed for lookup: decision sections by event id, and table rows by
// their first cell (the element's name). `names` maps a feature id to its display name, since the
// tables do not carry ids.
export function buildEffectsIndex({ docs, names = new Map() }) {
  const decisions = new Map(), rows = new Map();
  for (const [file, md] of Object.entries(docs)) {
    if (file === 'README.md') continue;
    for (const sec of md.split(/^(?=## )/m)) {
      const h = /^## (.+?) `([\w-]+)`\s*$/m.exec(sec.split('\n')[0]);
      if (h) decisions.set(h[2], { file: `docs/effects/${file}`, kind: 'decision', name: h[1], text: sec.trim() });
    }
    const lines = md.split('\n');
    for (let i = 0; i + 1 < lines.length; i++) {
      if (!/^\|/.test(lines[i]) || !/^\|[\s|:-]+\|$/.test(lines[i + 1])) continue;
      const head = cells(lines[i]);
      for (let j = i + 2; j < lines.length && /^\|/.test(lines[j]); j++) {
        const row = cells(lines[j]);
        const entry = { file: `docs/effects/${file}`, kind: 'row', name: row[0], columns: Object.fromEntries(head.map((h, k) => [h, row[k] ?? ''])), text: lines[j] };
        rows.set(row[0], [...(rows.get(row[0]) ?? []), entry]);
      }
    }
  }
  return { decisions, rows, names };
}

// Every effects entry for the ids of one feature entry; [] when none has one.
export function effectsFor(ids, index) {
  if (!index) return [];
  const out = [];
  for (const id of ids) {
    const d = index.decisions.get(id);
    if (d) out.push({ id, ...d });
    const name = index.names.get(id);
    if (name) for (const r of index.rows.get(name) ?? []) out.push({ id, ...r });
  }
  const seen = new Set();
  return out.filter((e) => { const k = `${e.file}\n${e.text}`; return seen.has(k) ? false : (seen.add(k), true); });
}

// The real index: the effects docs of this checkout and the names in src/data.
export async function loadEffectsIndex(root = new URL('../../', import.meta.url)) {
  const { readdirSync, readFileSync } = await import('node:fs');
  const dir = new URL('docs/effects/', root);
  let docs;
  try { docs = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith('.md')).map((f) => [f, readFileSync(new URL(f, dir), 'utf8')])); } catch { return null; }
  const names = new Map();
  for (const mod of ['items', 'policies', 'traits', 'training', 'paths', 'roles', 'categories', 'angles', 'models', 'research']) {
    try {
      const m = await import(new URL(`src/data/${mod}.js`, root));
      for (const v of Object.values(m)) for (const e of Array.isArray(v) ? v : typeof v === 'object' && v ? Object.values(v) : []) if (e && typeof e === 'object' && e.id && e.name && !names.has(e.id)) names.set(e.id, e.name);
    } catch { /* an unreadable data module only means fewer names */ }
  }
  return buildEffectsIndex({ docs, names });
}

// --- git and GitHub ---------------------------------------------------------------------------

const defaultGit = (args) => {
  const r = spawnSync('git', args, { encoding: 'utf8', maxBuffer: 256 << 20 });
  return r.status === 0 ? r.stdout : null;
};
const defaultGh = (args) => {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 256 << 20 });
  if (r.status !== 0) throw new Error(`gh ${args.slice(0, 3).join(' ')} failed: ${(r.stderr || '').trim().split('\n')[0]}`);
  return r.stdout;
};

// The merged PRs into main with merge times between two days (UTC-padded; the caller filters by zone).
// One search per 3-day window so a long backfill stays under the listing limit.
export function listMerged({ from, to }, { gh = defaultGh } = {}) {
  const byNumber = new Map();
  for (let d = addDays(from, -1); d <= addDays(to, 1); d = addDays(d, 3)) {
    const end = [addDays(d, 2), addDays(to, 1)].sort()[0];
    const out = JSON.parse(gh(['pr', 'list', '--state', 'merged', '--base', 'main', '--search', `merged:${d}..${end}`, '--limit', '1000', '--json', 'number,title,body,mergedAt,mergeCommit,url,author,labels']));
    if (out.length >= 1000) process.stderr.write(`day-changes: ${d}..${end} hit the 1000 PR listing limit; some PRs may be missing\n`);
    for (const pr of out) byNumber.set(pr.number, pr);
  }
  return [...byNumber.values()].sort((a, b) => a.mergedAt.localeCompare(b.mergedAt));
}

// The docs/features diff of one merged PR (its merge commit against the first parent): "" when it
// touched none, null when the commit is unknown here.
export function featuresDiff(oid, { git = defaultGit } = {}) {
  if (!oid || git(['cat-file', '-e', `${oid}^{commit}`]) === null) return null;
  return git(['diff', '--no-color', '-U0', `${oid}^1`, oid, '--', 'docs/features']);
}

// Which lane's player-facing code a path belongs to; null for tooling, tests, docs and the rest.
const AREAS = [['art', ['src/render/', 'blender/', 'public/models/']], ['ui', ['src/ui/', 'public/icons/']], ['sim', ['src/sim/', 'src/data/', 'src/save/']], ['audio', ['src/audio/', 'public/audio/']], ['docs/features', ['docs/features/']]];
export const areasOf = (files) => [...new Set(files.flatMap((f) => AREAS.filter(([, ps]) => ps.some((p) => f.startsWith(p))).map(([a]) => a)))];

// Commits on main's first-parent line that are not pull-request merges (the early history was merged
// by hand): { sha, at, subject, body, files }.
export function listDirect({ from, to }, { git = defaultGit, ref = 'origin/main' } = {}) {
  const log = git(['log', ref, '--first-parent', `--since=${addDays(from, -1)}T00:00:00Z`, `--until=${addDays(to, 2)}T00:00:00Z`, '--format=%H%x1f%aI%x1f%s%x1f%b%x1e']);
  if (log === null) return [];
  const out = [];
  for (const rec of log.split('\x1e')) {
    const [sha, at, subject, body = ''] = rec.replace(/^\n/, '').split('\x1f');
    if (!sha || /^Merge pull request #\d+/.test(subject) || /^chore\(release\)/.test(subject)) continue;
    const files = (git(['diff', '--name-only', `${sha}^1`, sha]) ?? git(['show', '--name-only', '--format=', sha]) ?? '').split('\n').filter(Boolean);
    out.push({ sha, at, subject, body: body.trim(), files });
  }
  return out;
}

export function build({ from, to }, opts = {}) {
  const { tz = Intl.DateTimeFormat().resolvedOptions().timeZone, scopes = DEFAULT_SCOPES, types = DEFAULT_TYPES, bodyChars = 600, gh, git, effects = null } = opts;
  // Each feature entry also carries the generated effects (docs/effects) of the ids it names.
  const featuresOf = (diff) => (diff ? entriesFromDiff(diff).map((e) => ({ ...e, effects: effectsFor(e.ids, effects) })) : []);
  const days = new Map(eachDay({ from, to }).map((d) => [d, { date: d, prs: [], direct: [], skipped: [] }]));
  for (const c of listDirect({ from, to }, { git, ref: opts.ref })) {
    const day = days.get(dayOf(c.at, tz));
    if (!day) continue;
    const areas = areasOf(c.files);
    if (!areas.length) { day.skipped.push({ sha: c.sha.slice(0, 8), title: c.subject, reason: 'direct commit, no player-facing paths' }); continue; }
    const diff = featuresDiff(c.sha, { git });
    day.direct.push({ sha: c.sha.slice(0, 8), at: c.at, subject: c.subject, body: trimBody(c.body, bodyChars), areas, features: featuresOf(diff) });
  }
  for (const pr of listMerged({ from, to }, { gh })) {
    const day = days.get(dayOf(pr.mergedAt, tz));
    if (!day) continue;
    const oid = pr.mergeCommit?.oid;
    const diff = featuresDiff(oid, { git });
    const touchesFeatures = !!diff && diff.trim().length > 0;
    const c = classify({ title: pr.title, touchesFeatures }, { scopes, types });
    if (!c.visible) { day.skipped.push({ number: pr.number, title: pr.title, reason: c.reason }); continue; }
    const t = parseTitle(pr.title);
    day.prs.push({
      number: pr.number, url: pr.url, title: pr.title, type: t?.type ?? null, scope: t?.scope ?? null, breaking: !!t?.breaking,
      reason: c.reason, mergedAt: pr.mergedAt, author: pr.author?.login ?? null,
      body: trimBody(pr.body, bodyChars), prMedia: extractMedia(pr.body),
      features: featuresOf(diff), ...(diff === null ? { featuresUnavailable: true } : {}),
    });
  }
  return { tz, from, to, days: [...days.values()] };
}

// --- command line -----------------------------------------------------------------------------

async function main(argv) {
  let v;
  try {
    v = parseArgs({ args: argv, allowPositionals: true, options: { 'since-first': { type: 'boolean' }, tz: { type: 'string' }, scopes: { type: 'string' }, types: { type: 'string' }, 'body-chars': { type: 'string' }, 'no-fetch': { type: 'boolean' } } });
  } catch (e) { console.error(`day-changes: ${e.message}`); return 2; }
  const { values, positionals } = v;
  const tz = values.tz || Intl.DateTimeFormat().resolvedOptions().timeZone;
  try { new Intl.DateTimeFormat('en-CA', { timeZone: tz }); } catch { console.error(`day-changes: unknown time zone ${tz}`); return 2; }
  const bodyChars = values['body-chars'] == null ? 600 : Number(values['body-chars']);
  if (!Number.isInteger(bodyChars) || bodyChars < 1) { console.error('day-changes: --body-chars needs a whole number above 0'); return 2; }
  let range;
  try { range = parseRange(positionals[0], { sinceFirst: values['since-first'], today: dayOf(new Date().toISOString(), tz) }); } catch (e) { console.error(`day-changes: ${e.message}`); return 2; }
  if (values['since-first'] && positionals.length) { console.error('day-changes: --since-first takes no day'); return 2; }
  if (!values['no-fetch']) spawnSync('git', ['fetch', '-q', 'origin', 'main'], { stdio: 'ignore' });
  try {
    const out = build(range, { tz, bodyChars, effects: await loadEffectsIndex(), scopes: values.scopes ? values.scopes.split(',') : DEFAULT_SCOPES, types: values.types ? values.types.split(',') : DEFAULT_TYPES });
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
    return 0;
  } catch (e) { console.error(`day-changes: ${e.message}`); return 1; }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exit(await main(process.argv.slice(2)));
