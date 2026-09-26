import {readFileSync} from 'node:fs';
import {holdSeconds} from '../../src/render/reading.js';
const rows=JSON.parse(readFileSync('logs/review-746/runtime-results.json'));
let failures=0;
for(const r of rows){
 const problems=[];
 if(r.ended===null||r.errors.length)problems.push('completion or console failure');
 if(['pause','menu'].includes(r.kind)&&r.pauseStable!==true)problems.push('pause lost state');
 if(r.kind==='menu'&&!r.menuBusy)problems.push('real Settings menu was not busy');
 const expected=r.lines.filter(l=>!['depart','remote','sabbatical'].includes(r.kind)||l.staffId!==r.lines[1].staffId).map(l=>l.text);
 const shown=r.trace.flatMap(q=>q.texts).filter(t=>expected.includes(t));
 const sequence=r.kind==='priority'?[expected[0],...expected]:expected;
 if(JSON.stringify(shown)!==JSON.stringify(sequence))problems.push('wrong turn order');
 for(const text of expected){let longest=0;for(let i=0;i<r.trace.length;i++)if(r.trace[i].texts.includes(text))longest=Math.max(longest,(r.trace[i+1]?.t??r.ended)-r.trace[i].t);
 const speed=r.kind==='normal2'?2:r.kind==='normal4'||r.kind==='outage4'||r.kind==='speed'&&text!==expected[0]?4:1;
 if(longest<holdSeconds(text,speed)-0.05)problems.push(`short hold: ${text}`);}
 if(r.trace.some(q=>q.texts.length>1))problems.push('multiple speech bubbles');
 if(r.kind==='denied'&&!r.trace.some(q=>q.standup?.phase==='talk'&&q.standup.i===0&&q.texts.some(t=>t.startsWith('Please wait'))))problems.push('denial not observed in talk phase');
 if(r.kind==='outage4'&&r.trace.some(q=>!q.outage&&q.texts.some(t=>t.includes('still down'))))problems.push(`stale outage claim at 5.4s after recovery at ${r.resolvedAt}s`);
 console.log(`${problems.length?'FAIL':'PASS'} ${r.kind}: ${problems.join('; ')||'order, full reading holds, single slot, lifecycle'}`);failures+=!!problems.length;
}
const small=JSON.parse(readFileSync('logs/review-746/independent-two-attendees-trace.json'));
const answer='Something small that another person can check.';
if(!small.lines.some(l=>l.text===answer)) {failures++;console.log('FAIL two-attendees: opening question and follow-up question have no answer before meeting completion.');}
console.log(`Acceptance failures: ${failures}`);process.exitCode=failures?1:0;
