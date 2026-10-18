#!/usr/bin/env bash
# Compatibility wrapper: install the generic pack into the Claude Code skills path.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
dest="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
bash "$root/install.sh" --skills-dir "$dest" --adapter claude-code --provider gitlab "$@"
echo "Claude Code skills -> $dest"
