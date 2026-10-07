# Sourced by hitl-reset.sh and hitl-autocompact.sh: where the Claude project memory and the team
# directories live, from the environment, so no machine path is written in the scripts.
#   lane_memory_dir   $HITL_MEMORY_DIR, else <config>/projects/<checkout path, / and . as ->/memory
#   lane_teams_dir    $HITL_TEAMS_DIR, else <config>/teams
# <config> is $CLAUDE_CONFIG_DIR, default ~/.claude.

# The main checkout, from any worktree of it: Claude keys its project directory on that path.
lane_repo_root() {
  local common; common="$(git -C "$(dirname "${BASH_SOURCE[0]}")" rev-parse --path-format=absolute --git-common-dir)" || return 1
  dirname "$common"
}
lane_config_dir() { echo "${CLAUDE_CONFIG_DIR:-$HOME/.claude}"; }
lane_memory_dir() {
  if [ -n "${HITL_MEMORY_DIR:-}" ]; then echo "$HITL_MEMORY_DIR"; return; fi
  local root; root="$(lane_repo_root)" || return 1
  echo "$(lane_config_dir)/projects/$(printf '%s' "$root" | tr '/.' '--')/memory"
}
lane_teams_dir() { echo "${HITL_TEAMS_DIR:-$(lane_config_dir)/teams}"; }
