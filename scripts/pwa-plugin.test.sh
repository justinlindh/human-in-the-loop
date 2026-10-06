#!/usr/bin/env bash
# Cases for the pwa build plugin (scripts/vite-pwa.mjs): the build writes a manifest, a service worker and a
# warm list scoped to its base, and keeps the large files out of the precache. Exit 0 when all pass.
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
    const shell = JSON.parse(sw.match(/const SHELL = (\[.*\]);/)[1]);
    const assets = JSON.parse(fs.readFileSync(out + "/pwa-assets.json", "utf8"));
    const html = fs.readFileSync(out + "/index.html", "utf8");
    const bad = [];
    if (m.start_url !== base || m.scope !== base || m.display !== "standalone") bad.push("manifest scope/start/display");
    if (!m.icons.some((i) => i.purpose === "maskable") || !m.icons.every((i) => i.src.startsWith(base) && fs.existsSync(out + "/" + i.src.slice(base.length)))) bad.push("manifest icons");
    if (!sw.includes("const BASE = \"" + base + "\"".replace(/"/g, "\x27")) && !sw.includes("const BASE = \x27" + base + "\x27")) bad.push("sw base");
    if (!/v9\.9\.9-[0-9a-f]{8}/.test(sw) || assets.version !== sw.match(/const VERSION = \x27([^\x27]+)\x27/)[1]) bad.push("version");
    if (shell.some((f) => /^(audio|models|memes|icons)\//.test(f))) bad.push("large files in the shell");
    if (!shell.includes("index.html") || !shell.some((f) => f.startsWith("assets/") && f.endsWith(".js"))) bad.push("shell lacks the page or bundles");
    if (!shell.every((f) => fs.existsSync(out + "/" + f))) bad.push("shell lists a missing file");
    if (!assets.warm.some((f) => f.startsWith("models/")) || assets.warm.some((f) => /^audio\/(music|voice)/.test(f))) bad.push("warm list");
    if (!html.includes("href=\"" + base + "manifest.webmanifest\"") || !html.includes("theme-color")) bad.push("index.html tags");
    if (bad.length) { console.log(bad.join("; ")); process.exit(1); }
  ' "$out" "$base" || fail "base $base: generated files are wrong"
done

[ $fails -eq 0 ] && echo "pwa-plugin: all cases pass"
exit $fails
