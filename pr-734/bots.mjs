import {runBot} from '../../src/sim/bots.js';
import {saveGame} from '../../src/save/save.js';
import {writeFileSync} from 'node:fs';
const groups={}, snapshots=[], runs=[];
const names=['sensible','balanced'];
const inc=(o,k,n=1)=>o[k]=(o[k]??0)+n;
for(const bot of names) for(let seed=1;seed<=200;seed++) {
 let state, prevEra='classic', prevStage=0, trace=[], seen=new Set();
 const group=()=>groups[`${bot}/${prevEra}/${prevStage}`]??=( {bot,era:prevEra,stage:prevStage,weeks:0,runs:0,events:{},actions:{}} );
 const started=new Set();
 const events=ev=>{for(const e of ev)inc(group().events,e.type);};
 const result=runBot(bot,seed,1040,{setup(s){state=s;},onEvents(ev,a){events(ev);inc(group().actions,a.type);},onWeek(s,ev){
   const g=group();g.weeks++;if(!started.has(g)){started.add(g);g.runs++;}events(ev);
   if(seed<=3 && bot==='sensible') {
    trace.push({week:s.week,era:prevEra,stage:prevStage,events:ev.filter(e=>['decision','chatPrompt','chat','moment','toast','levelUp','promoted','traitEarned','launch','era','unlock'].includes(e.type))});
    const age=s.week-(s.eraSchedule[s.era.id]??0);
    const key=s.era.id==='classic'?(s.officeStage===0?'classic-garage':'classic-floor'):s.era.id;
    if(!seen.has(key)&&age>=12&&!s.pendingDecision){
     const mem=new Map();saveGame(structuredClone(s),{getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)});
     snapshots.push({key,bot,seed,week:s.week,era:s.era.id,stage:s.officeStage,entries:[...mem]});seen.add(key);
    }
   }
   prevEra=s.era.id;prevStage=s.officeStage;
 }});
 runs.push({bot,seed,weeks:result.weeks,reason:result.reason});
 if(trace.length)writeFileSync(`shots/pacing-610/bot-trace-${seed}.json`,JSON.stringify(trace));
 if(seed%50===0) console.log(bot,seed);
}
writeFileSync('shots/pacing-610/bots.json',JSON.stringify({groups:Object.values(groups),runs},null,2));
writeFileSync('shots/pacing-610/snapshots.json',JSON.stringify(snapshots));
console.log('PASS 400 full bot runs;',snapshots.length,'browser snapshots');
