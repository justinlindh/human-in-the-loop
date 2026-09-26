import {createServer} from 'vite';
import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
import {holdRenderLock,launchChromium} from '../../scripts/lib/gl.js';
holdRenderLock('gpu');
const src=readFileSync('scripts/capture.js','utf8');
const shim=src.slice(src.indexOf('function shim('),src.indexOf('async function serve'));
const shimFn=shim.slice(0,shim.lastIndexOf('\n}')+2);
const snapshots=JSON.parse(readFileSync('shots/pacing-610/snapshots.json'));
const server=await createServer({logLevel:'error',server:{port:0},plugins:[{name:'review-probe',enforce:'pre',transform(code,id){
 const replace=(a,b)=>{if(!code.includes(a))throw Error('Missing probe anchor '+id+' '+a);return code.replace(a,b);};
 if(id.endsWith('/src/sim/registry.js'))return replace('events.push(e);',"window.__record?.('emitted',e); events.push(e);");
 if(id.endsWith('/src/main.js'))return replace('const canSave =', 'window.__playerEvents = events => route(events, sim.state, true); const canSave =');
 if(id.endsWith('/src/ui/chat.js'))return replace("if (e.type === 'say') return;","if (e.type === 'say') return; if(!silent) window.__record?.('yak',e);");
 if(id.endsWith('/src/ui/toasts.js'))return replace('live.push(t);',"window.__record?.('toast',{text,tone,glyph,growth:!!person}); live.push(t);");
 if(id.endsWith('/src/ui/announce.js'))return replace('const item = queue.shift();',"const item = queue.shift(); window.__record?.('card',{kind:item.kind});");
 if(id.endsWith('/src/ui/popups.js'))return replace('function renderDecision(s, d) {',"function renderDecision(s, d) { window.__record?.('decision',{id:d.eventId});");
}}]});
await server.listen();const {browser}=await launchChromium(chromium,{mode:'gpu',label:'pacing-610'});const results=[];
try {for(const snap of snapshots)for(const speed of [1,2]){
 const page=await browser.newPage({viewport:{width:1280,height:800}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.addInitScript(`(${shimFn})({fps:30,seed:12345});`);
 await page.addInitScript(entries=>{for(const [k,v]of entries)localStorage.setItem(k,v);},snap.entries);
 await page.goto(server.resolvedUrls.local[0]+'?quality=medium&time=day');
 for(let i=0;i<1000;i++){if(await page.evaluate(()=>!!(window.__HITL&&window.__hitlRender?.ready)))break;await page.evaluate(()=>window.__capture.frame());await new Promise(r=>setTimeout(r,30));}
 await page.evaluate(async ({speed,bot})=>{
  const H=window.__HITL,R=window.__hitlRender;
  if(!H.controls.continueGame().ok)throw Error('Cannot load snapshot');
  H.controls.setAutoPause(false);H.setSpeed(speed);
  window.__bots=await import('/src/sim/bots.js');
  const render=R.render.bind(R);R.render=dt=>render(dt,{draw:false});
  window.__t0=performance.now()/1000;window.__log=[];
  window.__record=(kind,e)=>window.__log.push({t:+(performance.now()/1000-window.__t0).toFixed(3),week:H.state.week,era:H.state.era.id,stage:H.state.officeStage,kind,e:JSON.parse(JSON.stringify(e))});
  window.__measure={lastWeek:-1,decision:null,decisionAt:0,modal:null,modalAt:0,spotKey:null,moments:new Set(),bot,speed,frames:0,free:0,holdOnly:0,spotFrames:0,busy:0,decisionFrames:0,zeroSpeed:0};
 },{speed,bot:snap.bot});
 for(let sec=0;sec<120;sec++)await page.evaluate(()=>{
  const H=window.__HITL,R=window.__hitlRender,m=window.__measure;
  for(let f=0;f<30&&!H.state.gameOver;f++){
   const now=performance.now()/1000-window.__t0,d=H.state.pendingDecision;
   if(d!==m.decision){m.decision=d;m.decisionAt=now;}
   if(d&&now-m.decisionAt>=8)window.__bots.botDecide(m.bot,H.state,{onEvents:window.__playerEvents});
   const modal=document.querySelector('.announce-back, .modal.launch, .modal.launch-batch');
   if(modal!==m.modal){m.modal=modal;m.modalAt=now;if(modal&&!modal.matches('.announce-back'))window.__record('launchPopup',{});}
   if(modal&&now-m.modalAt>=6){
    const btn=[...modal.querySelectorAll('button')].find(x=>['Nice!','Got it','Later','Onward','See the decision','Continue','Close','Back to the office'].includes(x.textContent.trim()));
    if(btn)btn.click();else dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
   }
   if(!H.state.pendingDecision&&!H.clock.busy&&H.state.week!==m.lastWeek){m.lastWeek=H.state.week;window.__bots.botTurn(m.bot,H.state,{onEvents:(ev,a)=>{window.__record('action',a);window.__playerEvents(ev);}});}
   if(H.state.gameOver)break; window.__capture.frame();m.frames++;
   const c=H.clock,spot=c.spotlight;
   if(c.busy)m.busy++;if(H.state.pendingDecision)m.decisionFrames++;if(c.speed===0)m.zeroSpeed++;
   if(spot){m.spotFrames++;if(!c.busy&&!H.state.pendingDecision&&c.speed>0)m.holdOnly++;if(spot.key!==m.spotKey)window.__record('spotlight',spot);}
   m.spotKey=spot?.key??null;
   if(!c.busy&&!H.state.pendingDecision&&!spot&&c.speed>0)m.free++;
   const kinds=new Set((R.moments?.active??[]).map(x=>x[1]));
   for(const kind of kinds)if(!m.moments.has(kind))window.__record('moment',{kind});m.moments=kinds;
  }
 });
 const result=await page.evaluate(()=>({log:window.__log,stats:{...window.__measure,decision:undefined,modal:undefined,moments:undefined},week:window.__HITL.state.week,endEra:window.__HITL.state.era.id,endStage:window.__HITL.state.officeStage,pending:window.__HITL.state.pendingDecision?.eventId,clock:window.__HITL.clock}));
 results.push({key:snap.key,seed:snap.seed,initialWeek:snap.week,initialStage:snap.stage,speed,...result,errors});
 writeFileSync('shots/pacing-610/loop.json',JSON.stringify(results));
 const counts={};for(const e of result.log)counts[e.kind]=(counts[e.kind]??0)+1;
 console.log(snap.seed,snap.key,speed,'weeks',result.week-snap.week,counts,'holdSeconds',result.stats.holdOnly/30,'errors',errors);
 await page.close();
}}finally{await browser.close();await server.close();}
if(results.some(r=>r.errors.length||(r.week===r.initialWeek&&!r.log.some(l=>l.kind==='emitted'&&l.e.type==='gameOver'))))process.exitCode=1;
