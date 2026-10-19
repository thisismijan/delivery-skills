#!/usr/bin/env bash
# Cloud agents only: puts gitlab-forge and gitlab-work-item on PATH. The skill
# store drops execute bits, a cloud agent has the GitLab token only as
# GITLAB_TOKEN (not ~/token), and git's insteadOf rewrite gives
# `git remote get-url` a credentialed URL that host parsing must strip.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -n "${GITLAB_TOKEN:-}" ] || { echo "GITLAB_TOKEN is not set" >&2; exit 1; }

bin_dir="${DELIVERY_BIN_DIR:-${HOME}/.local/bin}"
mkdir -p "$bin_dir"
cp "${here}/gitlab-host.ts" "${bin_dir}/gitlab-host.ts"
cp "${here}/gitlab-forge.ts" "${bin_dir}/gitlab-forge"
cp "${here}/gitlab-work-item.ts" "${bin_dir}/gitlab-work-item"
chmod 0755 "${bin_dir}/gitlab-forge" "${bin_dir}/gitlab-work-item"

echo "gitlab-forge and gitlab-work-item installed in ${bin_dir}; add it to PATH if needed"
