// Small helpers shared by the perf scripts.
const argv = process.argv.slice(2);

// --name value, or dflt; a bare --name is true.
export function arg(name, dflt) {
  const i = argv.indexOf(`--${name}`);
  if (i < 0) return dflt;
  const next = argv[i + 1];
  return next === undefined || next.startsWith('--') ? true : next;
}

// Linear-interpolated quantile of an unsorted list; NaN when empty.
export function quantile(xs, q) {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export const median = (xs) => quantile(xs, 0.5);
