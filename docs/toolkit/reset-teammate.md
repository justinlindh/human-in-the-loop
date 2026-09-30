---
tool: `scripts/team/reset-teammate.sh <name> <clear|compact> [max-wait-seconds] [--log <file>]`
section: run
who: team-lead
covers: scripts/team/reset-teammate.sh scripts/team/reset-teammate.test.sh
---
Resets an idle teammate's context with `/clear` or `/compact` from outside its session, so a long-lived teammate stops re-reading a huge context on every turn. It finds the teammate's tmux pane by the `@<name>` bar on the pane's last lines, waits until the pane is idle at the prompt (30 minutes by default), prints the context size from the teammate's transcript, sends the command, and confirms a compact from the transcript's `compact_boundary` line, not from the screen. A clear writes nothing to the transcript until the next message, so it is confirmed by sending the command and letting the pane settle; resend the teammate's spawn brief after it, since a clear drops it. After a compact, tell the teammate to re-read its handoff and continue. `--log` appends a row (time, name, mode, context size, transcript) for a clear-versus-compact comparison. The transcript directory is Claude Code's, derived from the repository's path (`CLAUDE_PROJECTS_DIR` names another), and a teammate's transcript is its newest one whose first lines hold its `You are `<name>`` brief. Run it from team-lead's session, never for the session you are in, and never from the teammate itself. Exit 0 done, 1 no pane or transcript, still busy, or not confirmed, 2 usage. See the README's "Keeping contexts small".

    scripts/team/reset-teammate.sh sim compact
    scripts/team/reset-teammate.sh reviewer clear 600 --log resets.tsv
