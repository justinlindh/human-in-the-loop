# Audio tools report: music, SFX, voice, and the audio engine

Research, samples, and a design. Nothing is wired into the game. Samples live in `/home/justin/src/audio-samples/`, and the scripts that made them live in `~/tools/audio/scripts/`.

## TL;DR

| Category | Recommendation | License (code / weights) | Status on this box |
|---|---|---|---|
| Music | **ACE-Step 1.5, repo tag v0.1.8, `acestep-v15-xl-sft` (4B DiT) plus the `acestep-5Hz-lm-4B` planner**, 60 steps, CFG 7, shift 3. Render many 90 s takes, cut the most consistent 10-bar window with a wrap search, master, and encode. Comparison model: HeartMuLa 3B | MIT / MIT; outputs usable commercially | Native install in `~/tools/audio/ace-step` on the 5090: about 22 s per 90 s take with the planner, 15 s without; XL-sft uses 12.1 GB VRAM |
| SFX | **Curated Kenney CC0 packs**, plus freesound CC0 only. Generation only for rare one-offs | CC0 | Two Kenney packs downloaded, 9-sound UI set made |
| Voice | **Simlish barks**: design each voice with Qwen3-TTS VoiceDesign; emotions from Qwen (design or clone) or CosyVoice3 anchored to that voice, whichever holds timbre better per variant. 2 sets (fem, masc) × 8 variants, 7 emotions, 0.5 to 1.8 s. Used rarely (section 6) | Qwen3-TTS Apache-2.0; CosyVoice3 Apache-2.0 | Cast audition rendered (`voice4/`); full banks after the user's veto |
| Engine | A small `src/audio` subsystem: a pure **director** (events and state in, commands out; testable headless like the pacer) and a thin WebAudio **backend** (buses, music stems, voices) | n/a | Designed in section 6 |

Licenses:
- **Clean**: ACE-Step 1.5 (code, XL checkpoints and LM all MIT), HeartMuLa 3B and HeartCodec (Apache-2.0), Qwen3-TTS, Fun-CosyVoice3, Chatterbox, Kenney, HeartMuLa, DiffRhythm, Dia.
- **Conditional**:
  - Stable Audio 3: Community License. Commercial use needs registration, it is free only under USD 1M revenue, and the license ends above that.
  - Higgs Audio v2: under 100k annual users.
  - Orpheus: built on Llama, so the Llama license applies.
- **Ruled out** (non-commercial weights): MusicGen/AudioGen, YuE and YuE2 (CC BY-NC 4.0; companies must ask), MMAudio, TangoFlux, Woosh, Fish Speech/OpenAudio.

## 1. What is on the machine

| Item | Found | Runs? |
|---|---|---|
| GPU | RTX 5090, 32 GB. Driver 615.71.09, CUDA 13.4. About 2.7 GB used at idle by the desktop | Yes |
| CPU / RAM / disk | Ryzen 9 9950X3D (16 cores, 32 threads), 123 GiB RAM, about 820 GB free on `/` | |
| Python / uv | Python 3.13 (`/opt/miniforge`, torch 2.11+cu128), uv 0.8.15 | yes |
| Audio CLIs | ffmpeg 9 (libopus, libvorbis, loudnorm, ebur128, rubberband, atempo), sox, lame | yes |
| Python audio libs (miniforge) | numpy, scipy, soundfile, librosa 0.11 | yes |
| Docker | nvidia runtime plus CDI, nvidia-container-toolkit 1.20.0 | Yes, after the CDI spec fix (see "Docker GPU") |
| Ollama | LLMs only | n/a |
| GPU lazy proxy | `gpu-lazy-proxy@{ace-step,comfyui,docling,qwen3-tts-clone}`: starts a backend on the first request, stops it after 10 idle minutes | yes |
| **ACE-Step 1.5, native** | `~/tools/audio/ace-step`: repo tag **v0.1.8** (commit dce6214, the latest tag), `uv sync`, torch 2.10.0+cu128. Checkpoints: `acestep-v15-xl-sft` and `acestep-v15-xl-base` (4B DiT), `acestep-v15-turbo`, `acestep-5Hz-lm-4B` and `lm-1.7B`, VAE, Qwen3-Embedding-0.6B (about 55 GB) | Yes, on the host GPU |
| ACE-Step 1.5, homelab | Image `ghcr.io/dotnetautor/ace-step-1.5-docker` (built from an early-2026 tree), volume `dockers_ace-step-checkpoints` (turbo DiT only), proxy :7860 to :7861. Left untouched | Yes, once the CDI fix is in. It lacks the XL checkpoints and the newer samplers |
| **HeartMuLa 3B** | `~/tools/audio/heartlib` (commit ba0a786), own uv venv (Python 3.11, torch 2.10.0+cu128). Checkpoints: HeartMuLa-oss-3B-happy-new-year, HeartCodec-oss-20260123 (21 GB) | Yes. `torchaudio.save` needs torchcodec, so `scripts/heartmula_gen.py` saves through soundfile |
| **Qwen3-TTS 1.7B** | HF cache: Base (cloning), CustomVoice, VoiceDesign. Host servers `~/qwen-tts-server.py` (proxy :8880) and `~/qwen-tts-clone-server.py` (proxy :8882, `POST /clone`) | Yes on the host GPU. Load it from the snapshot path; loading by repo id calls the HF API and fails offline |
| **Fun-CosyVoice3 0.5B** | Image `neosun/cosyvoice:v3.4.0` with its weights (7 GB) | CPU only (35 to 53 s per clip): the image's torch 2.3.1+cu121 has no sm_120 kernels. Needs `text_frontend=False` offline |
| Qwen3-ASR 1.7B (STT) | `hermes-stt` on :8771; `hermes-tts` on :8770 | Yes, GPU healthy after the CDI fix |
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

