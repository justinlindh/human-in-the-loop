import {runBot} from '../../src/sim/bots.js';
import {saveGame} from '../../src/save/save.js';
import {writeFileSync} from 'node:fs';
let snapshots={};
for(let seed=1;seed<=20 && Object.keys(snapshots).length<3;seed++) runBot('balanced',seed,1040,{onWeek(s){let stage=['garage','floor','hq'][s.officeStage];if(!snapshots[stage] && !s.pendingDecision && s.week>=12){let mem=new Map();saveGame(structuredClone(s),{getItem:k=>mem.get(k)??null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)});snapshots[stage]={seed,week:s.week,staff:s.staff.length,entries:[...mem]};console.log(stage,seed,s.week,s.staff.length);}},stopWhen:()=>Object.keys(snapshots).length===3});
writeFileSync('shots/chatter/snapshots.json',JSON.stringify(snapshots));
