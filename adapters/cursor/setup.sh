#!/usr/bin/env bash
# Cursor adapter: state the host mutation limitation; providers install tools.
set -euo pipefail

echo "Cursor read-only stages are ready. Mutating stages remain blocked because Cursor exposes no enforceable denial hook."
