#!/usr/bin/env bash
# Cursor adapter: install and verify the hooks.json denial boundary.
set -euo pipefail

factory_root="${DELIVERY_FACTORY_ROOT:?}"
hooks_file="${CURSOR_HOOKS_FILE:-$HOME/.cursor/hooks.json}"
evidence="$factory_root/.mutation-guard-enforced"
bun "$factory_root/scripts/cursor-settings.ts" \
  "$hooks_file" \
  "$factory_root" \
  "$evidence"
echo "Reload Cursor so hooks.json is loaded. Mutating stages stay blocked until doctor shows Mutation guard as ready."
