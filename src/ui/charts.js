// Small canvas charts for Reports and Ops. Drawn once per data change, never per frame.
import { dateOf } from './dom.js';

const INK = '#2a2630';
const GRID = 'rgba(42,38,48,0.10)';
const FONT = (px, w = 500) => `${w} ${px}px 'JetBrains Mono', ui-monospace, monospace`;

function setup(w, hgt) {
  const c = document.createElement('canvas');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  c.width = Math.round(w * dpr);
  c.height = Math.round(hgt * dpr);
  c.style.width = `${w}px`;
  c.style.height = `${hgt}px`;
  c.className = 'chart';
  const g = c.getContext('2d');
  if (g) g.scale(dpr, dpr);
  return { c, g };
}

// Picks a round step so the axis has 2 to 4 even ticks.
function niceScale(v) {
  if (!(v > 0)) return { max: 1, ticks: 2 };
  const raw = v / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  let step = 10 * p;
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= raw) { step = m * p; break; }
  const ticks = Math.max(2, Math.ceil(v / step - 1e-9));
  return { max: step * ticks, ticks };
}

function frame(g, w, hgt, pad, max, min, fmt, weeks, ticks = 4) {
  const x0 = pad.l, x1 = w - pad.r, y0 = pad.t, y1 = hgt - pad.b;
  g.font = FONT(10);
  g.fillStyle = 'rgba(42,38,48,0.6)';
  g.textBaseline = 'middle';
  g.textAlign = 'right';
  for (let i = 0; i <= ticks; i++) {
    const v = min + ((max - min) * i) / ticks;
    const y = y1 - ((y1 - y0) * i) / ticks;
    g.strokeStyle = GRID;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
    g.fillText(fmt(v), x0 - 5, y);
  }
  if (weeks.length > 1) {
    g.textAlign = 'center';
    g.textBaseline = 'top';
    const first = weeks[0], last = weeks[weeks.length - 1];
    const span = Math.max(1, last - first);
    let lastYear = dateOf(first).year;
    let lastLabelX = x0 + 14;
    g.fillText(String(lastYear), lastLabelX, y1 + 4);
    for (let i = 1; i < weeks.length; i++) {
      const yr = dateOf(weeks[i]).year;
      if (yr === lastYear) continue;
      lastYear = yr;
      const x = x0 + ((yr - 2026) * 52 - first) / span * (x1 - x0);
      g.strokeStyle = GRID; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke();
      const lx = Math.min(x1 - 14, x);
      if (lx - lastLabelX > 44) { g.fillText(String(yr), lx, y1 + 4); lastLabelX = lx; }
    }
  }
  return { x0, x1, y0, y1 };
}

// series: [{ label, color, values: number[] }] sharing x = weeks.
export function lineChart({ weeks, series, w = 420, h: hgt = 150, fmt = (v) => String(Math.round(v)), min = 0, max, fill = true }) {
  const { c, g } = setup(w, hgt);
  if (!g) return c;
  const all = series.flatMap((s) => s.values).filter(Number.isFinite);
  const lo0 = Math.min(min, ...all.filter((v) => v < min));
  const sc = max !== undefined ? { max, ticks: 4 } : niceScale(Math.max(1, ...all) - Math.min(0, lo0));
  const lo = lo0 < 0 ? -niceScale(-lo0).max : lo0;
  const top = max ?? (lo < 0 ? niceScale(Math.max(1, ...all)).max : sc.max);
  const pad = { l: 46, r: 12, t: 10, b: 20 };
  const f = frame(g, w, hgt, pad, top, lo, fmt, weeks, lo < 0 ? 4 : sc.ticks);
  const n = weeks.length;
  if (n < 2) {
    g.fillStyle = 'rgba(42,38,48,0.5)'; g.font = FONT(11); g.textAlign = 'center';
    g.fillText('Not enough history yet', w / 2, hgt / 2);
    return c;
  }
  const X = (i) => f.x0 + (i / (n - 1)) * (f.x1 - f.x0);
  const Y = (v) => f.y1 - ((v - lo) / (top - lo || 1)) * (f.y1 - f.y0);
  for (const s of series) {
    const vals = s.values;
    if (fill) {
      g.fillStyle = `${s.color}26`;
      g.beginPath(); g.moveTo(X(0), Y(Math.max(lo, 0)));
      vals.forEach((v, i) => g.lineTo(X(i), Y(v)));
      g.lineTo(X(n - 1), Y(Math.max(lo, 0))); g.closePath(); g.fill();
    }
    g.strokeStyle = s.color; g.lineWidth = 2.5; g.lineJoin = 'round'; g.lineCap = 'round';
    g.beginPath();
    vals.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
    g.stroke();
    const lv = vals[n - 1];
    g.fillStyle = s.color; g.strokeStyle = INK; g.lineWidth = 1.5;
    g.beginPath(); g.arc(X(n - 1), Y(lv), 3.5, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  return c;
}

// Stacked area: series drawn bottom-up.
export function stackedChart({ weeks, series, w = 420, h: hgt = 150, fmt = (v) => String(Math.round(v)) }) {
  const { c, g } = setup(w, hgt);
  if (!g) return c;
  const n = weeks.length;
  const totals = weeks.map((_, i) => series.reduce((a, s) => a + (s.values[i] || 0), 0));
  const sc = niceScale(Math.max(1, ...totals));
  const top = sc.max;
  const pad = { l: 46, r: 12, t: 10, b: 20 };
  const f = frame(g, w, hgt, pad, top, 0, fmt, weeks, sc.ticks);
  if (n < 2) return c;
  const X = (i) => f.x0 + (i / (n - 1)) * (f.x1 - f.x0);
  const Y = (v) => f.y1 - (v / top) * (f.y1 - f.y0);
  const base = new Array(n).fill(0);
  for (const s of series) {
    const next = base.map((b, i) => b + (s.values[i] || 0));
    g.fillStyle = s.color;
    g.beginPath();
    g.moveTo(X(0), Y(next[0]));
    for (let i = 1; i < n; i++) g.lineTo(X(i), Y(next[i]));
    for (let i = n - 1; i >= 0; i--) g.lineTo(X(i), Y(base[i]));
    g.closePath(); g.fill();
    g.strokeStyle = INK; g.lineWidth = 1.2;
    g.beginPath();
    for (let i = 0; i < n; i++) (i ? g.lineTo(X(i), Y(next[i])) : g.moveTo(X(i), Y(next[i])));
    g.stroke();
    for (let i = 0; i < n; i++) base[i] = next[i];
  }
  return c;
}

// Evenly thins a long history for drawing.
export function sample(hist, maxPoints = 160) {
  if (hist.length <= maxPoints) return hist;
  const step = hist.length / maxPoints;
  const out = [];
  for (let i = 0; i < maxPoints; i++) out.push(hist[Math.floor(i * step)]);
  out[out.length - 1] = hist[hist.length - 1];
  return out;
}
