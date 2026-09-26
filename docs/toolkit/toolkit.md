---
tool: `npm run toolkit [-- --section <s> | --grep <text> | --check]`
section: pr
who: all
covers: scripts/toolkit.mjs
---
Prints this toolkit as tables, one per section, from the per-tool files in `docs/toolkit/`. `--grep` finds the entries that mention a tool or a word. A PR that adds, removes or changes a tool adds or edits its own `docs/toolkit/<name>.md` (a `tool`, `section`, optional `who` and a `covers` list of the files it documents, then what it does). `--check`, which local CI runs, fails when a script or check has no entry, an entry is malformed, or an entry names a file that doesn't exist; modules the tools import are listed in `docs/toolkit/internal.txt` instead.
