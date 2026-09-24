// Placeholder audio, synthesized into AudioBuffers when a real asset is missing: short tonal UI and
// SFX sounds, stingers, one looping bed per era in its key and tempo, gibberish voice barks per
// bank and emotion, and a crowd murmur. Every generator is deterministic.

import { MUSIC, MUSIC_BARS } from './manifest.js';

const RATE = 22050;
const TAU = Math.PI * 2;
const NOTE = { C: 0, 'C#': 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, 'F#': 6, Gb: 6, G: 7, Ab: 8, A: 9, Bb: 10, B: 11 };
const hz = (midi) => 440 * 2 ** ((midi - 69) / 12);

function buffer(ctx, seconds, fill, channels = 1) {
  const n = Math.max(1, Math.floor(seconds * RATE));
  const buf = ctx.createBuffer(channels, n, RATE);
  const data = buf.getChannelData(0);
  fill(data, RATE);
  for (let c = 1; c < channels; c++) buf.getChannelData(c).set(data);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
  if (peak > 0.95) for (let c = 0; c < channels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < n; i++) d[i] *= 0.95 / peak; }
  return buf;
}

// Notes: [start s, freq, dur s, wave, gain, endFreq?]
function tones(ctx, notes) {
  const len = Math.max(...notes.map((n) => n[0] + n[2])) + 0.05;
  return buffer(ctx, len, (d, r) => {
    for (const [at, f0, dur, wave, gain, f1] of notes) {
      const s0 = Math.floor(at * r), n = Math.floor(dur * r);
      let ph = 0;
      for (let i = 0; i < n; i++) {
        const k = i / n;
        const f = f1 ? f0 * (f1 / f0) ** k : f0;
        ph += (TAU * f) / r;
        const env = Math.min(1, i / (0.008 * r)) * (1 - k) ** 1.6;
        const x = wave === 'square' ? Math.sign(Math.sin(ph)) * 0.6 : wave === 'saw' ? ((ph / TAU) % 1) * 2 - 1 : wave === 'tri' ? Math.asin(Math.sin(ph)) * 0.9 : Math.sin(ph);
        d[s0 + i] += x * gain * env;
      }
    }
  });
}

