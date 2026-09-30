import { registerHooks } from 'node:module';

const era = process.env.ATTIRE_ERA;
if (!['preinternet', 'dotcom', 'dotcom-bust', 'web2'].includes(era)) throw new Error('ATTIRE_ERA required');
const query = `&eras&eraArt=${era}${process.env.ATTIRE_RIG === '1' ? '&rig=1' : ''}`;
registerHooks({
  load(url, context, next) {
    const result = next(url, context);
    if (result.format !== 'module' || result.source == null) return result;
    let source = String(result.source);
    if (process.env.ATTIRE_CORE === '1' && url.endsWith('/scripts/studio/runtime.mjs')) {
      source = source.replace('await loadModels();', "await loadModels(); globalThis.attireTemplate = (await import('../../src/render/models.js')).getTemplate;");
    }
    if (process.env.ATTIRE_CORE === '1' && url.endsWith('/blender/checks/sample.js')) {
      source = source.replace("const [pp, wp] = o.a === p ? [q.a, q.b] : [q.b, q.a];", `const [pp, wp] = o.a === p ? [q.a, q.b] : [q.b, q.a];
        if (p.id === 's618' && w.id === 'f710' && pp === 'torso') {
          const person = globalThis.__HITL.state.staff.find(s => s.id === p.id);
          const torso = p.meshes.find(m => m.userData.part === 'torso');
          const core = globalThis.attireTemplate('chibi').getObjectByName('torso_' + (person.appearance.build ?? 1)).clone();
          core.updateMatrix();
          core.geometry = core.geometry.clone().applyMatrix4(core.matrix);
          core.matrixWorld.copy(torso.matrixWorld);
          const target = w.meshes.find(m => m.material.name === 'pal_fabric_slate');
          console.log('CORE', JSON.stringify({t, person, matrix: torso.matrixWorld.elements, full: q.depth,
            coreIntoNoc: X.depthInto(core, target), nocIntoCore: X.depthInto(target, core)}));
          core.geometry.dispose();
        }`);
    }
    if (process.env.ATTIRE_DENSE === '1' && url.endsWith('/blender/checks/intersect.js')) {
      source = source.replace('const MAX_POINTS = 1500;', 'const MAX_POINTS = Infinity;')
        .replace('const SIDE_POINTS = 300;', 'const SIDE_POINTS = Infinity;');
    }
    if (url.endsWith('/scripts/studio/platform.mjs')) {
      source = source.replace("href: 'http://scene.invalid/' };", `href: 'http://scene.invalid/' }; g.location.search += ${JSON.stringify(query)};`);
    }
    if (url.endsWith('/blender/checks/harness.mjs')) {
      source = source.replace('${base}?snap=1&${query}', '${base}?snap=1&${query}' + query);
    }
    if (url.endsWith('/scripts/studio/loader.mjs') && process.env.ATTIRE_POSE === '1') {
      source = source.replace("let source = readFileSync(new URL(url), 'utf8');", `let source = readFileSync(new URL(url), 'utf8');
        if (url.endsWith('/src/render/character.js') && source.includes('wardrobeLook')) {
          source = source.replace('const rand = timingRandom(opts.seed);', 'if (!Object.hasOwn(opts, "wardrobe")) opts = { ...opts, wardrobe: ${era} }; const rand = timingRandom(opts.seed);'.replace('wardrobe: ${era}', 'wardrobe: ${JSON.stringify(era)}'));
        }
        if (url.endsWith('/src/render/models.js') && source.includes('WARDROBE_MODELS')) {
          source = source.replace('return Promise.all(names.map(loadOne))', 'return Promise.all([...new Set([...names, "era_attire"])].map(loadOne))');
        }`);
    }
    if (process.env.ATTIRE_DIAG === '1' && url.endsWith('/blender/checks/clip-exact.js')) {
      source = source.replace('let hit = 0;', 'let hit = 0; const crosses = new THREE.Box3();');
      source = source.replace('if (crossed) hit++;', 'if (crossed) { hit++; for (const i of [a,b,c]) crosses.expandByPoint(new THREE.Vector3().fromBufferAttribute(pos,i)); }');
      source = source.replace('return n ? hit / n : 0;', 'if(hit) console.log(JSON.stringify({part:part.userData.part,target:target.material.name,hit,crosses})); return n ? hit / n : 0;');
    }
    return { ...result, source };
  },
});
