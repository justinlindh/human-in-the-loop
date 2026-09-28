---
tool: `scripts/hooks/claude/em-dash-guard.sh`
section: hooks
who: all
covers: scripts/hooks/claude/em-dash-guard.sh
---
Runs before each SendMessage: refuses a message or summary that holds an em dash (U+2014), whether as the character or as its JSON escape text, and asks the sender to rewrite it with a colon, comma, period or parentheses. Every string in a structured message (a shutdown or plan response) is checked too. Hyphens and en dashes get through. Files, commits and shell commands have their own em dash checks.
