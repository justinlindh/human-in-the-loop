---
tool: `audio-masters-<n>` releases (use the newest)
section: models
who: audio
---
Lossless FLAC masters of every shipped audio file, plus a manifest mapping each to its shipped file with SHA-256 checksums. Re-encode from these, never from `public/audio/`.

Music beds (everything under `public/audio/music/` and `public/audio/music_night/`) ship at `libopus -b:a 64k` for `.ogg` and `aac -b:a 96k` for `.m4a`, encoded from the masters at 48 kHz stereo with no trim or gain, so loop points and loudness are the master's. The audio lane's `music_reencode.py REPO` redoes every music bed at these rates (`--check96` re-encodes at the older 96k/128k rates to prove each source). New music goes through the same settings; stingers, sfx, ui and voice keep their own.
