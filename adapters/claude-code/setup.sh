#!/usr/bin/env bash
# Optional Claude Code adapter: install forge/review wrappers from the GitLab provider.
set -euo pipefail

pack_root="${DELIVERY_PACK_ROOT:?}"
bin_dir="${DELIVERY_BIN_DIR:-$HOME/.local/bin}"
provider="$pack_root/providers/gitlab"
mkdir -p "$bin_dir"
for tool in gl-mr gl-note; do
  cp "$provider/$tool" "$bin_dir/$tool"
  chmod 0755 "$bin_dir/$tool"
done
echo "Review tools -> $bin_dir"
