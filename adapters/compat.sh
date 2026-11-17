#!/usr/bin/env bash
# Named-host compatibility wrapper. The generic installer requires --skills-dir.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
targets=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cursor) targets+=(cursor) ;;
    --claude) targets+=(claude) ;;
    --store) targets+=(store) ;;
    --all) targets+=(cursor claude store) ;;
    *)
      echo "usage: $0 [--cursor] [--claude] [--store] [--all]" >&2
      exit 2
      ;;
  esac
  shift
done
if [[ ${#targets[@]} -eq 0 ]]; then
  echo "usage: $0 [--cursor] [--claude] [--store] [--all]" >&2
  exit 2
fi

for target in "${targets[@]}"; do
  case "$target" in
    cursor) bash "$here/cursor/install.sh" ;;
    claude) bash "$here/claude-code/install.sh" ;;
    store) bash "$here/cursor/install-store.sh" ;;
  esac
done
