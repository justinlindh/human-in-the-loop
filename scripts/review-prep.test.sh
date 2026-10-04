#!/usr/bin/env bash
# Cases for scripts/review-prep.sh: its helpers (sourced) and the trust gate, with gh stubbed.
# Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
# shellcheck source=/dev/null
source "$HERE/review-prep.sh"

[ "$(owners src/render/props.js)" = art ] || fail "owners of src/render: $(owners src/render/props.js)"
[ "$(owners src/audio/mix.js)" = "ui audio" ] || fail "owners of src/audio: $(owners src/audio/mix.js)"
[ "$(owners CLAUDE.md)" = lead ] || fail "owners of CLAUDE.md: $(owners CLAUDE.md)"
[ -z "$(owners nowhere/x)" ] || fail "an unowned path"
lane_may tools blender/checks/stage.mjs || fail "tools may edit blender/checks"
lane_may tools docs/toolkit/x.md || fail "every lane may edit docs/toolkit"
lane_may tools scripts/review-verdict.sh && fail "tools may not edit scripts/ without an exception"

body='## What

x

## Evidence

- **Tests:** ok
- **Gates run:** <!-- template -->
  - stage: 16 of 16
  - sweep: clean
- **Numbers:** n

## Changes to how the game plays

None <!-- or each change -->

## Affects

- art: merge main
'
[ "$(section Affects "$body")" = "- art: merge main" ] || fail "Affects section: $(section Affects "$body")"
[ "$(section 'Changes to how the game plays' "$body")" = "None " ] || fail "plays section: [$(section 'Changes to how the game plays' "$body")]"
[ "$(gates "$body" | wc -l)" -eq 2 ] && gates "$body" | grep -q 'stage: 16 of 16' || fail "gates: $(gates "$body")"
m="$(media_in '![a](https://github.com/o/r/blob/pr-media/pr-9/clip.mp4?raw=true) ![b](https://github.com/o/r/blob/pr-media/pr-9/clip-preview.gif?raw=true) [n](https://github.com/o/r/blob/pr-media/site-3/notes.txt?raw=true) ![c](https://github.com/o/r/blob/pr-media/site-3/sheet.png?raw=true)')"
[ "$m" = $'clip.mp4\nsheet.png' ] || fail "media: $m"

# The trust gate stops before anything is fetched.
mkdir -p "$tmp/bin"
cat >"$tmp/bin/gh" <<F
#!/usr/bin/env bash
case "\$1 \$2" in
  "pr view") cat "$tmp/pr.json" ;;
  "api repos/{owner}/{repo}/pulls/9/files") cat "$tmp/files" ;;
  *) echo "unexpected gh \$*" >&2; exit 1 ;;
esac
F
chmod +x "$tmp/bin/gh"
cat >"$tmp/bin/git" <<'F'
#!/usr/bin/env bash
echo "git must not run before the trust gate passes" >&2; exit 9
F
chmod +x "$tmp/bin/git"
gate() { # <author> <cross> <files, one per word> [flags]: sets rc and out
  jq -n --arg a "$1" --argjson c "$2" --argjson b "${IS_BOT:-false}" '{author: {login: $a, is_bot: $b}, isCrossRepository: $c}' >"$tmp/pr.json"; echo "$3" | tr ' ' '\n' | sed 's/$/\t1\t0/' >"$tmp/files"
  shift 3; out="$(PATH="$tmp/bin:$PATH" bash "$HERE/review-prep.sh" 9 --no-checkout "$@" 2>&1)"; rc=$?
}
gate justinlindh true 'src/a.js'; [ $rc -eq 3 ] && grep -q fork <<<"$out" || fail "a fork: $rc $out"
gate stranger false 'src/a.js'; [ $rc -eq 3 ] && grep -q 'not in scripts/ci-trusted' <<<"$out" || fail "an outside author: $rc $out"
gate 'dependabot[bot]' false 'package.json'; [ $rc -eq 3 ] && grep -q 'use --bot' <<<"$out" || fail "Dependabot without --bot: $rc $out"
gate 'dependabot[bot]' false 'package.json src/main.js' --bot; [ $rc -eq 3 ] && grep -q 'src/main.js' <<<"$out" || fail "Dependabot touching code: $rc $out"
gate justinlindh false 'package.json' --bot; [ $rc -eq 3 ] && grep -q 'for Dependabot PRs' <<<"$out" || fail "--bot on a person's PR: $rc $out"
gate justinlindh false 'src/a.js'; [ $rc -eq 2 ] && grep -q "can't fetch" <<<"$out" || fail "a trusted PR passes the gate: $rc $out"
IS_BOT=true gate 'app/loop-reviewer-justinlindh' false 'src/a.js'; [ $rc -eq 2 ] && grep -q "can't fetch" <<<"$out" || fail "a listed app's PR passes the gate: $rc $out"
IS_BOT=true gate 'app/other-app' false 'src/a.js'; [ $rc -eq 3 ] && grep -q 'ci-trusted-bots' <<<"$out" || fail "an unlisted app is refused: $rc $out"
IS_BOT=false gate 'app/loop-reviewer-justinlindh' false 'src/a.js'; [ $rc -eq 3 ] || fail "a listed name that is not a bot is refused: $rc $out"
gate 'dependabot[bot]' false 'package.json package-lock.json .github/workflows/ci.yml' --bot; [ $rc -ne 3 ] || fail "a clean Dependabot PR passes the gate: $rc $out"

