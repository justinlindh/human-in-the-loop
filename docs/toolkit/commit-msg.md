---
tool: `scripts/hooks/commit-msg` (`npm run hooks`)
section: pr
covers: scripts/hooks/commit-msg scripts/hooks/commit-msg.test.sh
---
Refuses a commit whose message carries AI attribution: a `Claude-Session:` or `Co-Authored-By:` trailer, a claude.ai session link, or a "Generated with Claude Code" line. It lists the offending lines; remove them and commit again. Comment lines git strips are ignored.