**Fix** (applied by the user):
1. `sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml`
2. Recreate the running GPU containers (hermes-tts, hermes-stt, immich_machine_learning).

**Keeping it fixed.** The uvm major can change on any reboot. `~/tools/audio/nvidia-cdi-refresh.service` is a root oneshot that runs `nvidia-modprobe -u` and then `nvidia-ctk cdi generate` before `docker.service`. Install instructions are in the file's header. It is not installed yet.

### Other blockers

- Installing new code needs the user's approval. Approved and installed: ACE-Step v0.1.8 and HeartMuLa. Not installed: Chatterbox.
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

#### Max quality: ACE-Step v0.1.8 XL-sft (`music_hq/`)

- **Settings**: `acestep-v15-xl-sft`, 60 steps (the recommendation is 50), CFG 7.0, shift 3.0, ODE Euler, DCW off (the UI default for SFT), 48 kHz WAV.
- **Planner**: `acestep-5Hz-lm-4B` with thinking on (it plans the audio codes; the caption, BPM and key are kept, no CoT rewrite), or off for the A/B.
- **Speed**: 20 to 24 s per 90 s take with the planner (15 s of that is diffusion), 14 to 24 s without. XL-sft peaks at 12.1 GB VRAM; with the planner the peak reads 26.8 GB, mostly vLLM's cache reservation. Model init: DiT 7 to 9 s, LM 43 s.

| File | Prompt, seed | Planner | Loop | Wrap dev / typical p95 |
|---|---|---|---|---|
| `music_hq/hq_steady_think_s2202_loop_x3.ogg` (+ `_full.ogg`) | steady, 2202 | 4B | 25.3 s from 55.0 s | 0.67 / 0.64 dB |
| `music_hq/hq_base_think_s2202_loop_x3.ogg` (+ `_full.ogg`) | s2202 caption, 2202 | 4B | 24.5 s from 33.1 s | 0.80 / 1.92 dB |
| `music_hq/hq_steady_think_s3101_loop_x3.ogg` (+ `_full.ogg`) | steady, 3101 | 4B | 25.1 s from 26.4 s | 0.56 / 1.00 dB |
| `music_hq/hq_steady_nolm_s2202_loop_x3.ogg` (+ `_full.ogg`) | steady, 2202 | none | 25.0 s from 55.8 s | 0.73 dB |

Eight planner takes and four no-planner takes are kept as `raw_hq_*.wav`.

#### Comparison model: HeartMuLa 3B (`music_hq/heartmula_*`)

- **Model**: HeartMuLa-oss-3B "happy-new-year" plus HeartCodec-oss-20260123, both Apache-2.0.
- **Settings**: topk 50, temperature 1.0, CFG 1.5 (the recommended defaults), bf16 MuLa, fp32 codec, 48 kHz stereo.
- **Speed**: 45 to 48 s per 90 s take, 25 GB peak VRAM.
- **Prompt**: the same brief as tags ("instrumental, electric piano, marimba, muted guitar, brushed drums, bass, cheerful, cozy, bouncy, retro video game, office, background music, 96 bpm"), with only `[Intro] [Inst] [Inst] [Inst] [Outro]` as lyrics.
- **No tempo control**: takes landed at about 104 to 122 BPM.
- **Files**: `heartmula_take1_full.ogg` and `heartmula_take1_loop_x3.ogg` (20.8 s loop, 0.75 / 2.0 dB), and `heartmula_take3_*` (23.1 s loop).

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

