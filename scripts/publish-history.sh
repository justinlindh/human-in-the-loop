#!/usr/bin/env bash
# Builds the cleaned public history from feat/one-shot in a fresh scratch clone, then verifies it.
# Nothing here touches GitHub or the working repos; publishing is the manual checklist in
# docs/publishing.md.
#
# Usage: scripts/publish-history.sh <out-dir> [--branch feat/one-shot] [--no-ci]
#   <out-dir>  an empty or missing directory for the scratch clone (it is deleted and rebuilt)
# Result: <out-dir> holds a repo with a single branch, main, whose history has
#   - docs/superpowers/specs/2026-09-24-audio-tools-report.md removed from every commit,
#   - no Co-Authored-By, Claude-Session, or "Generated with Claude Code" lines in messages,
#   - home-directory paths replaced in file contents and messages (see REPLACEMENTS below),
# and the verification report (gitleaks, trufflehog, the audit grep, npm run ci) at the end.
set -euo pipefail

out="${1:?usage: scripts/publish-history.sh <out-dir> [--branch <ref>] [--no-ci]}"; shift
branch="feat/one-shot"; run_ci=1
while [ $# -gt 0 ]; do
  case "$1" in
    --branch) branch="$2"; shift 2 ;;
    --no-ci) run_ci=0; shift ;;
    *) echo "publish-history: unknown option $1" >&2; exit 2 ;;
  esac
done

REPO="$(cd "$(dirname "$0")/.." && pwd)"
url="$(git -C "$REPO" remote get-url origin)"
command -v git-filter-repo >/dev/null || { echo "publish-history: needs git-filter-repo" >&2; exit 2; }

# 1. A fresh clone of the main line only (no pr-media, lane or topic branches, no remote refs).
rm -rf "$out"
git clone -q --no-local --single-branch --branch "$branch" "$url" "$out"
cd "$out"
git checkout -q -B main
git branch -D "$branch" >/dev/null 2>&1 || true
git remote remove origin

# 2. The rewrite. Replacements apply to file contents and commit messages; regex groups use \1.
home="$HOME"
repl="$(mktemp)"
cat >"$repl" <<EOF
regex:${home}/src/(gamedev[A-Za-z0-9_-]*)==>../\1
regex:${home}/==>~/
EOF
strip_trailers='
import re
text = message.decode("utf-8", "replace")
text = re.sub(r"(?mi)^(co-authored-by|claude-session):.*\n?", "", text)
text = re.sub(r"(?mi)^.*generated with \[?claude code\]?.*\n?", "", text)
text = re.sub(r"\n{3,}", "\n\n", text).rstrip() + "\n"
return text.encode("utf-8")
'
git filter-repo --force --quiet \
  --invert-paths --path docs/superpowers/specs/2026-09-24-audio-tools-report.md \
  --replace-text "$repl" --replace-message "$repl" \
  --message-callback "$strip_trailers"
rm -f "$repl"
git reflog expire --expire=now --all && git gc -q --prune=now

# 3. Verification. Each check prints PASS or FAIL; the script exits non-zero if any fails.
fail=0
check() { if "$2"; then echo "PASS  $1"; else echo "FAIL  $1"; fail=1; fi; }

removed() { [ -z "$(git log --all --format=%H -- docs/superpowers/specs/2026-09-24-audio-tools-report.md)" ]; }
trailers() { ! git log --all --format=%B | grep -qiE '^(co-authored-by|claude-session):|generated with \[?claude code'; }
# The pre-publication audit's strings (local paths, service and project names, ports) are kept out of
# the repo, one extended regex per line, in AUDIT_FILE; the home directory is always checked.
AUDIT_FILE="${PUBLISH_AUDIT_FILE:-$HOME/.config/hitl-publish/audit.txt}"
AUDIT="$(printf '%s' "$home" | sed 's/[.[\*^$]/\\&/g')"
if [ -f "$AUDIT_FILE" ]; then AUDIT="$AUDIT|$(grep -vE '^\s*(#|$)' "$AUDIT_FILE" | paste -sd'|' -)"; fi
audit() {
  local hits
  hits="$( { git log --all -p --format='%H%n%B'; } | grep -nE "$AUDIT" | head -20 || true)"
  [ -z "$hits" ] || { echo "$hits"; return 1; }
}
branches() { [ "$(git for-each-ref --format='%(refname)' | grep -vc '^refs/heads/main$' || true)" = 0 ]; }
gl() {
  local log; log="$(mktemp)"
  gitleaks git --no-banner --redact --exit-code 1 . >"$log" 2>&1
  local rc=$?
  [ $rc -eq 0 ] || tail -20 "$log"
  rm -f "$log"
  return $rc
}
# With --fail, trufflehog exits 0 when clean and 183 on findings; anything else is an error, not a pass.
th() {
  local log; log="$(mktemp)"
  trufflehog git "file://$PWD" --no-update --fail --results=verified,unknown --json >"$log" 2>&1
  local rc=$?
  [ $rc -eq 0 ] || head -20 "$log"
  rm -f "$log"
  return $rc
}

check "the audio report is gone from every commit" removed
check "no attribution trailers in any message" trailers
check "the audit grep finds nothing in history or messages" audit
check "only one branch (main), no other refs" branches
[ -f "$AUDIT_FILE" ] || { echo "FAIL  audit term list missing ($AUDIT_FILE)"; fail=1; }
if command -v gitleaks >/dev/null; then check "gitleaks: no findings in full history" gl; else echo "SKIP  gitleaks (not installed)"; fail=1; fi
if command -v trufflehog >/dev/null; then check "trufflehog: no verified or unknown secrets in full history" th; else echo "SKIP  trufflehog (not installed)"; fail=1; fi
if [ "$run_ci" = 1 ]; then
  cis() {
    local log; log="$(mktemp)"
    ln -sfn "$REPO/node_modules" node_modules
    CI_DIR="$PWD" bash "$REPO/scripts/ci-local.sh" --base HEAD >"$log" 2>&1
    local rc=$?
    tail -14 "$log"
    rm -f "$log" node_modules
    return $rc
  }
  check "npm run ci on the rewritten tree" cis
fi

echo
echo "commits: $(git rev-list --count main); head: $(git rev-parse --short main)"
exit "$fail"
