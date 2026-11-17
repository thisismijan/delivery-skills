#!/usr/bin/env bash
# Optional GitHub provider: install github-forge and github-tracker with a shared client.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin_dir="${DELIVERY_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$bin_dir"
cp "$here/github-client.ts" "$bin_dir/github-client.ts"
cp "$here/github-forge.ts" "$bin_dir/github-forge"
cp "$here/github-tracker.ts" "$bin_dir/github-tracker"
chmod 0755 "$bin_dir/github-forge" "$bin_dir/github-tracker"
echo "GitHub tools -> $bin_dir"
