import { Worker } from 'node:worker_threads';

// Each scene owns a worker so module caches, clocks, and legacy random streams cannot leak.
export async function openScene(options = {}) {
  const start = performance.now();
  // A compose file compiles here, in the caller's thread, to the game state and script the worker runs.
  if (options.compose) {
    const { compose } = await import('./compose.mjs');
    const { state, script } = compose(options.compose);
    options = { ...options, compose: undefined, state, script };
  }
  const worker = new Worker(new URL('./worker.mjs', import.meta.url), { workerData: options, execArgv: [] });
  const pending = new Map(); let sequence = 0, closed = false;
  const fail = error => { for (const p of pending.values()) p.reject(error); pending.clear(); };
  let ready;
  const opening = new Promise((resolve, reject) => { ready = { resolve, reject }; });
  worker.on('error', error => { ready.reject(error); fail(error); });
  worker.on('exit', code => { const error = new Error(`scene-engine: worker exited (${code})`); ready.reject(error); fail(error); });
  worker.on('message', message => {
    if (message.ready) { ready.resolve(message); return; }
    if (message.id == null && message.error) { ready.reject(new Error(message.error)); return; }
    const p = pending.get(message.id); pending.delete(message.id);
    if (message.error) p?.reject(new Error(message.error)); else p?.resolve(message);
  });
  let opened;
  try { opened = await opening; } catch (error) { await worker.terminate(); throw error; }
  return {
    readyMs: performance.now() - start,
    provenance: opened.provenance,
    sample(frame, sampleOptions = {}) {
      if (closed) return Promise.reject(new Error('scene-engine: scene is closed'));
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject }); worker.postMessage({ id, frame, options: sampleOptions });
      });
    },
    async close() { closed = true; await worker.terminate(); },
  };
}

export async function sampleMany(requests, { jobs = 2 } = {}) {
  if (!Number.isInteger(jobs) || jobs < 1) throw new Error('scene-engine: jobs must be a positive integer');
  const results = new Array(requests.length); let next = 0;
  await Promise.all(Array.from({ length: Math.min(jobs, requests.length) }, async () => {
    while (next < requests.length) {
      const index = next++, request = requests[index];
      const scene = await openScene(request);
      try { results[index] = await scene.sample(request.frame ?? 1, request); } finally { await scene.close(); }
    }
  }));
  return results;
}
