// Which GL a headless Chromium renders with, and a launcher that proves it got it.
//
// Local runs default to the GPU. SwiftShader (software GL) is for work that compares exact pixels
// (the golden images), for machines without a GPU (the GitHub runners set HITL_GL=software), and
// for runs that stand in for a weak device. A run that asked for the GPU and got software GL fails
// instead of quietly taking minutes of CPU.
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { basename } from 'node:path';
import { isSoftwareRenderer } from '../../src/quality.js';
import { logTiming } from './timing.js';
import { trackRun } from './timing.js';

const WITH_RENDER_LOCK = fileURLToPath(new URL('../with-render-lock.sh', import.meta.url));

export const SOFTWARE_GL_ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
export const GPU_GL_ARGS = ['--use-angle=vulkan', '--enable-features=Vulkan', '--ignore-gpu-blocklist', '--enable-gpu'];

// 'gpu' or 'software': --software or --gpu on the command line, else HITL_GL, else software under
// CI (the cloud runners have no GPU), else the fallback.
export function glMode({ argv = process.argv, env = process.env, fallback = env.CI ? 'software' : 'gpu' } = {}) {
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
// Every tool that launches here also logs its run (wall and CPU time, GL mode, exit code) to the
// team's timing log (scripts/lib/timing.js).
export async function launchChromium(chromium, { mode = glMode(), label = 'browser', args = [], ...opts } = {}) {
  trackRun(basename(process.argv[1] ?? label).replace(/\.m?js$/, ''), { gl: mode, args: process.argv.slice(2).join(' ').slice(0, 120) });
  const browser = await chromium.launch({ ...opts, args: [...glArgs(mode), ...args] });
  const renderer = await rendererOf(browser);
  console.log(`${label}: GL ${mode} (${renderer ?? 'no WebGL2'})`);
  watchWebglLoss(browser, { label, mode });
  if (!rendererMatches(mode, renderer)) {
    await browser.close();
    throw new Error(`${label}: asked for the GPU but got ${renderer ?? 'no WebGL2'}; set HITL_GL=software to run on SwiftShader`);
  }
  return { browser, renderer, mode };
}

// Makes sure this process renders under the render lock for `mode`: the exclusive software-GL lock,
// or a GPU slot. Returns at once when it already holds a lock that covers the request (it is the
// holder, or an ancestor is). Otherwise it runs this same command again under
// scripts/with-render-lock.sh, waits for it, and exits with its status, so nothing after the call
// runs twice. Call it before starting servers or browsers. Under CI (no shared machine) it does nothing.
export function holdRenderLock(mode, { env = process.env, argv = process.argv } = {}) {
  if (env.CI) return;
  const flag = mode === 'software' ? '--software' : '--gpu';
  if (spawnSync('bash', [WITH_RENDER_LOCK, flag, '--held'], { stdio: 'inherit' }).status === 0) return;
  const r = spawnSync('bash', [WITH_RENDER_LOCK, flag, process.execPath, ...process.execArgv, ...argv.slice(1)], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

// Counts pages that lose their WebGL context (or never get one) in this browser, and logs one
// timing line (webgl_lost=1) when the browser closes, so GPU failures can be told apart from a
// check's own failures and set against how many GPU runs overlapped. Every page, from newPage or a
// new context, gets a listener; watching never fails the run.
const LOST_MARK = '[hitl] webglcontextlost';
const LOST_RE = /\[hitl\] webglcontextlost|could not be created|Error creating WebGL context|CONTEXT_LOST_WEBGL/;
function watchWebglLoss(browser, { label, mode }) {
  let lost = 0;
  const script = `document.addEventListener('webglcontextlost', () => console.warn(${JSON.stringify(LOST_MARK)}), true);`;
  const watch = (page) => {
    try {
      page.on('console', (m) => { if (LOST_RE.test(m.text())) lost++; });
    } catch { /* never fail the run */ }
  };
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (...a) => {
    const page = await newPage(...a);
    try { await page.addInitScript(script); } catch { /* never fail the run */ }
    watch(page);
    return page;
  };
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...a) => {
    const ctx = await newContext(...a);
    try { await ctx.addInitScript(script); ctx.on('page', watch); } catch { /* never fail the run */ }
    return ctx;
  };
  browser.on('disconnected', () => { if (lost) logTiming({ kind: 'gpu', tool: label, gl: mode, webgl_lost: 1, lost_events: lost }); });
}
