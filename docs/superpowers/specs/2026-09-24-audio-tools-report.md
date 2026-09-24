# Audio tools report: music, SFX, voice, and the audio engine

Research, samples, and a design. Nothing is wired into the game. Samples live in `/home/justin/src/audio-samples/`, and the scripts that made them live in `~/tools/audio/scripts/`.

## TL;DR

| Category | Recommendation | License (code / weights) | Status on this box |
|---|---|---|---|
| Music | **ACE-Step 1.5** (instrumental). Render many 90 s takes on the GPU, cut the most consistent 10-bar window with a wrap search, master, and encode | MIT / MIT; outputs usable commercially | Runs on the 5090: **1.3 s per 90 s take, 7.9 GB VRAM** (turbo, 8 steps) |
| SFX | **Curated Kenney CC0 packs**, plus freesound CC0 only. Generation only for rare one-offs | CC0 | Two Kenney packs downloaded, 9-sound UI set made |
| Voice | **Simlish barks**: short acted-gibberish clips per voice type and emotion, pitch-shifted per character at runtime. Candidates: CosyVoice3 (reference timbre plus emotion instruction), Qwen3-TTS VoiceDesign, Chatterbox (not installed) | CosyVoice3 Apache-2.0; Qwen3-TTS Apache-2.0; Chatterbox MIT | Rounds 1 and 2 are made and waiting for the user's ear |
| Engine | A small `src/audio` subsystem: a pure **director** (events and state in, commands out; testable headless like the pacer) and a thin WebAudio **backend** (buses, music stems, voices) | n/a | Designed in section 6 |

Licenses:
- **Clean**: ACE-Step 1.5, Qwen3-TTS, Fun-CosyVoice3, Chatterbox, Kenney, HeartMuLa, DiffRhythm, Dia.
- **Conditional**:
  - Stable Audio 3: Community License. Commercial use needs registration, it is free only under USD 1M revenue, and the license ends above that.
  - Higgs Audio v2: under 100k annual users.
  - Orpheus: built on Llama, so the Llama license applies.
- **Ruled out** (non-commercial weights): MusicGen/AudioGen, YuE, MMAudio, TangoFlux, Woosh, Fish Speech/OpenAudio.

## 1. What is on the machine

| Item | Found | Runs? |
|---|---|---|
| GPU | RTX 5090, 32 GB. Driver 615.71.09, CUDA 13.4. About 2.7 GB used at idle by the desktop | Yes |
| CPU / RAM / disk | Ryzen 9 9950X3D (16 cores, 32 threads), 123 GiB RAM, about 820 GB free on `/` | |
| Python / uv | Python 3.13 (`/opt/miniforge`, torch 2.11+cu128), uv 0.8.15 | yes |
| Audio CLIs | ffmpeg 9 (libopus, libvorbis, loudnorm, ebur128, rubberband, atempo), sox, lame | yes |
| Python audio libs (miniforge) | numpy, scipy, soundfile, librosa 0.11 | yes |
| Docker | nvidia runtime plus CDI, nvidia-container-toolkit 1.20.0 | See "Docker GPU" below |
| Ollama | LLMs only | n/a |
| GPU lazy proxy | `gpu-lazy-proxy@{ace-step,comfyui,docling,qwen3-tts-clone}`: starts a backend on the first request, stops it after 10 idle minutes | yes |
| **ACE-Step 1.5** | Image `ghcr.io/dotnetautor/ace-step-1.5-docker`, volume `dockers_ace-step-checkpoints` (turbo DiT, LM 1.7B and 4B, VAE). Proxy :7860 goes to :7861 | Yes, on the GPU through the legacy runtime (see below) |
| **Qwen3-TTS 1.7B** | HF cache: Base (cloning), CustomVoice, VoiceDesign. Host servers `~/qwen-tts-server.py` (proxy :8880) and `~/qwen-tts-clone-server.py` (proxy :8882, `POST /clone`) | Yes on the host GPU. Load it from the snapshot path; loading by repo id calls the HF API and fails offline |
| **Fun-CosyVoice3 0.5B** | Image `neosun/cosyvoice:v3.4.0` with its weights (7 GB) | CPU only (35 to 53 s per clip): the image's torch 2.3.1+cu121 has no sm_120 kernels. Needs `text_frontend=False` offline |
| Qwen3-ASR 1.7B (STT) | `hermes-stt` on :8771; `hermes-tts` on :8770 | The containers are up, but CUDA fails in them (see Docker GPU) |
| Chatterbox | Removed from compose (`docker-compose.yml.bak-before-chatterbox-removal`); volume `dockers_chatterbox-cache` still holds about 3 GB of weights | Not runnable: no code or image. The prebuilt images ship torch older than 2.7, which Blackwell needs |
| Fish Speech / OpenAudio S1-mini | Images and weights present | Not tested: CC-BY-NC-SA, not shippable |
| Kokoro | `kokoro-fastapi-cpu` | Not tested: preset voices only, no emotion |
| sesame-csm, whisper-asr | Compose directories only | Not deployed |
| `~/homelab-k8s` | Talos cluster config, Helm and manifests | **No audio, TTS, or STT services.** The only matches are SOPS secrets and a Digits privacy rule |

