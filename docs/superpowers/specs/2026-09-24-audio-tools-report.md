# Audio tools report: music, SFX, voice

Research and a recommendation. Nothing is wired into the game. Samples live in `/home/justin/src/audio-samples/`, and the scripts that made them live in `~/tools/audio/scripts/`.

## TL;DR

| Category | Recommendation | License (code / weights) | Status on this box |
|---|---|---|---|
| Music | **ACE-Step 1.5** (turbo, then try XL-sft), instrumental, curated by ear, then loop-cut, normalized, and encoded by script | MIT / MIT; outputs usable commercially | Installed (Docker image + 17 GB of checkpoints). Samples made on CPU because Docker GPU is broken (see Blockers) |
| SFX | **Curated Kenney CC0 packs** as the base, topped up with freesound CC0 only. Generation is optional, for a few odd one-offs | CC0 | Two Kenney packs downloaded, 9-sound UI set made |
| Voice | **Syllable-bank babble**: a small bank of spoken syllables from **Qwen3-TTS VoiceDesign**, pitched and sped per character at runtime (Animal Crossing style). A pure-synth blip is the fallback | Apache-2.0 / Apache-2.0 | Installed and runs on the 5090: 4.3 GB VRAM, about 2 s per line |

Rejected on license: MusicGen and AudioGen (weights CC-BY-NC), YuE (weights CC-BY-NC 4.0), MMAudio (CC-BY-NC 4.0), TangoFlux (non-commercial research), Woosh (non-commercial). Allowed with conditions: Stable Audio 3 Small SFX (Stability Community License: free under USD 1M annual revenue, commercial use needs registration, and the license ends above the threshold). Clean: ACE-Step 1.5, HeartMuLa (Apache-2.0, but it is built for songs with lyrics), DiffRhythm (Apache-2.0), Qwen3-TTS (Apache-2.0), Kenney (CC0).

## 1. What is on the machine

| Item | Found | Runs? |
|---|---|---|
| GPU | RTX 5090, 32 GB. Driver 615.71.09, CUDA 13.4 (nvcc 13.4.92). About 2.7 GB used at idle by the desktop | Yes on the host (torch 2.11.0+cu128 in `/opt/miniforge` sees it) |
| CPU / RAM / disk | Ryzen 9 9950X3D (16 cores, 32 threads), 123 GiB RAM, 823 GB free on `/` | |
| Python / uv | Python 3.13.13 (`/opt/miniforge`), uv 0.8.15 | yes |
| Audio CLIs | ffmpeg n9.0.2 (libopus, libvorbis, loudnorm, ebur128, rubberband, atempo), sox, lame. No `oggenc` or `opusenc`, but ffmpeg covers both | yes |
| Python audio libs (miniforge) | numpy 2.4.3, scipy 1.17.1, soundfile, librosa 0.11.0. No pyloudnorm (ffmpeg ebur128 used instead) | yes |
| Docker | Yes, with nvidia runtime and CDI, nvidia-container-toolkit 1.20.0 | **GPU broken in containers**, see Blockers |
| Ollama | Yes, LLMs only (qwen3.x, gemma3, glm, gpt-oss). No audio models | n/a |
| GPU lazy proxy | `~/gpu-lazy-proxy` plus systemd `gpu-lazy-proxy@{ace-step,comfyui,docling,qwen3-tts-clone}` (there is also a `qwen3-tts.json` config, but no running proxy for it). Each one starts its backend on the first request and stops it after 10 idle minutes | yes |
| **ACE-Step 1.5** (music) | Docker image `ghcr.io/dotnetautor/ace-step-1.5-docker` (8.65 GB). Volume `dockers_ace-step-checkpoints` holds `acestep-v15-turbo` (4.5 GB), `acestep-5Hz-lm-1.7B` (3.5 GB), `acestep-5Hz-lm-4B` (7.8 GB), a VAE, and Qwen3-Embedding-0.6B. Proxy on :7860 goes to :7861 | On the GPU: **no** (CUDA init fails in the container). On CPU: **yes**, 57 to 97 s per 30 to 34 s clip |
| **Qwen3-TTS 1.7B** (TTS, voice design, cloning) | HF cache: `-Base` (cloning), `-CustomVoice` (preset speakers), `-VoiceDesign` (voice from a text description). Host servers: `~/qwen-tts-server.py` (:8881, proxy :8880) and `~/qwen-tts-clone-server.py` (:8883, proxy :8882, POST `/clone`) | **Yes** on the host GPU. Load the model from the snapshot path: loading by repo id calls the HF API and fails offline |
| Qwen3-ASR 1.7B (STT) | `hermes-stt` container on :8771 | The container is up, but torch in it reports `cuda.is_available() == False` (same Docker bug) |
| hermes-tts | Container on :8770 (Qwen3-TTS CustomVoice, speaker Ryan) | Same Docker GPU bug |
| Fish Speech / OpenAudio S1-mini | Images `fishaudio/fish-speech:server-cuda` and `v1.5.1`; weights `fish-speech-1.5` and `openaudio-s1-mini` in the HF cache | Not tested. Weights are CC-BY-NC-SA, so not for shipping anyway |
| Kokoro | Image `kokoro-fastapi-cpu` | Not tested. Apache-2.0, but preset voices only |
| Voice-clone tooling | `~/src/digits-voice-clone` (release-note audio via the clone server, `release-audio.service`) | Uses the host Qwen3-TTS path |
| ComfyUI | `frefrik/comfyui-flux` container (image generation), proxy :8188 | Not relevant here |
| sesame-csm, whisper-asr | Compose directories under `~/src/dockers` only | Not deployed |
| NVIDIA BigVGAN v2 44k | In the HF cache | Unused vocoder |