# The extra checkouts, in a scratch repo with a bare origin, refs/pull/9/head, and gh stubbed.
g() { git -c user.name=t -c user.email=t@t "$@"; }
o="$tmp/origin.git"; r="$tmp/repo"; git init -q --bare -b main "$o"
git clone -q "$o" "$r" 2>/dev/null; mkdir -p "$r/scripts/hooks/claude"
cp "$HERE/review-prep.sh" "$r/scripts/"; cp "$HERE/ci-trusted" "$r/scripts/"; cp "$HERE/hooks/claude/lanes.txt" "$r/scripts/hooks/claude/"
echo 1 >"$r/f"; echo '{"lockfileVersion":3}' >"$r/package-lock.json"; g -C "$r" add -A; g -C "$r" commit -qm base; g -C "$r" branch -M main; g -C "$r" push -q origin main
g -C "$r" checkout -qb feat; echo a >"$r/a"; g -C "$r" add -A; g -C "$r" commit -qm one; first="$(g -C "$r" rev-parse HEAD)"
echo b >"$r/b"; g -C "$r" add -A; g -C "$r" commit -qm two; head="$(g -C "$r" rev-parse HEAD)"
g -C "$r" push -q origin "$head:refs/pull/9/head"; g -C "$r" checkout -q main
echo m >"$r/m"; g -C "$r" add -A; g -C "$r" commit -qm "main moves"; g -C "$r" push -q origin main; newmain="$(g -C "$r" rev-parse HEAD)"; oldmain="$(g -C "$r" rev-parse HEAD~1)"
cat >"$tmp/bin/gh" <<F
#!/usr/bin/env bash
case "\$1 \$2" in
  "pr view") jq -n --arg h "$head" '{number: 9, title: "t", author: {login: "justinlindh"}, isCrossRepository: false, headRefName: "tools/x", headRefOid: \$h, baseRefName: "main", isDraft: false, labels: [], body: "", createdAt: "2026-01-01T00:00:00Z", mergeable: "MERGEABLE", statusCheckRollup: [], comments: [], reviews: [], files: [], url: "u"}' ;;
  "api repos/{owner}/{repo}/pulls/9/files") printf 'b\t1\t0\n' ;;
  "api repos/{owner}/{repo}/pulls/9/commits") printf '%s\n' "$first"; sleep 0.3; printf '%s\n' "$head" ;;
  *) echo "unexpected gh \$*" >&2; exit 1 ;;
