#!/usr/bin/env node
// The dev server for the pose lab (pose-lab.html, src/dev/pose-lab/): Vite on this checkout with the
// param plugin made live, so the lab's sliders change render constants the way --param does and the
// page reloads on the new code.
//   node scripts/tools/lab.mjs [--port 5174] [--host]
// Endpoints the page uses:
//   GET  /__lab/params            the numeric consts in src/render/{character,robot,rig}.js: [{ file, name, value }]
//   POST /__lab/params            body { specs: ["src/render/character.js:PALM_STAND[2]=0.3", ...] } sets the
//                                 whole override list (an empty list clears it); answers { ok } or { error }
// The override list is the same specs --param takes, applied by the same code (blender/checks/param.js).
import { createServer } from 'vite';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyParams, listConsts, resolveParams } from '../../blender/checks/param.js';

const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const FILES = ['src/render/character.js', 'src/render/robot.js', 'src/render/rig.js'];
const argv = process.argv.slice(2);
const opt = (name, dflt) => { const i = argv.indexOf(`--${name}`); return i >= 0 ? argv[i + 1] : dflt; };

// The consts a slider can drive, with the values in the checked-out source (not the overridden ones).
export function discover(root = ROOT) {
  return FILES.filter((f) => existsSync(resolve(root, f))).flatMap((f) => listConsts(readFileSync(resolve(root, f), 'utf8')).map((c) => ({ file: f, ...c })));
}

// A Vite plugin holding a replaceable list of param specs.
export function livePlugin(root = ROOT) {
  let by = new Map();
  let server = null;
  const set = (specs) => {
    const resolved = resolveParams(specs, root);
    const next = new Map();
    for (const p of resolved) next.set(p.file, [...(next.get(p.file) ?? []), p]);
    by = next;
  };
  return {
    set,
    plugin: {
      name: 'hitl-lab-params', enforce: 'pre',
      configureServer(s) {
        server = s;
        s.middlewares.use('/__lab/params', (req, res) => {
          res.setHeader('content-type', 'application/json');
          if (req.method === 'GET') { res.end(JSON.stringify(discover(root))); return; }
          if (req.method !== 'POST') { res.statusCode = 405; res.end('{}'); return; }
          let body = '';
          req.on('data', (d) => { body += d; });
          req.on('end', () => {
            try {
              set(JSON.parse(body).specs ?? []);
              server.moduleGraph.invalidateAll();
              res.end(JSON.stringify({ ok: true }));
            } catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: String(e.message ?? e) })); }
          });
        });
      },
      transform(code, id) {
        const mine = by.get(id.split('?')[0]);
        return mine ? { code: applyParams(code, mine), map: null } : null;
      },
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { plugin } = livePlugin(ROOT);
  const server = await createServer({ root: ROOT, plugins: [plugin], server: { port: Number(opt('port', 5174)), host: argv.includes('--host') || undefined, strictPort: false }, optimizeDeps: { include: ['three-mesh-bvh'] } });
  await server.listen();
  const url = server.resolvedUrls?.local?.[0] ?? `http://localhost:${server.config.server.port}/`;
  console.log(`lab: ${url}pose-lab.html  (root ${relative(process.cwd(), ROOT) || '.'})`);
}