### Digits voice-clip pipeline (`~/src/digits-voice-clone`)

`voice-clone` is a bash wrapper:
1. It takes a reference clip (default `~/src/digits/pi/tones/bell-woman-ref.mp3`) and a transcript: hardcoded for the default clip, otherwise from Whisper on :9000, which is not running.
2. It resamples to 44.1 kHz mono and posts to the Qwen3-TTS clone server (`:8882/clone`, multipart `ref_audio`, `ref_text`, `text`).
3. It applies an optional POTS band-pass (300 to 3400 Hz), then writes WAV.

`generate-release-audio` runs it over GitHub release notes and encodes MP3 at 128k. There's no loudness normalization.

For this game, the reusable parts are the clone endpoint and the "fixed reference voice" pattern: a fixed reference clip keeps a character's timbre stable. The pipeline itself reads plain text neutrally and has no emotion control, so it can't make Simlish barks on its own. Its telephone band-pass is a nice trick for in-game phone and video-call barks during the lockdown era.

### Docker GPU

**Cause.** `docker run --gpus` and compose `driver: nvidia` inject devices from the CDI spec `/etc/cdi/nvidia.yaml`. That spec says `/dev/nvidia-uvm` is major 510, but this boot's kernel registered 509 (`/proc/devices`). Containers get a dead uvm node, and CUDA fails with "unknown error". This breaks hermes-tts, hermes-stt and immich_machine_learning.

**Evidence:**
- inside hermes-tts, the uvm node is 510
- `nvidia-ctk cdi generate`, run unprivileged to a scratch file, produces 509
- a test container on the legacy runtime (`--runtime=nvidia -e NVIDIA_VISIBLE_DEVICES=all`) gets 509, and `torch.cuda.is_available()` is True

**Fix** (needs sudo; no daemon restart):
1. `sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml`
2. Recreate the running GPU containers: `docker compose up -d --force-recreate hermes-tts hermes-stt` in `~/src/dockers`, and the same for `~/src/dockers/immich-machine-learning`.

The uvm major can change on any reboot, so the spec should be regenerated at boot (a root oneshot unit before `docker.service`).

**Workaround in use:** throwaway containers on `--runtime=nvidia`. Nothing on the system was changed.

### Other blockers

- The permission classifier blocks cloning or pip-installing new code (ACE-Step from GitHub, `chatterbox-tts` from PyPI). Anything new needs the user's approval. Everything above ran from images and installs that were already here.
- Stable Audio 3 Small SFX is gated on Hugging Face (accept the license on an account first).

## 2. Survey and licenses

### (a) Music generation, local on a 5090

| Model | Quality and control | Loopability | Code / weights license | Verdict |
|---|---|---|---|---|
| **ACE-Step 1.5** (XL 4B DiT variants since Apr 2026) | Close to Suno v4.5 on the authors' benchmarks. Instrumental; caption plus BPM, key, time signature, and duration. Repaint, extend, cover, reference audio, stem extraction ("lego"), LoRA | Repaint regenerates a time range, so a bad wrap can be redone. BPM control makes bar math exact | **MIT / MIT** (local checkpoint READMEs say `license: mit`); the card says outputs can be used commercially; trained on licensed, royalty-free and synthetic data | **Pick** |
| HeartMuLa 3B | Strong on songs with lyrics | No loop features; instrumental-only use isn't documented | Apache-2.0 / Apache-2.0 | Legal, poor fit |
| Stable Audio 3 Small or Medium | Instrumental and SFX, trained on licensed data | Variable length | Stability Community License (see TL;DR) | Backup only |
| DiffRhythm | Songs | Weak | Apache-2.0 | Not needed |
| YuE / YuE2 | Songs with vocals | Weak | Apache code / **CC-BY-NC 4.0 weights** | Ruled out |
| MusicGen | Dated | Weak | MIT code / **CC-BY-NC weights** | Ruled out |
| CC0 libraries | Uneven; no single voice across 5 eras | Often clean | CC0 | Fallback |

