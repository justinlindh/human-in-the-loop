---
tool: `node src/audio/sfx-screen.mjs`
section: run
who: audio
covers: src/audio/sfx-screen.mjs
---
Screens short sound-effect candidates for a ringing or reverberant tail before they go to the owner's desk. Run it on every candidate file (WAV, OGG or anything ffmpeg decodes); a file over a bar prints `FAIL` with the bar it broke, and the command exits 1. Drop the failures before sending anything to team-lead.

Both checks are relative to the clip, so a 10 ms click is not judged like a bell. `decay` is the time from the envelope's peak until it stays 40 dB below it; a short cue (a clip audible for up to `shortMax`; leading and trailing silence do not count, so padding a bell does not hide it) must settle within it, and longer clips (loops, ambience, stingers) skip the check and are judged by ear. `end` is the peak of the clip's last stretch (a quarter of the clip, at most 50 ms) against the clip's own peak, so a clip cut while still loud fails. The default bars are recorded in `BARS` in the file: decay 0.8 s, shortMax 1.2 s, end -6 dB. Every shipped effect and UI sound passes them (a test runs the screen over `public/audio/sfx` and `public/audio/ui` and keeps it so), and 1.1 s bells that ring for a second fail.

`--decay`, `--short-max` and `--end` set a bar for a sound that is meant to be longer, such as a bell. Exit 2 is bad input (an unknown option, a non-number, no files); an undecodable file counts as a failure. It needs `ffmpeg` on the path. A candidate that passes can still sound wrong: the owner picks by ear.
