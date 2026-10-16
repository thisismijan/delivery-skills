#!/usr/bin/env bash
# Compatibility wrapper: install the generic pack into the Cursor skills path.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
dest="${CURSOR_SKILLS_DIR:-$HOME/.cursor/skills}"
bash "$root/install.sh" --skills-dir "$dest" --adapter cursor "$@"
echo "Cursor skills -> $dest"