- **Round 3, voice sets** (`voice3/`), Qwen3-TTS 1.7B, the user's pick of engine. For each variant, one anchor voice is designed with VoiceDesign (`anchor_<variant>.wav`). Then per emotion, two methods:
  - **design**: VoiceDesign with the voice description plus an emotion description. 8 takes; keep the take in the 0.6 to 1.8 s window whose speaker embedding (Qwen3-TTS x-vector) is closest to the anchor.
  - **clone**: the Base model in ICL clone mode from the anchor. Emotion comes only from the text and its punctuation (clone mode takes no instruction). 4 takes.
  - Timbre similarity to the anchor is 0.94 to 0.98 for design and 0.97 to 0.98 for clone. 8.7 GB VRAM with both models loaded; about 9 to 15 s per design cell and 3 to 6 s per clone cell.
  - Batch 1 (3 variants × 4 emotions) has audition sheets `sheet_{design,clone}_{variant}.ogg`. The full sets (8 variants × 7 emotions, both methods) are in `voice3/full/`.
  - The user dropped the neutral set (it read as a young woman) and rejected the high fem_bright voice.
- **Round 4, cast audition** (`voice4/`, `scripts/voice_cast.py`): 8 fem and 8 masc variants, adult voices described by age, register and texture (see the list below). Every description says "natural adult speaking register, not a cartoon, not a child, not anime".
  - Per variant, the anchor is picked from up to 14 takes by median F0: window 150 to 215 Hz fem, 90 to 150 Hz masc. A calm anchor line ("Well, kolo mishi deeba lonnie, sho feshta...") gives lower pitch than an exclamatory one.
  - One happy bark per variant is picked from 10 takes by length, pitch, and timbre match (0.95 to 0.97).
  - Measured, the model leans high. Fem anchor takes mostly measure 280 to 480 Hz; masc takes from an exclamatory line measured 200 to 400 Hz.
  - `scripts/normpitch.py` applies a formant-preserving shift (rubberband, formant=preserved, capped at -5 semitones) to reach a happy-bark median of about 230 Hz fem and 150 Hz masc. Sheets: `audition_{fem,masc}_{raw,pitchnorm}.ogg`.
  - fem_warm A/B in `voice3/ab/`: the baseline (median 391 Hz), and -3 and -4 semitone formant-preserving shifts (355 and 309 Hz). The user keeps fem_warm as the baseline.
  - Group cheer: `voice4/group_cheer_demo.ogg` (`scripts/group_cheer.py`); the design is in section 6.

Cast (variant ids as used in the bank table):

| fem | masc |
|---|---|
| alto40: forties, low alto, slightly husky, matter-of-fact | warm: late twenties, mellow baritone |
| warm30: thirties, relaxed alto, kind coworker | gruff50: fifties, slightly raspy baritone, grumpy but lovable |
| crisp: late thirties, clear mezzo, brisk | nerdy: mid-twenties, light tenor, slightly nasal, fast |
| deadpan: late twenties, low, dry humour | crisp: thirties, articulate baritone, polished |
| breathy: early thirties, soft, slightly breathy low mezzo | laidback: thirties, relaxed, slightly breathy low tenor |
| raspy50: fifties, raspy contralto, wry | deadpan: forties, flat low-key baritone |
| nasal: thirties, slightly nasal mezzo, chatty | sixty: around sixty, warm, slightly weathered |
| sixty: around sixty, weathered alto | raspy: thirties, raspy energetic tenor |

Gibberish lines (rounds 1 and 2 used the longer versions):

| Emotion | Line |
|---|---|
| happy | "Ooh, bibbala!" |
| annoyed | "Ugh, nargo blok!" |
| tired | "Mmh... sheloo..." |
| questioning | "Hm? Deeba sho?" |
| excited | "Wah! Zippa zoo!" |
| laughing | "Ha ha! Toomi ha!" |
| sighing | "Haah... dorra mah." |

These are invented, not the Sims' real Simlish lexicon.

## 4. Recommended stack and pipeline

### Music

**Locked recipe** (`~/tools/audio/scripts/music_recipe.py`, which records the captions, BPM, keys and seeds per cue):
- ACE-Step v0.1.8 (commit dce6214), `acestep-v15-xl-sft` plus the `acestep-5Hz-lm-4B` planner.
- 60 steps, CFG 7.0, shift 3.0, ODE Euler, DCW off, 48 kHz, 90 s takes, 6 or more seeds per cue.
- Cut with `loopify2.py` (8 to 16 bars, wrap search plus a consistency score), master to -18 LUFS with TP -1.5, then a human picks.

