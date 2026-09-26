import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const get=p=>JSON.parse(readFileSync(`shots/pacing-610/${p}.json`));
const n=(x)=>+(x??0).toFixed(2);
const summary={};
if(existsSync('shots/pacing-610/bots.json')){
 const bots=get('bots'),groups={};
 for(const g of bots.groups){const a=groups[g.era]??={era:g.era,weeks:0,events:{},actions:{}};a.weeks+=g.weeks;for(const type of ['events','actions'])for(const[k,v]of Object.entries(g[type]))a[type][k]=(a[type][k]??0)+v;}
 summary.bots=Object.values(groups).map(g=>({era:g.era,weeks:g.weeks,unpausedMinutes:n(g.weeks*8/60),decisions:n((g.events.decision??0)*7.5/g.weeks),prompts:n((g.events.chatPrompt??0)*7.5/g.weeks),yak:n((g.events.chat??0)*7.5/g.weeks),toasts:n((g.events.toast??0)*7.5/g.weeks),growth:n(((g.events.promoted??0)+(g.events.traitEarned??0))*7.5/g.weeks),levelUp:n((g.events.levelUp??0)*7.5/g.weeks),events:g.events}));
 console.log('BOT raw per unpaused 1x minute');console.table(summary.bots.map(({events,...x})=>x));
}
if(existsSync('shots/pacing-610/loop.json')){
 const groups={};
 for(const r of get('loop').filter(r=>!r.log.some(l=>l.kind==='emitted'&&l.e.type==='gameOver'&&l.t===0))){const g=groups[`${r.key}/${r.speed}`]??={key:r.key,speed:r.speed,runs:0,minutes:0,weeks:0,decisions:0,prompts:0,yak:0,importantYak:0,toasts:0,growthToasts:0,cards:0,launch:0,moments:0,spotlights:0,holdSeconds:0,pausedSeconds:0,rawYak:0,actions:0,menuActions:0,worstMinute:0,minPopupGap:null};
  g.runs++;g.minutes+=r.stats.frames/30/60;g.weeks+=r.week-r.initialWeek;g.holdSeconds+=r.stats.holdOnly/30;g.pausedSeconds+=(r.stats.busy+r.stats.decisionFrames)/30;
  for(const l of r.log){if(l.kind==='decision')g.decisions++;if(l.kind==='emitted'&&l.e.type==='chatPrompt')g.prompts++;if(l.kind==='emitted'&&l.e.type==='chat')g.rawYak++;
   if(l.kind==='yak'){g.yak++;if(l.e.important||['incidents','wins'].includes(l.e.channel)||(!l.e.fromId&&String(l.e.from).startsWith('@')))g.importantYak++;}
   if(l.kind==='toast'){g.toasts++;if(l.e.growth)g.growthToasts++;}if(l.kind==='card')g.cards++;if(l.kind==='launchPopup')g.launch++;if(l.kind==='moment')g.moments++;if(l.kind==='spotlight')g.spotlights++;if(l.kind==='action'){g.actions++;if(l.e.type!=='answerPrompt')g.menuActions++;}
  }
  const pop=r.log.filter(l=>['decision','card','launchPopup'].includes(l.kind));
  for(let i=1;i<pop.length;i++){const d=pop[i].t-pop[i-1].t;g.minPopupGap=Math.min(g.minPopupGap??Infinity,d);}
  const ints=r.log.filter(l=>['decision','card','launchPopup','toast','yak'].includes(l.kind));for(const l of ints)g.worstMinute=Math.max(g.worstMinute,ints.filter(x=>x.t>=l.t&&x.t<l.t+60).length);
 }
 summary.loop=Object.values(groups).map(g=>({...g,rates:Object.fromEntries(['decisions','prompts','yak','importantYak','toasts','growthToasts','cards','launch','moments','spotlights','actions','menuActions','rawYak'].map(k=>[k,n(g[k]/g.minutes)])),holdPercent:n(g.holdSeconds/(g.minutes*60)*100)}));
 for(const speed of [1,2]){console.log('BROWSER',speed);console.table(summary.loop.filter(g=>g.speed===speed).map(g=>({key:g.key,n:g.runs,minutes:g.minutes,weeks:g.weeks,...g.rates,holdSeconds:n(g.holdSeconds),holdPercent:g.holdPercent,worstMinute:g.worstMinute,minPopupGap:n(g.minPopupGap)})));}
}
summary.pace=[];
for(const speed of [1,2])if(existsSync(`shots/pacing-610/pace-${speed}.json`))for(const r of get(`pace-${speed}`)){
 let groups={},last=0,era='classic';for(const l of r.timeline){const g=groups[era]??={era,seconds:0,counts:{}};g.seconds+=l.t-last;last=l.t;g.counts[l.kind]=(g.counts[l.kind]??0)+1;if(l.kind==='era')era=l.text;}
 groups[era].seconds+=r.metrics.realMinutes*60-last;
 summary.pace.push({speed,player:r.metrics.player,minutes:r.metrics.realMinutes,weeks:r.metrics.weeks,pausedShare:r.metrics.pausedShare,eras:Object.values(groups).map(g=>({era:g.era,minutes:n(g.seconds/60),decisions:n((g.counts.decision??0)*60/g.seconds),yak:n((g.counts.chat??0)*60/g.seconds),menus:n((g.counts.menu??0)*60/g.seconds)}))});
}
console.log('PACE',JSON.stringify(summary.pace));
writeFileSync('shots/pacing-610/summary.json',JSON.stringify(summary,null,2));
