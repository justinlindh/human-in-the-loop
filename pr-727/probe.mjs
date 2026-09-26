import {createServer} from 'vite';
import {chromium} from 'playwright';
import {readFileSync,writeFileSync} from 'node:fs';
import {holdRenderLock,launchChromium} from '../../scripts/lib/gl.js';
const name=process.argv[2]??'before';
holdRenderLock('gpu');
const src=readFileSync('scripts/capture.js','utf8');
const shim=src.slice(src.indexOf('function shim('),src.indexOf('async function serve'));
const shimFn=shim.slice(0,shim.lastIndexOf('\n}')+2);
const snapshots=JSON.parse(readFileSync('shots/chatter/snapshots.json'));
const root=name==='before'?(process.env.CHATTER_BASE??'../chatter-base'):'.';
const server=await createServer({root,logLevel:'error',server:{port:0},plugins:[{name:'chatter-probe',enforce:'pre',transform(code,id){
 if(id.endsWith('/src/sim/registry.js')) return code.replace('events.push(e);',`if(e.type==='say'||e.type==='chat') window.__origins?.set(e.id,{source:new Error().stack.split('\\n').filter(x=>/src\\/sim\\/(?!registry)/.test(x)).join('; '),event:e}); events.push(e);`);
 if(id.endsWith('/src/render/labels.js')) return code.replace('l.kind = \'say\';',`l.kind = 'say'; window.__bubbles?.push({l,start:performance.now()/1000,text,source:new Error().stack.split('\\n').filter(x=>/sync.js/.test(x)).join('; ')});`);
 if(id.endsWith('/src/ui/chat.js')) return code.replace("if (e.type === 'say') return;",`if (e.type === 'say') return; if(!silent) window.__yak?.push({t:performance.now()/1000,e});`);
}}]});
await server.listen();const {browser}=await launchChromium(chromium,{mode:'gpu',label:'chatter'});const results=[];
try{for(const [stage,snap] of Object.entries(snapshots)) for(const speed of [1,2,4]){
const page=await browser.newPage({viewport:{width:1280,height:800}});let errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(`(${shimFn})({fps:30,seed:12345}); window.__origins=new Map();window.__bubbles=[];window.__yak=[];`);
await page.addInitScript(entries=>{for(const [k,v] of entries)localStorage.setItem(k,v);},snap.entries);
await page.goto(server.resolvedUrls.local[0]+'?seed=1&quality=medium&time=day');
for(let i=0;i<1000;i++){if(await page.evaluate(()=>!!(window.__HITL&&window.__hitlRender?.ready)))break;await page.evaluate(()=>window.__capture.frame());await new Promise(r=>setTimeout(r,30));}
await page.evaluate(async speed=>{const H=window.__HITL;H.controls.continueGame();H.controls.setAutoPause(false);H.setSpeed(speed);window.__bots=await import('/src/sim/bots.js');window.__lastWeek=-1;window.__bubbles=[];window.__yak=[];window.__t0=performance.now()/1000;window.__stats={max:0,overlapFrames:0,pairFrames:0,visibleFrames:0,yakMax:0};},speed);
for(let sec=0;sec<120;sec++) await page.evaluate(()=>{
const H=window.__HITL;
for(let i=0;i<12;i++){const b=[...document.querySelectorAll('button')].find(x=>x.getClientRects().length&&['Got it','Later'].includes(x.textContent.trim()));if(b)b.click();else if(H.clock.busy)dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));else break;}
if(Math.floor(performance.now()/1000-window.__t0)%4===0&&H.state.pendingDecision)window.__bots.botDecide('balanced',H.state,{onEvents:H.emit});
if(H.state.week!==window.__lastWeek&&!H.state.pendingDecision){window.__lastWeek=H.state.week;window.__bots.botTurn('balanced',H.state,{onEvents:H.emit});}
for(let f=0;f<30;f++){window.__capture.frame();const now=performance.now()/1000;
const visible=[...document.querySelectorAll('.hitl-say')].filter(x=>x.getClientRects().length&&Number(getComputedStyle(x).opacity)>0.5).map(x=>x.getBoundingClientRect());
let yakVisible=0;
for(const y of window.__yak){const el=document.querySelector('.msg[data-id="'+CSS.escape(y.e.id)+'"]');if(!el)continue;const a=el.getBoundingClientRect();let top=0,bottom=innerHeight;for(let p=el.parentElement;p;p=p.parentElement){if(/auto|scroll|hidden/.test(getComputedStyle(p).overflowY)){const r=p.getBoundingClientRect();top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}}const visible=el.getClientRects().length&&Math.min(a.bottom,bottom)-Math.max(a.top,top)>=Math.min(a.height,40);if(visible){y.visible=(y.visible??0)+1/30;yakVisible++;}y.lastVisible=!!visible;}
const st=window.__stats;st.yakMax=Math.max(st.yakMax,yakVisible);st.max=Math.max(st.max,visible.length);if(visible.length>1)st.overlapFrames++;st.visibleFrames+=visible.length;
if(visible.some((a,i)=>visible.slice(i+1).some(b=>Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top))))st.pairFrames++;
for(const b of window.__bubbles){if(b.done)continue;const el=b.l.el;if(b.l.kind!=='say'||b.l.inner.textContent!== (b.text.length>70?b.text.slice(0,67)+'...':b.text)||!el.isConnected||b.l.t>=b.l.life){b.end=now;b.done=true;}else if(el.getClientRects().length&&Number(getComputedStyle(el).opacity)>0.5)b.visible=(b.visible??0)+1/30;}
}
});
await page.screenshot({path:`shots/chatter/${name}-${stage}-${speed}.png`});
const result=await page.evaluate(()=>({camera:window.__cameraStats,week:window.__HITL.state.week,start:window.__t0,stats:window.__stats,bubbles:window.__bubbles.map(({l,...b})=>({...b,end:b.end??performance.now()/1000})),yak:window.__yak,origins:[...window.__origins]}));
results.push({stage,speed,seed:snap.seed,initialWeek:snap.week,...result,errors});writeFileSync(`shots/chatter/${name}.json`,JSON.stringify(results,null,2));console.log(stage,speed,'bubbles',result.bubbles.length,'yak',result.yak.length,'max',result.stats.max,'weeks',result.week-snap.week,'errors',errors);await page.close();
}}finally{await browser.close();await server.close();}
