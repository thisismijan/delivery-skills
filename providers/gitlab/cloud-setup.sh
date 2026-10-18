#!/usr/bin/env bash
# Cloud agents only: puts gitlab-forge, gl-mr, and gl-note on PATH. The skill
# store drops execute bits, a cloud agent has the GitLab token only as
# GITLAB_TOKEN (not ~/token), and git's insteadOf rewrite gives
# `git remote get-url` a credentialed URL that host parsing must strip.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -n "${GITLAB_TOKEN:-}" ] || { echo "GITLAB_TOKEN is not set" >&2; exit 1; }

bin_dir="${DELIVERY_BIN_DIR:-${HOME}/.local/bin}"
mkdir -p "$bin_dir"
cp "${here}/gitlab-forge.ts" "${bin_dir}/gitlab-forge"
chmod 0755 "${bin_dir}/gitlab-forge"
for tool in gl-mr gl-note; do
  cp "${here}/${tool}" "${bin_dir}/${tool}"
  chmod 0755 "${bin_dir}/${tool}"
done

echo "gitlab-forge, gl-mr, and gl-note installed in ${bin_dir}; add it to PATH if needed"
