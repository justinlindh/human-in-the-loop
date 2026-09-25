// Which GL a headless Chromium renders with, and a launcher that proves it got it.
//
// Local runs default to the GPU. SwiftShader (software GL) is for work that compares exact pixels
// (the golden images), for machines without a GPU (the GitHub runners set HITL_GL=software), and
// for runs that stand in for a weak device. A run that asked for the GPU and got software GL fails
// instead of quietly taking minutes of CPU.
import { isSoftwareRenderer } from '../../src/quality.js';

export const SOFTWARE_GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
export const GPU_GL_ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu'];

// 'gpu' or 'software': --software or --gpu on the command line, else HITL_GL, else the fallback.
export function glMode({ argv = process.argv, env = process.env, fallback = 'gpu' } = {}) {
  if (argv.includes('--software')) return 'software';
  if (argv.includes('--gpu')) return 'gpu';
  if (env.HITL_GL === 'software' || env.HITL_GL === 'gpu') return env.HITL_GL;
  return fallback;
}

export function glArgs(mode) {
  return mode === 'software' ? SOFTWARE_GL_ARGS : GPU_GL_ARGS;
}

// The WebGL2 renderer string a browser reports, or null without WebGL2.
export async function rendererOf(browser) {
  const page = await browser.newPage();
  try {
    return await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return null;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    });
  } finally {
    await page.close();
  }
}

// Whether a renderer string satisfies a mode: the GPU needs a hardware renderer.
export function rendererMatches(mode, renderer) {
  if (mode !== 'gpu') return true;
  return typeof renderer === 'string' && renderer !== '' && !isSoftwareRenderer(renderer);
}

// Launches Chromium in `mode`, prints "<label>: GL <mode> (<renderer>)", and throws when the GPU was
// asked for but the browser fell back to software GL (a missing Vulkan driver, a blocked GPU).
export async function launchChromium(chromium, { mode = glMode(), label = 'browser', args = [], ...opts } = {}) {
  const browser = await chromium.launch({ ...opts, args: [...glArgs(mode), ...args] });
  const renderer = await rendererOf(browser);
  console.log(`${label}: GL ${mode} (${renderer ?? 'no WebGL2'})`);
  if (!rendererMatches(mode, renderer)) {
    await browser.close();
    throw new Error(`${label}: asked for the GPU but got ${renderer ?? 'no WebGL2'}; set HITL_GL=software to run on SwiftShader`);
  }
  return { browser, renderer, mode };
}
