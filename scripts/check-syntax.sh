#!/usr/bin/env bash
set -euo pipefail

status=0

while IFS= read -r -d '' file; do
  if ! node --check "$file"; then
    status=1
  fi
done < <(git ls-files -z '*.js')

exit $status
