export class WebGLRenderer {
  constructor({ canvas }) {
    this.domElement = canvas; this.shadowMap = {};
    this.info = { autoReset: false, render: { calls: 0, triangles: 0 }, memory: {}, programs: [], reset() {} };
  }
  getContext() { return { getExtension: () => null, getParameter: () => 'headless' }; }
  setSize() {} setPixelRatio() {} dispose() {}
}

export function createPost() {
  return { bloom: {}, setQuality() {}, setTiltShift() {}, setCamera() {}, setSize() {}, dispose() {},
    render() { throw new Error('scene-engine: drawing is unavailable'); } };
}
