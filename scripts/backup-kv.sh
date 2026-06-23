#!/usr/bin/env bash
# Snapshot the entire HIREFLOW_KV namespace to a timestamped JSON file under backups/.
# Read-only against KV. Output is gitignored (contains emails + password hashes).
# Usage:  ./scripts/backup-kv.sh [NAMESPACE_ID]
set -euo pipefail

NS="${1:-84f236c3086b4ca7809be72b6969ea62}"
TS="$(date +%Y%m%d-%H%M%S)"
mkdir -p backups
OUT="backups/kv-backup-${TS}.json"

echo "Listing keys from namespace ${NS}…"
KEYS="$(npx --yes wrangler kv key list --namespace-id "$NS" --remote \
  | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{JSON.parse(d).forEach(k=>console.log(k.name))})')"

COUNT="$(printf '%s\n' "$KEYS" | grep -c . || true)"
echo "Found ${COUNT} keys. Backing up to ${OUT}…"

printf '{\n' > "$OUT"
first=1
while IFS= read -r key; do
  [ -z "$key" ] && continue
  val="$(npx --yes wrangler kv key get "$key" --namespace-id "$NS" --remote)"
  if [ $first -eq 0 ]; then printf ',\n' >> "$OUT"; fi
  first=0
  node -e 'process.stdout.write("  "+JSON.stringify(process.argv[1])+": "+JSON.stringify(process.argv[2]))' "$key" "$val" >> "$OUT"
done <<< "$KEYS"
printf '\n}\n' >> "$OUT"

echo "✓ Backup saved: ${OUT} (${COUNT} keys)"
