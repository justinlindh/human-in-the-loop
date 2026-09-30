import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
const names = readdirSync('public/models').filter(n=>n.startsWith('era_')).concat(['whiteboard.glb','coffee_machine.glb','monitor.glb','plant_small.glb','trophy.glb','desk.glb']);
const rows=[];
for(const name of names){
  const b=readFileSync('public/models/'+name),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());
  let triangles=0;for(const m of j.meshes??[])for(const p of m.primitives)triangles+=(p.indices===undefined?j.accessors[p.attributes.POSITION].count:j.accessors[p.indices].count)/3;
  rows.push({name,triangles,bytes:b.length});
}
const small=rows.filter(x=>['era_retail_boxes.glb','era_floppy_stack.glb','era_cd_spindle.glb'].includes(x.name));
const shared=small.reduce((x,y)=>({triangles:x.triangles+y.triangles,bytes:x.bytes+y.bytes}),{triangles:0,bytes:0});
if(shared.triangles>=3000||rows.some(x=>x.name.startsWith('era_')&&x.triangles>=3000))throw Error('Triangle budget');
writeFileSync('shots/era-batch2/model-counts.json',JSON.stringify({shared,rows},null,2));
console.log('| Model | Triangles | Bytes |');console.log('| --- | ---: | ---: |');for(const r of rows)console.log(`| ${r.name} | ${r.triangles} | ${r.bytes} |`);console.log('Shared small props:',shared);
