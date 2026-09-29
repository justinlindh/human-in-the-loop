---
tool: `scripts/tools/gh-as.sh token|env|git-setup <lane>`
section: run
who: all
covers: scripts/tools/gh-as.sh scripts/tools/gh-as.test.sh
---
Acts on GitHub as a lane's own GitHub App bot, so its PRs, reviews and pushes carry the bot's login instead of the owner's. `gh-as.sh token <lane>` mints an installation token (an RS256 JWT signed with the lane's private key, exchanged at the GitHub API), caches it, and reuses it until 10 minutes remain of its hour. `env <lane>` prints `export GH_TOKEN=...`, for `eval "$(scripts/tools/gh-as.sh env <lane>)"` in a shell that runs `gh`; the token is a snapshot, so evaluate it again after an hour. `git-setup <lane>` configures the current worktree only: commits are authored as the bot, github.com over ssh is rewritten to https, and a credential helper serves a fresh token for pushes. A lane with no key (no `<lane>.pem`, or no entry in `apps.json`) gets a message and today's behaviour: `env` and `git-setup` change nothing and exit 0, `token` exits 3. The apps directory is `HITL_APPS_DIR`, default `~/.config/hitl/apps`; it holds `apps.json` (appId, clientId, installationId, botLogin, botEmail per lane) and one `<lane>.pem` per lane, mode 600. Nothing prints or stores a key, and a token is printed only by `token`, `env` and the credential helper.

    scripts/tools/gh-as.sh git-setup reviewer
    eval "$(scripts/tools/gh-as.sh env reviewer)" && gh api /installation/repositories --jq '.repositories[].full_name'
