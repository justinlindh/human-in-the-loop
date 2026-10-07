---
tool: `node src/ui/tools/build-glyphs.js`
section: models
who: ui
covers: src/ui/tools/build-glyphs.js
---
Writes the UI glyph SVGs in `public/icons/glyphs/` and their manifest from `src/ui/tools/glyphs.js`.
The `press.*` glyphs supply the four parody outlet logos used on launch cards and in Reports; edit their vector definitions in `glyphs.js`, then rebuild with this command.
It deletes every SVG in the folder before writing, so a new glyph goes into `glyphs.js` first and a hand-added file is lost; `src/ui/tools/glyphsInSync.test.js` fails when the folder and the source disagree.
