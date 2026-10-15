#!/usr/bin/env bash
# Install delivery skills for Cursor and Claude Code from this clone.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
hosts=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --cursor) hosts+=(cursor) ;;
    --claude) hosts+=(claude) ;;
    --store) hosts+=(store) ;;
    --all) hosts+=(cursor claude store) ;;
    *) echo "usage: $0 [--cursor] [--claude] [--store] [--all]" >&2; exit 2 ;;
  esac
  shift
done
if [[ ${#hosts[@]} -eq 0 ]]; then
  hosts=(cursor claude)
fi

if [[ -z "${DELIVERY_INSTALL_SKIP_BUN:-}" ]] && command -v bun >/dev/null 2>&1; then
  (cd "$root/factory" && bun install)
else
  echo "bun is not on PATH; factory gate scripts will fail until it is installed" >&2
fi

link_dir() {
  local dest="$1"
  mkdir -p "$dest"
  local skill
  for skill in "$root/skills"/*; do
    local name
    name="$(basename "$skill")"
    ln -sfn "$skill" "$dest/$name"
  done
}

for host in "${hosts[@]}"; do
  case "$host" in
    cursor)
      link_dir "${CURSOR_SKILLS_DIR:-$HOME/.cursor/skills}"
      echo "Cursor skills -> ${CURSOR_SKILLS_DIR:-$HOME/.cursor/skills}"
      ;;
    claude)
      link_dir "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
      echo "Claude Code skills -> ${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
      ;;
    store)
      # Cloud Agent personal store. Copy, do not symlink: the store may not
      # follow links outside itself. Place factory as a sibling of `skills/`
      # so `../../factory` from a skill still resolves.
      store="${CURSOR_AGENT_STORE:-/cursor/stores/user/skills}"
      store_parent="$(dirname "$store")"
      store_probe="${CURSOR_AGENT_STORE_PROBE:-$(
        case "$store" in
          /cursor/*) echo /cursor ;;
          *) echo "$store_parent" ;;
        esac
      )}"
      if [[ ! -d "$store_probe" ]] || [[ ! -w "$store_probe" ]]; then
        echo "Agent store skipped (not writable here): $store"
        continue
      fi
      if ! mkdir -p "$store" 2>/dev/null; then
        echo "Agent store skipped (not writable here): $store"
        continue
      fi
      for skill in "$root/skills"/*; do
        name="$(basename "$skill")"
        rm -rf "$store/$name"
        cp -R "$skill" "$store/$name"
      done
      rm -rf "$store_parent/factory"
      cp -R "$root/factory" "$store_parent/factory"
      echo "Agent store -> $store"
      echo "Factory -> $store_parent/factory"
      ;;
  esac
done

echo "Next: open a new Cursor chat and a new Claude Code session so /delivery reloads."
echo "Factory root: $root/factory"
