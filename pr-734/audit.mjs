import {strict as assert} from 'node:assert';
import {readFileSync} from 'node:fs';
const read=n=>JSON.parse(readFileSync(`shots/pacing-610/${n}.json`));
const bots=read('bots'),all=read('loop');
assert.equal(bots.runs.length,400);assert.equal(new Set(bots.runs.map(r=>`${r.bot}/${r.seed}`)).size,400);
const ended=all.filter(r=>r.log.some(l=>l.kind==='emitted'&&l.e.type==='gameOver'&&l.t===0));
assert.equal(ended.length,2);assert(ended.every(r=>r.seed===2&&r.key==='plateau'));
const rows=all.filter(r=>!ended.includes(r));assert.equal(rows.length,34);
for(const r of rows){assert.equal(r.errors.length,0);assert.equal(r.stats.frames,3600);assert(r.week>r.initialWeek);assert.equal(r.endEra,r.key.startsWith('classic')?'classic':r.key);assert.equal(r.initialStage,r.endStage);assert(!r.log.some(l=>l.kind==='emitted'&&l.e.type==='gameOver'));for(const l of r.log)assert(l.t>=0&&l.t<=120);}
const summary=read('summary');assert.equal(summary.loop.reduce((s,r)=>s+r.minutes,0),68);
for(const g of summary.loop){const rs=rows.filter(r=>r.key===g.key&&r.speed===g.speed);assert.equal(g.decisions,rs.reduce((s,r)=>s+r.log.filter(l=>l.kind==='decision').length,0));assert.equal(g.prompts,rs.reduce((s,r)=>s+r.log.filter(l=>l.kind==='emitted'&&l.e.type==='chatPrompt').length,0));assert.equal(g.yak,rs.reduce((s,r)=>s+r.log.filter(l=>l.kind==='yak').length,0));assert.equal(g.toasts,rs.reduce((s,r)=>s+r.log.filter(l=>l.kind==='toast').length,0));}
console.log('PASS: 400 unique bot runs; 34 valid browser windows, 68 virtual minutes; 2 immediate-retirement windows excluded; 0 browser errors; table counts reconcile.');
const one=rows.filter(r=>r.speed===1);let templates=0,eventPrompts=0,toasts=0,campaign=0;
for(const r of one){for(const p of r.log.filter(l=>l.kind==='emitted'&&l.e.type==='chatPrompt')){const root=r.log.find(l=>l.kind==='emitted'&&l.e.type==='chat'&&l.e.id===p.e.chatId);assert(root);if(root.e.fromId)templates++;else eventPrompts++;}for(const t of r.log.filter(l=>l.kind==='toast')){toasts++;if(t.e.text==='Conference Booth is live.')campaign++;}}
assert.deepEqual({templates,eventPrompts,toasts,campaign},{templates:84,eventPrompts:2,toasts:363,campaign:79});
console.log('PASS: 84 template prompts, 2 event prompts, 363 displayed toasts, 79 Conference Booth confirmations at 1x.');
