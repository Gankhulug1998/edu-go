#!/usr/bin/env bash
# Download required fonts into assets/fonts/.
# Run once after `npm install`:  npm run fonts
set -euo pipefail
cd "$(dirname "$0")/../assets/fonts"

dl() {
  local out="$1"; local url="$2"
  if [[ -f "$out" ]]; then echo "  ✓ $out (exists)"; return; fi
  echo "  ↓ $out"
  curl -fsSL -o "$out" "$url"
}

echo "📦 Downloading fonts → assets/fonts/"

# Inter — static WOFF, split per subset (latin / cyrillic). Satori falls back
# within the same family for missing glyphs, so Cyrillic letters fall through
# to the cyrillic file. @fontsource v4 ships WOFF1 which satori parses cleanly.
FS=https://cdn.jsdelivr.net/npm/@fontsource/inter@4.5.15/files
for subset in latin latin-ext cyrillic cyrillic-ext; do
  for weight in 400 700; do
    dl "Inter-${subset}-${weight}.woff" "$FS/inter-${subset}-${weight}-normal.woff"
  done
done

# Source Han Sans CN — Simplified Chinese sans (Noto Sans SC equivalent, smaller)
dl SourceHanSansCN-Regular.otf "https://github.com/adobe-fonts/source-han-sans/raw/release/SubsetOTF/CN/SourceHanSansCN-Regular.otf"
dl SourceHanSansCN-Bold.otf    "https://github.com/adobe-fonts/source-han-sans/raw/release/SubsetOTF/CN/SourceHanSansCN-Bold.otf"

# Source Han Serif CN Bold — fallback serif for the big character
dl SourceHanSerifCN-Bold.otf "https://github.com/adobe-fonts/source-han-serif/raw/release/SubsetOTF/CN/SourceHanSerifCN-Bold.otf"

# LXGW WenKai (霞鹜文楷) Medium — clean textbook-style kaishu. Used for ALL
# Chinese characters so they read like neat, elegant handwriting. OFL-licensed.
dl LXGWWenKai-Medium.ttf "https://github.com/lxgw/LxgwWenKai/releases/download/v1.522/LXGWWenKai-Medium.ttf"

echo "✓ Done."
