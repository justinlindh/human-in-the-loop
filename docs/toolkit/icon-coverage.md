---
tool: `node src/ui/tools/icon-coverage.js [--strict]`
section: models
who: ui
covers: src/ui/tools/icon-coverage.js
---
Lists icon names that still use an emoji stand-in and fails on a manifest entry with no file. `src/ui/icons.test.js` (in `npm test`) fails when game data can ask for an icon name that has neither art nor an entry, such as a new marketing channel.
