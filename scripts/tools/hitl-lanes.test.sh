#!/usr/bin/env bash
# Cases for hitl-autocompact.sh (and the compact step it runs) with tmux and gh stubbed. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "${HITL_TMP:=$HOME/.cache/hitl-ci/tmp}"; tmp="$(mktemp -d -p "$HITL_TMP")"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }

mem="$tmp/memory"; proj="$tmp"; teams="$tmp/teams"
mkdir -p "$mem/handoffs" "$teams/session-a/inboxes" "$teams/session-old"
echo '{"members":[{"name":"lane"},{"name":"integrator"},{"name":"tools2"},{"name":"team-lead"}]}' >"$teams/session-a/config.json"
echo '{"members":[{"name":"ghost"}]}' >"$teams/session-old/config.json"
echo '[]' >"$teams/session-a/inboxes/lane.json"
echo 'lane' >"$mem/handoffs/other.md"; echo 'lane' >"$mem/handoffs/lane.md"; echo 'nothing' >"$mem/handoffs/quiet.md"
printf '{"x":"You are `lane`"}\n{"usage":{"input_tokens":1,"cache_read_input_tokens":40,"cache_creation_input_tokens":2}}\n' >"$tmp/t1.jsonl"
touch -d '1 minute ago' "$tmp/t1.jsonl"

mkdir -p "$tmp/bin"
# gh pr list prints $tmp/prs.json run through the --jq filter's input.
cat >"$tmp/bin/gh" <<F
#!/usr/bin/env bash
[ "\$1 \$2" = "pr list" ] || exit 1
jq -r "\${@: -1}" "$tmp/prs.json"
F
# tmux: one pane showing @lane; send-keys is logged and a /compact appends a compact_boundary record.
cat >"$tmp/bin/tmux" <<F
#!/usr/bin/env bash
case "\$1" in
  list-panes) echo %1 ;;
  capture-pane) [ -f "$tmp/busy" ] && echo "esc to interrupt"; echo "status @\${PANE_NAME:-lane}" ;;
  send-keys) echo "\$*" >>"$tmp/keys"; case "\$*" in *"/compact"*) [ -f "$tmp/noconfirm" ] || echo '{"compact_boundary":1}' >>"$tmp/t1.jsonl" ;; esac ;;
esac
F
chmod +x "$tmp/bin/gh" "$tmp/bin/tmux"
export PATH="$tmp/bin:$PATH" RESET_POLL=0 HITL_RESET_RESTATE_WAIT=0 CLAUDE_PROJECTS_DIR="$tmp"
ac() { bash "$HERE/hitl-autocompact.sh" --memory "$mem" --teams "$teams" "$@" >"$tmp/out" 2>&1; rc=$?; }

# The gate: passes, held by inbox, held by changes requested, unknown name.
echo '[]' >"$tmp/prs.json"
ac lane --check; [ $rc -eq 0 ] && grep -qx 'gates pass for lane; other handoffs naming it: other ' "$tmp/out" || fail "gates pass: $rc $(cat "$tmp/out")"
echo '[{"from":"x"}]' >"$teams/session-a/inboxes/lane.json"
ac lane --check; [ $rc -eq 3 ] && grep -qx 'held: lane has unread messages' "$tmp/out" || fail "held by the inbox: $rc $(cat "$tmp/out")"
echo '[]' >"$teams/session-a/inboxes/lane.json"
# A verdict is the `review` status on the head; reviews stay COMMENTED, so reviewDecision is not used.
pr_row() { # <branch> <review state>
  jq -nc --arg b "$1" --arg s "$2" '{headRefName: $b, reviewDecision: "", statusCheckRollup: [{__typename: "StatusContext", context: "review", state: $s}, {__typename: "CheckRun", name: "smoke", conclusion: "SUCCESS"}]}'
}
{ echo '['; pr_row lane/topic FAILURE; echo ','; pr_row other/topic FAILURE; echo ']'; } >"$tmp/prs.json"
ac lane --check; [ $rc -eq 3 ] && grep -qx 'held: lane has a PR with changes requested' "$tmp/out" || fail "held by changes requested: $rc $(cat "$tmp/out")"
ac --check lane; [ $rc -eq 3 ] || fail "--check may come first: $rc"
{ echo '['; pr_row lane/topic SUCCESS; echo ','; pr_row lane/other PENDING; echo ']'; } >"$tmp/prs.json"
ac lane --check; [ $rc -eq 0 ] || fail "a passed or pending review does not hold the lane: $rc $(cat "$tmp/out")"
echo "[$(pr_row integ/topic FAILURE)]" >"$tmp/prs.json"
ac integrator --check; [ $rc -eq 3 ] || fail "the integrator's PRs are integ/: $rc $(cat "$tmp/out")"
echo "[$(pr_row tools/topic FAILURE)]" >"$tmp/prs.json"
ac tools2 --check; [ $rc -eq 3 ] || fail "tools2's PRs are on tools/ branches: $rc $(cat "$tmp/out")"
echo "[$(pr_row lead/topic FAILURE)]" >"$tmp/prs.json"
ac team-lead --check; [ $rc -eq 3 ] || fail "team-lead's PRs are on lead/ branches: $rc $(cat "$tmp/out")"
ac lane --check; [ $rc -eq 0 ] || fail "another lane's verdict does not hold this one: $rc $(cat "$tmp/out")"
# The gate fails closed: a gh that cannot answer holds the lane.
printf '#!/usr/bin/env bash\nexit 1\n' >"$tmp/bin/gh.fail"; chmod +x "$tmp/bin/gh.fail"; cp "$tmp/bin/gh" "$tmp/bin/gh.ok"; cp "$tmp/bin/gh.fail" "$tmp/bin/gh"
ac lane --check; [ $rc -eq 3 ] && grep -qx "held: couldn't read lane's PRs from GitHub" "$tmp/out" || fail "a failing gh holds the lane: $rc $(cat "$tmp/out")"
cp "$tmp/bin/gh.ok" "$tmp/bin/gh"
echo '[]' >"$tmp/prs.json"
ac nobody --check; [ $rc -eq 1 ] && grep -q 'no team lists nobody' "$tmp/out" || fail "an unknown name: $rc $(cat "$tmp/out")"
ac ghost --check; [ $rc -eq 0 ] || fail "a name in an older session directory is found: $rc $(cat "$tmp/out")"

