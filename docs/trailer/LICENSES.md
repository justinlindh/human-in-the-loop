# Trailer licences and provenance

Everything the trailer is made of, and where it comes from.

## Narrator voice

| Item | Source | Licence |
|---|---|---|
| Speech model | Qwen3-TTS 12Hz 1.7B Base (voice cloning), https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-Base | Apache-2.0 (code and weights); outputs unrestricted |
| Voice reference | `ref_masc_deadpan`, the audio lane's designed narrator: a synthetic voice made with Qwen3-TTS 12Hz 1.7B VoiceDesign from a text description ("dry, deadpan man in his forties, flat low-key baritone, dry humour"), https://huggingface.co/Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign. Its words are nonsense syllables; it only carries timbre | Apache-2.0 |

The voice is synthetic from end to end: it is not a recording or clone of any real person. The lines
are rendered on the GPU through the audio lane's voice-clone script with this reference and its
transcript, then loudness-normalized. No pitch processing.

Take selection transcribes each take with Whisper large-v3 (https://huggingface.co/openai/whisper-large-v3,
Apache-2.0) to pick the one that says the line correctly. Whisper output never reaches the trailer.

## Music and stingers

The title bed, the Corporate Synthwave music night track and the stingers are the game's own files
under `public/audio/`, generated with ACE-Step 1.5 (MIT code and weights; commercial use of outputs
permitted). Details per file are in `public/audio/LICENSES.md`.

## Pictures and type

- Gameplay: captured from the game itself (this repository's licence).
- Logo: `docs/readme/logo.png`, the project's own.
- Cards and captions are set in Fredoka (Google Fonts), SIL Open Font License 1.1.
