# Audio licences and provenance

Every file under `public/audio/` is listed here. Files marked *candidate* are for review and may be replaced.

Lossless FLAC masters of every shipped file, with a manifest of checksums and sources, are attached to the `audio-masters-1` pre-release on GitHub. Re-encode from those rather than from the lossy files here.

## Music (candidate beds)

Seeds are listed to identify each take. ACE-Step renders that use its planner are not reproducible run to run (the same seed and settings give a different take), so the lossless masters in the `audio-masters-1` release are the only source copies; the files here are the shipped encodes made from them. Re-encode from the masters rather than re-rendering.

Generated with ACE-Step 1.5 (MIT code and weights; the model card permits commercial use of outputs). XL-sft 4B checkpoint with the 4B planner, 60 steps, 48 kHz. Each file is cut to a seamless loop and mastered to -18 LUFS.

| File | Era | Tempo, key | Loop |
|---|---|---|---|
| `music/classic/a_full.ogg` | Classic (playlist piece A, seed 4101) | 96 bpm, F major | 58 bars, 2:23.5 |
| `music/classic/b_full.ogg` | Classic (playlist piece B, seed 4102) | 96 bpm, F major | 58 bars, 2:25.0 |
| `music/classic/c_full.ogg` | Classic (playlist piece C, seed 4105) | 96 bpm, F major | 58 bars, 2:23.5 |
| `music/chatgbt/a_full.ogg` | ChatGBT (playlist piece A, seed 5201) | 102 bpm, Bb major | 58 bars, 2:17.8 |
| `music/chatgbt/b_full.ogg` | ChatGBT (playlist piece B, seed 5204) | 102 bpm, Bb major | 58 bars, 2:12.6 |
| `music/agents/a_full.ogg` | Agents | 108 bpm, D minor | 8 bars |
| `music/consolidation/a_full.ogg` | Consolidation | 90 bpm, A minor | 8 bars |
| `music/plateau/a_full.ogg` | Plateau | 84 bpm, Eb major | 8 bars |
| `music/title/a_full.ogg` | Title | 104 bpm, F major | 8 bars |

The Classic and ChatGBT playlist pieces were rendered at 2:45 with section tags (intro, verse, marimba chorus, a verse with a guitar counter-melody, a breakdown, a build, and a final chorus), then cut to a bar-line loop that starts after the intro and includes the breakdown.

## Music night dance breaks (candidates)

Generated with ACE-Step 1.5 (MIT code and weights; commercial use of outputs permitted): the XL-sft 4B checkpoint plus the 4B planner, 60 steps, 48 kHz. Each is an original short piece: rendered at 24 s, cut at a natural ending between 15 and 20 s, faded, and mastered to about -18 LUFS, the same loudness as the stingers (Sad Lo-fi uses a gentle limiter to get there).

| File | Genre | Tempo, key | Length |
|---|---|---|---|
| `music_night/corporate_synthwave.ogg` | Corporate Synthwave | 118 bpm, A minor | 15.6 s |
| `music_night/motivational_polka.ogg` | Motivational Polka | 124 bpm, F major | 18.9 s |
| `music_night/aggressive_bossa_nova.ogg` | Aggressive Bossa Nova | 132 bpm, D minor | 16.4 s |
| `music_night/sad_lofi.ogg` | Sad Lo-fi | 80 bpm, Eb major | 17.8 s |

## Moments

### `moments/printer_smash.ogg`

A 15.7 s original aggressive rap for the scene where staff wreck the jammed printer outside. It is rapped entirely in the game's invented gibberish lexicon. Nothing comes from any existing song: no melody, lyric or sample.

- **Model:** ACE-Step 1.5 (MIT code and weights; commercial use of outputs permitted), the XL-sft 4B checkpoint plus the 4B planner, 60 steps, CFG 7.0, shift 3.0, 48 kHz.
- **Settings:** seed 6613, 88 bpm, F minor, vocals on, rendered at 20 s.
- **Cut and master:** cut just after the hook's final line with a 0.35 s fade, mastered to -18 LUFS.
- **Caption:** "aggressive 90s hardcore hip hop, hard boom bap drums, deep 808 bass, menacing minor key bassline, gritty and dark, angry male rapper, fast aggressive rap vocals, shouted hook with gang vocals, raw mix, eerie piano stabs, heavy kick, menacing and confrontational".
- **Lyrics** (structure tags as given to the model):

  ```
  [Verse - aggressive rap, fast and punchy]
  Nuffa dolu, nopu ta, tebi ba, no-la
  Pomi weh? Nopu! Nuffa dolu, ta-ta-ta
  Yobi yobi, meloo nopu, soomah dolu ba
  Nuffa! Tebi! Dolu nopu, pomi la!

  [Chorus - shouted gang vocals]
  Nopu! Nopu! Nuffa dolu ba!
  Nopu! Nopu! Tebi pomi la!
  ```

