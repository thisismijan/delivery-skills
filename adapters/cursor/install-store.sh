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
bash "$root/install.sh" --skills-dir "$store" --adapter cursor "$@"
echo "Agent store -> $store"
echo "Factory -> $store/_factory"
