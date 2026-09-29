// Which readability specs a change touches (stage.mjs --touched): the specs of stage.mjs's SPECS table
// that are new or whose text changed against a base version of the file, and every spec that runs in a
// scenario whose setup (the SCENARIOS table) changed. Text is compared as written, so an edited comment
// above a spec counts.

// The entries of `const <name> = {` ... `};` at the top level: key -> the entry's text with the comment
// lines just above it. An entry starts at a two-space indent with a quoted or bare key.
export function tableEntries(text, name) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(`const ${name} = {`));
  const entries = new Map();
  if (start < 0) return entries;
  let key = null, buf = [], lead = [];
  const finish = () => { if (key) entries.set(key, buf.join('\n')); key = null; buf = []; };
  for (let i = start + 1; i < lines.length && lines[i] !== '};'; i++) {
    const line = lines[i];
    const m = /^ {2}(?:'([^']+)'|([A-Za-z_]\w*)):/.exec(line);
    if (m) { finish(); key = m[1] ?? m[2]; buf = [...lead, line]; lead = []; }
    else if (/^ {2}\/\//.test(line)) { finish(); lead.push(line); }
    else if (key) buf.push(line);
  }
  finish();
  return entries;
}

const scenarioOf = (entryText) => /scenario: '([^']+)'/.exec(entryText)?.[1] ?? /moment: '([^']+)'/.exec(entryText)?.[1] ?? null;

// The specs a head file touches against a base file: key -> why (added, changed, or its scenario changed).
export function touchedSpecs(baseText, headText) {
  const was = tableEntries(baseText, 'SPECS'), now = tableEntries(headText, 'SPECS');
  const wasScenarios = tableEntries(baseText, 'SCENARIOS'), nowScenarios = tableEntries(headText, 'SCENARIOS');
  const changedScenarios = new Set([...nowScenarios].filter(([k, v]) => wasScenarios.get(k) !== v).map(([k]) => k));
  const out = new Map();
  for (const [k, v] of now) {
    if (!was.has(k)) out.set(k, 'added');
    else if (was.get(k) !== v) out.set(k, 'changed');
    else if (changedScenarios.has(scenarioOf(v))) out.set(k, `its scenario "${scenarioOf(v)}" changed`);
  }
  return out;
}
