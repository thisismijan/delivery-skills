#!/usr/bin/env bash
# Claude Code adapter: install and verify the mutation-denial hook.
set -euo pipefail

factory_root="${DELIVERY_FACTORY_ROOT:?}"
settings_file="${CLAUDE_SETTINGS_FILE:-$HOME/.claude/settings.json}"
evidence="$factory_root/.mutation-guard-enforced"
bun "$factory_root/scripts/claude-settings.ts" \
  "$settings_file" \
  "$factory_root" \
  "$evidence"
