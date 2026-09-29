---
tool: `scripts/pr-body.sh <pr> --show <heading> | --section <heading> --from <file|-> [--append] [--dry-run]`
section: pr
who: all, reviewer
covers: scripts/pr-body.sh scripts/pr-body.test.sh
---
Reads or replaces one `## ` section of a PR description and leaves the rest alone, in place of a `gh pr view`, python and `gh pr edit` chain. `--show <heading>` prints a section. `--section <heading> --from <file|->` replaces it (the heading match ignores case; a section the description lacks is added at the end), and `--append` adds to the section instead. `--dry-run` prints the whole new description without editing. The new text is refused before any `gh` edit when it holds a local path (`/home/...`, `/tmp/...`), which the PR-text hook would refuse anyway; media goes through `scripts/pr-media.sh`. Update the Evidence section after each new run with it, rather than rewriting the whole body.
