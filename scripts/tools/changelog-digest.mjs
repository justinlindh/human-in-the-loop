// One day of day-changes.mjs output as plain markdown, for a drafting model to read: each kept PR with
// its title, trimmed body, the feature entries it added or changed (with their still links) and the
// generated effects numbers behind them. Long effects text is cut, and clips and GIFs are left out
// because the changelog shows stills only.
//
//   node scripts/tools/changelog-digest.mjs <day-changes.json> [<day> [<file with the feature-media branch's file names>]]
//   (markdown on stdout)
//
// Exit 0; 2 on bad input.
import { readFileSync } from 'node:fs';

const cut = (s, n) => (s.length > n ? `${s.slice(0, n).trim()} ...` : s);
const oneLine = (s) => String(s).replace(/\s+/g, ' ').trim();

const RAW = 'https://raw.githubusercontent.com/justinlindh/human-in-the-loop/feature-media';

// The feature-media branch's files (`names`) that are a still of one of these feature ids:
// `<kind>-<id>.webp` or `.png`, any kind.
export const stillsFor = (ids = [], names = []) => names.filter((n) => ids.some((id) => new RegExp(`^[a-z]+-${id.replace(/[^\w-]/g, '')}\\.(webp|png)$`).test(n)));

// `featureFiles` lists the file names on the feature-media branch; a feature whose id has one there gets it
// as a still line.
export function digest(data, day = data.days[0]?.date, featureFiles = []) {
  const d = data.days.find((x) => x.date === day);
  if (!d) throw new Error(`no ${day} in the data`);
  const out = [`# ${day}: ${d.prs.length} merged PR(s), ${d.direct.length} direct commit(s)`, ''];
  for (const pr of d.prs) {
    out.push(`## #${pr.number} ${pr.title}`, '', cut(pr.body, 700), '');
    const stills = pr.prMedia.filter((m) => m.kind === 'still');
    for (const m of stills.slice(0, 4)) out.push(`- PR still${m.label ? ` (${oneLine(m.label)})` : ''}: ${m.url}`);
    for (const f of pr.features) {
      if (f.status === 'removed') continue;
      out.push(`- Feature (${f.status}, ${f.file.replace('docs/features/', '')}): ${cut(oneLine(f.text), 1500)}`);
      const seen = new Set();
      for (const u of [...f.media.filter((x) => x.kind === 'still').map((m) => m.url), ...stillsFor(f.ids, featureFiles).map((n) => `${RAW}/${n}`)]) if (!seen.has(u)) { seen.add(u); out.push(`  - still: ${u}`); }
      for (const e of f.effects ?? []) out.push(`  - effects (${e.name}): ${cut(oneLine(e.kind === 'row' ? Object.entries(e.columns).slice(1).map(([k, v]) => `${k}: ${v}`).join('; ') : e.text), 450)}`);
    }
    out.push('');
  }
  for (const c of d.direct) {
    out.push(`## commit ${c.sha} ${c.subject}`, '', cut(c.body, 400), '');
    for (const f of c.features) if (f.status !== 'removed') out.push(`- Feature (${f.status}): ${cut(oneLine(f.text), 400)}`);
    out.push('');
  }
  return `${out.join('\n').replace(/\n{3,}/g, '\n\n').trim()}\n`;
}

function main(argv) {
  if (!argv[0]) { console.error('usage: changelog-digest.mjs <day-changes.json> [<day> [<feature-media file list>]]'); return 2; }
  try {
    const stills = argv[2] ? readFileSync(argv[2], 'utf8').split('\n').map((s) => s.trim()).filter(Boolean) : [];
    process.stdout.write(digest(JSON.parse(readFileSync(argv[0], 'utf8')), argv[1], stills)); return 0;
  } catch (e) { console.error(`changelog-digest: ${e.message}`); return 2; }
}

if (import.meta.url === `file://${process.argv[1]}`) process.exitCode = main(process.argv.slice(2));