const SFX = {
  'ui/click': [[0, 900, 0.035, 'square', 0.25, 700]],
  'ui/open': [[0, 520, 0.07, 'tri', 0.4, 780], [0.05, 880, 0.08, 'tri', 0.3]],
  'ui/close': [[0, 700, 0.07, 'tri', 0.35, 440]],
  'ui/confirm': [[0, 660, 0.08, 'tri', 0.45], [0.07, 990, 0.12, 'tri', 0.45]],
  'ui/error': [[0, 220, 0.1, 'square', 0.3, 180], [0.1, 180, 0.14, 'square', 0.3, 140]],
  'ui/coin': [[0, 988, 0.06, 'square', 0.3], [0.06, 1319, 0.16, 'square', 0.3]],
  'ui/blip': [[0, 1200, 0.05, 'sine', 0.35, 1500]],
  'ui/decision': [[0, 523, 0.1, 'tri', 0.4], [0.1, 659, 0.1, 'tri', 0.4], [0.2, 784, 0.18, 'tri', 0.4]],
  'ui/unlock': [[0, 784, 0.08, 'tri', 0.4], [0.08, 1047, 0.08, 'tri', 0.4], [0.16, 1319, 0.22, 'sine', 0.45]],
  'ui/goal': [[0, 659, 0.1, 'tri', 0.4], [0.1, 880, 0.1, 'tri', 0.4], [0.2, 1175, 0.3, 'tri', 0.45]],
  'sfx/hire': [[0, 587, 0.09, 'tri', 0.45], [0.09, 740, 0.09, 'tri', 0.45], [0.18, 880, 0.2, 'tri', 0.45]],
  'sfx/farewell': [[0, 523, 0.12, 'tri', 0.4], [0.12, 659, 0.12, 'tri', 0.4], [0.24, 880, 0.35, 'sine', 0.4]],
  'sfx/resign': [[0, 440, 0.16, 'sine', 0.45, 392], [0.16, 349, 0.3, 'sine', 0.45, 330]],
  'sfx/alarm': [[0, 880, 0.18, 'saw', 0.25, 660], [0.2, 880, 0.18, 'saw', 0.25, 660], [0.4, 880, 0.18, 'saw', 0.25, 660]],
  'sfx/save': [[0, 988, 0.06, 'square', 0.3], [0.06, 1319, 0.16, 'square', 0.3]],
  'sfx/award': [[0, 784, 0.1, 'tri', 0.4], [0.1, 988, 0.1, 'tri', 0.4], [0.2, 1175, 0.1, 'tri', 0.4], [0.3, 1568, 0.35, 'tri', 0.4]],
  'sfx/reward': [[0, 880, 0.08, 'tri', 0.4], [0.08, 1109, 0.08, 'tri', 0.4], [0.16, 1319, 0.25, 'sine', 0.4]],
  'sfx/bad': [[0, 330, 0.12, 'tri', 0.35, 300], [0.12, 262, 0.2, 'tri', 0.35, 247]],
  'sfx/pop': [[0, 600, 0.05, 'sine', 0.35, 1100]],
  'stingers/launch': [[0, 523, 0.12, 'square', 0.28], [0.12, 659, 0.12, 'square', 0.28], [0.24, 784, 0.12, 'square', 0.28], [0.36, 1047, 0.5, 'square', 0.3], [0.36, 523, 0.5, 'tri', 0.35]],
  'stingers/era': [[0, 392, 0.3, 'tri', 0.35], [0.25, 523, 0.3, 'tri', 0.35], [0.5, 659, 0.3, 'tri', 0.35], [0.75, 784, 0.7, 'sine', 0.4], [0.75, 392, 0.7, 'tri', 0.3]],
  'stingers/waffle': [[0, 659, 0.1, 'square', 0.25], [0.1, 784, 0.1, 'square', 0.25], [0.2, 988, 0.1, 'square', 0.25], [0.3, 1319, 0.1, 'square', 0.25], [0.42, 1568, 0.45, 'tri', 0.35]],
  'stingers/office': [[0, 440, 0.15, 'tri', 0.35], [0.15, 554, 0.15, 'tri', 0.35], [0.3, 659, 0.15, 'tri', 0.35], [0.45, 880, 0.5, 'tri', 0.4]],
  'stingers/win': [[0, 523, 0.12, 'square', 0.28], [0.12, 659, 0.12, 'square', 0.28], [0.24, 784, 0.12, 'square', 0.28], [0.36, 1047, 0.8, 'tri', 0.4], [0.36, 659, 0.8, 'tri', 0.3]],
  'stingers/gameover': [[0, 392, 0.3, 'tri', 0.4], [0.3, 330, 0.3, 'tri', 0.4], [0.6, 262, 0.8, 'tri', 0.4]],
};

// One looping bed: a four-chord progression on electric piano, a round bass, and a marimba line.
function bed(ctx, eraId) {
  const m = MUSIC[eraId] ?? MUSIC.classic;
  const beat = 60 / m.bpm;
  const bars = MUSIC_BARS;
  const root = 48 + (NOTE[m.key] ?? 5);
  const major = m.mode !== 'minor';
  // Scale degrees for I-vi-IV-V (major) or i-VI-III-VII (minor), as semitone offsets of the root.
  const prog = major ? [[0, 4, 7], [9, 12, 16], [5, 9, 12], [7, 11, 14]] : [[0, 3, 7], [8, 12, 15], [3, 7, 10], [10, 14, 17]];
  const len = bars * 4 * beat;
  return buffer(ctx, len, (d, r) => {
    const add = (t0, f, dur, gain, kind) => {
      const s0 = Math.floor(t0 * r), n = Math.floor(dur * r);
      let ph = 0;
      for (let i = 0; i < n && s0 + i < d.length; i++) {
        ph += (TAU * f) / r;
        const tt = i / r;
        let x;
        if (kind === 'ep') x = (Math.sin(ph) + 0.35 * Math.sin(2 * ph) * Math.exp(-tt * 6)) * Math.exp(-tt * 1.8);
        else if (kind === 'bass') x = (Math.sin(ph) + 0.2 * Math.sin(2 * ph)) * Math.min(1, tt * 60) * Math.exp(-tt * 2.5);
        else x = Math.sin(ph) * Math.exp(-tt * 14) + 0.4 * Math.sin(4 * ph) * Math.exp(-tt * 30);
        d[s0 + i] += x * gain * Math.min(1, i / (0.004 * r));
      }
    };
    for (let bar = 0; bar < bars; bar++) {
      const chord = prog[bar % 4];
      const t0 = bar * 4 * beat;
      for (const iv of chord) { add(t0, hz(root + 12 + iv), 4 * beat, 0.09, 'ep'); add(t0 + 2 * beat, hz(root + 12 + iv), 2 * beat, 0.05, 'ep'); }
      add(t0, hz(root - 12 + chord[0]), 1.8 * beat, 0.28, 'bass');
      add(t0 + 2 * beat, hz(root - 12 + chord[0] + (bar % 2 ? 7 : 12)), 1.5 * beat, 0.2, 'bass');
      const arp = [chord[0], chord[1], chord[2], chord[1] + 12, chord[2], chord[1], chord[0] + 12, chord[2]];
      arp.forEach((iv, k) => { if ((bar + k) % 3 !== 2) add(t0 + k * 0.5 * beat, hz(root + 24 + iv), 0.45 * beat, 0.07, 'marimba'); });
    }
  });
}

