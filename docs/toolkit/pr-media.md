---
tool: `scripts/pr-media.sh [--print-only] [--issue] [--repo <r>] <n> <files>`
section: pr
covers: scripts/pr-media.sh
---
Puts screenshots and clips on a PR, or with `--issue` on an issue (a playtest report, say), without local paths, stored on the `pr-media` branch. It posts the markdown as a comment on the PR or issue and prints it, so the media is linked where reviewers and `review-verdict.sh`'s watched-media check look: media uploaded but never linked counts for nothing. `--print-only` only prints it, for a caller that posts its own comment.
