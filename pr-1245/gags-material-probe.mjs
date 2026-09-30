import { startHarness } from '../../blender/checks/harness.mjs';
const H = await startHarness();
try {
  const {page}=await H.openScene('mock=garage&quality=high&eras&eraArt=preinternet');
  console.log(JSON.stringify(await page.evaluate(async()=>{
    const {getTemplate,PROP_NAMES}=await import('/src/render/models.js');
    window.__step(150);
    const mats=new Map(),duplicates=[];
    function visit(o){if(!o.isMesh)return;for(const m of [].concat(o.material)){const prev=mats.get(m.uuid);if(prev&&prev!==m)duplicates.push({uuid:m.uuid,a:{id:prev.id,name:prev.name,color:prev.color.getHexString()},b:{id:m.id,name:m.name,color:m.color.getHexString()}});mats.set(m.uuid,m);}}
    for(const name of PROP_NAMES)getTemplate(name)?.traverse(visit);
    window.__hitlRender.scene.traverse(visit);
    return {duplicates};
  }),null,2));
}finally{await H.close();}
