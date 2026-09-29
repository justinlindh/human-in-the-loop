// Pure helpers for the sweep's scoped and replayed runs (sweep.mjs); loaded in Node and in the page.

// Whether a violation involves the item: its id as a whole token in either thing or the detail
// (`noc` matches `noc/pal_plastic_charcoal` and `noc#3[frame]`, not `snocone` or `noc_l2`; `desk`
// does not match `standing_desk`).
export function mentions(item, ...texts) {
  const re = new RegExp(`(^|[^a-z0-9_])${String(item).replace(/[^a-z0-9_]/gi, '')}(?![a-z0-9_])`, 'i');
  return texts.some((t) => t != null && re.test(String(t)));
}

// What a previous report's violations need to be checked again: the weeks of each seeded game, the
// mocks, and the indexed moments (their queries are recorded on the report's windows).
// `only` narrows it to the named states.
export function planReplay(report, only = null) {
  const seeds = {}, mocks = new Set(), events = new Set(), skipped = new Set();
  const queryOf = new Map((report.windows ?? []).filter((w) => w.query).map((w) => [w.state, w.query]));
  for (const v of report.violations ?? []) {
    for (const state of v.states ?? [v.state]) {
      if (only && !only.includes(state)) continue;
      let m;
      if ((m = /^seed:(\d+):w(\d+)$/.exec(state))) (seeds[m[1]] ??= new Set()).add(Number(m[2]));
      else if (/^mock:/.test(state)) mocks.add(state.slice(5));
      else if (state.startsWith('event:') && queryOf.has(state)) events.add(queryOf.get(state));
      else if (state.startsWith('moment:')) mocks.add('floor');
      else skipped.add(state);
    }
  }
  return { seeds: Object.fromEntries(Object.entries(seeds).map(([s, w]) => [s, [...w].sort((a, b) => a - b)])), mocks: [...mocks], events: [...events], skipped: [...skipped] };
}
