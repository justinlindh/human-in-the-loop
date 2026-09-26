#!/usr/bin/env node
// Stage the game's characters, then typeset reproducible Yak pictures in Fredoka.
import { startHarness } from '../../blender/checks/harness.mjs';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const MEME_ART = [
  { id: 'this_is_fine', format: 'This is fine', caption: 'SEV-1. Everything is fine.', shots: ['sip'] },
  { id: 'two_buttons', format: 'Two buttons', caption: 'Ship on Friday / Sleep', shots: ['facepalm'] },
  { id: 'tabs_chart', format: 'Up-and-to-the-right chart', caption: 'tabs I have open', shots: ['celebrate'] },
  { id: 'always_config', format: 'Always has been', caption: "Wait, it's all config? / Always has been.", shots: ['point', 'idle'] },
  { id: 'yes_no_tests', format: 'Reject / approve', caption: 'writing the tests myself / asking the agent to write them', shots: ['fan', 'celebrate'] },
  { id: 'expanding_review', format: 'Expanding brain', caption: 'I write code / I review code / I review what the agent wrote', shots: ['typing', 'peer', 'celebrate'] },
];
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;
const out = resolve('public/memes'), evidence = resolve('shots/memes');
mkdirSync(out, { recursive: true });
mkdirSync(evidence, { recursive: true });
const H = await startHarness();
try {
  for (const meme of MEME_ART.filter(m => !only || m.id === only)) {
    const { page, errors } = await H.openScene('mock=garage&quality=high', { width: 1800, height: 1350 });
    const result = await page.evaluate(async (meme) => {
      const R = window.__hitlRender, S = window.__HITL.state;
      const { PALETTE: P } = await import('/src/render/palette.js');
      const { setRingsShown } = await import('/src/render/character.js');
      const { RoundedBoxGeometry } = await import('/node_modules/three/examples/jsm/geometries/RoundedBoxGeometry.js');
      const dump = await import('/blender/checks/dump.js');
      await dump.prepare();
      R.perks.hold = true;
      S.pendingDecision = null;
      const cast = structuredClone(S.staff);
      S.staff = cast;
      S.staff[0].mood = 'ok';
      window.__settle(90);
      setRingsShown(false);
      const T = R.THREE;
      const extras = new T.Group(); R.scene.add(extras);
      const material = color => new T.MeshStandardMaterial({ color, roughness: 0.65 });
      const box = (w, h, d, color, x, y, z) => {
        const m = new T.Mesh(new RoundedBoxGeometry(w, h, d, 3, 0.035), material(color));
        m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; extras.add(m); return m;
      };
      window.__tool(() => {
        if (meme.id === 'this_is_fine') {
          // Rounded toy flames sit among the office furniture, behind the coffee drinker.
          for (const [x, z, height] of [[-1, 0, 0.95], [0.9, 0, 1.15], [-0.8, 2, 0.7], [1.3, 1.5, 0.9]]) {
            for (const [r, h, color] of [[0.27, height, P.marker_orange], [0.14, height * 0.66, P.gold]]) {
              const points = [[0,0],[r,0.12],[r*0.9,h*0.42],[r*0.4,h*0.75],[0,h]].map(([a,b]) => new T.Vector2(a,b));
              const flame = new T.Mesh(new T.LatheGeometry(points, 16), material(color));
              flame.position.set(x, 0, z + (r < 0.2 ? 0.15 : 0)); flame.castShadow = true; extras.add(flame);
            }
          }
        }
        if (meme.id === 'two_buttons') {
          box(2.2, 0.2, 0.75, P.metal_soft, 0, 0.65, 2);
          for (const [x, color] of [[-0.65, P.marker_orange], [0.65, P.marker_green]]) {
            const button = new T.Mesh(new T.CylinderGeometry(0.27, 0.29, 0.14, 32), material(color));
            button.position.set(x, 0.82, 2); button.castShadow = true; extras.add(button);
          }
        }
      });
      const captures = [], measurements = [], subjects = [];
      for (const [index, anim] of meme.shots.entries()) {
        const id = S.staff[meme.id === 'tabs_chart' || (meme.id === 'always_config' && index === 1) ? 1 : 0].id;
        subjects.push(id);
        for (const p of S.staff) R.standAt(p.id, -3, -3);
        R.standAt(id, 0, 1);
        R.catchFor(id, { anim, t: 100, goal: { x: 0, z: 1, yaw: Math.PI / 4 } });
        R.focusAt(0, 1, 3.2);
        window.__settle(60);
        let frame = dump.dumpFrame(R, S);
        let pixels = document.querySelector('canvas').toDataURL('image/png');
        if (anim === 'sip') {
          // Select the raised-cup beat from a full sipping cycle using wrist geometry.
          let highest = -Infinity;
          for (let sample = 0; sample < 24; sample++) {
            window.__settle(5);
            const candidate = dump.dumpFrame(R, S);
            const height = candidate.people.find(p => p.id === id).hands[1].world[1];
            if (height > highest) {
              highest = height; frame = candidate;
              pixels = document.querySelector('canvas').toDataURL('image/png');
            }
          }
        }
        measurements.push(frame);
        const img = new Image(); img.src = pixels; await img.decode();
        captures.push(img);
      }
      const canvas = document.createElement('canvas'); canvas.width = 1200; canvas.height = 900;
      const c = canvas.getContext('2d');
      c.fillStyle = P.paper; c.fillRect(0, 0, 1200, 900);
      const text = (line, x, y, size = 68, max = 1120, color = P.ink) => {
        c.font = `700 ${size}px Fredoka`; c.fillStyle = color; c.textAlign = 'center'; c.textBaseline = 'middle';
        if (c.measureText(line).width > max) throw new Error(`Caption too wide: ${line}`);
        c.fillText(line, x, y);
      };
      const shot = (i, x, y, w, h, wide = false) => {
        // Native-pixel crops keep faces sharp; the dump supplies the subject's screen bounds.
        const person = measurements[i].people.find(p => p.id === subjects[i]);
        const [px, py, pw, ph] = person.screen;
        const sh = wide ? (meme.id === 'this_is_fine' ? 790 : 840) : (meme.id === 'expanding_review' ? 440 : 560), sw = sh * w / h;
        const sx = Math.max(0, Math.min(1800 - sw, px + pw / 2 - sw / 2));
        const sy = Math.max(0, Math.min(1350 - sh, py + ph / 2 - sh / 2));
        c.drawImage(captures[i], sx, sy, sw, sh, x, y, w, h);
        return { sx, sy, sw, sh, x, y, w, h };
      };
      const rule = y => { c.fillStyle = P.ink; c.fillRect(0, y - 5, 1200, 10); };
      if (meme.id === 'this_is_fine') {
        shot(0, 0, 120, 1200, 660, true);
        text('SEV-1', 600, 62, 78);
        text('Everything is fine.', 600, 838, 76);
      } else if (meme.id === 'two_buttons') {
        shot(0, 0, 135, 1200, 765, true);
        text('Ship on Friday', 340, 70, 61, 590); text('Sleep', 930, 70, 66, 380);
        c.fillStyle = P.marker_orange; c.fillRect(65, 111, 550, 14);
        c.fillStyle = P.marker_green; c.fillRect(745, 111, 365, 14);
      } else if (meme.id === 'tabs_chart') {
        text('tabs I have open', 600, 70, 78);
        shot(0, 0, 150, 480, 750);
        c.strokeStyle = P.ink; c.lineWidth = 10; c.beginPath(); c.moveTo(540,230); c.lineTo(540,770); c.lineTo(1130,770); c.stroke();
        c.strokeStyle = P.marker_green; c.lineWidth = 25; c.lineJoin = 'round'; c.beginPath(); c.moveTo(580,725); c.lineTo(715,685); c.lineTo(825,600); c.lineTo(890,470); c.lineTo(1080,280); c.stroke();
        c.beginPath(); c.moveTo(995,285); c.lineTo(1080,280); c.lineTo(1080,370); c.stroke();
      } else if (meme.id === 'always_config') {
        shot(0, 0, 190, 600, 710); shot(1, 600, 190, 600, 710);
        text("Wait, it's", 300, 56, 62, 570); text('all config?', 300, 130, 62, 570);
        text('Always', 900, 56, 62, 570); text('has been.', 900, 130, 62, 570);
        c.fillStyle = P.ink; c.fillRect(594, 0, 12, 900);
      } else if (meme.id === 'yes_no_tests') {
        shot(0, 0, 0, 450, 450); shot(1, 0, 450, 450, 450);
        text('writing the', 825, 180, 64, 700); text('tests myself', 825, 260, 64, 700);
        text('asking the agent', 825, 630, 59, 700); text('to write them', 825, 710, 64, 700); rule(450);
      } else {
        const lines = [['I write code'], ['I review code'], ['I review what', 'the agent wrote']];
        for (let i = 0; i < 3; i++) {
          const crop = shot(i, 0, i * 300, 400, 300);
          if (i > 0) {
            const [hx, hy] = measurements[i].people[0].head.screen;
            const x = (hx - crop.sx) / crop.sw * crop.w;
            const y = (hy - crop.sy) / crop.sh * crop.h + crop.y;
            c.save(); c.beginPath(); c.rect(10, i * 300 + 10, 380, 280); c.clip();
            c.strokeStyle = i === 1 ? P.gold : P.screen_cyan; c.lineWidth = 7;
            for (let ray = 0; ray < 12; ray++) { const a = ray * Math.PI / 6; c.beginPath(); c.moveTo(x + Math.cos(a) * 62, y + Math.sin(a) * 55); c.lineTo(x + Math.cos(a) * (i === 1 ? 78 : 103), y + Math.sin(a) * (i === 1 ? 72 : 95)); c.stroke(); }
            c.restore();
          }
          c.fillStyle = [P.wall_cream, P.wall_sage, P.glass][i]; c.fillRect(400, i * 300, 800, 300);
          lines[i].forEach((line, j) => text(line, 800, i * 300 + (lines[i].length === 1 ? 150 : 110 + j * 85), 65, 750));
          if (i) rule(i * 300);
        }
      }
      c.strokeStyle = P.ink; c.lineWidth = 16; c.strokeRect(8, 8, 1184, 884);
      const big = canvas.toDataURL('image/webp', 0.94);
      const small = document.createElement('canvas'); small.width = 480; small.height = 360;
      const sc = small.getContext('2d'); sc.imageSmoothingQuality = 'high'; sc.drawImage(canvas, 0, 0, 480, 360);
      return { big, small: small.toDataURL('image/webp', 0.94), measurements };
    }, meme);
    for (const [suffix, data] of [['', result.small], ['@2x', result.big]]) writeFileSync(`${out}/${meme.id}${suffix}.webp`, Buffer.from(data.split(',')[1], 'base64'));
    writeFileSync(`${evidence}/${meme.id}.json`, JSON.stringify(result.measurements, null, 2));
    if (errors.length) throw new Error(errors.join('\n'));
    await page.close(); console.log(`memes: ${meme.id}: 480x360 + 1200x900`);
  }
} finally { await H.close(); }
