import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const mod = p => import(pathToFileURL(resolve(p)));
const { game, addProduct } = await mod('tests/sim/helpers.js');
const { dispatch } = await mod('src/sim/index.js');
const { standupSystem } = await mod('src/sim/standup.js');
const { startOutage, clearOutage } = await mod('src/sim/incidents.js');
const { makeCtx } = await mod('src/sim/registry.js');
const { emitChat } = await mod('src/sim/chat.js');
const { createYakPacer } = await mod('src/yak-pacing.js');
const { B } = await mod('src/sim/balance.js');
const { saveGame, loadGame } = await mod('src/save/save.js');
const positive = () => {
  const s = game(2), p = addProduct(s), q = createYakPacer();
  startOutage(makeCtx(s), { productId:p.id, kind:'ransomware', severity:1 });
  const c = makeCtx(s), e = emitChat(c, { person:s.staff[0], text:'Investigating.', outage:true });
  q.enqueue([e], { state:s });
  assert.equal(dispatch(s, { type:'killProduct', productId:p.id }).ok, true);
  assert.equal(s.outage, null);
  assert.deepEqual(q.step(0,true,{state:s}), []);
  console.log('PASS actual killProduct removes pending outage chatter');

  const history = emitChat(c, { from:'@pagerbot', channel:'incidents', text:'Recorded incident.' });
  const root = emitChat(c, { person:s.staff[0], text:'Context.' });
  const reply = emitChat(c, { person:s.staff[1], text:'Important result.', replyTo:root.id, important:true });
  q.enqueue([root,reply,history],{state:s});
  const delivered = [q.step(40,true,{state:s,gameTime:160}),q.step(6,true,{state:s,gameTime:184}),q.step(6,true,{state:s,gameTime:208})].flat().map(e=>e.id);
  assert.deepEqual(delivered,[root.id,reply.id,history.id]);
  console.log('PASS historical notice and queued parent retained beyond both age ceilings');

  const old = game(3); addProduct(old);
  old.outage = {productId:old.products[0].id,kind:'ransomware',severity:1,weeks:0,unrecoverable:false};
  const store = new Map(), storage = {getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v),removeItem:k=>store.delete(k)};
  assert.equal(saveGame(old,storage),true);
  const loaded=loadGame(storage); assert.equal(loaded.ok,true);
  const before=JSON.stringify(loaded.state.rng), cc=makeCtx(loaded.state);
  const linked=emitChat(cc,{person:loaded.state.staff[0],text:'Investigating.',outage:true});
  assert.equal(loaded.state.flags.outageChat[linked.id],0);
  assert.equal(JSON.stringify(loaded.state.rng),before);
  for(let i=0;i<3*B.chatLogSize;i++) emitChat(cc,{person:loaded.state.staff[0],text:'Investigating.',outage:true});
  assert.equal(Object.keys(loaded.state.flags.outageChat).length,B.chatLogSize);
  assert.equal(JSON.stringify(loaded.state).includes('NaN'),false);
  assert.equal(saveGame(loaded.state,storage),true);
  assert.equal(loadGame(storage).ok,true);
  console.log('PASS actual old-save load, default occurrence, bounded metadata, round trip and unchanged game RNG');
};
positive();
let failed=0;
for (const speed of [1,2,4]) {
  const s=game(2), prod=addProduct(s), c=makeCtx(s), q=createYakPacer();
  s.policies.async_standups=true; s.policies.daily_standups=false;
  for(const p of s.staff) {p.role='engineer';p.assignment={type:'idle'};p.mood='happy';}
  startOutage(makeCtx(s),{productId:prod.id,kind:'ransomware',severity:1});
  standupSystem(c);
  const posts=c.events.filter(e=>e.type==='chat'); assert.ok(posts.length);
  q.enqueue([{type:'chat',id:'read',text:'Read this.',channel:'general',fromId:'a'}],{urgentIds:new Set(['read']),state:s});
  q.enqueue(posts,{state:s,gameTime:0});
  clearOutage(makeCtx(s),'');
  let shown=[];
  for(let frame=1;frame<=24;frame++) shown.push(...q.step(.25,true,{state:s,gameTime:frame*.25*speed}));
  try {assert.deepEqual(shown,[], 'resolved outage standup must not arrive');}
  catch {failed++; console.log(`FAIL ${speed}x: recovered outage, 6 active seconds, ${6*speed} game seconds; delivered ${JSON.stringify(shown.map(e=>e.text))}; context ${JSON.stringify(s.flags.outageChat??{})}`);}
}
console.log(`Independent checks: 3 passing groups; ${failed} failing acceptance cases`);
process.exitCode=failed?1:0;
