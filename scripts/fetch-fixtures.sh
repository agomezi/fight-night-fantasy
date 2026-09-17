#!/usr/bin/env bash
# Fetch the HTML fixtures the ingestion parser tests run against.
#
# The fixtures are not committed — they are ~800KB of third-party markup that
# would dominate the repo's diff. Run this once after cloning, and again if a
# test starts failing on markup that has since changed upstream.
#
#   bash scripts/fetch-fixtures.sh

set -euo pipefail
cd "$(dirname "$0")/.."

DIR="services/ingestion/__fixtures__"
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36"
EVENTS="ufc-316 ufc-317 ufc-318 ufc-319"

mkdir -p "$DIR"

for e in $EVENTS; do
  out="$DIR/$e.html"
  code=$(curl -sL --max-time 45 -A "$UA" "https://www.ufc.com/event/$e" -o "$out" -w "%{http_code}")
  size=$(wc -c < "$out")
  if [ "$code" != "200" ] || [ "$size" -lt 50000 ]; then
    echo "FAILED $e (http $code, ${size}b) — expected a full event page" >&2
    exit 1
  fi
  printf '%-10s %s bytes\n' "$e" "$size"
done

echo
echo "Done. Run the parser tests with:  npx jest services/ingestion"
