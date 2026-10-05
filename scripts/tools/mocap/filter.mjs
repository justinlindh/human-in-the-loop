// Smoothing for baked motion. A one-euro filter (Casiez, Roussel, Vogel 2012) cuts the cutoff frequency when a
// signal is slow, which removes the tracker's jitter, and raises it when the signal moves fast, which keeps
// real motion crisp. A baked clip is offline, so the filter runs forward and backward and the two passes are
// averaged: no lag, and a flat signal comes out exactly flat.

export const DEFAULT_FILTER = { minCutoff: 1.5, beta: 0.3, dCutoff: 1.0 };

const alpha = (cutoff, fps) => { const tau = 1 / (2 * Math.PI * cutoff); return 1 / (1 + tau * fps); };

function pass(series, fps, { minCutoff, beta, dCutoff }) {
  const out = [series[0].slice()];
  const dim = series[0].length;
  let dHat = new Array(dim).fill(0);
  for (let t = 1; t < series.length; t++) {
    const prev = out[t - 1], x = series[t];
    const dRaw = x.map((v, k) => (v - prev[k]) * fps);
    const ad = alpha(dCutoff, fps);
    dHat = dRaw.map((v, k) => ad * v + (1 - ad) * dHat[k]);
    const speed = Math.hypot(...dHat);
    const a = alpha(minCutoff + beta * speed, fps);
    out.push(x.map((v, k) => a * v + (1 - a) * prev[k]));
  }
  return out;
}

// series: an array of equal-length number arrays at `fps`. Returns a new array of the same shape.
export function smoothSeries(series, fps, params = DEFAULT_FILTER) {
  if (series.length < 3) return series.map((v) => v.slice());
  const p = { ...DEFAULT_FILTER, ...params };
  const fwd = pass(series, fps, p);
  const bwd = pass(series.slice().reverse(), fps, p).reverse();
  return fwd.map((f, t) => f.map((v, k) => (v + bwd[t][k]) / 2));
}

// Unit quaternions [x, y, z, w] with sign continuity (neighbours in the same hemisphere), smoothed
// componentwise and renormalised.
export function smoothQuats(quats, fps, params) {
  const flipped = [quats[0].slice()];
  for (let t = 1; t < quats.length; t++) {
    const q = quats[t], p = flipped[t - 1];
    const dot = q[0] * p[0] + q[1] * p[1] + q[2] * p[2] + q[3] * p[3];
    flipped.push(dot < 0 ? q.map((v) => -v) : q.slice());
  }
  return smoothSeries(flipped, fps, params).map((q) => { const n = Math.hypot(...q) || 1; return q.map((v) => v / n); });
}
