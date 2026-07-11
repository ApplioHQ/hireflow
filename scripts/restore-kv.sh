#!/usr/bin/env bash
# Restore keys from a backup JSON (created by backup-kv.sh) back into a KV namespace.
# WRITES to KV, only run this to recover. By default it restores ONLY user:* and
# resume:* keys (skips rate-limit/health/stripe-dedupe junk). Pass --all to restore
# everything.
# Usage:  ./scripts/restore-kv.sh backups/kv-backup-XXXX.json [NAMESPACE_ID] [--all]
set -euo pipefail

FILE="${1:?Usage: restore-kv.sh <backup.json> [NAMESPACE_ID] [--all]}"
NS="${2:-84f236c3086b4ca7809be72b6969ea62}"
MODE="${3:-}"

[ -f "$FILE" ] || { echo "Backup file not found: $FILE"; exit 1; }

echo "Restoring from ${FILE} into namespace ${NS} (mode: ${MODE:-user+resume only})…"
node -e '
const fs=require("fs");
const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));
const all=process.argv[2]==="--all";
for(const k of Object.keys(data)){
  if(!all && !/^(user:|resume:)/.test(k)) continue;
  console.log(k);
}
' "$FILE" "$MODE" | while IFS= read -r key; do
  [ -z "$key" ] && continue
  val="$(node -e 'const d=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));process.stdout.write(d[process.argv[2]])' "$FILE" "$key")"
  printf 'Restoring %s … ' "$key"
  printf '%s' "$val" | npx --yes wrangler kv key put "$key" --namespace-id "$NS" --remote --path /dev/stdin >/dev/null
  echo "done"
done

echo "✓ Restore complete."