## Stingers (candidates)

Generated with ACE-Step 1.5 using the same model and settings as the music (XL-sft 4B plus the 4B planner, 60 steps, 48 kHz) and the shared instrument core. Each was rendered at 12 s, then cut at a quiet point near its target length, faded out and mastered to -18 LUFS.

| File | Cue | Length |
|---|---|---|
| `stingers/era.ogg` | era arrival | 5.6 s |
| `stingers/launch.ogg` | product launch | 4.0 s |
| `stingers/office.ogg` | office upgrade | 4.1 s |
| `stingers/waffle.ogg` | Waffle Party | 9.6 s |
| `stingers/win.ogg` | win | 8.4 s |
| `stingers/gameover.ogg` | game over | 7.5 s |

## UI sounds (candidates)

From Kenney's "Interface Sounds" pack, CC0 1.0 (public domain; credit to Kenney, kenney.nl, is optional and appreciated). Each is trimmed, mono and peak-normalized to -3 dBFS.

| File | Source |
|---|---|
| `ui/click.ogg` | click_002 |
| `ui/open.ogg` | maximize_006 |
| `ui/close.ogg` | minimize_006 |
| `ui/confirm.ogg` | confirmation_002 |
| `ui/error.ogg` | error_004 |
| `ui/blip.ogg` | select_001 |
| `ui/coin.ogg` | glass_002 |
| `ui/decision.ogg` | question_001 |
| `ui/goal.ogg` | confirmation_004 |
| `ui/unlock.ogg` | maximize_008 |

## Sound effects and ambience (candidates)

All are CC0 1.0 (public domain), from Kenney's packs (kenney.nl) and from freesound.org. Credit isn't required; it's recorded here anyway. Each sound is made to one soft, cozy feel:
- trimmed, mono 48 kHz, with a gentle high-shelf cut above 7 kHz
- loudness-matched: the loudest 400 ms window at -20 dBFS RMS, peaks at or below -3 dBFS
- the ambience loop is quieter (-32 dBFS RMS) and crossfaded into a seamless loop

