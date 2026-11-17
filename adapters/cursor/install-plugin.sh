#!/usr/bin/env bash
# Install the pack as a local Cursor plugin: the usual install into the plugin's
# skills folder, then the agents and manifest Cursor reads.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../.." && pwd)"
dest="${CURSOR_PLUGIN_DIR:-$HOME/.cursor/plugins/local/delivery}"
mkdir -p "$dest"
bash "$root/install.sh" --skills-dir "$dest/skills" --adapter cursor --provider gitlab "$@"
bun "$root/factory/scripts/cursor-plugin.ts" build "$dest" "$dest/skills/_factory"
echo "Cursor plugin -> $dest"
echo "Reload Cursor, then confirm the plugin's skills and agents appear in Customize."
