import { startHarness } from '../../blender/checks/harness.mjs';
import { writeFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const H = await startHarness();
const results = [];
try {
  for (const query of ['', '&eras', '&eraArt=dotcom', '&eras&eraArt=invalid']) {
    const { page, errors } = await H.openScene('mock=garage&quality=low' + query);
    const value = await page.evaluate(() => { window.__step(60); return { models: performance.getEntriesByType('resource').filter(x => /models\/era_/.test(x.name)).map(x => x.name), billboard: window.__hitlRender.exterior().billboard }; });
    assert.equal(value.models.length, 0); assert.equal(value.billboard, null); assert.equal(errors.length, 0);
    results.push({ kind: 'opt-in', query, ...value }); await page.close();
  }
  for (const mock of ['garage', 'floor', 'hq']) for (const era of ['preinternet', 'dotcom', 'dotcom-bust', 'web2', 'classic', 'chatgbt', 'agents', 'consolidation', 'plateau']) for (const quality of ['high', 'low']) {
    const { page, errors } = await H.openScene(`mock=${mock}&quality=${quality}&eras&eraArt=${era}`, { width: 1920, height: 1080 });
    const value = await page.evaluate(() => {
      const R=window.__hitlRender;
      window.__step(60);
      const hits=[], inter=(a,b)=>Math.min(a.x1,b.x1)>Math.max(a.x0,b.x0) && Math.min(a.z1,b.z1)>Math.max(a.z0,b.z0);
      let samples=0,nearest=Infinity;
      for(let n=0;n<900;n++) {
        window.__sample(1);
        const e=R.exterior(), signs=e.feet.filter(f=>['billboard','payphone'].includes(f.id));
        for(const a of signs) {
          for(const b of e.feet) if(a!==b&&inter(a,b))hits.push(`standing ${a.id}/${b.id}`);
          for(const b of e.lanes)if(inter(a,b))hits.push(`lane ${a.id}`);
          for(const b of e.cars){samples++;if(inter(a,b))hits.push(`car ${a.id}`);nearest=Math.min(nearest,Math.hypot(Math.max(0,a.x0-b.x1,b.x0-a.x1),Math.max(0,a.z0-b.z1,b.z0-a.z1)));}
        }
      }
      let lights=0;R.scene.traverse(o=>{if(o.isLight)lights++;});
      return { hits:[...new Set(hits)],samples,nearest:Number.isFinite(nearest)?nearest:null,lights,exterior:R.exterior() };
    });
    assert.deepEqual(value.hits, [], `${mock}/${era}/${quality}`);assert.equal(errors.length,0);
    results.push({kind:'exterior',mock,era,quality,...value});console.log(`exterior ${mock}/${era}/${quality}: 900 frames, ${value.samples} car comparisons, 0 overlaps`);
    await page.close();
  }
  {
    const { page, errors } = await H.openScene('mock=garage&quality=low&eras&eraArt=calendar');
    const value = await page.evaluate(() => {
      const S=window.__HITL.state,R=window.__hitlRender,out=[];
      const rows=[[1991,'classic','era_pager_billboard'],[1998,'classic','era_sock_billboard'],[2002,'classic','era_lease_billboard'],[2008,'classic','era_beta_billboard'],[2019,'classic','era_led_billboard'],[2023,'chatgbt','era_led_billboard'],[2025,'agents','era_led_billboard'],[2030,'consolidation','era_led_billboard'],[2035,'plateau','era_led_billboard']];
      for(const [year,era,want] of rows){S.week=(year-2019)*52;S.era.id=era;R.sync(S);window.__step(12);const e=R.exterior();if(e.billboard!==want)throw Error(`${year}: ${e.billboard}`);out.push({year,era:e.era,billboard:e.billboard});}
      S.era.id='dotcom';S.flags.dotcom={phase:'boom'};R.sync(S);if(R.exterior().billboard!=='era_sock_billboard')throw Error('boom');S.flags.dotcom.phase='bust';R.sync(S);if(R.exterior().billboard!=='era_lease_billboard')throw Error('bust');
      return out;
    });
    assert.equal(errors.length,0);results.push({kind:'calendar',rows:value});console.log('calendar: 9 stages and saved boom/bust phase passed');await page.close();
  }
} finally { await H.close();writeFileSync('shots/era-gags/validation.json',JSON.stringify(results,null,2)); }

