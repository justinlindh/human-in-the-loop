// Graphics quality the game starts in when neither ?quality= nor a saved choice picks one.

// Software rasterizers draw every pixel on the CPU; High is unplayable on them.
const SOFTWARE_GL = /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i;

export function isSoftwareRenderer(name) {
  return typeof name === 'string' && SOFTWARE_GL.test(name);
}

// The WebGL renderer string, unmasked where the browser allows it; null without WebGL.
export function glRendererName(doc = globalThis.document) {
  try {
    const gl = doc.createElement('canvas').getContext('webgl2') ?? doc.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER);
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return String(name);
  } catch {
    return null;
  }
}

export function autoQuality(name) {
  return isSoftwareRenderer(name) ? 'low' : 'high';
}