// A gibberish bark: 2 to 4 syllables of a vowel-ish voice with a pitch contour per emotion.
const CONTOUR = {
  happy: [1, 1.12, 1.02], excited: [1.15, 1.3, 1.2], laughing: [1.2, 1.05, 1.2, 1.05], questioning: [1, 0.96, 1.25],
  annoyed: [0.95, 0.9, 0.85], tired: [0.9, 0.84, 0.78], sighing: [1.05, 0.85, 0.72],
};
const VOWELS = [[730, 1090], [530, 1840], [300, 2300], [570, 840], [440, 1020], [660, 1700]];

function hashStr(s) { let h = 2166136261; for (const ch of s) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); return h >>> 0; }

function bark(ctx, bankId, emotion) {
  const fem = bankId.startsWith('fem');
  const h = hashStr(bankId);
  const f0 = fem ? 190 + (h % 70) : 98 + (h % 45);
  const contour = CONTOUR[emotion] ?? CONTOUR.happy;
  const syl = contour.length;
  const sylLen = emotion === 'excited' || emotion === 'laughing' ? 0.13 : emotion === 'sighing' || emotion === 'tired' ? 0.26 : 0.17;
  const breath = emotion === 'sighing' || emotion === 'tired' ? 0.35 : 0.08;
  return buffer(ctx, syl * sylLen + 0.15, (d, r) => {
    let ph = 0;
    for (let s = 0; s < syl; s++) {
      const [fa, fb] = VOWELS[(h + s * 7) % VOWELS.length];
      const s0 = Math.floor(s * sylLen * r), n = Math.floor(sylLen * r);
      const a = contour[s], b = contour[Math.min(syl - 1, s + 1)];
      for (let i = 0; i < n && s0 + i < d.length; i++) {
        const k = i / n;
        const f = f0 * (a + (b - a) * k);
        ph += (TAU * f) / r;
        let x = 0;
        for (let hN = 1; hN <= 12; hN++) {
          const fh = f * hN;
          const w = Math.exp(-(((fh - fa) / 160) ** 2)) + 0.6 * Math.exp(-(((fh - fb) / 220) ** 2)) + 0.05 / hN;
          x += Math.sin(ph * hN) * w;
        }
        const env = Math.sin(Math.PI * Math.min(1, k * 1.1)) ** 0.7;
        const noise = (Math.sin(i * 12.9898 + s * 78.233) * 43758.5453) % 1;
        d[s0 + i] += (x * 0.16 + noise * breath * 0.08) * env;
      }
    }
  });
}

function crowd(ctx) {
  return buffer(ctx, 3, (d, r) => {
    let y = 0, z = 0;
    for (let i = 0; i < d.length; i++) {
      const n = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * 2 - 1;
      // Two one-pole lowpasses leave a soft murmur band instead of hiss.
      y += 0.03 * (n - y); z += 0.03 * (y - z);
      const t = i / r;
      const swell = Math.sin(Math.PI * Math.min(1, t / 3)) * (0.6 + 0.4 * Math.sin(t * 7.3) * Math.sin(t * 3.1));
      d[i] = z * 6 * swell;
    }
  });
}

// id -> AudioBuffer for any placeholder id; bark ids are `voice/<bank>#<emotion>`.
export function synthesize(ctx, id) {
  if (SFX[id]) return tones(ctx, SFX[id]);
  if (id.startsWith('music/')) return bed(ctx, id.slice(6).split('/')[0]);
  if (id === 'voice/crowd') return crowd(ctx);
  if (id.startsWith('voice/')) { const [bank, emotion] = id.slice(6).split('#'); return bark(ctx, bank, emotion); }
  return tones(ctx, SFX['ui/blip']);
}
