import { afterAll, describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { toolTmp } from '../../scripts/tools/tmp.mjs';

const ROOT = resolve(__dirname, '../..');
const tmp = mkdtempSync(join(toolTmp(), 'sweep-yak-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

// The studio sweep host plays seed 1 for 120 weeks and counts the chat the renderer is shown, and the chat the
// sim emitted. Chat goes through the game's Yak pacer, so the renderer sees only what the pacer releases over the
// frames the sampler stepped: fewer than the sim emitted, and more than none.
const script = (root) => `
import { SEED_PLAY } from '${root}/blender/checks/sweep-plan.js';
const host = await import('${root}/scripts/studio/sweep-host.mjs');
let shown = 0, sent = 0, held, heldH;
Object.defineProperty(globalThis, '__hitlRender', { configurable: true, get: () => held, set: (R) => { if (held === R) return; held = R; const h = R.handleEvents.bind(R); R.handleEvents = (ev, s) => { for (const e of ev) if (e.type === 'chat') shown++; return h(ev, s); }; } });
Object.defineProperty(globalThis, '__HITL', { configurable: true, get: () => heldH, set: (g) => { heldH = g; let emit = g.emit; Object.defineProperty(g, 'emit', { get: () => (ev, d) => { for (const e of ev) if (e.type === 'chat') sent++; return emit(ev, d); }, set: (f) => { emit = f; } }); } });
await host.hostSeed({ seed: 1, ...SEED_PLAY.fast, weeks: 120, known: [], worst: {} });
console.log(JSON.stringify({ shown, sent }));
`;

describe('the studio sweep host feeds chat through the Yak pacer', () => {
  it('shows the renderer fewer chat events than the bots emitted, but some', () => {
    const f = join(tmp, 'count.mjs');
    writeFileSync(f, script(ROOT));
    const r = spawnSync(process.execPath, [f], { encoding: 'utf8', cwd: ROOT, timeout: 120000 });
    expect(r.status, r.stderr.slice(-400)).toBe(0);
    const { shown, sent } = JSON.parse(r.stdout.trim().split('\n').pop());
    expect(sent).toBeGreaterThan(0);
    expect(shown).toBeGreaterThan(0);
    expect(shown).toBeLessThan(sent);
  });
});
