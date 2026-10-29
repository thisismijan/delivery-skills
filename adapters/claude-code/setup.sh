#!/usr/bin/env bash
# Claude Code adapter: install and verify the mutation-denial hook.
set -euo pipefail

factory_root="${DELIVERY_FACTORY_ROOT:?}"
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
settings_file="${CLAUDE_SETTINGS_FILE:-$HOME/.claude/settings.json}"
evidence="$factory_root/.mutation-guard-enforced"
preload="$factory_root/host/no-agent-summary.js"
mkdir -p "$(dirname "$preload")"
cp "$here/no-agent-summary.js" "$preload"
bun "$factory_root/scripts/claude-settings.ts" \
  "$settings_file" \
  "$factory_root" \
  "$evidence" \
  "$preload"
