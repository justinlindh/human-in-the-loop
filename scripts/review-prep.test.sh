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
  jq -n --arg a "$1" --argjson c "$2" '{author: {login: $a}, isCrossRepository: $c}' >"$tmp/pr.json"; echo "$3" | tr ' ' '\n' | sed 's/$/\t1\t0/' >"$tmp/files"
  shift 3; out="$(PATH="$tmp/bin:$PATH" bash "$HERE/review-prep.sh" 9 --no-checkout "$@" 2>&1)"; rc=$?
}
gate justinlindh true 'src/a.js'; [ $rc -eq 3 ] && grep -q fork <<<"$out" || fail "a fork: $rc $out"
gate stranger false 'src/a.js'; [ $rc -eq 3 ] && grep -q 'not in scripts/ci-trusted' <<<"$out" || fail "an outside author: $rc $out"
gate 'dependabot[bot]' false 'package.json'; [ $rc -eq 3 ] && grep -q 'use --bot' <<<"$out" || fail "Dependabot without --bot: $rc $out"
gate 'dependabot[bot]' false 'package.json src/main.js' --bot; [ $rc -eq 3 ] && grep -q 'src/main.js' <<<"$out" || fail "Dependabot touching code: $rc $out"
gate justinlindh false 'package.json' --bot; [ $rc -eq 3 ] && grep -q 'for Dependabot PRs' <<<"$out" || fail "--bot on a person's PR: $rc $out"
gate justinlindh false 'src/a.js'; [ $rc -eq 2 ] && grep -q "can't fetch" <<<"$out" || fail "a trusted PR passes the gate: $rc $out"
gate 'dependabot[bot]' false 'package.json package-lock.json .github/workflows/ci.yml' --bot; [ $rc -ne 3 ] || fail "a clean Dependabot PR passes the gate: $rc $out"

[ $fails -eq 0 ] && echo "review-prep: all cases pass"
exit $fails
