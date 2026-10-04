// Prints, as JSON on the last line, how many distinct scene materials a harness page has and which
// of them share a UUID. Run by harness-uuid.full.test.js (a separate process, since the harness
// takes the render lock by re-running its command). It reads materials, not pixels, so it takes the
// harness's GL default (the GPU).
import { startHarness } from '../../blender/checks/harness.mjs';

const h = await startHarness();
try {
  const { page, errors } = await h.openScene('mock=garage&quality=high&eras&eraArt=preinternet');
  await page.evaluate(() => window.__step(150));
  const out = await page.evaluate(async () => {
    const { getTemplate, PROP_NAMES } = await import('/src/render/models.js');
    const byUuid = new Map();
    const visit = (o) => {
      for (const m of [].concat(o.material || [])) {
        if (!byUuid.has(m.uuid)) byUuid.set(m.uuid, new Set());
        byUuid.get(m.uuid).add(m);
      }
    };
    window.__hitlRender.scene.traverse(visit);
    for (const n of [...PROP_NAMES, 'chibi', 'pets', 'robot']) getTemplate(n)?.traverse(visit);
    return { total: byUuid.size, clashes: [...byUuid].filter(([, set]) => set.size > 1).map(([uuid, set]) => `${uuid}: ${[...set].map((m) => m.name || m.color?.getHexString()).join(', ')}`) };
  });
  console.log(JSON.stringify({ ...out, errors }));
} finally { await h.close(); }