The wiki (`~/.openwiki/wiki/topics/docker-stack.md`) only lists these services as "in progress". It has no notes on audio tooling.

### Blockers

1. **Docker GPU is broken for every CUDA container.** `/etc/cdi/nvidia.yaml` (generated before the last reboot) gives `/dev/nvidia-uvm` **major 510**, but the running kernel registered **509** (`/proc/devices`). The containers get a dead device node, so `torch.cuda` hits "CUDA unknown error". This also breaks hermes-tts and hermes-stt. The fix needs sudo:
   ```
   sudo nvidia-ctk cdi generate --output=/etc/cdi/nvidia.yaml
   docker restart hermes-tts hermes-stt   # and anything else on the GPU
   ```
   The uvm major can change on any reboot. Regenerating the spec from a boot-time unit, or an `nvidia-ctk` hook, keeps it in sync.
2. **The permission classifier blocked cloning ACE-Step from GitHub** into a native uv environment under `~/tools/audio`, because it is external code. So all music samples came from the existing Docker image on CPU. For native GPU runs (and to try XL), the user should approve cloning `https://github.com/ace-step/ACE-Step-1.5` plus `uv sync`. The alternative is fix 1, then run the existing container on the GPU.
3. **Stable Audio 3 Small SFX is gated** on Hugging Face. Someone has to accept the license on an HF account before it can be downloaded. It was not tried.

## 2. Survey and licenses

### (a) Music generation, local on a 5090

| Model | Quality and control | Loopability | Code / weights license | Verdict |
|---|---|---|---|---|
| **ACE-Step 1.5** (Jan 2026; XL 4B DiT added Apr 2026) | Close to Suno v4.5 on the authors' benchmarks. Instrumental mode; caption plus BPM, key, time signature, and duration. Repaint (regenerate a time range), extend, cover, reference audio, and LoRA fine-tuning | Supports "loop" completion and repaint. You can repaint the seam region, and BPM control makes bar math exact | **MIT / MIT** (checked in the local checkpoint READMEs, `license: mit`). The model card says outputs can be used commercially. Trained on licensed, royalty-free, and synthetic data | **Pick** |
| HeartMuLa 3B (Jan to Feb 2026) | Strong on songs with lyrics | Nothing built for loops; instrumental-only use isn't documented | Apache-2.0 / Apache-2.0 | Legal, but a poor fit for BGM |
| Stable Audio 3 Small or Medium (May 2026) | Instrumental and SFX. The cleanest training-data story (AudioSparx plus Freesound) | Variable length | Stability Community License: register for commercial use; free under USD 1M revenue; the license ends above that, and it doesn't say what happens to outputs made before | Workable backup. The revenue clause is a real risk if the game sells well |
| DiffRhythm | Songs, fast | Weak | Apache-2.0 | Not needed |
| YuE / YuE2 | Songs with vocals | Weak | Apache code / **CC-BY-NC 4.0 weights** | **Ruled out** |
| MusicGen (Meta) | Dated | Weak | MIT code / **CC-BY-NC weights** | **Ruled out** |
| CC0 music libraries | Very uneven. Good CC0 chiptune and lounge music exists, but no single consistent voice across 5 eras | Human-made loops are often clean | CC0 | A fallback, not a plan |