# Usage and bad input.
bash "$HERE/hitl-autocompact.sh" --help | grep -q '^Usage: hitl-autocompact.sh' || fail "autocompact --help prints usage"
ac; [ $rc -eq 2 ] || fail "autocompact with no name exits 2: $rc"
ac lane --bogus; [ $rc -eq 2 ] || fail "an unknown option exits 2: $rc"
ac --memory; [ $rc -eq 2 ] || fail "an option without its value exits 2: $rc"

# The compact step is scripts/team/reset-teammate.sh: an unconfirmed compact or a missing pane stops the
# run with its exit code and leaves the lane without a restate prompt.
touch "$tmp/noconfirm"; : >"$tmp/keys"; echo '[]' >"$tmp/prs.json"
ac lane; [ $rc -eq 1 ] && grep -q 'not confirmed' "$tmp/out" && ! grep -q 'Re-read' "$tmp/keys" || fail "an unconfirmed compact stops before the restate prompt: $rc $(cat "$tmp/out")"
rm -f "$tmp/noconfirm"
PANE_NAME=other ac lane; [ $rc -eq 1 ] && grep -q 'no pane shows @lane' "$tmp/out" || fail "no pane exits 1: $rc $(cat "$tmp/out")"

# The whole run: gates pass, compact (logged under the memory directory), restate prompt typed into the pane.
: >"$tmp/keys"
ac lane
[ $rc -eq 0 ] && grep -q 'compacted lane and asked it to restate' "$tmp/out" && grep -q "Re-read memory/handoffs/lane.md" "$tmp/keys" \
  && grep -qP '^\S+\tlane\tcompact\tpre=\d+\ttranscript=t1.jsonl$' "$mem/reset-trial.log" || fail "an autocompact compacts, logs and asks for the restate: $rc $(cat "$tmp/out") $(cat "$tmp/keys")"
echo '[{"from":"x"}]' >"$teams/session-a/inboxes/lane.json"; : >"$tmp/keys"
ac lane; [ $rc -eq 3 ] && [ ! -s "$tmp/keys" ] || fail "a held lane is not touched: $rc $(cat "$tmp/keys")"

# Paths come from the environment, with no machine path in the scripts.
cfg="$tmp/cfg"; mkdir -p "$cfg"
root="$(dirname "$(git -C "$HERE" rev-parse --path-format=absolute --git-common-dir)")"
want="$cfg/projects/$(printf '%s' "$root" | tr '/.' '--')/memory"
got="$(CLAUDE_CONFIG_DIR="$cfg" bash -c '. "$1/hitl-lane-paths.sh"; lane_memory_dir; lane_teams_dir' _ "$HERE")"
[ "$got" = "$want"$'\n'"$cfg/teams" ] || fail "default directories follow CLAUDE_CONFIG_DIR: $got"
got="$(HITL_MEMORY_DIR=/m HITL_TEAMS_DIR=/t bash -c '. "$1/hitl-lane-paths.sh"; lane_memory_dir; lane_teams_dir' _ "$HERE")"
[ "$got" = $'/m\n/t' ] || fail "HITL_MEMORY_DIR and HITL_TEAMS_DIR win: $got"
grep -nE '/home/|\.claude/(projects|teams)' "$HERE"/hitl-autocompact.sh "$HERE"/hitl-lane-paths.sh | grep -v '^\S*:[0-9]*:#' && fail "a machine path is in a script"

[ $fails -eq 0 ] && echo "hitl-lanes: all cases pass"
exit $fails
