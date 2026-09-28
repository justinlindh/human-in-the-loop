---
tool: `scripts/trailer/vo/table.mjs`
section: run
who: audio, video
covers: scripts/trailer/vo/table.mjs docs/trailer/script.md
---
The trailer's script and timing table. `scripts/trailer/config.js` is the one place the script and its timing live: video edits `BEATS`, audio edits `VO.lines` (each line's beat, offset and `max`, the most seconds of speech it may run). This tool reads both and prints every line's beat, start and window, and how much of the beat is left after the window closes.

```
node scripts/trailer/vo/table.mjs                 # windows, checked against the cuts
node scripts/trailer/vo/table.mjs --vo <dir>      # plus each rendered line's measured speech and fit
node scripts/trailer/vo/table.mjs --write         # regenerate docs/trailer/script.md
```

It exits 1 when a window breaks the rules the team agreed:
- the first line in a beat starts 0.2 to 0.5 s after the cut;
- a window closes at least 0.3 s before the next cut;
- with `--vo`, each file's speech fits its `max`, ends at least 0.3 s before the cut, and leaves at least 0.4 s before the next line in the same beat.

Run it after any change to `BEATS` or `VO.lines`, and commit the regenerated `docs/trailer/script.md` in the same PR, so the diff shows what moved. `--vo` needs `ffmpeg`.