### (b) Sound effects: generation vs curated CC0

- **Kenney packs (CC0)**: UI Audio (50 files) and Interface Sounds (100 files: click, select, open and close, confirmation, error, tick, glitch, and more). They are cohesive because one person made them. The "glitch", "error" and "scratch" sets suit the AI-era jokes. Kenney also has Impact, RPG, Casino (coin and cash sounds) and Digital packs, all CC0.
- **freesound.org**: use it only with the license filter set to CC0. CC-BY is legal but brings an attribution log per file. The quality varies, so every pick needs a listen.
- **Generation**: Stable Audio 3 Small SFX is the only current open-weight SFX model you can use commercially (Community License, gated, same revenue clause). TangoFlux, MMAudio and Woosh are all non-commercial. Generated SFX also drift in timbre, which works against "one consistent feel".
- Verdict: **curate**. Use generation only for the odd one-off no pack has (an office printer jam, a server-room hum), and loudness-match it to the Kenney set.

### (c) Voice blips

| Approach | Pros | Cons | License |
|---|---|---|---|
| **Syllable bank from Qwen3-TTS VoiceDesign, played at runtime with per-character pitch and rate** | Sounds like a mouth (Animal Crossing style). One small bank (about 12 to 20 syllables, under 100 KB) serves every character through `playbackRate`. Deterministic per character | Automatic slicing of TTS output is messy (see samples); the bank needs a few minutes of manual trimming | Apache-2.0 / Apache-2.0 |
| Pure synth blips (WebAudio oscillators with a formant tone) | Zero assets. Works on low-end devices. Very Kairosoft | Can sound like the current placeholder beeps if not tuned carefully | n/a |
| Full TTS lines per character | Characterful | Wrong for this game: thousands of generated chat lines, large downloads, and it clashes with the Kairosoft feel | Apache-2.0 |
| Voice cloning (Qwen3-TTS Base) | Could clone a team member's voice for a cameo | The consent and likeness rules get complicated; not needed | Apache-2.0 |
| Fish Speech / OpenAudio S1 | Good quality | **CC-BY-NC-SA weights: ruled out** for shipping | NC |

## 3. Samples made (objective numbers)

All samples are under `/home/justin/src/audio-samples/`.

### Music: ACE-Step 1.5 turbo, 8 steps, DiT only (no LM planner), **on CPU** (32 threads)

Prompt (Classic era): "cheerful cozy office management game background music, instrumental, warm electric piano, marimba, soft muted guitar, light brushed drums, round bass, gentle and bouncy, retro 90s video game soundtrack feel, clean mix, loopable, no vocals", 96 BPM, F major, 4/4.

The loops were made by `loopify.py`: beat-track, start at the first beat after 1.5 s, cut a whole number of beats, crossfade 2 beats of the tail over the head (equal power), normalize to -18 LUFS with true peak under -1.5 dBTP, then encode OGG Vorbis q4 and Opus 96k. The `_loop_x3.ogg` files play the loop three times, so the seam is heard twice.

| File | Gen time | Loop | LUFS raw to out | TP out | Seam level jump | Seam flux vs a typical beat | OGG / Opus |
|---|---|---|---|---|---|---|---|
| `music/classic_office_s1101_loop_x3.ogg` | 57 s for 30 s (on CPU) (diffusion 37 s, 4.6 s/step) | 15.2 s, 24 beats | -16.9 to -18.0 | -1.8 dBTP | -0.5 dB | 0.83 (clean) | 183 / 208 KB |
| `music/classic_office_s2202_loop_x3.ogg` | 87 s for 34 s | 25.3 s, 40 beats | -12.2 to -18.0 | -5.5 dBTP | **+5.3 dB (likely audible)** | 1.42 | 356 / 371 KB |
| `music/classic_office_s3303_loop_x3.ogg` | 97 s for 34 s | 15.3 s (tracker read 187.5 BPM, double time) | -12.4 to -18.0 | -5.5 dBTP | +1.0 dB | 0.34 (clean) | 211 / 225 KB |
| `music/classic_office_s4404_loop_x3.ogg` | 76 s for 34 s | 15.0 s, starting at 11.0 s (no beats detected before that) | -10.5 to -18.0 | -7.1 dBTP | **+14.6 dB (bad cut)** | 3.76 (bad) | 229 / 222 KB |
| `music/agents_era_s5505_loop_x3.ogg` (Agents-era contrast: "sleek futuristic office... pulsing analog synth arpeggios, glassy bells, tight electronic drums, deep sub bass, focused and slightly uneasy", 110 BPM, A minor) | 86 s for 34 s | 26.2 s, 48 beats | -12.1 to -18.0 | -4.0 dBTP | +0.4 dB | 1.57 | 352 / 402 KB |