**Per-era plan.** The shared core in every cue is warm electric piano, marimba and round bass, plus the same steady, loopable arrangement language. Each era adds one twist.

| Era | Tempo, key | Twist | Beds | Demo bed |
|---|---|---|---|---|
| Classic (2019) | 96, F major | soft muted guitar, light brushed drums; cozy and bouncy | 3: day, busy (plus rhythm stem), late (sparser) | `music_hq/hq_steady_think_s2202` |
| ChatGBT | 102, Bb major | sparkling synth bells, plucky synth arp, crisp shaker; optimistic, a little giddy | 2 to 3 | `music_eras/chatgbt_s5104` |
| Agents | 108, D minor | pulsing analog arps, tight electronic drums; driven, a hint of unease | 2 to 3 | `music_eras/agents_s6105` |
| Consolidation | 90, A minor | muted core, vibraphone, soft brushes; cool corporate lounge | 2 | `music_eras/consolidation_s7105` |
| Plateau | 84, Eb major | soft warm pads, lazy groove; calm, settled, back to the warm core | 2 | `music_eras/plateau_s8102` |

Beds within an era share tempo and key, so the intensity layers and bed rotation (section 6) crossfade cleanly.

**Stingers.** Each is rendered as a short cue (8 to 12 s) and trimmed to its first phrase, in the current era's key and palette, so it lands in tune over the bed:

| Stinger | Length | Brief |
|---|---|---|
| Era arrival | 4 to 6 s | a rising fanfare in the new era's palette; bridges into the new bed |
| Launch | 3 to 4 s | a bright, triumphant flourish; layered under the group cheer |
| Incident | 2 to 3 s | a tense, dissonant pulse; the music ducks and then drops to the bed layer |
| Waffle Party | 8 to 10 s | a festive, silly swing loop, played while the party is staged; carries the group cheer |
| Win and game over | 6 to 10 s | resolved major and wistful minor versions of the Classic theme |
| Title | loop | the Classic core at 90 bpm |

Stems for intensity layers come from ACE-Step's extract task (or Demucs if approved). All stems share the loop points.

**Master** at -18 LUFS integrated (stems at their natural relative level) and TP -1.5 dBTP. **Encode** as Ogg Opus 64 to 80 kbps plus AAC `.m4a` 96 kbps for Safari older than 18.4.

### SFX

Kenney CC0 first, then freesound CC0 only. Trim, mono 48 kHz, peak -3 dBFS, OGG/Opus plus the m4a fallback. Keep a per-file license list in `public/audio/LICENSES.md`.

### Voice barks

- **Cast**: 2 sets (fem, masc) × 8 variants. Each variant has one anchor voice designed with Qwen3-TTS VoiceDesign, picked by measured median F0.
- **Emotions**: happy, annoyed, tired, questioning, excited, laughing, sighing. They come from Qwen (VoiceDesign with a timbre match to the anchor, or Base clone) or from CosyVoice3 anchored to the same voice; per variant, whichever holds timbre steadier. Formant-preserving normalization is applied where the register runs high (`normpitch.py`).
- **Fewer, better**: barks are rare in play (section 6), so each bank holds 7 emotions × 2 takes, 0.5 to 1.8 s each. That is about 20 s of audio per bank, about 80 KB at 32 kbps mono Opus, and about 1.3 MB for all 16.
- **Master**: trim, mono 48 kHz, -20 LUFS, limiter -2 dBFS.
- **Scripts**: `voice_cast.py` renders anchors and barks per variant and emotion, `normpitch.py` normalizes pitch, `bark_master.sh` masters, `group_cheer.py` prototypes the cheer mix.

### What a human must judge by ear

- Whether generated music clears "charming, never cheap", and fatigue over 10+ minutes.
- Loop wraps.
- Whether the era palettes read as one soundtrack.
- The Kenney feel.
- Which bark engine sounds acted rather than read.
- Whether per-character pitch reads as personality.
- The final mix in the real game.

## 5. Listening queue

