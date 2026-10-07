---
tool: `scripts/team/reset-teammate.sh <name> compact [max-wait-seconds] [--log <file>] [--before-send <command>] [--confirm-wait <seconds>]`
section: run
who: team-lead
covers: scripts/team/reset-teammate.sh scripts/team/reset-teammate.test.sh
---
Compacts an idle teammate's context with `/compact` from outside its session, so a long-lived teammate stops re-reading a huge context on every turn. It finds the teammate's tmux pane by the `@<name>` bar on the pane's last lines, waits until the pane is idle at the prompt (30 minutes by default), prints the context size from the teammate's transcript, sends `/compact`, and confirms it from the transcript's `compact_boundary` line, not from the screen. After a compact, tell the teammate to re-read its handoff and continue. `--log` appends a row (time, name, mode, context size, transcript). The transcript directory is Claude Code's, derived from the repository's path (`CLAUDE_PROJECTS_DIR` names another), and a teammate's transcript is its newest one whose first lines hold its `You are `<name>`` brief. A copy outside the repository works when run from inside one. Run it from team-lead's session, never for the session you are in, and never from the teammate itself. Exit 0 done, 1 no pane or transcript, still busy, or not confirmed, 2 usage.

Two waits, two options: the idle wait before `/compact` is `max-wait-seconds`; the wait for the compaction to finish is `--confirm-wait` (default 600 s, since a compaction of a big context takes minutes while its pane shows a spinner). A boundary is confirmed only by a real `"subtype":"compact_boundary"` record in the transcript (a message that mentions the word is not one). A pane that sits idle for 30 s (`RESET_IDLE_GRACE`) after the command with no boundary refused it (nothing to compact, an error), so the run ends at once with exit 1 and the pane's last lines. `--before-send <command>` is run with `bash -c` once the pane is idle, just before `/compact` is typed: a nonzero exit ends the run with that code and sends nothing (`hitl-autocompact.sh` uses it to look once more for a message that arrived during the wait).

`clear` is refused (exit 2): a `/clear`'ed teammate keeps working, but its end-of-turn reports stop reaching team-lead, so the lead loses track of it without any error. When a compact isn't enough, shut the teammate down and respawn it with its brief and handoff. See the README's "Keeping contexts small".

    scripts/team/reset-teammate.sh sim compact
    scripts/team/reset-teammate.sh reviewer compact 600 --log resets.tsv
