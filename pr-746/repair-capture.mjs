import { PLAY, IN_OFFICE, CLEAR_CARDS, IDLE } from '../../scripts/capture-manifest.js';
const observe=`
 const H=window.__HITL,R=window.__hitlRender;window.__reviewTrace=[];let previous='';
 const observe=()=>{const s=H.state,texts=[...document.querySelectorAll('.hitl-say')].map(e=>e.textContent),st=R.stats.standup;
 const row={t:window.__capture.now/1000,week:s.week,outage:!!s.outage,texts,standup:st};const sig=JSON.stringify([row.week,row.outage,row.texts,st]);
 if(sig!==previous){window.__reviewTrace.push(row);previous=sig;}requestAnimationFrame(observe);};requestAnimationFrame(observe);
 setInterval(()=>{${CLEAR_CARDS};${IDLE};if(H.state.pendingDecision)H.dispatch({type:'resolveDecision',choice:0});},100);
 H.setSpeed(1);`;
const after=IN_OFFICE+`s.policies.daily_standups=false;s.policies.async_standups=false;s.projects=[];s.pendingDecision=null;s.chatPrompts=[];for(const p of s.staff){p.mood='ok';p.assignment={type:'idle',targetId:null};}`;
function trigger(outage){return `(async()=>{const H=window.__HITL,S=H.state,R=window.__hitlRender;
 const {standupSystem}=await import('/src/sim/standup.js');const {makeCtx}=await import('/src/sim/registry.js');
 ${outage?"S.outage={productId:S.products.find(p=>!p.killed).id,kind:'bug',severity:0.01,weeks:0,unrecoverable:false};":''}
 S.policies.daily_standups=true;const c=makeCtx(S);standupSystem(c);S.policies.daily_standups=false;
 const e=c.events.find(e=>e.type==='standup');window.__reviewLines=e.lines;H.setSpeed(${outage?4:1});H.emit([e]);
 const goals=e.lines.map(l=>R.walkOf(l.staffId)?.temp?.goal).filter(Boolean);if(goals.length)R.focusAt(goals.reduce((v,g)=>v+g.x,0)/goals.length,goals.reduce((v,g)=>v+g.z,0)/goals.length,2.1);
 })()`;}
export const ITEMS=[
 {id:'independent-daily-outage-4x',title:'Daily standup continues after outage recovery',query:'seed=26&speed=0&time=day',seconds:35,warmup:0,fps:30,size:'1280x800',hideUi:false,
 setup:`(async()=>{await ${PLAY({weeks:110,after})};${observe}})()`,actions:[{at:4,js:trigger(true)},{at:34.9,js:"(window.__captureMarks??=[]).push({t:0,label:JSON.stringify({lines:window.__reviewLines,trace:window.__reviewTrace})})"}],screenshots:[8,10,14,32]},
 {id:'independent-two-attendees',title:'Two-person opening exchange ends before its answer',query:'seed=26&speed=0&time=day',seconds:40,warmup:0,fps:30,size:'1280x800',hideUi:false,
 setup:`(async()=>{await ${PLAY({weeks:110,after:after+"s.flags.standupConversationRecent=[]; for(const p of s.staff.slice(2)){p.mood='away';p.sabbaticalWeeksLeft=30;p.assignment={type:'sabbatical',targetId:null};}"})};${observe}})()`,actions:[{at:4,js:trigger(false)},{at:39.9,js:"(window.__captureMarks??=[]).push({t:0,label:JSON.stringify({lines:window.__reviewLines,trace:window.__reviewTrace})})"}],screenshots:[8,12,17,22,28,35]},
];
