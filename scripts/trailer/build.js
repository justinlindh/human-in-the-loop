// Builds the trailer from the current tree: captures its beats from seeded games, renders the cards
// and captions, cuts the video, and mixes the game's music and stingers under the voiceover.
//
// npm run trailer                                  capture, then build shots/trailer/trailer.mp4
// npm run trailer -- --vo shots/trailer/vo         voiceover lines as <dir>/<line id>.wav
//   [--out shots/trailer] [--reuse] [--vertical] [--no-captions] [--print-vo] [--software] [--audio-only]
// --audio-only mixes mix.wav and music-stem.wav and stops: no capture, no video.
// --reuse keeps clips already captured from the same commit. Every choice lives in config.js.
import { spawn, execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { BEATS, CARDS, MUSIC, OUTPUT, PLAY_URL, VO } from './config.js';
import { renderGraphics } from './cards.js';

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) out[a.slice(2)] = true;
    else { out[a.slice(2)] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
if (args['print-vo']) {
  // A line's `say` (how the narrator speaks it, e.g. a URL read aloud) is the TTS script when set; `text` stays the caption.
  process.stdout.write(`${JSON.stringify(VO.lines.map(({ id, text, say }) => ({ id, text: say ?? text })), null, 2)}\n`);
  process.exit(0);
}

const ROOT = resolve(new URL('../..', import.meta.url).pathname);
const OUT = resolve(String(args.out ?? join(ROOT, 'shots/trailer')));
const CLIPS = join(OUT, 'clips');
const GFX = join(OUT, 'gfx');
const VO_DIR = typeof args.vo === 'string' ? resolve(args.vo) : null;
// The vertical (1080x1920) cut is built only on request.
const VERTICAL = !!args.vertical && !!OUTPUT.vertical;
const CAPTIONS = !args['no-captions'] && VO.captions;
// Hard ceilings on the child processes, so a hung browser or encoder cannot hold the machine.
const CAPTURE_TIMEOUT_S = 3600;
// Headless renders share one machine-wide lock with local CI's render checks.
const FFMPEG_TIMEOUT_S = 900;
mkdirSync(CLIPS, { recursive: true });
mkdirSync(GFX, { recursive: true });

function run(cmd, argv, { timeout, quiet = false } = {}) {
  return new Promise((ok, fail) => {
    const p = spawn('timeout', ['--kill-after=10', String(timeout), 'nice', '-n', '10', cmd, ...argv], { cwd: ROOT, stdio: quiet ? ['ignore', 'pipe', 'pipe'] : 'inherit' });
    let err = '';
    p.stderr?.on('data', (d) => { err += d; });
    p.on('close', (code) => (code === 0 ? ok(err) : fail(new Error(`${cmd} exited ${code}${code === 124 ? ' (timed out)' : ''}\n${err.slice(-2000)}`))));
  });
}

const probeSeconds = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' }).trim());

// Beat start times, and `at` values ({ beat, offset } or seconds) resolved against them.
const starts = {};
let total = 0;
for (const b of BEATS) { starts[b.id] = total; total += b.dur; }
const at = (a) => (typeof a === 'number' ? a : (() => {
  if (!(a.beat in starts)) throw new Error(`trailer: unknown beat ${a.beat}`);
  return starts[a.beat] + (a.offset ?? 0);
})());

// 1. Capture.
const commit = (() => { try { return execSync('git rev-parse --short HEAD', { cwd: ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown'; } })();
const indexFile = join(CLIPS, 'index.json');
const clipBeats = BEATS.filter((b) => b.item);
const captured = () => (existsSync(indexFile) ? JSON.parse(readFileSync(indexFile, 'utf8')).items : {});
// A clip is reused only when its capture item and the commit are unchanged.
const { ITEMS: CAPTURE_ITEMS } = await import('./manifest.js');
const keyOf = (b) => createHash('sha256').update(`${commit}\n${JSON.stringify(CAPTURE_ITEMS.find((it) => it.id === `trailer-${b.id}`))}`).digest('hex');
const keyFile = (b) => join(CLIPS, `trailer-${b.id}.key`);
const fresh = (b) => { const i = captured()[`trailer-${b.id}`]; return i && i.errors === 0 && existsSync(join(CLIPS, `trailer-${b.id}.mp4`)) && existsSync(keyFile(b)) && readFileSync(keyFile(b), 'utf8') === keyOf(b); };
const AUDIO_ONLY = !!args['audio-only'];
const todo = AUDIO_ONLY ? [] : args.reuse ? clipBeats.filter((b) => !fresh(b)) : clipBeats;
if (todo.length) {
  console.log(`trailer: capturing ${todo.map((b) => b.id).join(', ')}`);
  const capture = ['scripts/capture.js', '--manifest', 'scripts/trailer/manifest.js', '--out', CLIPS, '--fps', String(OUTPUT.fps),
    '--size', `${OUTPUT.width}x${OUTPUT.height}`, '--no-webm', '--only', todo.map((b) => `trailer-${b.id}`).join(','), ...(args.software ? ['--software'] : [])];
  // Capture renders under a render lock (a GPU slot, or the software lock with --software); the
  // wrapper runs straight through when a caller already holds one.
  await run('bash', [join(ROOT, 'scripts/with-render-lock.sh'), args.software ? '--software' : '--gpu', 'node', ...capture], { timeout: CAPTURE_TIMEOUT_S });
  for (const b of todo) writeFileSync(keyFile(b), keyOf(b));
}
for (const b of AUDIO_ONLY ? [] : clipBeats) {
  const len = probeSeconds(join(CLIPS, `trailer-${b.id}.mp4`));
  if (b.from + b.dur > len + 1e-3) throw new Error(`trailer: beat ${b.id} cuts ${b.from}s to ${b.from + b.dur}s from a ${len.toFixed(2)}s clip`);
}

// 2. Voiceover lines and their times.
const lines = VO.lines.map((l) => {
  const file = VO_DIR ? join(VO_DIR, `${l.id}.wav`) : null;
  const has = file && existsSync(file);
  if (VO_DIR && !has) throw new Error(`trailer: missing voiceover line ${file}`);
  // Without a recording, a caption stays up for a reading-pace estimate.
  const len = has ? probeSeconds(file) : l.text.split(/\s+/).length / 2.6;
  return { ...l, file: has ? file : null, start: at(l.at), len };
});
for (const [i, l] of lines.entries()) {
  const next = lines[i + 1];
  if (next && l.start + l.len > next.start) console.warn(`trailer: warning: line ${l.id} runs ${(l.start + l.len - next.start).toFixed(2)}s into ${next.id}`);
  if (l.start + l.len > total) console.warn(`trailer: warning: line ${l.id} runs past the end`);
}

// 3. Cards and captions.
const gfx = await renderGraphics({ dir: GFX, cards: CARDS, lines, output: VERTICAL ? OUTPUT : { ...OUTPUT, vertical: null }, logoPath: join(ROOT, 'docs/readme/logo.png'), url: PLAY_URL.replace(/^https:\/\//, '').replace(/\/$/, '') });

// 4. Audio mix: music bed, swaps and stingers, ducked under the voiceover, then loudness-normalized.
// adelay only shifts timestamps; aresample (async, from 0) turns the shift into real silence, so
// every later filter and the mix see each sound at its place.
const f = (n) => n.toFixed(3);
// With `stem`, the graph also outputs [stem]: the music as it sits in the mix (ducked), without the voice.
function audioGraph({ stem = false } = {}) {
  const inputs = [];
  const chains = [];
  const music = [];
  const add = (argv) => { inputs.push(...argv); return inputs.filter((x) => x === '-i').length - 1; };
  const swapEnv = MUSIC.swaps.map((s) => {
    const a = at(s.at); const b = at(s.until); const fd = s.fade;
    return { a, b, fd, env: `clip((t-${f(a)})/${f(fd)},0,1)*clip((${f(b)}-t)/${f(fd)},0,1)` };
  });
  const bed = add(['-stream_loop', '-1', '-i', MUSIC.bed.file]);
  const bedDip = swapEnv.length ? `,volume='1-(${swapEnv.map((s) => s.env).join('+')})':eval=frame` : '';
  chains.push(`[${bed}:a]atrim=0:${f(total)},asetpts=N/SR/TB,aformat=sample_rates=48000:channel_layouts=stereo,volume=${MUSIC.bed.gain}dB,afade=t=in:d=${MUSIC.bed.fadeIn}${bedDip}[bed]`);
  music.push('[bed]');
  MUSIC.swaps.forEach((s, i) => {
    const n = add(['-i', s.file]);
    const e = swapEnv[i];
    chains.push(`[${n}:a]atrim=start=${f(s.seek ?? 0)}:duration=${f(e.b - e.a + e.fd)},asetpts=N/SR/TB,aformat=sample_rates=48000:channel_layouts=stereo,volume=${s.gain}dB,adelay=${Math.round(e.a * 1000)}:all=1,aresample=async=1:first_pts=0,apad,atrim=0:${f(total)},volume='${e.env}':eval=frame[sw${i}]`);
    music.push(`[sw${i}]`);
  });
  MUSIC.stingers.forEach((s, i) => {
    const n = add(['-i', s.file]);
    chains.push(`[${n}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${s.gain}dB,adelay=${Math.round(at(s.at) * 1000)}:all=1,aresample=async=1:first_pts=0,apad,atrim=0:${f(total)}[st${i}]`);
    music.push(`[st${i}]`);
  });
  chains.push(`${music.join('')}amix=inputs=${music.length}:normalize=0:duration=first[music]`);
  const voiced = lines.filter((l) => l.file);
  let tail = '[music]';
  if (stem && !voiced.length) { chains.push('[music]asplit=2[music1][stem]'); tail = '[music1]'; }
  if (voiced.length) {
    voiced.forEach((l, i) => {
      const n = add(['-i', l.file]);
      chains.push(`[${n}:a]aformat=sample_rates=48000:channel_layouts=stereo,volume=${VO.gain}dB,adelay=${Math.round(l.start * 1000)}:all=1,aresample=async=1:first_pts=0,apad,atrim=0:${f(total)}[vo${i}]`);
    });
    chains.push(`${voiced.map((_, i) => `[vo${i}]`).join('')}amix=inputs=${voiced.length}:normalize=0:duration=first[vo]`);
    // The music dips by duck.db under each line: it ramps down over duck.attack before the line starts
    // and back up over duck.release after it ends. A gain envelope, not a compressor, so it never pumps.
    // Without `duck`, the music stays at one constant level under the voice.
    const d = MUSIC.duck;
    const under = d ? voiced.map((l) => `clip((t-${f(l.start - d.attack)})/${f(d.attack)},0,1)*clip((${f(l.start + l.len + d.release)}-t)/${f(d.release)},0,1)`).join('+') : '';
    const dip = d ? `volume='1-${(1 - 10 ** (d.db / 20)).toFixed(4)}*min(1,${under})':eval=frame` : 'anull';
    chains.push(`[music]${dip}${stem ? ',asplit=2[ducked][stem]' : '[ducked]'}`);
    chains.push('[ducked][vo]amix=inputs=2:normalize=0:duration=first[premix]');
    tail = '[premix]';
  }
  chains.push(`${tail}afade=t=out:st=${f(total - MUSIC.fadeOut)}:d=${MUSIC.fadeOut}[mix]`);
  return { inputs, graph: chains.join(';') };
}

const mixWav = join(OUT, 'mix.wav');
{
  const { inputs, graph } = audioGraph();
  const target = `I=${OUTPUT.lufs}:TP=${OUTPUT.truePeak}:LRA=11`;
  const log = await run('ffmpeg', ['-y', '-hide_banner', '-nostats', ...inputs, '-filter_complex', `${graph};[mix]loudnorm=${target}:print_format=json[out]`, '-map', '[out]', '-f', 'null', '-'], { timeout: FFMPEG_TIMEOUT_S, quiet: true });
  const m = JSON.parse(log.slice(log.lastIndexOf('{'), log.lastIndexOf('}') + 1));
  const second = `loudnorm=${target}:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true`;
  // The same gain goes on the music stem (music-stem.wav), for checking the bed on its own.
  const withStem = audioGraph({ stem: true });
  const gain = `volume=${(OUTPUT.lufs - Number(m.input_i)).toFixed(2)}dB`;
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...withStem.inputs, '-filter_complex', `${withStem.graph};[mix]${second},aresample=48000[out];[stem]${gain},aresample=48000[stemout]`,
    '-map', '[out]', '-t', f(total), '-c:a', 'pcm_s16le', mixWav, '-map', '[stemout]', '-t', f(total), '-c:a', 'pcm_s16le', join(OUT, 'music-stem.wav')], { timeout: FFMPEG_TIMEOUT_S });
}

if (AUDIO_ONLY) { console.log(`trailer: ${mixWav}`); process.exit(0); }

// 5. Video. Each beat becomes one input, normalized, then everything is concatenated and captioned.
function videoGraph(vertical) {
  const inputs = [];
  const chains = [];
  const n = () => inputs.filter((x) => x === '-i').length - 1;
  const fps = OUTPUT.fps;
  const W = vertical ? OUTPUT.vertical.width : OUTPUT.width;
  const H = vertical ? OUTPUT.vertical.height : OUTPUT.height;
  const { square, top } = gfx.vlayout;
  let frameIdx = null;
  if (vertical) { inputs.push('-loop', '1', '-framerate', String(fps), '-t', f(total), '-i', gfx.vframe); frameIdx = n(); }
  // A punch-in: the view zooms from zoom[0] to zoom[1] over the beat with an ease in and out, toward
  // `at` (fractions of the frame) and kept inside the picture. zoompan reads a 2x upscale so the
  // sub-pixel motion stays smooth.
  const punch = (b) => {
    if (!b.punch) return '';
    const [z0, z1] = b.punch.zoom;
    const [cx, cy] = b.punch.at;
    const p = `clip(in/${f(b.dur * fps)},0,1)`;
    const z = `${z0}+(${z1 - z0})*${p}*${p}*(3-2*${p})`;
    return `scale=${OUTPUT.width * 2}:${OUTPUT.height * 2}:flags=lanczos,`
      + `zoompan=z='${z}':x='clip(iw*${cx}-iw/zoom/2,0,iw-iw/zoom)':y='clip(ih*${cy}-ih/zoom/2,0,ih-ih/zoom)':d=1:s=${OUTPUT.width}x${OUTPUT.height}:fps=${fps},`;
  };
  BEATS.forEach((b, i) => {
    const norm = `fps=${fps},setsar=1,format=yuv420p,trim=duration=${f(b.dur)},setpts=PTS-STARTPTS`;
    if (b.card) {
      inputs.push('-loop', '1', '-framerate', String(fps), '-t', f(b.dur), '-i', vertical ? gfx.vcards[b.card] : gfx.cards[b.card]);
      const fade = i === 0 ? `fade=t=in:d=0.35:color=0xfbf5ea,` : '';
      chains.push(`[${n()}:v]scale=${W}:${H},${fade}${norm}[b${i}]`);
      return;
    }
    inputs.push('-ss', f(b.from), '-t', f(b.dur), '-i', join(CLIPS, `trailer-${b.id}.mp4`));
    if (!vertical) { chains.push(`[${n()}:v]setpts=PTS-STARTPTS,${punch(b)}scale=${W}:${H},${norm}[b${i}]`); return; }
    // The vertical cut shows a square window of the gameplay inside its frame.
    const cropW = OUTPUT.height;
    const x = Math.round((OUTPUT.width - cropW) * (b.vx ?? 0.5));
    chains.push(`[${n()}:v]setpts=PTS-STARTPTS,${punch(b)}crop=${cropW}:${OUTPUT.height}:${x}:0,scale=${square}:${square},${norm}[g${i}]`);
    chains.push(`[${frameIdx}:v]trim=start=${f(starts[b.id])}:duration=${f(b.dur)},setpts=PTS-STARTPTS,fps=${fps},format=yuv420p[fr${i}]`);
    chains.push(`[fr${i}][g${i}]overlay=0:${top}:shortest=1,${norm}[b${i}]`);
  });
  chains.push(`${BEATS.map((_, i) => `[b${i}]`).join('')}concat=n=${BEATS.length}:v=1:a=0[cat]`);
  let tail = '[cat]';
  if (CAPTIONS) {
    lines.forEach((l, i) => {
      // A card with `captions: false` already carries its own words.
      const beat = BEATS.find((b) => l.start >= starts[b.id] && l.start < starts[b.id] + b.dur);
      if (beat?.card && CARDS[beat.card].captions === false) return;
      inputs.push('-loop', '1', '-framerate', String(fps), '-t', f(total), '-i', vertical ? gfx.vcaptions[l.id] : gfx.captions[l.id]);
      const y = vertical ? top + square + 30 : H - 180 - 36;
      // A caption gives way to the next line's.
      const end = Math.min(l.start + l.len + 0.25, lines[i + 1]?.start ?? total);
      chains.push(`[${n()}:v]format=rgba,fade=t=in:st=${f(l.start)}:d=0.15:alpha=1,fade=t=out:st=${f(end - 0.15)}:d=0.15:alpha=1[c${i}]`);
      chains.push(`${tail}[c${i}]overlay=0:${y}:enable='between(t,${f(l.start)},${f(end)})':shortest=1[v${i}]`);
      tail = `[v${i}]`;
    });
  }
  chains.push(`${tail}fade=t=out:st=${f(total - 0.4)}:d=0.4:color=0xfbf5ea,format=yuv420p[vout]`);
  return { inputs, graph: chains.join(';'), W, H };
}

async function encode(vertical, file) {
  const { inputs, graph } = videoGraph(vertical);
  await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...inputs, '-i', mixWav, '-filter_complex', graph,
    '-map', '[vout]', '-map', `${inputs.filter((x) => x === '-i').length}:a`, '-t', f(total),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-color_range', 'tv', '-r', String(OUTPUT.fps),
    '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', file], { timeout: FFMPEG_TIMEOUT_S });
  return file;
}

const outputs = [await encode(false, join(OUT, 'trailer.mp4'))];
if (VERTICAL) outputs.push(await encode(true, join(OUT, 'trailer-vertical.mp4')));

const summary = {
  build: commit,
  seconds: total,
  outputs: outputs.map((o) => o.slice(OUT.length + 1)),
  voiceover: VO_DIR ? 'recorded' : 'none (captions only)',
  beats: BEATS.map((b) => ({ id: b.id, start: starts[b.id], dur: b.dur, ...(b.item ? { item: b.item, from: b.from } : { card: b.card }) })),
  lines: lines.map((l) => ({ id: l.id, start: +l.start.toFixed(2), seconds: +l.len.toFixed(2), text: l.text })),
};
writeFileSync(join(OUT, 'trailer.json'), `${JSON.stringify(summary, null, 2)}\n`);
for (const o of outputs) console.log(`trailer: ${o} (${probeSeconds(o).toFixed(2)}s)`);