### (b) Sound effects

- **Kenney (CC0)**: UI Audio (50 files) and Interface Sounds (100 files) are downloaded to `~/tools/audio/packs/`. Also useful: Casino (coins), Impact, Digital, RPG. One author, so they share one feel.
- **freesound.org**: CC0 filter only. CC-BY is legal but adds per-file attribution.
- **Generation**: Stable Audio 3 Small SFX is the only current open-weight SFX model that allows commercial use (Community License, gated). TangoFlux, MMAudio and Woosh are non-commercial.
- Verdict: **curate**, and generate only rare one-offs, loudness-matched to the set.

### (c) Voice: Simlish barks

The target is acted gibberish with real intonation (happy, annoyed, tired, excited, questioning, laughing). That means neither TTS reading words nor chopped syllables.

| Model | Emotion control | Non-verbals | Timbre consistency across emotions | License | On this box |
|---|---|---|---|---|---|
| **Fun-CosyVoice3 0.5B** | Trained instructions: happy, sad, angry, fast, slow, loud, soft (plus dialects) | `[laughter]`, `[breath]` inline | **Good**: the timbre comes from a fixed reference clip | Apache-2.0 | Yes (CPU) |
| **Qwen3-TTS VoiceDesign** | Free-text instruction ("annoyed, exasperated sigh...") | Only through the description | Weak: the voice is re-created from the description on every call | Apache-2.0 | Yes (GPU) |
| **Chatterbox / Chatterbox-Turbo** (Resemble) | `exaggeration` dial (monotone to dramatic) plus cloning | `[laugh]`, `[sigh]`, `[gasp]`, `[cough]`, `[chuckle]` (Turbo) | Good (cloning) | MIT (outputs carry an inaudible PerTh watermark) | No: needs an install approval and torch 2.7+ |
| Dia / Dia2 (Nari Labs) | Script-driven | `(laughs)`, `(sighs)`, `(gasps)` | Weak without a prompt clip | Apache-2.0 | No |
| Orpheus (Canopy) | Emotion tags | yes | Preset voices | Llama-derived license | No |
| IndexTTS2 | Separate emotion reference or vector | some | Good | Unclear (reports conflict); check before use | No |
| Higgs Audio v2 | Strong expressivity | yes | Good | Boson community license, under 100k annual users | No |
| Fish Speech / OpenAudio | Emotion tags | yes | Good | **CC-BY-NC-SA** | Ruled out |

Recommended bark approach:
1. Design 4 to 6 voice types. Each is one reference clip made with Qwen3-TTS VoiceDesign.
2. Render each type × emotion with an emotion-capable cloner (CosyVoice3 now, Chatterbox if approved), 6 to 10 takes per cell.
3. A human picks and trims 2 to 3 barks of 0.5 to 2 s per cell.
4. At runtime, each character gets pitch and rate variation on top. The contract already gives every Staff `voice: { set, variant, pitch }`.

## 3. Samples made

All paths are under `/home/justin/src/audio-samples/`. Each clip was sent to the lead as it was made.

### Music

**Wrap metric.** A loop wrap is judged by bar-length loudness, stepped by one beat, across the loop played twice: the bar straddling the wrap should deviate from the median bar no more than a typical bar does ("wrap dev" against "typical p95" below). A comparison of two 50 ms windows is phase-sensitive in a groove that alternates loud and soft beats by about 9 dB. That comparison produced false "jumps" in the first measurements, so don't use it.

**Loop cutting.**
- `loopify2.py` searches every start beat for an N-beat window. It scores:
  - the level and spectral match between the bar after the loop start and the bar after the loop end (the crossfade mixes those two),
  - continuity into the wrap,
  - internal consistency: steady bar loudness and a steady spectrum across the window.
- It loudness-matches the tail to the head, then does a 2-beat equal-power crossfade.
- It masters to -18 LUFS with true peak at or below -1.5 dBTP, then encodes OGG Vorbis q4.
- `*_loop_x3.ogg` plays the loop three times, so the wrap is heard twice.

