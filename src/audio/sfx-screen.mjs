// Screens a short sound-effect candidate for a ringing or reverberant tail before it goes anywhere near the
// owner's desk. Measures the clip's length, how long its envelope takes to fall 40 dB below its peak, the
// level of its last 200 ms against the whole clip, and its last 50 ms peak, and fails any file over a bar.
//
//   node src/audio/sfx-screen.mjs [--max-dur s] [--decay s] [--last200 dB] [--last50 dB] FILE...
//
// Exits 1 when any file fails. Decoding needs ffmpeg on the path.
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 48000;

// The bars sit between the sounds the owner accepted (a 0.5 s wooden tick, a 0.6 s water glug) and the ones
// rejected as echo-y (a bell that rings past a second).
export const BARS = {
  maxDur: 0.8,     // s: longest clip
  decay: 0.45,     // s: from the envelope's peak until it stays 40 dB below it
  last200: -20,    // dB: RMS of the last 200 ms relative to the whole clip's RMS
  last50: -50,     // dBFS: peak of the last 50 ms
};

const db = (x) => 20 * Math.log10(x + 1e-12);
const rms = (a) => Math.sqrt(a.reduce((s, v) => s + v * v, 0) / Math.max(1, a.length));

// A 5 ms RMS envelope of mono samples.
function envelope(x, sr) {
  const w = Math.max(1, Math.round(0.005 * sr)), out = [];
  for (let i = 0; i < x.length; i += w) out.push(rms(x.slice(i, i + w)));
  return { env: out, step: w / sr };
}

// Metrics for mono samples `x` at `sr`, and the bars each one broke.
export function screen(x, sr, bars = BARS) {
  const dur = x.length / sr;
  const { env, step } = envelope(x, sr);
  const peak = Math.max(...env), peakAt = env.indexOf(peak);
  const floor = peak * 0.01; // 40 dB below the peak
  let last = peakAt;
  for (let i = env.length - 1; i > peakAt; i--) if (env[i] > floor) { last = i; break; }
  const decay = (last - peakAt) * step;
  const tail = (s) => x.slice(Math.max(0, x.length - Math.round(s * sr)));
  // A clip under 0.4 s has no separate tail: its last half stands in for the last 200 ms.
  const last200 = db(rms(tail(Math.min(0.2, dur / 2)))) - db(rms(x));
  const last50 = db(Math.max(...tail(0.05).map(Math.abs)));
  const m = { dur, decay, last200, last50 };
  const failed = [];
  if (dur > bars.maxDur) failed.push(`length ${dur.toFixed(2)} s > ${bars.maxDur} s`);
  if (decay > bars.decay) failed.push(`decay ${decay.toFixed(2)} s > ${bars.decay} s`);
  if (last200 > bars.last200) failed.push(`last 200 ms ${last200.toFixed(1)} dB > ${bars.last200} dB`);
  if (last50 > bars.last50) failed.push(`last 50 ms peak ${last50.toFixed(1)} dBFS > ${bars.last50} dBFS`);
  return { ...m, failed };
}

function decode(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', 'pipe:1'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`could not decode ${file}: ${r.stderr}`);
  const b = r.stdout;
  return Array.from(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)));
}

function main(argv) {
  const bars = { ...BARS }, files = [], keys = { '--max-dur': 'maxDur', '--decay': 'decay', '--last200': 'last200', '--last50': 'last50' };
  for (let i = 0; i < argv.length; i++) {
    if (keys[argv[i]]) {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) { console.error(`sfx-screen: ${argv[i - 1]} needs a number`); return 2; }
      bars[keys[argv[i - 1]]] = v;
    } else if (argv[i].startsWith('--')) { console.error(`sfx-screen: unknown option ${argv[i]}`); return 2; }
    else files.push(argv[i]);
  }
  if (!files.length) { console.error('usage: sfx-screen.mjs [--max-dur s] [--decay s] [--last200 dB] [--last50 dB] FILE...'); return 2; }
  let bad = 0;
  for (const f of files) {
    let r;
    try { r = screen(decode(f), SR, bars); } catch (e) { console.error(`${basename(f)}: ${e.message}`); bad++; continue; }
    console.log(`${r.failed.length ? 'FAIL' : 'ok  '} ${basename(f)}  ${r.dur.toFixed(2)} s  decay ${r.decay.toFixed(2)} s  last200 ${r.last200.toFixed(1)} dB  last50 ${r.last50.toFixed(1)} dBFS${r.failed.length ? `  (${r.failed.join('; ')})` : ''}`);
    if (r.failed.length) bad++;
  }
  return bad ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
