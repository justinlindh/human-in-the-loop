---
tool: `node src/audio/sfx-screen.mjs`
section: run
who: audio
covers: src/audio/sfx-screen.mjs
---
Screens short sound-effect candidates for a ringing or reverberant tail before they go to the owner's desk. Run it on every candidate file (WAV, OGG or anything ffmpeg decodes); a file over a bar prints `FAIL` with the bars it broke, and the command exits 1. Drop the failures before sending anything to team-lead.

It measures the clip's length, the time from the envelope's peak until it stays 40 dB below it (`decay`), the RMS of the last 200 ms against the whole clip (`last200`, the last half for a clip under 0.4 s), and the peak of the last 50 ms (`last50`). The default bars, recorded in `BARS` in the file: length 0.8 s, decay 0.45 s, last200 -20 dB, last50 -50 dBFS. They sit between the sounds the owner picked (a 0.5 s wooden tick, a 0.6 s water glug, both pass) and the ones rejected as echo-y (1.1 s bells with a 1 s decay, both fail).

`--max-dur`, `--decay`, `--last200` and `--last50` set a bar for a sound that is meant to be longer, such as a bell or a stinger. Exit 2 is bad input (an unknown option, a non-number, no files); an undecodable file counts as a failure. It needs `ffmpeg` on the path. A candidate that passes can still sound wrong: the owner picks by ear.