| File | How | Loop | Wrap dev / typical p95 | Notes |
|---|---|---|---|---|
| `music/classic_office_s1101_loop_x3.ogg` | CPU, 30 s take | 15.2 s | 5.9 / 7.0 dB | first-round sample |
| `music/classic_office_s2202_loop_x3.ogg` | CPU, 34 s take | 25.3 s, 10 bars | 1.3 / 1.8 dB | **the user's pick** |
| `music/classic_office_s2202_seamfix_loop_x3.ogg` | re-cut with the wrap search | 25.3 s from 2.39 s | 1.9 / 1.8 dB | |
| `music/classic_office_s3303_loop_x3.ogg` | CPU | 15.3 s | 1.4 / 4.5 dB | |
| `music/classic_office_s4404_loop_x3.ogg` | CPU | 15.0 s | 0.1 / 0.7 dB | |
| `music/agents_era_s5505_loop_x3.ogg` | CPU, Agents-era prompt, 110 BPM A minor | 26.2 s | 2.3 / 2.4 dB | era contrast |
| `music/pre_ai_steady_s2210_loop_x3.ogg` | **GPU**, 90 s take, "steady" prompt | 25.2 s from 5.7 s | 0.7 / 0.9 dB | new pre-AI loop |
| `music/pre_ai_steady_s2220_loop_x3.ogg` | **GPU**, 90 s take, "steady" prompt | 25.0 s from 22.9 s | 0.7 / 1.2 dB | new pre-AI loop |

The Classic prompt is "cheerful cozy office management game background music, instrumental, warm electric piano, marimba, soft muted guitar, light brushed drums, round bass, gentle and bouncy, retro 90s video game soundtrack feel, clean mix, loopable, no vocals", at 96 BPM in F major. The "steady" variant appends "steady repetitive groove, consistent instrumentation throughout, same arrangement from start to end, no breakdown, no build-up, no solo, background music for a menu screen".

GPU numbers (turbo, 8 steps, DiT only, legacy runtime):
- **1.3 s per 90 s take**, 7.9 GB peak VRAM, model init 3.6 s.
- 24 takes rendered in about 30 s. The cost of music is now entirely listening time.
- The beat tracker read half tempo on 3 of the 24 takes; those were excluded automatically.
- Nearby seeds are not musically related. "Same neighbourhood" means the same prompt, tempo and key.

The raw takes (`raw_*.wav`, 48 kHz stereo) are kept next to the loops. The GPU batch's metrics are in `~/tools/audio/work/batch2_metrics.jsonl`.

### SFX

`sfx/ui_set_kenney_audition.ogg`: nine Kenney CC0 sounds in the order click, button, select, toggle, open, close, tick, confirm, error. Each is trimmed, mono 48 kHz, peak -3 dBFS, OGG, 3 to 7 KB. The individual files are `sfx/kenney/ui_*.ogg`. Integrated LUFS is meaningless under 400 ms, so short UI sounds are peak-matched.

### Voice

- **Round 0** (`voice/`): TTS reading lines (`tts_*.wav`), chopped-syllable babble (`babble_syllables_*.wav`), and synth blips (`babble_synth_*.wav`). **The user rejected all of them.**
- **Round 1** (`voice2/qwen_{bright,gruff}_{happy,annoyed,tired,questioning}.ogg`): Qwen3-TTS VoiceDesign speaking invented gibberish with an emotion instruction ("performed like a cartoon voice actor").
  - GPU: 4.4 GB VRAM, 1.3 to 2.5 s per take.
  - The best of 3 takes by length; trimmed, -20 LUFS, limiter at -2 dBFS, OGG.
  - 2.2 to 4.0 s long, which is too long for barks.
- **Round 2** (`voice2/cosy_{bright,gruff}_{happy,annoyed,tired,questioning}.ogg`): Fun-CosyVoice3, instruct mode.
  - Timbre from a fixed Qwen-designed reference clip per voice (`~/tools/audio/work/refs/ref_{bright,gruff}.wav`).
  - Emotion: happy and angry are native; tired is the slow instruction plus `[breath]`; questioning is the soft instruction plus a rising "?"; happy adds `[laughter]`.
  - CPU, 35 to 53 s per clip. 2.9 to 7.6 s long, -20 LUFS, OGG.

Gibberish lines used:
- happy: "Ooh, bibbala! Toomi toomi!"
- annoyed: "Ugh. Nargo feshta. Blok!"
- tired: "Mmh... sheloo... dorra mah."
- questioning: "Hm? Deeba lonnie... sho?"

These are invented, not the Sims' real Simlish lexicon.

## 4. Recommended stack and pipeline

### Music

1. **Generate** on the GPU: turbo for breadth (dozens of 90 to 120 s takes per prompt), then `acestep-v15-xl-sft` for final quality (needs a download; 12 to 20 GB VRAM).
2. **One palette per era, one core across eras**:

   | Era | Palette |
   |---|---|
   | Classic | warm electric piano, marimba, brushed drums |
   | ChatGBT | the same core plus bright synth bells, a little faster |
   | Agents | arpeggiated synths, tighter drums, a hint of unease |
   | Consolidation | sparser, colder, corporate lounge |
   | Plateau | calm, back to the warm core |

   Aim for 2 to 3 beds per era, plus stingers (era arrival, launch, incident, award, win, game over) and a title theme.
