#!/usr/bin/env bash
# Compatibility wrapper: copy the pack into a Cloud Agent skill store when writable.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
store="${CURSOR_AGENT_STORE:-/cursor/stores/user/skills}"
# macOS bash 3.2 cannot parse a case statement inside $( ... ).
if [[ -n "${CURSOR_AGENT_STORE_PROBE:-}" ]]; then
  store_probe="$CURSOR_AGENT_STORE_PROBE"
elif [[ "$store" == /cursor/* ]]; then
  store_probe=/cursor
else
  store_probe="$(dirname "$store")"
fi
if [[ ! -d "$store_probe" ]] || [[ ! -w "$store_probe" ]]; then
  echo "Agent store skipped (not writable here): $store"
  exit 0
fi
if ! mkdir -p "$store" 2>/dev/null; then
  echo "Agent store skipped (not writable here): $store"
  exit 0
fi
# A store may refuse folder renames and symbolic links, so install locally,
# copy the result in place, then point the mutation hook at the store copy.
local_dir="$(mktemp -d)"
trap 'rm -rf -- "$local_dir"' EXIT
CURSOR_HOOKS_FILE="$local_dir/hooks.json" \
  bash "$root/install.sh" --skills-dir "$local_dir/skills" --adapter cursor --provider gitlab "$@"
bun "$root/factory/scripts/store-sync.ts" "$local_dir/skills" "$store"
DELIVERY_FACTORY_ROOT="$store/_factory" bash "$here/setup.sh"
echo "Agent store -> $store"
echo "Factory -> $store/_factory"
