# Audio licences and provenance

Every file under `public/audio/` is listed here. Files marked *candidate* are for review and may be replaced.

## Music (candidate beds)

Generated with ACE-Step 1.5 (MIT code and weights; the model card permits commercial use of outputs). XL-sft 4B checkpoint with the 4B planner, 60 steps, 48 kHz. Each file is cut to a seamless loop and mastered to -18 LUFS.

| File | Era | Tempo, key | Loop |
|---|---|---|---|
| `music/classic/a_full.ogg` | Classic | 96 bpm, F major | 10 bars |
| `music/chatgbt/a_full.ogg` | ChatGBT | 102 bpm, Bb major | 8 bars |
| `music/agents/a_full.ogg` | Agents | 108 bpm, D minor | 8 bars |
| `music/consolidation/a_full.ogg` | Consolidation | 90 bpm, A minor | 8 bars |
| `music/plateau/a_full.ogg` | Plateau | 84 bpm, Eb major | 8 bars |

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

## Voices

- `voice/crowd.ogg` (candidate): a looping crowd bed built from the game's own voice barks (see below). Low-passed, -26 LUFS, no pitch processing.
- Voice banks (`voice/<bank>.ogg`) will be listed here with their model and reference voice when they are added. The barks are generated gibberish in the game's own invented lexicon:
  - Chatterbox-Turbo (MIT; outputs carry Resemble AI's inaudible Perth watermark)
  - Zonos v0.1 (Apache-2.0)
  - reference voices from Qwen3-TTS (Apache-2.0)