Of the five automatic cuts, two are clean (s1101, s3303), two are borderline (s2202 has a level jump; s5505 has a spike in onset strength at the seam), and one is bad (s4404). So automatic loop cutting has to be checked by a human, and a bad seam is fixed with ACE-Step repaint rather than thrown away. VRAM on the 5090 could not be measured because Docker GPU is broken. The docs say turbo needs 4 to 6 GB and XL needs 12 to 20 GB, and the authors report under 10 s per full song on a 3090. Expect about 1 to 3 s per 30 s clip on the 5090, so a 100-candidate curation batch takes minutes.

The raw clips (`raw_*.wav`, 48 kHz stereo) are kept next to the loops.

### SFX: Kenney CC0 curated set

`sfx/ui_set_kenney_audition.ogg` (7.3 s, -20.1 LUFS for the whole sheet). Order: click, button, select, toggle, open, close, tick, confirm, error. Each sound is trimmed at the start, made mono 48 kHz, peak-normalized to -3 dBFS, and encoded as OGG Vorbis (3 to 7 KB each). The files are in `sfx/kenney/ui_*.ogg`. Integrated LUFS is meaningless for sounds under 400 ms (they read -70), so peak matching is the right tool for UI ticks. The sources are `click_002`, `click3`, `select_001`, `switch2`, `maximize_006`, `minimize_006`, `tick_002`, `confirmation_002`, `error_004` from the Interface Sounds and UI Audio packs.

### Voice: Qwen3-TTS 1.7B VoiceDesign on the 5090 (host, bf16, sdpa)

Model load 1.4 s (warm cache). Peak VRAM **4.3 GB**. Generation is **2.3 to 3.7 s per 3.4 s line**, faster than real time after the first call. Output is 24 kHz mono.

| File | What | Duration | LUFS |
|---|---|---|---|
| `voice/tts_founder.wav`, `tts_engineer.wav`, `tts_intern.wav` | Three voices designed from text descriptions, each saying one line | 3.4 to 3.5 s | -16.5 to -22.9 (not normalized; spoken lines vary) |
| `voice/syllable_bank_raw.wav` | Twelve nonsense syllables spoken by one designed voice | 8.2 s | -24.2 |
| `voice/syllables/syl_*.wav` | Automatic slices: 8 usable, 90 to 677 ms. Several are merged pairs, so this is where a human trims | | |
| `voice/babble_syllables_{founder,engineer,intern}.wav` | 14 random syllables, each capped at 160 ms, pitch +3, -4, or +7 semitones and rate 1.6, 1.3, or 1.8 | 1.4 to 2.2 s | about -17.5 |
| `voice/babble_synth_{founder,engineer,intern}.wav` | Pure synth blips at 520, 260, and 780 Hz | 1.26 s | -14.5 to -15.5 |

## 4. Recommended stack and pipeline

### Music

1. **Generate**: ACE-Step 1.5 on the GPU. Start with turbo for wide exploration (batches of 8 to 16 seeds per prompt), then run the best prompts through `acestep-v15-xl-sft` (needs a download; 12 to 20 GB VRAM) for final quality. Generate at 90 to 120 s, not 30 s: a 15 s loop would be grating over the hour-long Classic era.
2. **Per era, one palette.** Keep one instrument core and change the flavor per era, so the arc feels like one game:
   - Classic 2019: warm electric piano, marimba, brushed drums
   - ChatGBT: the same core plus bright synth bells, a little faster
   - Agents: arpeggiated synths, tighter drums, a hint of unease
   - Consolidation: sparser, colder, with a corporate lounge feel
   - Plateau: calm and reflective, back to the warm core
   Aim for 2 to 3 BGM tracks per era, plus short stingers: era arrival, launch, incident, award, game over, and win.
