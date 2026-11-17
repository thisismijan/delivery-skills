#!/usr/bin/env bash
# Optional Jira tracker provider: install the normalized jira-tracker adapter.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin_dir="${DELIVERY_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$bin_dir"
cp "$here/jira-tracker.ts" "$bin_dir/jira-tracker"
chmod 0755 "$bin_dir/jira-tracker"
echo "Tracker tools -> $bin_dir"
