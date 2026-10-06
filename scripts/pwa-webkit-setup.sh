#!/usr/bin/env bash
# Makes Playwright's WebKit start on a host that lacks the Ubuntu libraries it was built against, without
# touching the system: downloads the few missing libraries and unpacks them into the browser's own
# bundle (~/.cache/ms-playwright/webkit-*/minibrowser-*/sys/lib). Safe to run again.
# usage: scripts/pwa-webkit-setup.sh
set -euo pipefail
TMP="${TMPDIR:-$HOME/.cache/hitl-ci/tmp}/pwa-webkit-setup.$$"
mkdir -p "$TMP"
trap 'rm -rf "$TMP"' EXIT

cd "$(dirname "$0")/.."
npx playwright install webkit >/dev/null 2>&1 || true
dirs=$(ls -d "$HOME"/.cache/ms-playwright/webkit-*/minibrowser-*/sys/lib 2>/dev/null || true)
[ -n "$dirs" ] || { echo "pwa-webkit-setup: no WebKit bundle under ~/.cache/ms-playwright (npx playwright install webkit failed)" >&2; exit 1; }

# Package -> file name in the Ubuntu 24.04 archive.
fetch() {
  local pkg="$1" suite file
  for suite in noble-updates noble-security noble; do
    for comp in main universe; do
      file=$(curl -fsS "http://archive.ubuntu.com/ubuntu/dists/$suite/$comp/binary-amd64/Packages.gz" | gunzip | awk -v p="$pkg" '$1=="Package:"{cur=$2} $1=="Filename:"&&cur==p{print $2; exit}')
      if [ -n "$file" ]; then curl -fsS -o "$TMP/$pkg.deb" "http://archive.ubuntu.com/ubuntu/$file"; return 0; fi
    done
  done
  echo "pwa-webkit-setup: $pkg not found in the Ubuntu archive" >&2
  return 1
}

for pkg in libicu74 libflite1 libxml2; do
  fetch "$pkg"
  mkdir -p "$TMP/x-$pkg"
  (cd "$TMP/x-$pkg" && ar x "../$pkg.deb" && tar --zstd -xf data.tar.zst)
  find "$TMP/x-$pkg" \( -type f -o -type l \) -name '*.so*' -exec cp -an {} "$TMP/" \;
done

# The image decoder and the backtrace library are linked but barely used: the host's newer jxl library
# stands in, and an empty library satisfies the backtrace one.
jxl=$(ls /usr/lib/libjxl.so.0.* /usr/lib64/libjxl.so.0.* 2>/dev/null | head -1 || true)
[ -n "$jxl" ] && ln -sf "$jxl" "$TMP/libjxl.so.0.8"
jxlt=$(ls /usr/lib/libjxl_threads.so.0.* /usr/lib64/libjxl_threads.so.0.* 2>/dev/null | head -1 || true)
[ -n "$jxlt" ] && ln -sf "$jxlt" "$TMP/libjxl_threads.so.0.8"
echo 'void backtrace_stub(void){}' > "$TMP/s.c"
gcc -shared -o "$TMP/libbacktrace.so.0" "$TMP/s.c"

for d in $dirs; do cp -an "$TMP"/*.so* "$d"/; done
echo "pwa-webkit-setup: libraries installed into the WebKit bundle"
PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1 node -e "
const { webkit } = require('playwright');
(async () => { const b = await webkit.launch(); console.log('pwa-webkit-setup: WebKit', b.version(), 'starts'); await b.close(); })().catch((e) => { console.error(String(e).split('\n')[0]); process.exit(1); });
"
