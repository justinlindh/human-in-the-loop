---
tool: `scripts/review-verdict.sh <pr> pass|changes <body> --head <sha>`
section: pr
covers: scripts/review-verdict.sh scripts/lib/watched-media.sh scripts/watched-media.test.sh
---
The reviewer's verdict: a PR review plus the `review` status on that head. team-lead uses it for lead and integrator PRs. A pass on a PR judged by its media needs a `Watched:` line in the body naming every image, video and audio file on the PR (pr-media links in its body, or in comments from `scripts/ci-trusted` logins; a video's GIF preview comes with the video). That applies to any PR with media, and to any PR that changes `src/render/`, `src/ui/`, `src/audio/`, `public/models/` or the golden images. Without the line, or with a file missing from it, the pass is refused (exit 1) and the unwatched files are listed. A visible change with no media can't pass until the author posts some.
