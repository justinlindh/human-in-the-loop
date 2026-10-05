import * as THREE from 'three';
import { PALETTE as P } from './palette.js';

// The boombox while it plays: small music notes rise from it, drift and fade, a few at a time.
// It shows only when the office has a placed `boombox` and `state.radio.on`; with neither (the
// feature switched off) nothing is built. Low quality keeps one note at a time.

const NOTES = 3;
const LIFE = 2.4;
const RISE = 0.7;
const NOTE_M = 0.26;   // one note sprite's size: one square glyph cell of the sheet

let noteTex = null;
// One sheet with two glyphs side by side: an eighth note and a pair of beamed notes, in ink with a
// paper outline so they read against a dark wall or a pale floor.
function noteTexture() {
  if (noteTex) return noteTex;
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const ctx = c.getContext('2d');
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  const glyph = (ox, beamed) => {
    const heads = beamed ? [[ox + 40, 92], [ox + 88, 82]] : [[ox + 54, 92]];
    for (const pass of [0, 1]) {
      ctx.strokeStyle = pass ? P.ink : P.paper;
      ctx.fillStyle = pass ? P.ink : P.paper;
      ctx.lineWidth = pass ? 8 : 20;
      for (const [x, y] of heads) {
        ctx.beginPath(); ctx.ellipse(x, y, 15 + (pass ? 0 : 6), 11 + (pass ? 0 : 6), -0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.moveTo(x + 13, y - 4); ctx.lineTo(x + 13, y - 66); ctx.stroke();
      }
      ctx.beginPath();
      if (beamed) { ctx.moveTo(ox + 53, 22); ctx.lineTo(ox + 101, 12); }
      else { ctx.moveTo(ox + 67, 22); ctx.quadraticCurveTo(ox + 96, 36, ox + 88, 62); }
      ctx.lineWidth = pass ? 12 : 24;
      ctx.stroke();
    }
  };
  glyph(0, false);
  glyph(128, true);
  noteTex = new THREE.CanvasTexture(c);
  noteTex.colorSpace = THREE.SRGBColorSpace;
  return noteTex;
}

export function createRadio({ office, parent, low = () => false }) {
  const group = new THREE.Group();
  group.name = 'radio';
  parent.add(group);
  let notes = null;
  let entry = null;
  let playing = false;
  let t = 0;

  function build() {
    const tex = noteTexture();
    notes = [];
    for (let i = 0; i < NOTES; i++) {
      const map = tex.clone();
      map.repeat.set(0.5, 1);
      map.offset.set(i % 2 ? 0.5 : 0, 0);
      map.needsUpdate = true;
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map, transparent: true, depthWrite: false, opacity: 0 }));
      sp.userData.noAO = true;
      sp.scale.set(NOTE_M, NOTE_M, 1);
      group.add(sp);
      notes.push({ sp, t0: (i / NOTES) * LIFE, side: i % 2 ? 1 : -1 });
    }
  }

  function boombox() {
    for (const e of office.placed?.values() ?? []) if (e.itemId === 'boombox' && e.obj) return e;
    return null;
  }

  function sync(state) {
    entry = boombox();
    playing = !!(entry && state?.radio?.on);
    if (playing && !notes) build();
    group.visible = playing;
  }

  const box = new THREE.Box3();
  function update(dt) {
    if (!playing || !entry?.obj) return;
    t += dt;
    box.setFromObject(entry.obj);
    const cx = (box.min.x + box.max.x) / 2, cz = (box.min.z + box.max.z) / 2, top = box.max.y;
    const shown = low() ? 1 : NOTES;
    notes.forEach((n, i) => {
      if (i >= shown) { n.sp.visible = false; return; }
      n.sp.visible = true;
      const q = ((t + n.t0) % LIFE) / LIFE;
      // From just under the top (the aerial reaches past the body), out to either side and up.
      n.sp.position.set(cx + n.side * (0.12 + q * 0.22) + Math.sin(q * Math.PI * 2) * 0.05, top - 0.12 + q * RISE, cz);
      n.sp.material.opacity = Math.min(1, q * 6) * (1 - q * q);
      const s = 0.85 + q * 0.4;
      n.sp.scale.set(NOTE_M * s, NOTE_M * s, 1);
    });
  }

  // Where the boombox is (its top centre), for people turning to it; null when there is none.
  function at() {
    if (!entry?.obj) return null;
    box.setFromObject(entry.obj);
    return { x: (box.min.x + box.max.x) / 2, y: box.max.y, z: (box.min.z + box.max.z) / 2 };
  }

  return { sync, update, at, get playing() { return playing; }, group };
}
