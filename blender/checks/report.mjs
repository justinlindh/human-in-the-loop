// The report format shared by the render checks that judge many cases (stage.mjs, the scene
// sweep): one row per case and metric, printed as a table, written as JSON for PRs and tooling.
//
//   const rep = createReport('stage');
//   rep.row({ check: 'letter.read', view: 'default', beat: 'read', metric: 'faceVisible', value: 0.92, want: '>= 0.8', pass: true });
//   rep.skip('letter.read', 'the letter moment is not in this build');
//   A row with known: <issue> is a failure an open issue tracks: printed as KNOWN, not failed. A
//   known row that passes is flagged, so the marker comes off with the fix.
//   rep.finish({ out: 'shots/stage/report.json' })   // prints; returns the exit code (1 if any row failed)
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export function createReport(name) {
  const rows = [], skips = [];
  return {
    row(r) { rows.push(r); },
    skip(check, why) { skips.push({ check, why }); },
    get rows() { return rows; },
    finish({ out } = {}) {
      const cols = ['check', 'view', 'beat', 'metric', 'value', 'want'];
      const cell = (r, c) => (c === 'value' && typeof r.value === 'number' ? String(+r.value.toFixed(3)) : String(r[c] ?? ''));
      const w = cols.map((c) => Math.max(c.length, ...rows.map((r) => cell(r, c).length)));
      const tag = (r) => (r.pass ? 'ok  ' : r.known ? 'KNWN' : 'FAIL');
      // A known rule passing in every view it ran in: its marker can come off.
      const fixed = (r) => rows.filter((q) => q.known === r.known && q.check === r.check && q.metric === r.metric).every((q) => q.pass);
      const line = (vals, r) => `${name.toUpperCase()} ${r ? tag(r) : '    '} ${vals.map((v, i) => v.padEnd(w[i])).join('  ')}${r?.known && (!r.pass || fixed(r)) ? `  (#${r.known}${r.pass ? ': passes now, drop the marker' : ''})` : ''}`;
      console.log(line(cols));
      for (const r of rows) console.log(line(cols.map((c) => cell(r, c)), r));
      for (const s of skips) console.log(`${name.toUpperCase()} skip ${s.check}: ${s.why}`);
      const failed = rows.filter((r) => !r.pass && !r.known).length;
      const known = rows.filter((r) => !r.pass && r.known);
      console.log(`${name}: ${rows.length - failed - known.length} of ${rows.length} passed${known.length ? `, ${known.length} known (${[...new Set(known.map((r) => `#${r.known}`))].join(', ')})` : ''}${skips.length ? `, ${skips.length} skipped` : ''}`);
      if (out) { mkdirSync(dirname(out), { recursive: true }); writeFileSync(out, JSON.stringify({ rows, skips }, null, 1)); }
      return failed ? 1 : 0;
    },
  };
}
