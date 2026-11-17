#!/usr/bin/env bash
# Optional GitLab provider: install gitlab-forge, gitlab-work-item, and the
# shared host module they import.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
bin_dir="${DELIVERY_BIN_DIR:-$HOME/.local/bin}"
mkdir -p "$bin_dir"
cp "$here/gitlab-host.ts" "$bin_dir/gitlab-host.ts"
cp "$here/gitlab-forge.ts" "$bin_dir/gitlab-forge"
cp "$here/gitlab-work-item.ts" "$bin_dir/gitlab-work-item"
chmod 0755 "$bin_dir/gitlab-forge" "$bin_dir/gitlab-work-item"
echo "GitLab tools -> $bin_dir"
