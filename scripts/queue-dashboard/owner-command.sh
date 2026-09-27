#!/usr/bin/env bash
# Parse only the leading owner command; notes cannot change its meaning.
owner_command_kind() {
  case "$1" in
    /ship|/ship[[:space:]]*) printf 'ship\n' ;;
    /revise|/revise[[:space:]]*) printf 'revise\n' ;;
    *) printf 'none\n' ;;
  esac
}
owner_command_head() {
  local body="$1"
  if [[ "$body" =~ ^/ship[[:space:]]+([0-9a-f]{40})([[:space:]]|$) ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  elif [[ "$body" =~ ^/revise[[:space:]]+\[head:([0-9a-f]{40})\] ]]; then
    printf '%s\n' "${BASH_REMATCH[1]}"
  fi
}
