// Install before page code so counts include initialization and every WebGL context, including
// offscreen portraits. Observe real draw submissions without suppressing or replacing their work.
export function installDrawAudit() {
  const counts = {};
  const wrapped = new WeakSet();
  const wrap = (target, name) => {
    const original = target[name];
    if (typeof original !== 'function' || wrapped.has(original)) return;
    const fn = function (...args) {
      counts[name] = (counts[name] ?? 0) + 1;
      return original.apply(this, args);
    };
    wrapped.add(fn);
    target[name] = fn;
  };
  for (const type of [globalThis.WebGLRenderingContext, globalThis.WebGL2RenderingContext]) {
    if (!type) continue;
    const proto = type.prototype;
    for (const name of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawRangeElements']) wrap(proto, name);
    const getExtension = proto.getExtension;
    proto.getExtension = function (...args) {
      const extension = getExtension.apply(this, args);
      if (extension) {
        for (const name of ['drawArraysInstancedANGLE', 'drawElementsInstancedANGLE', 'multiDrawArraysWEBGL', 'multiDrawElementsWEBGL', 'multiDrawArraysInstancedWEBGL', 'multiDrawElementsInstancedWEBGL']) wrap(extension, name);
      }
      return extension;
    };
  }
  window.__drawAudit = () => ({ total: Object.values(counts).reduce((a, b) => a + b, 0), calls: { ...counts } });
  // The harness freezes performance.now for scene determinism; profiling needs the real clock.
  window.__wallNow = performance.now.bind(performance);
}
