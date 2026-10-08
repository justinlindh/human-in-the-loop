import * as THREE from 'three';
import { getModel } from './models.js';
import { PALETTE as P } from './palette.js';

// The ai_interview moment: a hire made under the AI Video Interviews policy starts the job in the
// meeting room, interviewed by a laptop. The avatar asks, talks over the answer, the candidate waves
// at it and wonders whether it is still listening, then gets up and walks to their desk.
// Ambient: it never holds the clock, and it is dropped when the office is busy with another moment.
//
// createAiInterview({ labels, parent, low }) -> {
//   want(staffId)                    the next arrival of this person is interviewed (the aiInterview event)
//   wanted(staffId) -> boolean
//   start(r, seat, approach) -> temp  seats them and returns their r.temp; the laptop goes on the table
//   update(dt)                       animates the avatar on the laptop screen
//   active -> { staffId, beat, t } | null
// }

export const AI_INTERVIEW = {
  seconds: 8.6,
  // [at seconds, who ('bot' or 'me'), text, seconds shown, thought]
  lines: [
    [0.4, 'bot', 'Describe a time you showed empathy.', 2.2],
    [2.6, 'me', 'Sure! So at my last job, I...', 1.6],
    [3.3, 'bot', 'Great answer! Next question.', 1.9],
    [6.2, 'me', 'Is it still listening?', 2.3, true],
  ],
  wave: [4.9, 6.1],
  reach: 0.42,             // metres from the seat to the laptop, toward the table
  tableTop: 0.69,
};

const BEATS = [[0, 'ask'], [2.6, 'answer'], [3.3, 'talkedOver'], [4.9, 'wave'], [6.2, 'wonder']];

export function createAiInterview({ labels, parent, low = () => false }) {
  const want = new Set();
  let cur = null;
  let screen = null;

  // The avatar: a smooth, symmetrical face on a gradient, its mouth moving while it talks.
  function paintAvatar(ctx, w, h, talk) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#6c5fd0');
    g.addColorStop(1, '#3fa6b0');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const cx = w / 2, cy = h * 0.5, r = h * 0.3;
    ctx.fillStyle = '#f1d3bd';
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#2f2a44';
    ctx.beginPath(); ctx.arc(cx, cy - r * 0.15, r * 1.02, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
    ctx.fillStyle = P.ink;
    for (const s of [-1, 1]) { ctx.beginPath(); ctx.arc(cx + s * r * 0.36, cy + r * 0.05, r * 0.1, 0, Math.PI * 2); ctx.fill(); }
    ctx.fillStyle = '#b5475a';
    ctx.beginPath(); ctx.ellipse(cx, cy + r * 0.48, r * 0.26, r * (0.05 + 0.2 * talk), 0, 0, Math.PI * 2); ctx.fill();
    // The platform's bar along the bottom.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(0, h * 0.86, w, h * 0.14);
    ctx.fillStyle = '#e0574a';
    ctx.beginPath(); ctx.arc(w * 0.08, h * 0.93, h * 0.035, 0, Math.PI * 2); ctx.fill();
  }

  function makeScreen() {
    if (screen) return screen;
    const c = document.createElement('canvas');
    c.width = 96; c.height = 64;
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    screen = { c, ctx: c.getContext('2d'), tex, mat: new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), talk: -1 };
    return screen;
  }

  function placeLaptop(seat) {
    const lap = getModel('laptop');
    const fx = Math.sin(seat.yaw), fz = Math.cos(seat.yaw);
    lap.position.set(seat.x + fx * AI_INTERVIEW.reach, AI_INTERVIEW.tableTop, seat.z + fz * AI_INTERVIEW.reach);
    lap.rotation.y = seat.yaw + Math.PI;
    const s = makeScreen();
    lap.traverse((o) => { if (o.isMesh && o.name.endsWith('_screen')) o.material = s.mat; });
    lap.userData.noAO = true;
    parent.add(lap);
    return lap;
  }

  function start(r, seat, approach) {
    want.delete(r.id);
    stop();
    const laptop = placeLaptop(seat);
    const said = new Set();
    // The bubbles of the laptop rise from just above its screen.
    const anchor = new THREE.Object3D();
    anchor.position.set(0, 0.1, 0);
    laptop.add(anchor);
    cur = { r, laptop, anchor, t: 0, beat: 'ask' };
    const T = AI_INTERVIEW.seconds;
    const stage = { beat: 'ask', role: 'candidate', target: laptop };
    return {
      anim: 'sit', t: T, back: true, moment: 'ai_interview', goal: { x: seat.x, z: seat.z, yaw: seat.yaw },
      enter: { t: 0, side: approach, from: { x: approach.x, z: approach.z } }, seat: true,
      stage,
      tick: (rr, dt, tp) => {
        const e = T - tp.t;
        if (cur?.r === rr) cur.t = e;
        stage.beat = BEATS.filter(([at]) => e >= at).at(-1)[1];
        if (cur?.r === rr) cur.beat = stage.beat;
        AI_INTERVIEW.lines.forEach(([at, who, text, secs, thought], i) => {
          if (e < at || said.has(i)) return;
          said.add(i);
          labels.say(text, who === 'bot' ? anchor : rr.char.root, secs, who === 'bot' ? 0.12 : 1.45, { moment: true, thought: !!thought });
        });
        const [w0, w1] = AI_INTERVIEW.wave;
        rr.char.setAnim(e >= w0 && e < w1 ? 'wavesit' : 'sit');
        if (rr.char.lookAt && laptop) rr.char.lookAt(laptop, { hold: 0.2 });
        return true;
      },
    };
  }

  // Talking stretches of the avatar, for its mouth.
  const botTalk = (e) => AI_INTERVIEW.lines.some(([at, who, , secs]) => who === 'bot' && e >= at && e < at + secs * 0.8);

  function update() {
    if (!cur) return;
    const r = cur.r;
    if (r.temp?.moment !== 'ai_interview') { stop(); return; }
    const s = screen;
    const talk = botTalk(cur.t) ? (low() ? 0.5 : 0.5 + 0.5 * Math.sin(cur.t * 18)) : 0;
    const q = Math.round(talk * 4) / 4;
    if (q !== s.talk) { s.talk = q; paintAvatar(s.ctx, s.c.width, s.c.height, q); s.tex.needsUpdate = true; }
  }

  function stop() {
    if (!cur) return;
    labels.clearFor?.(cur.anchor);
    cur.laptop.removeFromParent();
    cur = null;
  }

  return {
    want: (id) => want.add(id),
    wanted: (id) => want.has(id),
    drop: (id) => want.delete(id),
    start, update, stop,
    get active() { return cur && { staffId: cur.r.id, beat: cur.beat, t: +cur.t.toFixed(2) }; },
  };
}
