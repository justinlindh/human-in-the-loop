// Runs the scene sweep's samplers (blender/checks/sample.js) in Node on the studio engine instead of in a
// browser: the game's render code steps under the engine's platform, and sample.js sees the same
// `window.__hitlRender`, `__HITL`, `__advance` and `__step` a page gives it. The checks that read the page's
// DOM (screen, tooltip) and the crops (canvas) are browser-only and are not run here.
import { registerHooks } from 'node:module';
import { createRuntime } from './runtime.mjs';
import { resolveState } from './state.mjs';

const ROOT = new URL('../../', import.meta.url);

// sample.js imports the game by absolute path ('/src/sim/props.js'), as a page does.
let mapped = false;
function mapAbsolutePaths() {
  if (mapped) return;
  mapped = true;
  registerHooks({
    resolve(specifier, context, next) {
      if (/^\/(src|blender)\//.test(specifier)) return next(new URL(specifier.slice(1), ROOT).href, context);
      return next(specifier, context);
    },
  });
}

// A mesh pair as the engine reads it: touching or not, and the depth at the check's own tolerance
// (`depthAtTol`, the rule the sweep's pairDepths applies), at the middle of the two meshes' shared box.
async function engineMeasure() {
  const THREE = await import('three');
  const { meshContact, depthAtTol } = await import('./geometry.mjs');
  return (a, b, tol) => {
    const c = meshContact(a, b);
    if (!c.intersects) return null;
    const box = (m) => m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld);
    return [{ depth: depthAtTol(c, tol), at: box(a).intersect(box(b)).getCenter(new THREE.Vector3()) }];
  };
}

// One scene: the runtime, and the globals a page would hold.
async function open({ state, mock }) {
  mapped || mapAbsolutePaths();
  globalThis.__sweepMeasure ??= await engineMeasure();
  const rt = await createRuntime({ state, mock });
  const { R, S } = rt;
  // There is nothing to draw on: a render refreshes the scene and skips the draw.
  const render = R.render.bind(R);
  R.render = (dt, options) => render(dt, { ...options, draw: false });
  const step = (n) => { rt.stepTo(rt.frame + n); };
  // As the page's __advance: the world moves without the render pass (no labels, no camera).
  const advance = (n) => { for (let i = 0; i < n; i++) { rt.clock.tick(); R.sync(S); R.advance(1 / 30); R.scene.updateMatrixWorld(); } };
  const game = { state: S };
  Object.assign(globalThis, {
    __sweepNoDom: true,
    __hitlRender: R,
    __HITL: game,
    __advance: advance,
    __step: step,
  });
  // Moments announce themselves as window events for the page's listeners; nobody listens here.
  globalThis.dispatchEvent ??= () => true;
  // Removing a label from the scene asks its element's document for the window's Element class.
  if (globalThis.document) globalThis.document.defaultView ??= globalThis;
  return { rt, R, S, game };
}

export async function hostMock({ name, ...options }) {
  const { sampleMock } = await import('../../blender/checks/sample.js');
  await open({ mock: name });
  return sampleMock({ name, ...options, crops: 0 });
}

// A saved state (an indexed moment's snapshot, or a find.js match): played as sampleLoaded plays a page
// that loaded it, the open decision answered with its choice.
export async function hostLoaded({ file, ...options }) {
  const { sampleLoaded } = await import('../../blender/checks/sample.js');
  const { dispatch } = await import('../../src/sim/index.js');
  const state = await resolveState({ snapshot: file });
  const { R, S, game } = await open({ state });
  game.emit = (events) => { if (events?.length) R.handleEvents(events, S); };
  game.dispatch = (action) => { const res = dispatch(S, action); game.emit(res.events); return res; };
  return sampleLoaded({ ...options, crops: 0 });
}

export async function hostSeed({ seed, ...options }) {
  const { sampleSeed } = await import('../../blender/checks/sample.js');
  const { tick } = await import('../../src/sim/index.js');
  const state = await resolveState({ seed, week: 0 });
  const { R, S, game } = await open({ state });
  // What main.js's route does for the renderer: the sim's events reach it as they happen.
  game.emit = (events) => { if (events?.length) R.handleEvents(events, S); };
  game.tickN = (n) => { for (let i = 0; i < n; i++) game.emit(tick(S)); };
  // The sampler reports its week on the console for a browser run's time limit; here it is noise.
  const log = console.log;
  console.log = (...a) => { if (!/^sweep-progress /.test(a[0])) log(...a); };
  try { return await sampleSeed({ seed, ...options, crops: 0 }); } finally { console.log = log; }
}
