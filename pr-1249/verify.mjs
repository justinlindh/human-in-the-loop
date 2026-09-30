import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
import { installPlatform, Element } from '../../scripts/studio/platform.mjs';
import { installLoader } from '../../scripts/studio/loader.mjs';

const arg = name => process.argv[process.argv.indexOf(name) + 1];
const root = resolve(arg('--root'));
const query = arg('--query');
installPlatform(root, { quality: 'low' });
globalThis.location.search = query;
installLoader({ root });
const from = path => import(pathToFileURL(resolve(root, path)).href);
const { loadModels, getTemplate } = await from('src/render/models.js');
const { createCharacter } = await from('src/render/character.js');
const { createGame } = await from('src/sim/state.js');
const { ROLE_COLORS } = await from('src/render/palette.js');
const { createRenderer } = await from('src/render/index.js');
await loadModels();

function surfaces(c) {
  const hash = createHash('sha256');
  let triangles = 0, calls = 0, textures = 0;
  c.root.traverse(o => {
    if (!o.userData.part) return;
    calls++;
    triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3;
    textures += o.material.map ? 1 : 0;
    hash.update(o.userData.part);
    for (const k of ['position', 'normal', 'color', 'aSurf']) {
      const a = o.geometry.attributes[k].array;
      hash.update(Buffer.from(a.buffer, a.byteOffset, a.byteLength));
    }
  });
  return { hash: hash.digest('hex'), triangles, calls, textures };
}
const results = { query, models: { attire: !!getTemplate('era_attire') }, characters: [], careers: [], transitions: [] };
const attireLoaded = results.models.attire;
for (const [role, color] of Object.entries(ROLE_COLORS)) for (let build = 0; build < 3; build++) {
  const appearance = { build, hair: 2, skin: build, hairColor: '#4a3222', shirt: '#4f8cff', pants: '#2e3440', accessory: 'none' };
  const c = createCharacter(appearance, color, { role, seed: role + build });
  const modern = surfaces(c);
  const eras = {};
  if (attireLoaded) for (const era of ['preinternet', 'dotcom', 'dotcom-bust', 'web2', null]) {
    c.setAnim('typing'); c.update(0.1);
    c.setMood('coasting'); c.setShadows(false);
    const before = JSON.stringify(c.joints());
    const head = c.head, root = c.root, anim = c.anim, mood = c.mood;
    c.setWardrobe(era);
    assert.equal(JSON.stringify(c.joints()), before, 'wardrobe preserves joints');
    assert.equal(c.head, head); assert.equal(c.root, root); assert.equal(c.anim, anim); assert.equal(c.mood, mood);
    c.root.traverse(o => { if (o.userData.part) assert.equal(o.castShadow, false, 'Low shadows stay off'); });
    eras[era ?? 'modern'] = surfaces(c);
    if (era == null) assert.deepEqual(eras.modern, modern, 'modern surfaces restored exactly');
  }
  results.characters.push({ role, build, modern, eras });
  c.dispose();
}
for (const startEra of ['classic', 'dotcom', 'web2', 'chatgbt', 'agents']) {
  const S = createGame({ seed: 17, startEra });
  const R = createRenderer({ canvas: new Element('canvas'), labelsEl: new Element(), quality: 'low' });
  for (let i = 0; !R.ready && i < 1000; i++) await new Promise(r => setTimeout(r, 1));
  R.sync(S); R.render(0, { draw: false });
  const people = [];
  R.scene.traverse(o => { if (o.userData.staffId) people.push(o.parent); });
  results.careers.push({ startEra, era: S.era.id, wardrobes: people.map(p => p.userData.wardrobe ?? null) });
  if (startEra === 'dotcom') {
    const first = people[0];
    for (const [era, week] of [['dotcom', 156], ['web2', 208], ['classic', 416], ['chatgbt', 624], ['agents', 728], ['consolidation', 832], ['plateau', 936]]) {
      S.era.id = era; S.week = week;
      if (S.flags.dotcom) S.flags.dotcom.phase = week === 156 ? 'bust' : 'recovered';
      R.sync(S);
      const current = [];
      R.scene.traverse(o => { if (o.userData.staffId) current.push(o.parent); });
      assert.equal(current[0], first, 'calendar keeps character identity');
      results.transitions.push({ era, week, wardrobe: current[0].userData.wardrobe ?? null });
    }
  }
  R.dispose();
}
writeFileSync(arg('--out'), JSON.stringify(results, null, 2));
console.log(JSON.stringify({ query, controls: results.characters.length, careers: results.careers, transitions: results.transitions, models: results.models }));
