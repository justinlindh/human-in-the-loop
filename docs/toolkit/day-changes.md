---
tool: `node scripts/tools/day-changes.mjs <YYYY-MM-DD | YYYY-MM-DD..YYYY-MM-DD | --since-first> [--tz <zone>] [--scopes art,ui,...] [--types feat,fix] [--body-chars 600] [--no-fetch]`
section: pr
who: video, team-lead, drafting agents
covers: scripts/tools/day-changes.mjs tests/tools/day-changes.test.js
---
What changed for players on a day, as JSON, for drafting a per-day changelog. It reads the pull requests merged into main that day and keeps the ones that changed something players see: a `feat` or `fix` title in the `art`, `ui`, `sim`, `audio` or `pacing` scope (`--types` and `--scopes` change that), or any PR that touched `docs/features/`, so a capture or tooling PR counts only when it changed a feature entry. Everything else (tooling, CI, tests, perf, docs) is listed under `skipped` with its reason, so a PR the rule dropped is easy to find and rescue.

Per kept PR: `number`, `url`, `title`, `type`, `scope`, `mergedAt`, `author`, why it was kept (`reason`), a trimmed `body` (the template boilerplate, checklist, gates, affects, closing keywords and trailers removed, cut at `--body-chars`), `prMedia` (stills and clips linked in the PR body), and `features`: the `docs/features` bullets the PR added, changed or removed, each with its text, `ids`, `media` links (`still`, `clip`, `preview`) and the `media: none/pending` note. The entries come from the PR's merge commit against its first parent, so they are what the PR changed on main; a PR whose merge commit is not in the local repository carries `featuresUnavailable` (the tool fetches `origin/main` first; `--no-fetch` skips that).

Each feature entry also carries `effects`: the generated numbers from `docs/effects/` for the ids it names, so a draft can say what a new object does in play. A decision id gives its whole section (`kind: decision`); an item, policy, trait, role, model and similar id gives its table row (`kind: row`, with `columns` by header), found through the element's name in `src/data`, since those tables carry no ids. It is `[]` when no entry matches. The docs are the ones in the checkout the tool runs from (the current numbers, not the numbers on the day), and an id shared by two kinds of element (an era and a model) can match both, so check `name`.

Days follow `--tz` (default the machine's zone), and every day in the range appears, empty ones too. `--since-first` runs from 2026-09-23, the first day, to today. The first day has no pull requests: it was merged by hand, so commits on main that are not PR merges come out under `direct` (subject, body, the areas `art`/`ui`/`sim`/`audio` they touched, their `docs/features` entries), and those touching none of those paths go to `skipped`.

```
node scripts/tools/day-changes.mjs 2026-10-05 > day.json
jq '.days[0].prs[] | {number, title, features: [.features[].title]}' day.json
node scripts/tools/day-changes.mjs --since-first --no-fetch > all.json   # the backfill, about 20 s
```

Exit 0; 2 on a bad day, range, zone or option; 1 when GitHub or git cannot be read. Titles that are not Conventional Commits are skipped, since their kind is unknown.