3. **Cut**: pick the most consistent 8 to 16 bars with `loopify2.py`, then a human listens. A bad wrap gets redone with ACE-Step **repaint** on the last bar.
4. **Stems** for intensity layers (section 6): split the chosen take into 3 stems (bed: keys and pads; rhythm: drums and bass; top: lead and bells) with ACE-Step's extract feature, or with Demucs (MIT) if approved. All stems share the loop points.
5. **Master**: -18 LUFS integrated per full mix, stems at their natural relative level, true peak at or below -1.5 dBTP, 48 kHz.
6. **Encode**: Ogg Opus 64 to 80 kbps plus AAC `.m4a` 96 kbps for Safari older than 18.4 (choose with `canPlayType`).

### SFX

Kenney CC0 first, then freesound CC0 only. Trim, mono 48 kHz, peak -3 dBFS, OGG/Opus plus the m4a fallback. Keep a per-file license list in `public/audio/LICENSES.md`.

### Voice barks

4 to 6 voice types (for example bright, gruff, soft, nasal, deep, squeaky) × 6 emotions (happy, annoyed, tired, excited, questioning, laughing) × 2 to 3 takes, each 0.5 to 2 s. Mono 48 kHz, -20 LUFS, one Opus sprite per voice type at about 60 to 120 KB.

### What a human must judge by ear

- Whether generated music clears "charming, never cheap", and fatigue over 10+ minutes.
- Loop wraps.
- Whether the era palettes read as one soundtrack.
- The Kenney feel.
- Which bark engine sounds acted rather than read.
- Whether per-character pitch reads as personality.
- The final mix in the real game.

## 5. Listening queue

1. `music/pre_ai_steady_s2210_loop_x3.ogg` and `music/pre_ai_steady_s2220_loop_x3.ogg`, against the pick `music/classic_office_s2202_seamfix_loop_x3.ogg`: is the "steady" prompt more cohesive?
2. `voice2/qwen_*` against `voice2/cosy_*`: which sounds like acted Simlish, and does either keep one person recognizable across emotions?
3. `sfx/ui_set_kenney_audition.ogg`: is this the right UI feel?

## 6. Audio engine design (`src/audio`)

### Principles

- **Audio is a reader, like render and ui.** It consumes the same routed event stream (`route(events, state)` in `main.js`, after the pacer has released them) and reads state. It never mutates state and never dispatches.
- **No sounds in game code.** Sim events, UI actions and state conditions map to **cue ids** in a data manifest. UI keeps raising cue ids through the existing `hitl:sfx` window event, so ui needs no reference to audio.
- **Pure core, thin backend.** A deterministic `director` turns (events, state, clock, settings) into a list of commands. A small WebAudio `backend` executes them. The director runs in Node with no DOM, so audio is testable headless the same way `pacing.js` is.
- **Small first.** One file per concern, and the manifest carries everything tunable. New sounds are data edits.

### Layout

```
src/audio/
  audio.js       entry: createAudio({ quality, renderer }) -> { unlock, onEvents, update, cue, setBus, setMuted, setQuality }
  manifest.js    data: buses, cues, event and state rules, music per era, voice types
  director.js    pure: rules -> commands; voice limits, priorities, cooldowns, music state machine
  mixer.js       WebAudio graph: buses, ducking, master limiter
  music.js       stem player: loop points, bar-quantized crossfades, intensity layers
  voice.js       barks: voice from staff.voice, emotion pick, sync to say events
  loader.js      format choice, fetch and decode, lazy loading per era, streaming for Low
  spatial.js     screen-space pan and distance from the renderer's camera
  director.test.js
```

`audio.js` stays the entry because `main.js` globs `./audio/audio.js`.

### Wiring (integrator, in `main.js`)

```js
const audio = audioMod?.createAudio({ quality, renderer }) ?? null;
// route(): audio?.onEvents(events, state)           (state added)
// frame(): audio?.update(sim.state, dt, { speed, running, menuPause, decision: !!sim.state.pendingDecision, title: !playing })
// controls: setBus(bus, v), setMuted(m), setQuality(q) also forwards to audio
```

That is the whole footprint in the host: three calls. `update` is where state-driven music and ambience live.

### Manifest (data-driven cues)

