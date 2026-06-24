#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TSONIC_ROOT="$(cd "$REPO_ROOT/../tsonic" && pwd)"

for package_dir in packages/tsts packages/source-core packages/target-api; do
  (cd "$TSONIC_ROOT/$package_dir" && npm run build)
done

"$TSONIC_ROOT/scripts/build/tsgo-project.sh" "$REPO_ROOT/tsconfig.json" --pretty false
