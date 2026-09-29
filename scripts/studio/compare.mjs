#!/usr/bin/env node
import { parseArgs } from 'node:util';
import { writeFileSync } from 'node:fs';
import { startHarness } from '../../blender/checks/harness.mjs';
import { instrumentCharacter, controlPerkDelay } from './instrument.mjs';
import { resolveState } from './state.mjs';
import { openScene } from './index.mjs';

export function differences(a, b, tolerance = 1e-5, path = '$', out = []) {
  if (typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) <= tolerance) return out;
  if (a === b) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    if (Array.isArray(a) && a.length && b.length && [...a, ...b].every(v => v && typeof v === 'object' && typeof v.id === 'string')) {
      return differences(Object.fromEntries(a.map(v => [v.id, v])), Object.fromEntries(b.map(v => [v.id, v])), tolerance, path, out);
    }
    if (Array.isArray(a) && [...a, ...b].length && [...a, ...b].every(v => v && typeof v.a === 'string' && typeof v.b === 'string')) {
      const keyed = values => Object.fromEntries(values.map(v => [`${v.a}|${v.b}`, v]));
      return differences(keyed(a), keyed(b), tolerance, path, out);
    }
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()) differences(a[key], b[key], tolerance, `${path}.${key}`, out);
  } else out.push({ path, node: a ?? null, browser: b ?? null, ...(typeof a === 'number' && typeof b === 'number' ? { delta: Math.abs(a - b) } : {}) });
  return out;
}

async function main() {
  const { values } = parseArgs({ options: { ...Object.fromEntries(['mock', 'snapshot', 'frames', 'facts', 'out', 'tolerance', 'control-perk-delay'].map(k => [k, { type: 'string' }])), 'trace-random': { type: 'boolean' } } });
  const options = { mock: values.mock ?? 'floor', snapshot: values.snapshot, traceRandom: values['trace-random'],
    initialPerkDelay: values['control-perk-delay'] == null ? undefined : Number(values['control-perk-delay']) };
  const state = await resolveState(options);
  const frames = (values.frames ?? '0,1,30,65,90,180,600').split(',').map(Number);
  const facts = (values.facts ?? 'occupancy,projections').split(',').filter(Boolean);
  const tolerance = Number(values.tolerance ?? 1e-5);
  if (!Number.isFinite(tolerance) || tolerance < 0 || frames.some((frame, i) => !Number.isInteger(frame) || frame < 0 || (i > 0 && frame < frames[i - 1]))) throw new Error('invalid frames or tolerance');
  let harness, scene;
  try {
    scene = await openScene({ ...options, state });
    const start = performance.now();
    harness = await startHarness({ auditDraws: true });
    // Route instrumentation only exposes the existing character API; no pose code is replaced.
    const originalNewPage = harness.browser.newPage.bind(harness.browser);
    harness.browser.newPage = async (...args) => {
      const page = await originalNewPage(...args);
      await page.route('**/src/render/character.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: instrumentCharacter(await response.text()) });
      });
      if (options.initialPerkDelay != null) await page.route('**/src/render/perks.js*', async route => {
        const response = await route.fetch();
        await route.fulfill({ response, body: controlPerkDelay(await response.text(), options.initialPerkDelay) });
      });
      return page;
    };
    const { page, errors, phases } = await harness.openScene(`quality=low&rig=0&mock=${options.mock}`, { width: 1600, height: 1000 });
    await page.evaluate(async ({ state, traceRandom }) => {
      const previous = Math.random; Math.random = window.__tool(() => Math.random);
      try { window.__sceneModel = await import('/scripts/studio/model.mjs'); } finally { Math.random = previous; }
      window.__sceneState = state ?? window.__HITL.state;
      window.__sceneFrame = 0;
      if (traceRandom) {
        window.__sceneRandomTrace = [];
        const random = Math.random;
        Math.random = () => { const value = random(); window.__sceneRandomTrace.push({ t: performance.now(), value, stack: new Error().stack.split('\n').slice(2, 7).join('\n') }); return value; };
      }
      window.__hitlRender.sync(window.__sceneState);
      if (window.__sceneState.pendingDecision) window.__hitlRender.handleEvents([{ type: 'decision' }], window.__sceneState);
    }, { state: state ?? null, traceRandom: options.traceRandom });
    const openMs = performance.now() - start;
    const rows = [];
    for (const frame of frames) {
      const nodeStart = performance.now();
      const node = await scene.sample(frame, { facts });
      const nodeRoundTripMs = performance.now() - nodeStart;
      const browserStart = performance.now();
      const browser = await page.evaluate(({ frame, facts }) => {
        const now = window.__wallNow;
        const start = now();
        const R = window.__hitlRender, S = window.__sceneState;
        while (window.__sceneFrame < frame) { window.__tick(1000 / 30); R.sync(S); R.render(1 / 30, { draw: false }); window.__sceneFrame++; }
        const stepped = now();
        const result = window.__tool(() => window.__sceneModel.canonical(window.__sceneModel.sampleScene(R, S, { frame, facts })));
        return { result, randomTrace: window.__sceneRandomTrace, audit: window.__drawAudit(), timing: { stepMs: stepped - start, sampleMs: now() - stepped } };
      }, { frame, facts });
      const browserRoundTripMs = performance.now() - browserStart;
      browser.result.provenance = scene.provenance;
      const diff = differences(node.result, browser.result, tolerance);
      const grouped = {};
      for (const d of diff) {
        const key = d.path.split('.').slice(0, 3).join('.');
        grouped[key] = (grouped[key] ?? 0) + 1;
      }
      rows.push({ frame, differences: diff, grouped, nodeTiming: node.timing, browserTiming: browser.timing, nodeRoundTripMs, browserRoundTripMs, drawAudit: browser.audit,
        ...(options.traceRandom ? { randomTrace: { node: node.randomTrace, browser: browser.randomTrace } } : {}) });
      console.log(JSON.stringify({ frame, differences: diff.length, groups: Object.keys(grouped).length }));
    }
    if (errors.length) throw new Error(`browser errors: ${errors.join('; ')}`);
    const report = { schema: 'hitl.scene-parity/0.1', options: { ...options, snapshot: options.snapshot?.split('/').pop(), frames, facts, tolerance },
      nodeReadyMs: scene.readyMs, browserOpenMs: openMs, harnessPhases: harness.phases, pagePhases: phases, rows };
    if (values.out) writeFileSync(values.out, JSON.stringify(report, null, 2) + '\n');
    process.exitCode = rows.some(row => row.differences.length) ? 1 : 0;
  } finally { await scene?.close(); await harness?.close(); }
}
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) await main();