```js
export const BUSES = {
  music:    { gain: 0.55, limit: 1 },
  ambience: { gain: 0.35, limit: 3 },
  sfx:      { gain: 0.8,  limit: 6 },
  ui:       { gain: 0.6,  limit: 4 },
  voice:    { gain: 0.85, limit: 2 },
};
export const DUCK = {               // target gain multiplier on the music bus, attack/release in s
  voice:    { music: 0.7,  attack: 0.08, release: 0.6 },
  decision: { music: 0.45, attack: 0.3,  release: 1.2 },
  stinger:  { music: 0.3,  attack: 0.05, release: 1.5 },
};
export const CUES = {
  'ui.click':      { bus: 'ui',  files: ['ui/click'],                 cooldown: 0.03 },
  'sfx.launch':    { bus: 'sfx', files: ['stingers/launch'],         priority: 9, duck: 'stinger' },
  'sfx.hire':      { bus: 'sfx', files: ['sfx/hire_a', 'sfx/hire_b'], priority: 5, cooldown: 1.5 },
  'sfx.incident':  { bus: 'sfx', files: ['sfx/alarm'],               priority: 8, cooldown: 4 },
  'sfx.caught':    { bus: 'sfx', files: ['sfx/save'],                priority: 6 },
  'sfx.bubble':    { bus: 'sfx', files: ['sfx/pop_1', 'sfx/pop_2'],  priority: 1, cooldown: 0.25, spatial: true, jitter: { pitch: 0.06, gain: 0.1 } },
  // ...
};
// Sim events -> cues. Every event type in the contract is listed; null means deliberately silent.
export const ON_EVENT = {
  launch: 'sfx.launch',
  hire: 'sfx.hire',
  incident: (e) => (e.caught ? 'sfx.caught' : 'sfx.incident'),
  resign: (e) => (e.fired ? 'sfx.fired' : 'sfx.resign'),
  bubble: 'sfx.bubble',
  say: 'voice.bark',
  chat: null,
  toast: (e) => ({ bad: 'sfx.bad', warn: 'sfx.warn' })[e.tone] ?? null,
  era: 'stinger.era',
  unlock: 'ui.unlock',
  goal: 'ui.goal',
  // ...
};
export const MUSIC = {
  title: { stems: ['title/full'], bpm: 90 },
  classic: { bpm: 96, beds: [{ stems: { bed: 'classic/a_bed', rhythm: 'classic/a_rhythm', top: 'classic/a_top' }, bars: 10 }] },
  // chatgbt, agents, consolidation, plateau
};
// State -> music intensity and ambience: pure functions of state, evaluated in update().
export const MOOD = [
  { when: (s) => s.lockdown,               music: { layers: ['bed'], lowpass: 1800 }, ambience: 'empty_office' },
  { when: (s) => s.outage,                 music: { layers: ['bed', 'rhythm'], stinger: 'tension' }, ambience: 'server_alarm' },
  { when: (s) => crunch(s) > 0.6,          music: { layers: ['bed', 'rhythm', 'top'] } },
  { when: () => true,                      music: { layers: ['bed', 'rhythm'] }, ambience: officeAmbience },
];
```

Rules are ordered; the first match wins. `crunch(s)` is a small pure helper (for example the share of staff at low stamina with active projects) kept in the manifest, next to the rule that uses it.

### Director (pure)

```js
createDirector(manifest, { rng }) -> {
  events(events, state, t) -> Command[]     // sim events at real time t
  cue(id, opts, t) -> Command[]             // ui cues
  update(state, t, ctx) -> Command[]        // music state machine, ambience, ducking
}
Command = { op: 'play', cue, file, bus, gain, rate, pan, at }
        | { op: 'music', era, bed, layers, at /* bar boundary */, fade }
        | { op: 'duck', key, on } | { op: 'filter', bus, lowpass } | { op: 'stop', bus }
```

- **Voice allocation.** Each bus has `limit` simultaneous voices. A new cue steals the lowest-priority, oldest voice only if its own priority is higher; otherwise it is dropped. Every cue has a `cooldown` (per cue, plus per staff for voice) so a burst of the same event plays once.
- **Batch collapse.** Within one `route` batch, same-cue events merge into one play (the existing "one sound per batch" rule, generalized).
- **Speed.** The pacer already spreads events over real time, so at 4x there are about 4x as many per real second. Cooldowns scale with `speed` for cues marked `scaleWithSpeed` (bubbles, pops, barks), and priority-1 cues are skipped entirely at 4x. Music is real time and never speeds up.
- **Determinism.** Variation (file choice, pitch jitter) uses the director's own seeded rng, never the sim's rng (audio must not perturb game state), and never `Math.random`. That makes the trace harness reproducible.

### Mixer