esac
F
chmod +x "$tmp/bin/gh"; rm -f "$tmp/bin/git"
rp() { out="$(cd "$r" && PATH="$tmp/bin:$PATH" bash scripts/review-prep.sh 9 --dir "$tmp/wt" "$@" 2>&1)"; rc=$?; }
rp; [ $rc -eq 0 ] && [ -d "$tmp/wt/review-9" ] && [ ! -d "$tmp/wt/review-9-merged" ] && [ ! -d "$tmp/wt/review-9-base" ] && ls "$tmp/wt" | grep -qv 'at-' || fail "no flag: only the head checkout: $rc $out"
rp --head-at "${first:0:7}"; [ $rc -eq 0 ] && [ "$(git -C "$tmp/wt/review-9-at-${first:0:7}" rev-parse HEAD)" = "$first" ] || fail "--head-at checks out the earlier head: $rc $out"
rp --merged; [ $rc -eq 0 ] && [ -e "$tmp/wt/review-9-merged/m" ] && [ -e "$tmp/wt/review-9-merged/b" ] && [ "$(git -C "$tmp/wt/review-9-merged" rev-list --parents -n1 HEAD | wc -w)" -eq 3 ] || fail "--merged has both the PR's and main's files, as a merge: $rc $out"
[ ! -e "$tmp/wt/review-9/m" ] || fail "--merged leaves the head checkout alone"
rp --base-at "$oldmain"; [ $rc -eq 0 ] && [ "$(git -C "$tmp/wt/review-9-base" rev-parse HEAD)" = "$oldmain" ] || fail "--base-at puts the base at that commit: $rc $out"
rp --base; [ "$(git -C "$tmp/wt/review-9-base" rev-parse HEAD)" = "$oldmain" ] || fail "--base alone is the merge base: $(git -C "$tmp/wt/review-9-base" rev-parse HEAD) want $oldmain"
rp --head-at deadbeef; [ $rc -eq 2 ] && grep -q 'not a commit' <<<"$out" || fail "--head-at an unknown commit exits 2: $rc $out"
rp --head-at "$newmain"; [ $rc -eq 2 ] && grep -q "not one of #9's commits" <<<"$out" || fail "--head-at a commit outside the PR exits 2: $rc $out"
rp --head-at "${first:0:7}" --merged --base-at "$oldmain"; mt="$tmp/wt/review-9-merged"
[ $rc -eq 0 ] && [ "$(git -C "$mt" rev-parse HEAD^1)" = "$first" ] && [ -e "$mt/a" ] && [ ! -e "$mt/b" ] && [ -d "$tmp/wt/review-9-base" ] && [ -d "$tmp/wt/review-9-at-${first:0:7}" ] || fail "the flags combine, and --merged merges the earlier head: $rc $out"
rp --json --head-at "${first:0:7}" --merged --base-at "$oldmain"
[ "$(jq -r '[.trees[].kind] | join(",")' <<<"$out")" = "head,base,head-at,merged" ] && [ "$(jq -r '.trees[] | select(.kind == "merged") | .mergedWith' <<<"$out")" = "$newmain" ] && [ "$(jq -r '.trees[] | select(.kind == "merged") | .tree' <<<"$out")" = "$(git -C "$tmp/wt/review-9-merged" rev-parse 'HEAD^{tree}')" ] && [ "$(jq -r '.trees[] | select(.kind == "head") | .sha' <<<"$out")" = "$head" ] || fail "--json lists each tree with its sha, and for --merged the main sha and tree: $out"
rm -rf "$tmp/wt"; git -C "$r" worktree prune
out="$(cd "$r" && HITL_REVIEW_DIR="$tmp/wt" PATH="$tmp/bin:$PATH" bash scripts/review-prep.sh 9 --json 2>&1)"; rc=$?
[ $rc -eq 0 ] && jq -e '.trees == [] and .number == 9' <<<"$out" >/dev/null && [ ! -d "$tmp/wt" ] || fail "plain --json makes no checkout, even with HITL_REVIEW_DIR set: $rc $out"
out="$(cd "$r" && env -u HITL_REVIEW_DIR PATH="$tmp/bin:$PATH" bash scripts/review-prep.sh 9 --json 2>&1)"; rc=$?; [ $rc -eq 0 ] && jq -e '.trees == []' <<<"$out" >/dev/null || fail "plain --json needs no --dir: $rc $out"
rp --json --dir "$tmp/wt"; [ $rc -eq 0 ] && [ "$(jq '.trees | length' <<<"$out")" -eq 1 ] || fail "--json with --dir checks out the head: $rc $out"
rp --no-checkout --merged; [ $rc -eq 0 ] && grep -q 'need a checkout' <<<"$out" || fail "--merged with --no-checkout says so: $rc $out"
echo conflict >"$r/b"; g -C "$r" add -A; g -C "$r" commit -qm "main adds b"; g -C "$r" push -q origin main
rp --merged; [ $rc -eq 1 ] && grep -q 'does not merge cleanly' <<<"$out" && grep -q ' b' <<<"$out" || fail "--merged on a conflict exits 1 naming the file: $rc $out"
[ ! -d "$tmp/wt/review-9-merged" ] || fail "a conflict leaves no merged checkout behind"
rp --json --merged; [ $rc -eq 1 ] && ! jq -e . <<<"$out" >/dev/null 2>&1 || fail "--json --merged on a conflict exits 1 with no JSON: $rc $out"
rp --done; [ ! -d "$tmp/wt/review-9" ] && [ ! -d "$tmp/wt/review-9-merged" ] && ! ls "$tmp/wt" | grep -q 'review-9-at-' || fail "--done removes every checkout: $(ls "$tmp/wt")"

[ $fails -eq 0 ] && echo "review-prep: all cases pass"
exit $fails
