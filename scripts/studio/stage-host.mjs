// One stage scenario in one view on the studio engine: the page function blender/checks/stage.mjs runs in a
// harness page (stage-page.js), hosted on a Node scene with the globals a page gives it. stage.mjs forks
// this once per scenario and view, so no scenario starts from another's state, and reads the result over
// IPC (advanced serialization, so Infinity in a sample survives the trip as it does from a page).
import { registerHooks } from 'node:module';
import { createRuntime } from './runtime.mjs';

const ROOT = new URL('../../', import.meta.url);

// Engine output the game's own console noise makes that a page doesn't: the presentation stubs.
const ENGINE_NOISE = /^(BVH:|THREE\.WebGLRenderer: scene-engine: unsupported canvas context)/;

export async function hostStage(task) {
  // The page function imports the game by absolute path from the site root, as a page does.
  registerHooks({
    resolve(specifier, context, next) {
      if (/^\/(src|blender)\//.test(specifier)) return next(new URL(specifier.slice(1), ROOT).href, context);
      return next(specifier, context);
    },
  });
  const errors = [];
  const error = console.error;
  console.error = (...a) => { const text = a.map(String).join(' '); if (!ENGINE_NOISE.test(text)) errors.push(text); };
  const mock = new URLSearchParams(task.query).get('mock') ?? 'floor';
  // A harness page starts unsynced: its first sync is the check's first step.
  const rt = await createRuntime({ mock, quality: 'medium', era: task.era ?? null, initialSync: false });
  const { R, S, clock } = rt;
  // Nothing is drawn: a render steps the scene without the final draw.
  const render = R.render.bind(R);
  R.render = (dt, o) => render(dt, { ...o, draw: false });
  const step = (n) => { for (let i = 0; i < n; i++) { clock.tick(); R.sync(S); R.render(1 / 30); } };
  let fast = false;
  Object.assign(globalThis, {
    __hitlRender: R,
    __HITL: { state: S },
    __step: step,
    __sample: step,
    __settle: step,
    __advance: (n) => { for (let i = 0; i < n; i++) { clock.tick(); R.sync(S); R.advance(1 / 30); R.scene.updateMatrixWorld(); } },
    // harness.mjs's __fastRaycast: static meshes raycast through a tree, each built on the tool stream.
    __fastRaycast: async () => {
      if (fast) return;
      const bvh = await globalThis.__toolImport('/blender/checks/bvh.js');
      const THREE = R.THREE;
      const slow = THREE.Mesh.prototype.raycast;
      THREE.Mesh.prototype.raycast = function (raycaster, hits) {
        const g = this.geometry;
        if (this.isSkinnedMesh || this.isInstancedMesh || this.morphTargetInfluences || !g?.attributes?.position || g.morphAttributes?.position) return slow.call(this, raycaster, hits);
        if (!g.boundsTree) {
          if ((g.index ? g.index.count : g.attributes.position.count) / 3 < 64) return slow.call(this, raycaster, hits);
          globalThis.__tool(() => { g.boundsTree = new bvh.MeshBVH(g, { indirect: true }); });
        }
        return bvh.acceleratedRaycast.call(this, raycaster, hits);
      };
      fast = true;
    },
    // A module that makes three.js objects as it loads, loaded on the tool stream.
    __toolImport: async (path) => {
      const game = Math.random;
      Math.random = clock.tool;
      try { return await import(path); } finally { Math.random = game; }
    },
  });
  globalThis.KeyboardEvent ??= class extends Event { constructor(type, init = {}) { super(type); this.key = init.key; } };
  globalThis.CustomEvent ??= class extends Event { constructor(type, init = {}) { super(type); this.detail = init.detail; } };
  // The harness resets the game stream once the page is ready, then preloads tool modules on the tool stream.
  clock.reseed();
  await globalThis.__toolImport('/blender/checks/tool-preload.js');
  const { playStage } = await import('../../blender/checks/stage-page.js');
  try {
    return { res: await playStage(task.args), errors };
  } finally {
    console.error = error;
  }
}

if (process.argv[1] === new URL(import.meta.url).pathname && process.send) {
  process.once('message', async (task) => {
    // `loaded` is the files this run used, when the caller asked for them (load-log.mjs).
    try { process.send({ ok: true, ...(await hostStage(task)), loaded: [...(globalThis.__hitlLoaded ?? [])] }, () => process.exit(0)); }
    catch (e) { process.send({ ok: false, error: e.stack ?? String(e) }, () => process.exit(1)); }
  });
}