3. **Curate by ear** (a human). Keep perhaps 1 in 10.
4. **Fix the seam**: beat-aligned cut plus crossfade (`loopify.py`, give it the known BPM). If the seam still bumps, ACE-Step **repaint** can regenerate the last bar so it runs into the first bar.
5. **Master**: -18 LUFS integrated for BGM (UI SFX peak at -3 dBFS and sit above it), true peak at or below -1.5 dBTP, 48 kHz stereo.
6. **Encode**: Ogg Opus at 64 to 80 kbps stereo as the main format, with an AAC `.m4a` at 96 kbps as a fallback for Safari older than 18.4 (pick with `canPlayType`).
7. **Playback**: stream music through an `<audio>` element with `MediaElementAudioSourceNode`, not `decodeAudioData`. A decoded 90 s stereo track is about 35 MB of float PCM. Lazy-load per era.
8. **Size budget**: 5 eras × 3 tracks × about 100 s at 72 kbps is about 13 MB, plus stingers of about 1 MB. Music should stay under 15 MB, loaded lazily per era, so the first download holds only the Classic tracks (about 3 MB).

### SFX

Kenney CC0 as the base (Interface Sounds, UI Audio, Casino for money, Impact, Digital), plus freesound CC0 only, plus at most a handful of generated one-offs if the Stable Audio 3 license is accepted. Trim, mono, 48 kHz, peak -3 dBFS, then a per-category gain table in code (UI quiet; alarms and launches louder). Encode as OGG Vorbis or Opus (a `.m4a` fallback is needed for the same Safari reason). These files are small enough to preload and `decodeAudioData` at boot: 40 sounds at about 5 KB each is about 200 KB. Keep a `CREDITS` or `LICENSES` list per file even for CC0.

### Voice blips

Make one syllable bank with Qwen3-TTS VoiceDesign (a neutral, cute voice, 16 to 24 syllables, trimmed by hand to 60 to 150 ms each), mono 48 kHz, peak -6 dBFS, one Opus or OGG sprite of about 50 to 100 KB. At runtime, each character gets a seeded pitch (`playbackRate` from 0.8 to 1.6), a speed, and a timbre choice (two or three banks at most). Speech bubbles play one syllable per 2 to 3 characters of text, capped at about 1.5 s per bubble, with a global rate limit so a busy office doesn't turn into a choir. The synth blip is the Low-quality fallback and the "mute voices" setting.

### What a human must judge by ear

- Whether any ACE-Step output clears the "charming, never cheap" bar at all. This is the go/no-go for generated music.
- Loop seams, fatigue over 10+ minutes, and whether the era palettes feel like one soundtrack.
- Whether the Kenney set feels consistent with the chunky Kairosoft UI.
- Syllable babble vs synth blips, and whether per-character pitch reads as personality or as noise.
- Mix balance of music vs SFX vs blips in the real game.

## 5. First listening test (5 samples, about 3 minutes total)

1. `music/classic_office_s1101_loop_x3.ogg`: can generated music clear the bar? Listen for the seam at 15 s and 30 s.
2. `music/classic_office_s3303_loop_x3.ogg` and `music/classic_office_s2202_loop_x3.ogg`: seed-to-seed range for the same prompt. Which is closest to the game?
3. `music/agents_era_s5505_loop_x3.ogg`: does an era shift read as the same game?
4. `sfx/ui_set_kenney_audition.ogg`: is this the right UI feel?
5. `voice/babble_syllables_intern.wav` against `voice/babble_synth_intern.wav`, then the founder and engineer pairs: which blip style?

Decision after the test: if (1) to (3) fail, drop generated music and look at commissioning or buying a small licensed pack instead. If they pass, fix Docker GPU, run the XL-sft pass, and build the era soundtracks.

## Sources

- ACE-Step 1.5: https://github.com/ace-step/ACE-Step-1.5, https://huggingface.co/ACE-Step/Ace-Step1.5, arXiv 2602.00744
- HeartMuLa: https://github.com/HeartMuLa/heartlib
- Stable Audio 3 Small SFX: https://huggingface.co/stabilityai/stable-audio-3-small-sfx, license https://stability.ai/community-license-agreement
- TangoFlux license: https://github.com/declare-lab/TangoFlux/blob/main/LICENSE.md
- MMAudio weights: https://huggingface.co/hkchengrex/MMAudio
- Woosh: https://arxiv.org/html/2604.01929
- YuE, MusicGen, DiffRhythm licenses: https://www.spheron.network/blog/deploy-open-source-ai-music-generation-gpu-cloud-2026/, https://boppy.me/blog/best-open-source-ai-music-models
- Qwen3-TTS VoiceDesign: https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign
- Kenney: https://kenney.nl/assets/ui-audio, https://kenney.nl/assets/interface-sounds
- Safari Ogg support: https://caniuse.com/ogg-vorbis, https://www.testmuai.com/learning-hub/opus-audio-codec-browser-support/
