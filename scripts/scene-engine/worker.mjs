import { parentPort, workerData } from 'node:worker_threads';
import { performance as timer } from 'node:perf_hooks';
import { createRuntime } from './runtime.mjs';
import { resolveState } from './state.mjs';
import { provenance } from './provenance.mjs';

const now = timer.now.bind(timer);
const start = now();
try {
  const runtime = await createRuntime({ ...workerData, state: await resolveState(workerData) });
  const model = await runtime.loadMeasurements();
  const identity = provenance(runtime.S, workerData);
  parentPort.postMessage({ ready: true, readyMs: now() - start, provenance: identity });
  parentPort.on('message', ({ id, frame, options }) => {
    try {
      const before = now(); runtime.stepTo(frame); const stepped = now();
      const result = globalThis.__tool(() => model.canonical(model.sampleScene(runtime.R, runtime.S, { ...options, frame })));
      result.provenance = identity;
      const sampled = now();
      parentPort.postMessage({ id, result, ...(workerData.traceRandom ? { randomTrace: runtime.randomTrace } : {}), timing: { stepMs: stepped - before, sampleMs: sampled - stepped } });
    } catch (error) { parentPort.postMessage({ id, error: error.stack }); }
  });
} catch (error) { parentPort.postMessage({ error: error.stack }); }
