#!/usr/bin/env bash
# Cases for the pwa build plugin (scripts/vite-pwa.mjs): the build writes a manifest, a service worker and the
# list of files that make up the build, scoped to its base. Exit 0 when all pass.
set -uo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; ROOT="$(cd "$HERE/.." && pwd)"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
fails=0; fail() { echo "FAIL $*"; fails=$((fails + 1)); }
cd "$ROOT" || exit 1

for base in / /sub/; do
  out="$tmp/$(echo "$base" | tr '/' '_')"
  HITL_VERSION=v9.9.9 npx vite build --base "$base" --outDir "$out" --emptyOutDir --logLevel error >/dev/null 2>&1 || { fail "the build with base $base failed"; continue; }
  for f in manifest.webmanifest sw.js pwa-assets.json index.html; do [ -f "$out/$f" ] || fail "base $base: $f is missing"; done
  node -e '
    const fs = require("fs"); const [out, base] = process.argv.slice(1);
    const m = JSON.parse(fs.readFileSync(out + "/manifest.webmanifest", "utf8"));
    const sw = fs.readFileSync(out + "/sw.js", "utf8");
    const assets = JSON.parse(fs.readFileSync(out + "/pwa-assets.json", "utf8"));
    const html = fs.readFileSync(out + "/index.html", "utf8");
    const paths = assets.files.map((f) => f.p);
    const bad = [];
    if (m.start_url !== base || m.scope !== base || m.display !== "standalone") bad.push("manifest scope/start/display");
    if (!m.icons.some((i) => i.purpose === "maskable") || !m.icons.every((i) => i.src.startsWith(base) && fs.existsSync(out + "/" + i.src.slice(base.length)))) bad.push("manifest icons");
    if (!sw.includes("const BASE = \x27" + base + "\x27;")) bad.push("sw base");
    if (!/^v9\.9\.9-[0-9a-f]{8}$/.test(assets.id) || !sw.includes("const ID = \x27" + assets.id + "\x27;") || assets.version !== "v9.9.9") bad.push("version and id");
    if (!paths.includes("index.html") || !paths.includes("manifest.webmanifest") || !paths.some((f) => f.startsWith("assets/") && f.endsWith(".js"))) bad.push("list lacks the page, manifest or bundles");
    if (!paths.some((f) => f.startsWith("models/")) || !paths.some((f) => /^audio\/music\/.*\.ogg$/.test(f)) || !paths.some((f) => /^audio\/music\/.*\.m4a$/.test(f))) bad.push("list lacks models or both sound formats");
    if (paths.includes("sw.js") || paths.includes("pwa-assets.json") || paths.some((f) => f.endsWith(".md"))) bad.push("list holds the worker, itself or notes");
    if (!assets.files.every((f) => fs.existsSync(out + "/" + f.p) && fs.statSync(out + "/" + f.p).size === f.s)) bad.push("list sizes do not match the files");
    if (assets.bytes !== assets.files.reduce((n, f) => n + f.s, 0)) bad.push("total bytes");
    if (!html.includes("href=\"" + base + "manifest.webmanifest\"") || !html.includes("theme-color")) bad.push("index.html tags");
    if (bad.length) { console.log(bad.join("; ")); process.exit(1); }
  ' "$out" "$base" || fail "base $base: generated files are wrong"
done

# The file filter the page applies: one sound format per browser.
node --input-type=module -e '
  import { pickFiles } from "./src/dev/pwa.js";
  const files = [{ p: "audio/a.ogg", s: 1 }, { p: "audio/a.m4a", s: 1 }, { p: "models/x.glb", s: 1 }, { p: "index.html", s: 1 }];
  const opus = pickFiles(files, true).map((f) => f.p).join();
  const aac = pickFiles(files, false).map((f) => f.p).join();
  if (opus !== "audio/a.ogg,models/x.glb,index.html" || aac !== "audio/a.m4a,models/x.glb,index.html") { console.log(opus, aac); process.exit(1); }
' 2>&1 || fail "pickFiles keeps one sound format and everything else"

[ $fails -eq 0 ] && echo "pwa-plugin: all cases pass"
exit $fails
