#!/usr/bin/env bash
# Claude Code SessionStart and UserPromptSubmit hook: tells the session when its checkout is behind
# origin/main, with the tooling and contract commits it is missing (scripts/, blender/checks/,
# docs/toolkit.md and docs/toolkit/, src/contract/). Silent when up to date, and each turn repeats it only when the
# count changed. It never waits on the network: it starts a quiet fetch in the background at most
# once every two minutes, so the next notice is current. Fails open on its own errors.
# It also carries rule changes to a running session, which read CLAUDE.md, its lane's brief
# (.claude/agents/<lane>*.md) and the PR template only when it started: at session start it records
# what the session read, and when any of them later differs on origin/main it shows the added lines
# once, with "re-read, applies now", along with any new docs/toolkit/ page and its purpose.
input="$(cat)" || exit 0
command -v jq >/dev/null 2>&1 || exit 0
cwd="$(jq -r '.cwd // empty' <<<"$input" 2>/dev/null)"; event="$(jq -r '.hook_event_name // empty' <<<"$input" 2>/dev/null)"
[ -n "$cwd" ] || exit 0
top="$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)" || exit 0
[ -r "$top/scripts/hooks/claude/lanes.txt" ] || exit 0
gitdir="$(git -C "$top" rev-parse --absolute-git-dir 2>/dev/null)" || exit 0
common="$(git -C "$top" rev-parse --git-common-dir 2>/dev/null)"; case "$common" in /*) ;; *) common="$top/$common" ;; esac
stamp="$common/FETCH_HEAD"
if [ -z "$(find "$stamp" -mmin -2 2>/dev/null)" ]; then (git -C "$top" fetch -q origin main >/dev/null 2>&1 &) ; fi
branch="$(git -C "$top" branch --show-current)"; branch="${branch:-detached HEAD}"

# Rule changes since this session read the rules. Per session (the hook's session_id): a baseline of
# each rule file's content (as a blob) and the toolkit pages, taken at session start from the files
# the session read; each later change on origin/main is shown once and then becomes the baseline.
rules=""
sid="$(jq -r '.session_id // empty' <<<"$input" 2>/dev/null | tr -cd 'A-Za-z0-9_-')"
if [ -n "$sid" ]; then
  rdir="$gitdir/hitl-rules"; mkdir -p "$rdir" 2>/dev/null
  find "$rdir" -type f -mtime +7 -delete 2>/dev/null
  base="$rdir/$sid"
  lane="${branch%%/*}"; brief=""
  [ "$lane" != "$branch" ] && brief="$(cd "$top" && ls .claude/agents/"$lane"*.md 2>/dev/null | head -1)"
  files="CLAUDE.md .github/pull_request_template.md${brief:+ $brief}"
  pages() { git -C "$top" ls-tree --name-only "$1" docs/toolkit/ 2>/dev/null | sort; }
  if [ ! -f "$base" ] || [ "$event" = SessionStart ]; then
    # What the session read: the files on disk now.
    { for f in $files; do [ -f "$top/$f" ] && echo "file $f $(git -C "$top" hash-object -w "$top/$f")"; done
      (cd "$top" && ls docs/toolkit/ 2>/dev/null | sed 's|^|page docs/toolkit/|'); } >"$base" 2>/dev/null
  else
    for f in $files; do
      new="$(git -C "$top" rev-parse -q --verify "origin/main:$f" 2>/dev/null)" || continue
      old="$(awk -v f="$f" '$1 == "file" && $2 == f { print $3 }' "$base")"
      [ "$new" = "$old" ] && continue
      if [ -n "$old" ]; then
        added="$(git -C "$top" diff --no-color -U0 "$old" "$new" 2>/dev/null | grep -E '^\+[^+]' | sed 's/^+/  + /')"
        removed="$(git -C "$top" diff --no-color -U0 "$old" "$new" 2>/dev/null | grep -cE '^-[^-]')"
      else added="  (new file)"; removed=0; fi
      n="$(grep -c . <<<"$added")"
      rm_note=""; [ "${removed:-0}" -gt 0 ] && rm_note=", $removed removed"
      rules+=$'\n'"$f changed on main: $n line(s) added$rm_note:"$'\n'"$(head -n 20 <<<"$added")"
      [ "$n" -gt 20 ] && rules+=$'\n'"  ...and $((n - 20)) more (git diff $old $new)"
      grep -v "^file $f " "$base" >"$base.tmp"; echo "file $f $new" >>"$base.tmp"; mv "$base.tmp" "$base"
    done
    newpages=""
    for pg in $(pages origin/main); do
      grep -qxF "page $pg" "$base" && continue
      purpose="$(git -C "$top" show "origin/main:$pg" 2>/dev/null | awk 'h == 2 && NF { print; exit } /^---$/ { h++ }' | cut -c1-160)"
      tool="$(git -C "$top" show "origin/main:$pg" 2>/dev/null | sed -n 's/^tool: //p' | head -1)"
      newpages+=$'\n'"  $pg: ${tool:+$tool: }$purpose"
      echo "page $pg" >>"$base"
    done
    [ -n "$newpages" ] && rules+=$'\n'"New tools on main (npm run toolkit has them):$newpages"
    [ -n "$rules" ] && rules="Rules changed since this session started. Re-read these; they apply now (merging main is not enough):$rules"
  fi
fi

behind="$(git -C "$top" rev-list --count HEAD..origin/main 2>/dev/null)" || behind=0
state="$gitdir/hitl-behind-notice"
bmsg=""
if [ "$behind" = 0 ]; then rm -f "$state"
else
  key="$behind $(git -C "$top" rev-parse --short origin/main)"
  if ! { [ "$event" = UserPromptSubmit ] && [ "$(cat "$state" 2>/dev/null)" = "$key" ]; }; then
    echo "$key" >"$state" 2>/dev/null
    bmsg="behind"
  fi
fi
[ -n "$bmsg" ] || [ -n "$rules" ] || exit 0
msg=""
if [ -n "$bmsg" ]; then
msg="This checkout ($branch) is $behind commit(s) behind origin/main."
tools="$(git -C "$top" log --format='  %h %s' HEAD..origin/main -- scripts/ blender/checks/ docs/toolkit.md docs/toolkit/ src/contract/ 2>/dev/null)"
if [ -n "$tools" ]; then
  n="$(wc -l <<<"$tools")"
  msg+=$'\n'"Tooling or contract changes you don't have yet ($n):"$'\n'"$(head -n 6 <<<"$tools")"
  [ "$n" -gt 6 ] && msg+=$'\n'"  ...and $((n - 6)) more"
  msg+=$'\n'"Merge origin/main into your branch before relying on them."
fi
fi
[ -n "$rules" ] && msg="${msg:+$msg$'\n\n'}$rules"
jq -n --arg e "$event" --arg m "$msg" '{hookSpecificOutput: {hookEventName: $e, additionalContext: $m}}'
