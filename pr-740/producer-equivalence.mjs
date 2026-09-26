import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const here = (file) => pathToFileURL(resolve(file));
const { game, addProduct } = await import(here('tests/sim/helpers.js'));
const { makeCtx } = await import(here('src/sim/registry.js'));
const { standupSystem } = await import(here('src/sim/standup.js'));
const { startOutage } = await import(here('src/sim/incidents.js'));
const results = [];
for (const mode of ['daily', 'async']) for (let seed = 1; seed <= 200; seed++) {
  const state = game(seed);
  state.policies[`${mode}_standups`] = true;
  for (const p of state.staff) Object.assign(p, { role: 'engineer', mood: 'ok', assignment: { type: 'idle' } });
  const product = addProduct(state);
  startOutage(makeCtx(state), { productId: product.id, kind: 'ransomware', severity: 1 });
  const ctx = makeCtx(state);
  for (let i = 0; i < 10; i++) standupSystem(ctx);
  delete state.flags.outageChat;
  results.push({ state, events: ctx.events });
}
const text = JSON.stringify(results);
if (process.argv[2] === 'write') fs.writeFileSync(process.argv[3], text);
else {
  if (text !== fs.readFileSync(process.argv[3], 'utf8')) throw new Error('Producer state/events differ beyond outage context');
  console.log('PASS: 200 seeds per mode, 10 standups each; complete events and state identical excluding outageChat');
}
