// Writes src/audio/voice-env.json: one loudness track per voice take, for the 'hitl:voice' event.
// Decodes each shipped voice bank (public/audio/voice/*.ogg, needs ffmpeg), takes the RMS of every
// 1/30 s window of each take listed in assets.json, peak-normalizes per take, and writes one base36
// character per frame (0..35). Run it after adding or recutting a voice take:
//   node src/audio/voice-env.mjs
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RATE = 30, SR = 48000, SCALE = 35, W = SR / RATE;
const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
const assets = JSON.parse(readFileSync(`${root}/src/audio/assets.json`, 'utf8'));

function decode(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', `${root}/public/audio/${file}`, '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`voice-env: ffmpeg failed on ${file}: ${r.stderr}`);
  return new Float32Array(r.stdout.buffer, r.stdout.byteOffset, r.stdout.length / 4);
}

const out = { rate: RATE, scale: SCALE, banks: {} };
for (const [bank, v] of Object.entries(assets.voice).sort(([a], [b]) => (a < b ? -1 : 1))) {
  const y = decode(v.file);
  out.banks[bank] = {};
  for (const [emo, takes] of Object.entries(v.emotions).sort(([a], [b]) => (a < b ? -1 : 1))) {
    out.banks[bank][emo] = takes.map(([off, dur]) => {
      const n = Math.max(1, Math.round(dur * RATE));
      const base = Math.trunc(off * SR);
      const end = Math.trunc((off + dur) * SR);
      const rms = Array.from({ length: n }, (_, i) => {
        const a = base + i * W, b = Math.min(base + (i + 1) * W, end);
        if (b <= a) return 0;
        let s = 0;
        for (let k = a; k < b; k++) s += y[k] * y[k];
        return Math.sqrt(s / (b - a));
      });
      const peak = Math.max(...rms);
      return rms.map((x) => B36[Math.round((peak > 0 ? x / peak : x) * SCALE)]).join('');
    });
  }
}
writeFileSync(`${root}/src/audio/voice-env.json`, JSON.stringify(out));
console.log(`voice-env: ${Object.keys(out.banks).length} banks written`);