```
sources -> [spatial pan] -> bus gain (music | ambience | sfx | ui | voice)
        -> master gain -> DynamicsCompressor (gentle glue, -1 dBFS ceiling) -> destination
music bus -> lowpass BiquadFilter (pause and lockdown) -> duck gain -> bus gain
```

- **Ducking** is gain automation (`setTargetAtTime`) on a dedicated duck node. The voice bus ducks music only while a bark plays; decisions, era cards and stingers use deeper ducks.
- **Pause and menus** (`menuPause` or `decision`): the music lowpass drops to about 900 Hz and the level to -6 dB over 0.4 s. The sim-driven SFX stop because the pacer stops releasing them. UI cues still play.
- **Hidden tab**: suspend the AudioContext on `visibilitychange`, resume on return.

### Music engine

- **Beds of stems.** Each bed is 2 to 3 stems with identical length and loop points, started on the same `AudioContext` time with `AudioBufferSourceNode.loop = true` plus `loopStart`/`loopEnd`. That gives sample-accurate stem sync. Separate `<audio>` elements drift, so they can't be used for layers.
- **Intensity.** Layers fade in and out over 1 to 2 bars, quantized to the next bar boundary from the bed's BPM.
- **Era change.** On the `era` event: play the era stinger (music ducked), wait for the era card to close (`menuPause` false), then crossfade to the new era's bed over 2 bars. Beds rotate within an era every N loops (for example every 4 to 6 minutes) to fight fatigue.
- **Title and game over** have their own cues. Title music starts on the first unlock gesture.
- **Memory.** A decoded 25 s stereo 48 kHz stem is about 9.6 MB of float PCM. Keep only the current bed's stems decoded (about 29 MB at High), prefetch the next era's bed when `state.eraSchedule` says it is less than about 8 weeks away, and release the previous era after the crossfade.

### Spatial (optional, cheap)

- The renderer exposes one read-only query, for example `renderer.screenOf(kind, id) -> { x /* -1..1 */, depth /* 0..1 */, visible }` (a request for the art lane).
- Spatial cues (`spatial: true`: bubbles, desk sounds, pets, props) get a `StereoPannerNode` pan from `x`, and gain from zoom and depth (quieter off-screen or far). No `PannerNode` or HRTF: that costs too much for too little in an isometric diorama.
- At Low quality, spatial is off: everything plays centered, and no renderer queries are made.

### Voice barks

- **Voice identity** comes from the contract's `Staff.voice = { set, variant, pitch }`:
  - `set` and `variant` pick a voice type: a sprite of barks per emotion.
  - `pitch` (-1..1) maps to `playbackRate` 2^(±3/12); ±3 semitones keeps the voice natural.
  - Resampling pitch also changes duration, which is an acceptable character quirk.
- **Emotion** for a `say` event, in order:
  1. an explicit tone on the event, if the sim adds one (a proposed contract addition: optional `tone` on `say`),
  2. text cues: "?" gives questioning, "!" gives excited, "haha" or "lol" gives laughing,
  3. the speaker's state: `mood` burnout or low stamina gives tired, low meaning gives annoyed,
  4. otherwise a neutral or happy default.
- **Sync.** The bark starts when the pacer releases the `say` event, which is the moment the renderer shows the bubble. Bark length is picked to fit the text length, and never exceeds `BUBBLE_SECONDS`. The pacer already guarantees one bubble per speaker at a time; the voice bus limit (2) plus a per-speaker cooldown stops a busy HQ from sounding like a crowd.
- **Priority**: the camera-focused person, then lines addressed to someone (`toId`), then the rest. Barks from off-screen speakers are skipped when spatial is on.
- **Settings**: voices can be set to barks, blips (synth fallback, zero assets), or off.

### Assets and loading

```
public/audio/
  music/<era>/<bed>_<stem>.ogg|.m4a
  stingers/*.ogg|.m4a
  sfx/*.ogg|.m4a, ui/*.ogg|.m4a      (or two sprites with an offsets map)
  voice/<type>.ogg|.m4a              (one sprite per voice type; offsets in the manifest)
  LICENSES.md
```

A build step (`npm run audio`, with the script in `scripts/` owned by integrator) reads the masters from outside the repo, then:
- normalizes (music -18 LUFS, voice -20 LUFS, SFX peak -3 dBFS),
- encodes Opus plus m4a,
- writes `src/audio/assets.json` with the durations, loop points (in samples), and sprite offsets.

The manifest references the ids in that file, and a test fails on any missing file.