1. **Cast veto.** `voice4/audition_{fem,masc}_raw.ogg` against `_pitchnorm.ogg`: which voices stay, and raw or normalized?
2. **Group cheer.** `voice4/group_cheer_demo.ogg`.
3. **Era beds.** `music_eras/{chatgbt_s5104,agents_s6105,consolidation_s7105,plateau_s8102}_loop_x3.ogg` and their `_full.ogg`: does each era read as the same game with its own twist?
4. **fem_warm A/B.** `voice3/ab/`.
5. **UI feel.** `sfx/ui_set_kenney_audition.ogg`.

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
  voice:    { gain: 0.85, limit: 6 },   // 6 only for a group cheer; single barks are budgeted in VOICE_RULES
};
export const DUCK = {               // target gain multiplier on the music bus, attack/release in s
  voice:    { music: 0.7,  attack: 0.08, release: 0.6 },
  cheer:    { music: 0.35, attack: 0.05, release: 1.5 },
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
  say: null,                         // speech bubbles never bark; see VOICE_RULES
  incentive: (e) => (e.reward === 'waffle_party' ? 'stinger.waffle' : 'sfx.reward'),
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

Barks are rare, and less is more. They are never tied to speech bubbles or Slackk lines (`say` and `chat` map to no voice).

- **Bank.** `Staff.voice = { set: 'fem'|'masc', variant, pitch: -1..1 }` picks the bank: `${set}_${VOICE_VARIANTS[set][variant % n]}`, for example `fem_warm30`.
  - `VOICE_VARIANTS` in the manifest lists the recorded variants per set (8 each), so adding one is a data edit.
  - Each bank is one sprite holding 7 emotions × 2 takes. The manifest maps `{ bank: { emotion: [[offset, duration], ...] } }`.
- **Per-person pitch.** `pitch` maps to `playbackRate = 2 ** (pitch * 2 / 12)`, about ±2 semitones, so two people on the same bank never sound identical. Each bark adds ±0.3 semitones of jitter from the director's seeded rng.
- **Triggers** (`VOICE_RULES` in the manifest). Each rule gives who speaks and the emotion:

| Trigger | Source | Who | Emotion | Plays |
|---|---|---|---|---|
| Player clicks a character | UI cue `voice.poke` with `staffId` (raised when the renderer's pick returns a person) | that person | from their state: burnout or strain gives tired or sighing; low meaning gives annoyed; otherwise happy or questioning | always; per-person cooldown of 1.5 s so a click spree doesn't stack |
| Launch | `launch` | group cheer of those present | excited or laughing | always |
| Incident not caught | `incident` with `caught: false` | 1 to 2 people nearest the product owner | annoyed or sighing | always; a caught incident gets one happy bark from the catcher |
| Era arrival | `era` | group, 2 to 3 people | questioning, then excited | after the era card closes |
| Waffle Party | `incentive` with `reward: 'waffle_party'` | group cheer, led by the rewarded person | laughing or happy | always |
| Burnout | a staff `mood` change to `burnout` (the director keeps last week's moods) | that person | tired, then sighing | once per episode |
| Quitting | `resign` with `fired: false` | the leaver | sighing | always |
| Hire's first day | `hire` | the new person | happy | once |
| Ambient | none (a timer in `update`) | a random present person on screen | from their state | only if the global voice budget allows |

- **Global budget.** The director tracks the last voice time.
  - An ambient bark needs at least 30 s since the last bark of any kind, and a random draw spread over 30 to 60 s. It skips while a decision, menu or card is open (`menuPause` or `decision`), while speed is 0, and during lockdown when the office is empty.
  - Trigger barks ignore the ambient timer but still respect a 2 s global gap between separate moments.
  - A tone on `say` (in the contract) is available if a future rule wants it.
- **Group cheer** (launch, Waffle Party, era arrival):
  - Up to 6 people present in the office, chosen by closeness to the camera focus and then at random. Each uses their own bank and pitch.
  - Onsets are staggered 50 to 250 ms apart, with ±0.5 semitone jitter and 0 to -4 dB gain spread per voice.
  - Under them, a light crowd bed: a small prerendered murmur and cheer loop from the cast, low-passed, playing on the ambience bus and fading around the cheer.
  - The music bus uses the `cheer` duck (-9 dB, 50 ms attack, 1.5 s release after the last voice).
  - At Low quality the cheer drops to 2 voices plus the crowd bed.
  - Prototype: `~/tools/audio/scripts/group_cheer.py`; demo: `voice4/group_cheer_demo.ogg`.
- **Settings**: voices on or off (a slider on the voice bus).

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
| Voice sprites | decode the banks of present staff at load; others on first use | about 80 KB per bank at 32 kbps mono Opus (7 emotions × 2 takes); 16 banks about 1.3 MB; crowd bed about 60 KB |
| **Total shipped** | | **under 20 MB; first play under 4 MB** |

### Quality levels

| | High | Low (touch, low-end) |
|---|---|---|
| Music | stems with layers, decoded | one pre-mixed track per era, streamed through a `MediaElementAudioSourceNode` (no decode memory); intensity by filter only |
| Voice | cheer up to 6 voices | cheer 2 voices plus the crowd bed |
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
