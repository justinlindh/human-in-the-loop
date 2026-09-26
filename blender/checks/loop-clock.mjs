// Virtual time for the page. __frame(n) advances n frames: due timers run, then the frames' rAFs.
export const SHIM = `(() => {
  let now = 0, seq = 1, rafs = [];
  const timers = new Map();
  let s = 20260925;
  Math.random = () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  performance.now = () => now;
  Date.now = () => 1790000000000 + now;
  window.setTimeout = (fn, ms = 0, ...a) => { const id = seq++; timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn, a }); return id; };
  window.setInterval = (fn, ms = 0, ...a) => { const id = seq++; timers.set(id, { at: now + Math.max(1, Number(ms) || 0), fn, a, every: Math.max(1, Number(ms) || 0) }); return id; };
  window.clearTimeout = window.clearInterval = (id) => { timers.delete(id); };
  window.requestAnimationFrame = (cb) => { const id = seq++; rafs.push({ id, cb }); return id; };
  window.cancelAnimationFrame = (id) => { rafs = rafs.filter((r) => r.id !== id); };
  const run = (fn, a) => { try { if (typeof fn === 'function') fn(...a); } catch (e) { console.error(e); } };
  window.__frame = (n = 1) => {
    for (let i = 0; i < n; i++) {
      now += 1000 / 30;
      for (const [id, t] of [...timers].sort((x, y) => x[1].at - y[1].at)) {
        if (t.at > now) continue;
        if (t.every) t.at += t.every; else timers.delete(id);
        run(t.fn, t.a);
      }
      const due = rafs; rafs = [];
      for (const r of due) run(r.cb, [now]);
    }
  };
})();`;

