import { startHarness } from '../../blender/checks/harness.mjs';
import { renderScene } from '../../blender/checks/scene.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const out = 'shots/era-batch2';
const H = await startHarness();
const open = H.openScene.bind(H);
let era = 'dotcom';
H.openScene = async (q, o) => {
  const result = await open(`${q}&eras&eraArt=${era}`, o);
  if (mode === 'turntables') await result.page.evaluate(async () => { window.__models = await import('/src/render/models.js'); });
  return result;
};
const records = [];
const mode = process.argv[2] ?? 'stills';

async function capture(name, options) {
  const result = await renderScene(H, { mock: 'garage', size: '1920x1080', warm: 150, settle: 60, paused: true, ...options });
  if (result.errors.length) throw new Error(result.errors.join('\n'));
  if (options.frames) {
    const dir = `${out}/${name}-frames`; mkdirSync(dir, { recursive: true });
    result.images.forEach((image, i) => writeFileSync(`${dir}/${String(i).padStart(4, '0')}.png`, image));
    const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', `${dir}/%04d.png`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', `${out}/${name}.mp4`], { timeout: 120000, stdio: 'inherit' });
    if (r.status) throw new Error(`ffmpeg: ${r.status}`);
  } else writeFileSync(`${out}/${name}.png`, result.images[0]);
  records.push({ name, era, ...result.report });
  console.log(`capture ${name}: ${result.images.length} frames, zero console errors`);
}

try {
  if (mode === 'turntables') {
    const names = ['era_retail_boxes', 'era_floppy_stack', 'era_cd_spindle', 'era_dotcom_board', 'era_web2_badge', 'era_y2k_clock', 'era_y2k_sticker', 'era_payphone', 'era_video_sign', 'era_pager_billboard', 'era_sock_billboard', 'era_lease_billboard', 'era_beta_billboard', 'era_led_billboard'];
    for (const name of names) await capture(`${name}-turntable`, { size: '900x900', quality: 'high', time: 0.45, frames: 120,
      patchJs: `
        const T=R.THREE;for(const child of R.scene.children)if(!child.isLight)child.visible=false;
        const model=window.__models.getModel('${name}');const b=new T.Box3().setFromObject(model),size=b.getSize(new T.Vector3()),c=b.getCenter(new T.Vector3());
        const k=2.6/Math.max(size.x,size.y,size.z);model.scale.setScalar(k);model.position.set(-c.x*k,-b.min.y*k,-c.z*k);
        const pivot=new T.Group();pivot.add(model);R.scene.add(pivot);R.easeTo(0,0,2.2,100,size.y*k/2);
        const render=R.render.bind(R);R.render=(dt,o)=>{pivot.rotation.y+=Math.PI*2/120;return render(dt,o);};
      ` });
  } else if (mode === 'calendar') {
    era = 'calendar';
    await capture('billboard-calendar', { size: '1280x960', quality: 'low', time: 0.45, frames: 600,
      patchJs: `
        const years=[1991,1998,2002,2008,2019],eras=['classic','classic','classic','classic','classic'];
        const render=R.render.bind(R);let frame=0,part=-1;
        R.render=(dt,o)=>{const next=Math.min(4,Math.floor(frame/120));if(next!==part){part=next;S.week=(years[part]-2019)*52;S.era.id=eras[part];R.sync(S);const f=R.exterior().feet.find(f=>f.id==='billboard');R.easeTo((f.x0+f.x1)/2,(f.z0+f.z1)/2,1.8,100,1.3);}R.setTimeOfDay(frame%120<60?0.45:0.95);frame++;return render(dt,o);};
      ` });
  } else if (mode === 'stills') {
    for (era of ['preinternet', 'dotcom', 'dotcom-bust', 'web2', 'classic', 'chatgbt', 'agents', 'consolidation', 'plateau']) {
      for (const [label, quality, time] of [['day', 'high', 0.45], ['night', 'high', 0.95], ['low-day', 'low', 0.45], ['low-night', 'low', 0.95]]) {
        const common = { quality, time, report: 'window.__hitlRender.exterior()' };
        await capture(`${era}-${label}-office`, common);
        await capture(`${era}-${label}-billboard`, { ...common, patchJs: 'const f=R.exterior().feet.find(x=>x.id==="billboard");window.center=[(f.x0+f.x1)/2,1.25,(f.z0+f.z1)/2];R.easeTo(center[0],center[2],1.8,100,center[1]);', cropAround: 'window.center', cropSize: [850, 850] });
      }
    }
  } else if (mode === 'props') {
    for (const [which, names] of [['dotcom', ['era_retail_boxes', 'era_floppy_stack', 'era_cd_spindle', 'era_dotcom_board', 'era_y2k_clock', 'era_y2k_sticker']], ['web2', ['era_web2_badge']]]) {
      era = which;
      for (const name of names) for (const [label, quality, time] of [['day', 'high', 0.45], ['night', 'high', 0.95], ['low', 'low', 0.95]]) {
        await capture(`${name}-${label}`, { quality, time,
          patchJs: `const o=R.scene.getObjectByName('${name}');if(!o)throw Error('Missing ${name}');const b=new R.THREE.Box3().setFromObject(o),c=b.getCenter(new R.THREE.Vector3());window.center=c.toArray();R.easeTo(c.x,c.z,3.2,100,c.y);`,
          cropAround: 'window.center', cropSize: [760, 600] });
      }
    }
  } else if (mode === 'exterior') {
    era = 'preinternet';
    for (const [name, center] of [['payphone', null], ['video_sign', null]]) {
      for (const mock of name === 'video_sign' ? ['garage', 'floor', 'hq'] : ['garage']) {
      for (const [label, quality, time] of [['day', 'high', 0.45], ['night', 'high', 0.95], ['low', 'low', 0.95]]) {
        await capture(`${name}${mock === 'garage' ? '' : '-' + mock}-${label}`, { mock, quality, time,
          patchJs: name === 'payphone'
            ? 'const f=R.exterior().feet.find(x=>x.id==="payphone");window.center=[(f.x0+f.x1)/2,0.5,(f.z0+f.z1)/2];R.easeTo(center[0],center[2],3.2,100,center[1]);'
            : 'const f=R.exterior().fascia;window.center=[f.x,f.y+0.425,f.z];R.easeTo(center[0],center[2],2.2,100,center[1]);',
          cropAround: 'window.center', cropSize: [760, 650] });
      }
      }
    }
    for (era of ['preinternet', 'dotcom', 'web2', 'classic']) {
      for (const mock of ['garage', 'floor', 'hq']) await capture(`${era}-${mock}-turned-low`, { mock, quality: 'low', time: 0.45, patchJs: 'R.rotateView(1);', settle: 180 });
    }
  }
} finally {
  await H.close();
  writeFileSync(`${out}/capture-${mode}.json`, JSON.stringify(records, null, 2));
}
