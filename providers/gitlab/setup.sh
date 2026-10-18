#!/usr/bin/env bash
# Optional GitLab forge provider: install the normalized gitlab-forge adapter
# plus compatibility helpers gl-mr and gl-note.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin_dir="${DELIVERY_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$bin_dir"
cp "$here/gitlab-forge.ts" "$bin_dir/gitlab-forge"
chmod 0755 "$bin_dir/gitlab-forge"
for tool in gl-mr gl-note; do
  cp "$here/$tool" "$bin_dir/$tool"
  chmod 0755 "$bin_dir/$tool"
done
echo "Forge tools -> $bin_dir"