| Group | Load | Size budget (compressed) |
|---|---|---|
| UI and SFX | fetch and decode on the first unlock | under 400 KB |
| Title music | stream on unlock | under 1 MB |
| Current era bed (3 stems) | decode, lazily | about 0.8 MB per stem, 2.5 MB per bed |
| Next era | prefetch when close | the same |
| Voice sprites | decode on the first `say` | about 100 KB × 6 types |
| **Total shipped** | | **under 20 MB; first play under 4 MB** |

### Quality levels

| | High | Low (touch, low-end) |
|---|---|---|
| Music | stems with layers, decoded | one pre-mixed track per era, streamed through a `MediaElementAudioSourceNode` (no decode memory); intensity by filter only |
| Voice limit | 2 | 1, barks shortened or blips |
| SFX limit | 6 | 3; priority-1 cues off |
| Spatial | on | off |
| Ambience | on | off |

### Settings, unlock, persistence

- **Sliders**: master, music, effects (SFX plus UI), voices, and ambience; plus mute and the voice style. They live in the ui lane's `settings.js` (same localStorage record) and reach audio through `controls.setBus` and `controls.setMuted`.
- **Autoplay**: keep the current approach. Create or resume the AudioContext on the first `pointerdown` or `keydown` (the capture listener), and start title music then.
- **iOS** needs the context resumed inside the gesture handler, and a silent buffer played once.

### Headless test harness

- `director.test.js` (Vitest, Node):
  - every event type in the contract is present in `ON_EVENT`, even as `null`
  - every cue references an existing bus and asset id
  - per-bus limits and cooldowns hold for a synthetic burst
  - a fixed input gives the same commands
- `scripts/audio-trace.js`, like `scripts/pace.js`: plays the real sim through `createPacer` with the director and a fake clock at a chosen speed. It prints a cue timeline and the stats a human cares about:
  - cues per real minute per bus
  - peak concurrent voices
  - how many cues were dropped by limits or cooldowns
  - the longest stretch of silence with no SFX
  - music transitions: era, layers, ducks
  - checks against targets, for example voice-bus cues per minute under X at 4x, and the gap between an era change and the music crossfade

  It exits non-zero on a miss, like `pace.js --check`. The same trace can run on mock scenarios (`?mock=incident|hq`).
- **In the browser**: `window.__HITL.audio` exposes the last N commands for snapshot and playtest scripts.

### Lanes and contract asks

- **ui lane**: owns `src/audio`, so it builds all of the above.
- **integrator**: the three `main.js` calls, `controls.setBus` and `setMuted`, and `npm run audio`.
- **art**: `renderer.screenOf` (read-only).
- **Contract (lead)**, optional: a `tone` field on `say` events for bark emotion. Without it, the director infers emotion as described above.

Build order, each step shippable:
1. director plus mixer plus UI and SFX cues (replaces the placeholder beeps)
2. single-track music per era with crossfades and pause and decision ducking
3. voice barks
4. stems and intensity
5. spatial
6. the trace harness, which lands with step 1 and grows with each step

## Sources

- ACE-Step 1.5: https://github.com/ace-step/ACE-Step-1.5, https://huggingface.co/ACE-Step/Ace-Step1.5, arXiv 2602.00744
- HeartMuLa: https://github.com/HeartMuLa/heartlib
- Stable Audio 3 Small SFX: https://huggingface.co/stabilityai/stable-audio-3-small-sfx, license https://stability.ai/community-license-agreement
- TangoFlux license: https://github.com/declare-lab/TangoFlux/blob/main/LICENSE.md
- MMAudio weights: https://huggingface.co/hkchengrex/MMAudio
- Woosh: https://arxiv.org/html/2604.01929
- YuE, MusicGen, DiffRhythm: https://www.spheron.network/blog/deploy-open-source-ai-music-generation-gpu-cloud-2026/, https://boppy.me/blog/best-open-source-ai-music-models
- Qwen3-TTS VoiceDesign: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign
- Fun-CosyVoice3: model card in the local image (`license: apache-2.0`)
- Chatterbox: https://github.com/resemble-ai/chatterbox, https://huggingface.co/ResembleAI/chatterbox-turbo
- Dia: https://github.com/nari-labs/dia
- Higgs Audio v2 license: https://huggingface.co/bosonai/higgs-audio-v2-generation-3B-base/blob/main/LICENSE
- IndexTTS2: https://github.com/index-tts/index-tts
- Open TTS survey: https://www.bentoml.com/blog/exploring-the-world-of-open-source-text-to-speech-models
- Kenney: https://kenney.nl/assets/ui-audio, https://kenney.nl/assets/interface-sounds
- Safari Ogg support: https://caniuse.com/ogg-vorbis, https://www.testmuai.com/learning-hub/opus-audio-codec-browser-support/
