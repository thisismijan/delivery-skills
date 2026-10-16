#!/usr/bin/env bash
# Optional GitLab forge provider: install read-only MR metadata and note helpers.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin_dir="${DELIVERY_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$bin_dir"
for tool in gl-mr gl-note; do
  cp "$here/$tool" "$bin_dir/$tool"
  chmod 0755 "$bin_dir/$tool"
done
echo "Forge tools -> $bin_dir"
