// The small cash line in the HUD: the last stretch of weekly cash, drawn so a glance says rising, falling or
// heading for a cliff. Pure helpers plus one canvas draw.

export const SPARK_WEEKS = 40;

// The last `max` weeks of cash from state.history ({ week, cash }), oldest first.
export const sparkValues = (history, max = SPARK_WEEKS) => (history ?? []).slice(-max).map((x) => x.cash).filter(Number.isFinite);

// Changes whenever the line would, without building its values: the history grew or its newest week moved, the
// runway colour (`key`) changed, or the canvas was resized across a breakpoint.
export const sparkSig = (history, key, width = 0) => `${history?.length ?? 0}|${history?.[history.length - 1]?.week ?? ''}|${key}|${width}`;

// How many recent weeks decide whether the line is rising or falling.
export const SLOPE_WEEKS = 6;

// 'bad' when the runway line is red, 'warn' when amber, else 'up' or 'down' by where cash is heading now
// (the last few weeks), so a company that has turned around reads green however far it fell before.
export function sparkTone(values, subClass = 'sub') {
  if (/\bbad\b/.test(subClass)) return 'bad';
  if (/\bwarn\b/.test(subClass)) return 'warn';
  if (values.length < 2) return 'flat';
  const last = values[values.length - 1];
  const from = values[Math.max(0, values.length - 1 - SLOPE_WEEKS)];
  return last >= from ? 'up' : 'down';
}

const COLOR = { up: '#2f9e75', down: '#e8930c', warn: '#e8930c', bad: '#e5484d', flat: '#8f8795' };

export function drawCashSpark(canvas, values, tone) {
  const g = canvas.getContext?.('2d');
  if (!g) return false;
  const dpr = Math.min(2, globalThis.devicePixelRatio || 1);
  const w = canvas.clientWidth || 64, hgt = canvas.clientHeight || 24;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(hgt * dpr)) { canvas.width = Math.round(w * dpr); canvas.height = Math.round(hgt * dpr); }
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, hgt);
  if (values.length < 2) return true;
  const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  const pad = 3;
  const X = (i) => pad + (i / (values.length - 1)) * (w - 2 * pad);
  const Y = (v) => hgt - pad - ((v - lo) / (hi - lo || 1)) * (hgt - 2 * pad);
  const col = COLOR[tone] ?? COLOR.flat;
  // Zero is a dashed line when the cash dips below it.
  if (lo < 0) {
    g.strokeStyle = 'rgba(42,38,48,0.35)'; g.lineWidth = 1; g.setLineDash([2, 2]);
    g.beginPath(); g.moveTo(pad, Y(0)); g.lineTo(w - pad, Y(0)); g.stroke(); g.setLineDash([]);
  }
  g.fillStyle = `${col}33`;
  g.beginPath(); g.moveTo(X(0), Y(Math.max(lo, 0)));
  values.forEach((v, i) => g.lineTo(X(i), Y(v)));
  g.lineTo(X(values.length - 1), Y(Math.max(lo, 0))); g.closePath(); g.fill();
  g.strokeStyle = col; g.lineWidth = 2; g.lineJoin = 'round'; g.lineCap = 'round';
  g.beginPath(); values.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v)))); g.stroke();
  g.fillStyle = col; g.beginPath(); g.arc(X(values.length - 1), Y(values[values.length - 1]), 2.4, 0, Math.PI * 2); g.fill();
  return true;
}
