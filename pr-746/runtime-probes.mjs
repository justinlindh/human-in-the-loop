import { createServer } from 'vite';
import { chromium } from 'playwright';
import { readFileSync, writeFileSync } from 'node:fs';
import { launchChromium, holdRenderLock } from '../../scripts/lib/gl.js';
import { PLAY, IN_OFFICE, CLEAR_CARDS, IDLE } from '../../scripts/capture-manifest.js';
const shim=readFileSync('blender/checks/loop.mjs','utf8').match(/const SHIM = `([\s\S]*?)`;/)[1];
holdRenderLock('gpu');
const server=await createServer({cacheDir:'logs/review-746/vite-probe',server:{port:0},logLevel:'error'}); await server.listen();
const {browser}=await launchChromium(chromium,{mode:'gpu',label:'review-746'});
const results=JSON.parse(readFileSync('logs/review-746/runtime-results.json','utf8')); 
try {
 for(const kind of ['menu','priority','depart','remote','sabbatical','outage4']){
  const page=await browser.newPage({viewport:{width:1280,height:800}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(shim);
  await page.goto(`${server.resolvedUrls.local[0]}?seed=26&speed=0&quality=medium&time=day`);
  for(let i=0;i<1000;i++) {if(await page.evaluate(()=>!!window.__hitlRender?.ready))break;await page.evaluate(()=>window.__frame(1));await new Promise(r=>setTimeout(r,30));}
  await page.evaluate(PLAY({weeks:110,after:IN_OFFICE+` s.policies.daily_standups=false; s.policies.async_standups=false; s.projects=[]; s.pendingDecision=null; s.chatPrompts=[]; for(const p of s.staff){p.mood='ok';p.assignment={type:'idle',targetId:null};} `}));
  await page.evaluate(`${CLEAR_CARDS}; ${IDLE}; window.__HITL.setSpeed(1); window.__frame(120);`);
  const result=await page.evaluate(async kind=>{
    const H=window.__HITL,R=window.__hitlRender,S=H.state;
    const {standupSystem}=await import('/src/sim/standup.js'); const {makeCtx}=await import('/src/sim/registry.js');
    H.setSpeed(kind==='outage4'?4:Number(kind.replace('normal',''))||1);
    S.pendingDecision=null;
    const ids=S.staff.filter(p=>!p.remote&&p.mood!=='away').slice(0,3).map(p=>p.id);
    let lines=[{staffId:ids[0],text:'What needs another pair of eyes?'},{staffId:ids[1],text:'The plan. I have three answers to one question.'},{staffId:ids[2],text:'Let us try the smallest answer first.'},{staffId:ids[0],text:'Good. I will bring one question back.'}];
    if(kind==='outage4'){
      S.outage={productId:S.products.find(p=>!p.killed).id,kind:'bug',severity:0.01,weeks:0,unrecoverable:false};
      S.policies.daily_standups=true; const c=makeCtx(S);standupSystem(c);lines=c.events.find(e=>e.type==='standup').lines; S.policies.daily_standups=false;
    }
    const startedWeek=S.week; H.emit([{type:'standup',mode:'daily',lines}]);
    const trace=[],changes=[];let last='',acted=false,pauseStable=null,menuBusy=null,ended=null,resolvedAt=null;
    for(let f=0;f<2100;f++){
      const t=f/30, texts=[...document.querySelectorAll('.hitl-say')].map(e=>e.textContent);
      const sig=JSON.stringify(texts);
      if(sig!==last){trace.push({t,week:S.week,texts,standup:R.stats.standup,outage:!!S.outage});last=sig;}
      if(kind==='outage4'&&!S.outage&&resolvedAt===null)resolvedAt=t;
      if(!acted&&texts.some(t=>lines.some(l=>l.text===t))){
        acted=true;
        if(kind==='speed')H.setSpeed(4);
        if(kind==='priority')H.emit([{type:'launch'}]);
        if(kind==='depart')S.staff=S.staff.filter(p=>p.id!==ids[1]);
        if(kind==='remote')S.staff.find(p=>p.id===ids[1]).remote=true;
        if(kind==='sabbatical')S.staff.find(p=>p.id===ids[1]).assignment={type:'sabbatical',targetId:null};
        if(kind==='pause'||kind==='menu'){
          if(kind==='pause')H.setSpeed(0);
          else {const b=document.querySelector('button.gear'); if(!b)throw Error('settings button missing');b.click();}
          window.__frame(1);menuBusy=H.clock.busy;
          const before=JSON.stringify({week:S.week,st:R.stats.standup,text:[...document.querySelectorAll('.hitl-say')].map(e=>e.textContent)});
          window.__frame(150);
          pauseStable=before===JSON.stringify({week:S.week,st:R.stats.standup,text:[...document.querySelectorAll('.hitl-say')].map(e=>e.textContent)});
          if(kind==='pause')H.setSpeed(1);else dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));
        }
      }
      if(S.pendingDecision)H.dispatch({type:'resolveDecision',choice:0});
      for(let i=0;i<12;i++){const b=[...document.querySelectorAll('button')].find(b=>b.getClientRects().length&&b.textContent.trim()==='Got it');if(b)b.click();else if(H.clock.busy)dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}));else break;}
      window.__frame(1);
      if(!R.stats.standup&&acted){ended=t;break;}
    }
    return {kind,startedWeek,endedWeek:S.week,lines,trace,ended,resolvedAt,pauseStable,menuBusy};
  },kind);
  results.push({...result,errors});writeFileSync('logs/review-746/runtime-results.json',JSON.stringify(results,null,2));
  console.log(JSON.stringify({kind,ended:result.ended,errors,trace:result.trace,pauseStable:result.pauseStable,menuBusy:result.menuBusy}));
  await page.screenshot({path:`logs/review-746/runtime-${kind}.png`});await page.close();
 }
}finally{await browser.close();await server.close();}