| File | Source |
|---|---|
| `sfx/hire.ogg` | Kenney (kenney.nl), CC0 1.0: music-jingles PIZZI02 |
| `sfx/resign.ogg` | Kenney (kenney.nl), CC0 1.0: rpg-audio doorClose_1 |
| `sfx/alarm.ogg` | Kenney (kenney.nl), CC0 1.0: digital-audio lowThreeTone |
| `sfx/save.ogg` | Kenney (kenney.nl), CC0 1.0: digital-audio threeTone1 |
| `sfx/award.ogg` | Kenney (kenney.nl), CC0 1.0: music-jingles STEEL00 |
| `sfx/reward.ogg` | Kenney (kenney.nl), CC0 1.0: rpg-audio handleCoins |
| `sfx/bad.ogg` | Kenney (kenney.nl), CC0 1.0: digital-audio lowDown |
| `sfx/pop.ogg` | Kenney (kenney.nl), CC0 1.0: interface-sounds pluck_001 |
| `sfx/outage.ogg` | Kenney (kenney.nl), CC0 1.0: digital-audio phaserDown1 |
| `sfx/fixed.ogg` | Kenney (kenney.nl), CC0 1.0: digital-audio powerUp2 |
| `sfx/door.ogg` | Kenney (kenney.nl), CC0 1.0: rpg-audio doorOpen_1 |
| `sfx/move.ogg` | Kenney (kenney.nl), CC0 1.0: impact-sounds impactSoft_heavy_001 |
| `sfx/foosball.ogg` | Kenney (kenney.nl), CC0 1.0: impact-sounds impactWood_light_001 |
| `sfx/arcade.ogg` | Kenney (kenney.nl), CC0 1.0: digital-audio pepSound1 |
| `sfx/pingpong.ogg` | freesound.org 'ping pong ball.WAV' by cj_ascoli, CC0 1.0 (https://freesound.org/people/cj_ascoli/sounds/444372/) |
| `sfx/coffee.ogg` | freesound.org 'Coffee Machine - Select Pod.wav' by SpaceJoe, CC0 1.0 (https://freesound.org/people/SpaceJoe/sounds/344458/) |
| `sfx/dog.ogg` | freesound.org 'single bark - small to medium dog' by haulaway, CC0 1.0 (https://freesound.org/people/haulaway/sounds/630648/) |
| `sfx/cat.ogg` | freesound.org 'cat meow short' by skymary, CC0 1.0 (https://freesound.org/people/skymary/sounds/412017/) |
| `sfx/farewell.ogg` | Kenney (kenney.nl), CC0 1.0: music-jingles STEEL02 |
| `ambience/typing.ogg` | freesound.org 'Keyboard typing.WAV' by beansqueso31, CC0 1.0 (https://freesound.org/people/beansqueso31/sounds/223101/) |

## Voices (candidates)

**Barks.** Gibberish in the game's own invented lexicon, which is not Simlish and not any real language. There are 7 emotions (happy, annoyed, tired, questioning, excited, laughing, sighing), up to 2 takes each, in one sprite per bank. Offsets are in `src/audio/assets.json`.
- **Generation:** each voice was cloned from a neutral reference clip of the listed voice.
- **Selection:** every kept take passed a speaker-gender classifier check (p >= 0.98; 0.99 for designed male voices) and a 0.4 to 2.2 s length window, then was picked by timbre match to the reference.
- **Mastering:** -20 LUFS, limiter at -2 dBFS, and no pitch processing. Each bark ends 40 ms after its level falls 30 dB below its peak (a short fade), so no room-like tail rings into a group cheer.

**Models and licences:**
- Chatterbox-Turbo, Resemble AI: MIT code and weights. Its outputs carry an inaudible Perth watermark that marks them as AI-generated.
- Zonos v0.1 transformer, Zyphra: Apache-2.0 code and weights.
- Qwen3-TTS, Alibaba Qwen: Apache-2.0. It supplied the reference voices (the CustomVoice presets, and the designed voices via VoiceDesign plus Base cloning).

Only rendered audio ships, and none of these licences place conditions on generated output.

| File | Set | Bark model | Reference voice | Barks |
|---|---|---|---|---|
| `voice/fem_serena.ogg` | fem | Chatterbox-Turbo (MIT; Perth watermark) | Qwen3-TTS CustomVoice preset speaker "serena" | 14 |
| `voice/fem_vivian.ogg` | fem | Chatterbox-Turbo (MIT; Perth watermark) | Qwen3-TTS CustomVoice preset speaker "vivian" | 13 |
| `voice/fem_ono_anna.ogg` | fem | Chatterbox-Turbo (MIT; Perth watermark) | Qwen3-TTS CustomVoice preset speaker "ono_anna" | 14 |
| `voice/fem_sohee.ogg` | fem | Zonos v0.1 transformer (Apache-2.0) | Qwen3-TTS CustomVoice preset speaker "sohee" | 14 |
| `voice/masc_ryan.ogg` | masc | Chatterbox-Turbo (MIT; Perth watermark) | Qwen3-TTS CustomVoice preset speaker "ryan" | 14 |
| `voice/masc_aiden.ogg` | masc | Chatterbox-Turbo (MIT; Perth watermark) | Qwen3-TTS CustomVoice preset speaker "aiden" | 14 |
| `voice/masc_dylan.ogg` | masc | Chatterbox-Turbo (MIT; Perth watermark) | Qwen3-TTS CustomVoice preset speaker "dylan" | 14 |
| `voice/masc_eric.ogg` | masc | Chatterbox-Turbo (MIT; Perth watermark) | Qwen3-TTS CustomVoice preset speaker "eric" | 14 |
| `voice/masc_uncle_fu.ogg` | masc | Zonos v0.1 transformer (Apache-2.0) | Qwen3-TTS CustomVoice preset speaker "uncle_fu" | 14 |
| `voice/fem_alto40.ogg` | fem | Zonos v0.1 transformer (Apache-2.0) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 14 |
| `voice/fem_crisp.ogg` | fem | Zonos v0.1 transformer (Apache-2.0) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 14 |
| `voice/fem_deadpan.ogg` | fem | Zonos v0.1 transformer (Apache-2.0) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 13 |
| `voice/fem_breathy.ogg` | fem | Chatterbox-Turbo (MIT; Perth watermark) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 14 |
| `voice/fem_raspy50.ogg` | fem | Chatterbox-Turbo (MIT; Perth watermark) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 12 |
| `voice/fem_nasal.ogg` | fem | Chatterbox-Turbo (MIT; Perth watermark) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 14 |
| `voice/fem_sixty.ogg` | fem | Chatterbox-Turbo (MIT; Perth watermark) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 14 |
| `voice/masc_crisp.ogg` | masc | Zonos v0.1 transformer (Apache-2.0) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 13 |
| `voice/masc_deadpan.ogg` | masc | Zonos v0.1 transformer (Apache-2.0) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 14 |
| `voice/masc_gruff50.ogg` | masc | Chatterbox-Turbo (MIT; Perth watermark) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 13 |
| `voice/masc_laidback.ogg` | masc | Chatterbox-Turbo (MIT; Perth watermark) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 13 |
| `voice/masc_sixty.ogg` | masc | Zonos v0.1 transformer (Apache-2.0) | a voice designed with Qwen3-TTS VoiceDesign (text description), cloned with Qwen3-TTS Base | 14 |

`voice/crowd.ogg` (candidate) is a looping crowd bed mixed from the barks above: scattered, low-passed, -26 LUFS, no pitch processing.
