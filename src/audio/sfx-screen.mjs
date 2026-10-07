// Screens a short sound-effect candidate for a ringing or reverberant tail before it goes anywhere near the
// owner's desk. Two checks, both relative to the clip itself so a 10 ms click is not judged like a bell:
//   decay: how long the envelope takes to fall 40 dB below its peak and stay there. A short cue (a clip that
//          is audible for no longer than `shortMax`, trailing silence not counted) must settle within `decay`; longer clips are loops, ambience or stingers
//          and are judged by ear.
//   end:   the peak of the clip's last stretch (a quarter of the clip, at most 50 ms) against the clip's peak.
//          A clip cut off while still loud fails.
//
//   node src/audio/sfx-screen.mjs [--decay s] [--short-max s] [--end dB] FILE...
//
// Exits 1 when any file fails, 2 on bad input. Decoding needs ffmpeg on the path.
import { spawnSync } from 'node:child_process';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const SR = 48000;

// Every effect and UI sound in public/audio passes these. A 1.1 s bell that rings for a second does not.
export const BARS = {
  decay: 0.8,     // s: longest peak-to-silence time for a short cue
  shortMax: 1.2,  // s: clips up to this length are short cues
  end: -6,        // dB: last stretch's peak relative to the clip's peak
};

const db = (x) => 20 * Math.log10(x + 1e-12);
const peakOf = (a, from = 0) => { let p = 0; for (let i = from; i < a.length; i++) p = Math.max(p, Math.abs(a[i])); return p; };

// A 5 ms RMS envelope of mono samples.
function envelope(x, sr) {
  const w = Math.max(1, Math.round(0.005 * sr)), out = [];
  for (let i = 0; i < x.length; i += w) {
    let s = 0, n = 0;
    for (let j = i; j < Math.min(x.length, i + w); j++, n++) s += x[j] * x[j];
    out.push(Math.sqrt(s / n));
  }
  return { env: out, step: w / sr };
}

// Metrics for mono samples `x` at `sr`, and the bars each one broke.
export function screen(x, sr, bars = BARS) {
  const dur = x.length / sr;
  const { env, step } = envelope(x, sr);
  let peak = 0;
  for (const v of env) peak = Math.max(peak, v);
  const peakAt = env.indexOf(peak);
  const floor = peak * 0.01; // 40 dB below the peak
  let last = peakAt;
  for (let i = env.length - 1; i > peakAt; i--) if (env[i] > floor) { last = i; break; }
  const decay = (last - peakAt) * step;
  const sounding = (last + 1) * step; // length up to where it stays 40 dB down: trailing silence does not count
  const tailLen = Math.max(1, Math.round(Math.min(0.05, dur / 4) * sr));
  const end = db(peakOf(x, x.length - tailLen)) - db(peakOf(x));
  const failed = [];
  if (sounding <= bars.shortMax && decay > bars.decay) failed.push(`decay ${decay.toFixed(2)} s > ${bars.decay} s`);
  if (end > bars.end) failed.push(`ends at ${end.toFixed(1)} dB of its peak > ${bars.end} dB`);
  return { dur, decay, end, failed };
}

function decode(file) {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '1', '-ar', String(SR), '-f', 'f32le', 'pipe:1'], { maxBuffer: 1 << 28 });
  if (r.status !== 0) throw new Error(`could not decode ${file}: ${r.stderr}`);
  const b = r.stdout;
  return Array.from(new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4)));
}

function main(argv) {
  const bars = { ...BARS }, files = [], keys = { '--decay': 'decay', '--short-max': 'shortMax', '--end': 'end' };
  for (let i = 0; i < argv.length; i++) {
    if (keys[argv[i]]) {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v)) { console.error(`sfx-screen: ${argv[i - 1]} needs a number`); return 2; }
      bars[keys[argv[i - 1]]] = v;
    } else if (argv[i].startsWith('--')) { console.error(`sfx-screen: unknown option ${argv[i]}`); return 2; }
    else files.push(argv[i]);
  }
  if (!files.length) { console.error('usage: sfx-screen.mjs [--decay s] [--short-max s] [--end dB] FILE...'); return 2; }
  let bad = 0;
  for (const f of files) {
    let r;
    try { r = screen(decode(f), SR, bars); } catch (e) { console.error(`${basename(f)}: ${e.message}`); bad++; continue; }
    console.log(`${r.failed.length ? 'FAIL' : 'ok  '} ${basename(f)}  ${r.dur.toFixed(2)} s  decay ${r.decay.toFixed(2)} s  end ${r.end.toFixed(1)} dB${r.failed.length ? `  (${r.failed.join('; ')})` : ''}`);
    if (r.failed.length) bad++;
  }
  return bad ? 1 : 0;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) process.exit(main(process.argv.slice(2)));
