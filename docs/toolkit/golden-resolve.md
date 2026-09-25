---
tool: `scripts/golden-resolve.sh [--no-sheets]`
section: render
covers: scripts/golden-resolve.sh
---
When `git merge` stops on conflicted golden images, regenerates just those scenes from the merged code (`golden.mjs --update --only=...`, on the software lock) and stages them, instead of picking a side. It refuses while other files still conflict. It writes a sheet per scene (this branch, merged in, regenerated) to `shots/golden-resolve/`; post them with `scripts/pr-media.sh` so the change is reviewed as an image diff. ci-pr points to it when only golden images conflict.
