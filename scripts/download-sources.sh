#!/usr/bin/env bash
# Үгийн сан генераторуудын (gen-hsk1.py г.м.) эх өгөгдлийг татна.
# Эдгээр файл нь том тул git-д ороогүй (data/ нь .gitignore-д). Генератор
# ажиллуулахын өмнө нэг удаа ажиллуул:  bash scripts/download-sources.sh
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p data/sources
dl(){ [[ -f "$1" ]] && { echo "  ✓ $1"; return; }; echo "  ↓ $1"; curl -fsSL -o "$1" "$2"; }

echo "📦 Эх өгөгдөл → data/sources/"
# makemeahanzi — задаргаа (decomposition) + пиньин + тодорхойлолт + этимологи
dl data/sources/mmah.txt "https://raw.githubusercontent.com/skishore/makemeahanzi/master/dictionary.txt"
# HSK (хуучин) 1, 2 — үгийн жагсаалт + пиньин
dl data/sources/hsk_old_1.json "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/old/1.json"
dl data/sources/hsk_old_2.json "https://raw.githubusercontent.com/drkameleon/complete-hsk-vocabulary/main/wordlists/exclusive/old/2.json"
# CC-CEDICT — жишээ үгийн пиньин (дугаартай → диакритик генератор дотор)
if [[ ! -f data/sources/cedict.txt ]]; then
  echo "  ↓ data/sources/cedict.txt"
  curl -fsSL -o data/sources/cedict.txt.gz "https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz"
  gunzip -f data/sources/cedict.txt.gz
else echo "  ✓ data/sources/cedict.txt"; fi
echo "✓ Бэлэн. Одоо: python3 scripts/gen-hsk1.py"
