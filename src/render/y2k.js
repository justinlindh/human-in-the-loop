import * as THREE from 'three';
import { B } from '../sim/balance.js';
import { PALETTE as P } from './palette.js';
import { printerModel } from './props.js';

// A saved rollover stages once per loaded company. Presentation never changes sim state.
export function createY2kMoment({ recs, office, parent, getProps, ringSpots, walkTo, low, spotlights, dispatch }) {
  let scene = null;
  let seen = new WeakSet();
  const Y = B.y2k;
  const duration = Y.gatherSeconds + Y.countdownSeconds + Y.anticlimaxSeconds + Y.invoiceSeconds;
  function end() {
    if (!scene) return;
    const m = scene; scene = null;
    for (const r of m.people) if (r.temp?.moment === 'y2k') {
      r.temp = null;
      if (r.goal) walkTo(r, r.goal);
    }
    m.source.visible = true;
    m.obj.removeFromParent();
    m.paper.removeFromParent();
    m.paper.geometry.dispose(); m.paper.material.map.dispose(); m.paper.material.dispose();
    m.obj.traverse((o) => {
      if (o.geometry?.userData.own) o.geometry.dispose();
      if (o.material?.userData.own) o.material.dispose();
    });
    spotlights?.end(m.spot);
    dispatch('end', 'y2k_rollover', m.id);
  }
  function start(state, f) {
    if (spotlights?.current()) return;
    const source = getProps()?.objectOf(f.printerId);
    if (!source || !parent || !office.current) return;
    const obj = printerModel({ jammed: false });
    obj.position.copy(source.position); obj.rotation.copy(source.rotation); obj.scale.setScalar(1.2);
    source.visible = false; parent.add(obj);
    const canvas = document.createElement('canvas'); canvas.width = 256; canvas.height = 320;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = P.paper; ctx.fillRect(0, 0, 256, 320);
    ctx.fillStyle = P.metal_dark; ctx.textAlign = 'center'; ctx.font = 'bold 30px monospace';
    ctx.fillText('INVOICE', 128, 64); ctx.fillText('01/01/1900', 128, 126);
    ctx.font = '22px monospace'; ctx.fillText('Y2K SERVICES', 128, 196); ctx.fillText('PAID. WE THINK.', 128, 252);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.24, 0.3), new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide, roughness: 0.9 }));
    paper.rotation.x = -Math.PI / 2; paper.position.set(-0.14, 0.32, 0.26); paper.visible = false; obj.add(paper);
    const equipment = [...office.placed.values()];
    const target = equipment.find((e) => e.itemId === 'server_rack' || e.kind === 'rack')?.obj
      ?? equipment.find((e) => e.desk)?.obj ?? obj;
    const box = new THREE.Box3().setFromObject(target);
    const at = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const available = [...recs.values()].filter((r) => r.mode === 'placed' && !r.hidden && r.staff.mood !== 'away' && !r.staff.remote && !r.temp?.moment && !r.temp?.party);
    const spots = low() ? [] : ringSpots(at, Math.max(size.x, size.z) / 2 + 0.7, available.length, { far: true, strict: true, moment: 'y2k' });
    const people = available.slice(0, spots.length);
    people.forEach((r, i) => {
      r.temp = { anim: 'idle', t: Infinity, goal: spots[i], moment: 'y2k', stage: { beat: 'gather', role: 'watcher', target } };
      walkTo(r, spots[i]);
    });
    scene = { obj, paper, source, people, t: 0, lastCaption: '', f, at };
    scene.spot = spotlights?.begin('y2k_rollover', end, duration, () => scene?.at ?? at);
    scene.id = dispatch('start', 'y2k_rollover');
    seen.add(f);
  }
  function update(dt, state) {
    const f = state.flags?.y2k;
    if (scene && (scene.f !== f || f?.stage !== 'rollover')) end();
    if (!scene && f?.stage === 'rollover' && !seen.has(f)) start(state, f);
    const m = scene;
    if (!m) return;
    m.t += dt;
    const countdown = Y.gatherSeconds + Y.countdownSeconds;
    const invoice = countdown + Y.anticlimaxSeconds;
    const beat = m.t < Y.gatherSeconds ? 'gather' : m.t < countdown ? 'countdown' : m.t < invoice ? 'nothing' : 'invoice';
    const caption = beat === 'gather' ? 'New Year’s Eve, 1999. The team gathers. The champagne has a screw cap.'
      : beat === 'countdown' ? `31 DEC 1999 · 23:59:${String(60 - Math.ceil(countdown - m.t)).padStart(2, '0')} · ${Math.ceil(countdown - m.t)}…`
        : beat === 'nothing' ? '01 JAN 2000 · 00:00:00. Nothing happens. The servers keep humming.'
          : 'One printer wakes up. INVOICE · 01/01/1900. Happy new century, Accounts.';
    for (const r of m.people) if (r.temp?.moment === 'y2k') r.temp.stage.beat = beat;
    m.paper.visible = beat === 'invoice';
    if (m.paper.visible) { m.paper.position.z = 0.26 + 0.2 * Math.min(1, m.t - invoice); m.at = m.obj.position; }
    if (caption !== m.lastCaption) { m.lastCaption = caption; dispatch('beat', 'y2k_rollover', m.id, { caption, beat }); }
    if (m.t >= duration) end();
  }
  return { update, reset() { end(); seen = new WeakSet(); } };
}
