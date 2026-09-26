---
tool: `node scripts/features-ids.mjs`
section: ci
who: all
covers: scripts/features-ids.mjs
---
Checks `docs/features.md` against the data, both ways. Every staged event (a `stage`, `grant` or `leaves`), item, perk, moment kind, quick post, prompt template, music night genre and era needs a bullet ending in its `id: <x>`, unless a bullet in "Ids left out on purpose" names it in its subject (before the first colon). Every `id: <x>` in the file must exist somewhere in the data. Local CI runs it on every PR, and the light gate runs it on a PR that changes the file.
