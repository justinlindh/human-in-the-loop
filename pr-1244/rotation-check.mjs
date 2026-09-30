import { startHarness } from '../../blender/checks/harness.mjs';
import { writeFileSync } from 'node:fs';
const H = await startHarness();
const rows = [];
try {
  for (const rig of [0, 1]) for (const preview of [false, true]) {
    const { page, errors } = await H.openScene(`mock=floor&quality=low&rig=${rig}${preview ? '&eras&eraArt=dotcom' : ''}`, { width: 1920, height: 1080 });
    const got = await page.evaluate(async () => {
      const R = window.__hitlRender, S = window.__HITL.state;
      const C = await import('/src/render/checks.js');
      const X = await import('/blender/checks/clip-exact.js');
      C.useExactCross((...a) => window.__tool(() => X.crossFraction(...a)));
      S.office.props = [];
      S.pendingDecision = null;
      S.staff = S.staff.slice(0, 4);
      S.office.placed = [[3,3],[7,3],[3,7],[7,7]].map(([x,y], rot) => ({ id:`rot${rot}`, itemId:'desk', level:1, x,y,rot }));
      S.staff.forEach(p => { p.mood='ok'; p.stamina=80; p.assignment={type:'project',targetId:null}; });
      R.perks.hold = true;
      window.__advance(1000);
      const moods = [];
      for (const mood of ['ok','coasting','burnout','tired']) {
        S.staff.forEach(p => { p.mood=mood==='tired'?'ok':mood; p.stamina=mood==='tired'?10:80; });
        window.__advance(90);
        const checks = await C.runClipChecks(R,S);
        moods.push({ mood, results: checks.results.filter(r=>r.name.startsWith('desk:')) });
      }
      const anchors = R.office.current.desks.map(d=>({id:d.id,seat:d.seat,face:d.face}));
      const visibility = S.staff.map(p=>({id:p.id,views:R.probeViews(p.id)}));
      const box = (await import('/node_modules/three/build/three.module.js')).Box3;
      const bounds = R.office.current.desks.map(d=>({id:d.id,min:new box().setFromObject(d.obj).min,max:new box().setFromObject(d.obj).max}));
      return {moods,anchors,visibility,bounds};
    });
    if (errors.length) throw new Error(errors.join('\n'));
    rows.push({rig,preview,...got});
    await page.close();
  }
} finally { await H.close(); }
writeFileSync('shots/era/rotations.json', JSON.stringify(rows,null,2));
for (const row of rows) {
  const checks=row.moods.flatMap(x=>x.results);
  console.log(`rotation matrix rig=${row.rig} preview=${row.preview}: ${checks.filter(x=>x.pass).length}/${checks.length} seated poses passed`);
  for (const check of checks.filter(x=>!x.pass)) console.log(JSON.stringify(check));
}
for (const rig of [0,1]) {
  const pair=rows.filter(x=>x.rig===rig);
  if (JSON.stringify(pair[0].anchors)!==JSON.stringify(pair[1].anchors)) throw new Error('Seat anchors differ');
}
console.log('Seat positions and facing identical for all four rotations, both rigs.');
if(rows.some(row=>row.moods.some(m=>m.results.length!==4 || m.results.some(r=>!r.pass)))) process.exitCode=1;
