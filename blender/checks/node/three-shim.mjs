export * from '/home/justin/src/gamedev-tools/node_modules/three/build/three.module.js';
const noop = new Proxy(function () {}, { get: (_, k) => (k === 'then' ? undefined : k === Symbol.toPrimitive ? () => 0 : noop), apply: () => noop, set: () => true });
class Fake {
  constructor(o = {}) {
    this.domElement = o.canvas ?? { width: 1, height: 1, style: {}, addEventListener() {}, getContext: () => null };
    this.shadowMap = { enabled: false, type: 0 };
    this.info = { autoReset: false, render: { calls: 0, triangles: 0, frame: 0 }, memory: { geometries: 0, textures: 0 }, programs: [], reset() {} };
    this.capabilities = { getMaxAnisotropy: () => 1, maxTextureSize: 4096, isWebGL2: true };
    this.extensions = { has: () => false, get: () => null };
    this.xr = { enabled: false };
    return new Proxy(this, { get: (t, k) => (k in t ? t[k] : noop), set: (t, k, v) => { t[k] = v; return true; } });
  }
  getSize(v) { return v.set(1280, 800); }
  getDrawingBufferSize(v) { return v.set(1280, 800); }
  getPixelRatio() { return 1; }
  getContext() { return noop; }
  setSize() {} setPixelRatio() {} render() {} setRenderTarget() {} clear() {} dispose() {} compile() {} setClearColor() {}
}
export { Fake as WebGLRenderer };
