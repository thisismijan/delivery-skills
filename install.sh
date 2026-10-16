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

if [[ -n "${DELIVERY_INSTALL_SKIP_BUN:-}" ]]; then
  :
elif command -v bun >/dev/null 2>&1; then
  (cd "$root/factory" && bun install --frozen-lockfile)
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
    if [[ -e "$dest/$name" || -L "$dest/$name" ]]; then
      if [[ -L "$dest/$name" && "$(readlink "$dest/$name")" == "$skill" ]]; then
        continue
      fi
      rm -rf -- "$dest/$name"
    fi
    ln -s "$skill" "$dest/$name"
  done
}

install_review_tools() {
  local review_skill="$1"
  local bin_dir="${DELIVERY_BIN_DIR:-$HOME/.local/bin}"
  mkdir -p "$bin_dir"
  local tool
  for tool in gl-mr gl-note; do
    cat >"$bin_dir/$tool" <<EOF
#!/usr/bin/env bash
exec bash "$review_skill/$tool" "\$@"
EOF
    chmod 0755 "$bin_dir/$tool"
  done
  echo "Review tools -> $bin_dir"
}

copy_delivery_skill() {
  local source="$1" dest="$2"
  mkdir -p "$dest"
  local manifest="$dest/.delivery-managed"
  if [[ -f "$manifest" ]]; then
    while IFS= read -r name; do
      case "$name" in runs|candidates|versions|"") continue ;; esac
      rm -rf -- "$dest/$name"
    done <"$manifest"
  fi
  : >"$manifest"
  local item name
  for item in "$source"/*; do
    name="$(basename "$item")"
    rm -rf -- "$dest/$name"
    cp -R "$item" "$dest/$name"
    printf '%s\n' "$name" >>"$manifest"
  done
}

copy_factory() {
  local dest="$1"
  mkdir -p "$dest"
  local manifest="$dest/.delivery-managed"
  if [[ -f "$manifest" ]]; then
    while IFS= read -r name; do
      [[ -n "$name" ]] && rm -rf -- "$dest/$name"
    done <"$manifest"
  fi
  : >"$manifest"
  local item name
  for item in "$root/factory"/*; do
    name="$(basename "$item")"
    case "$name" in node_modules|.review) continue ;; esac
    rm -rf -- "$dest/$name"
    cp -R "$item" "$dest/$name"
    printf '%s\n' "$name" >>"$manifest"
  done
}

for host in "${hosts[@]}"; do
  case "$host" in
    cursor)
      link_dir "${CURSOR_SKILLS_DIR:-$HOME/.cursor/skills}"
      install_review_tools "$root/skills/mr-review"
      echo "Cursor skills -> ${CURSOR_SKILLS_DIR:-$HOME/.cursor/skills}"
      ;;
    claude)
      link_dir "${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
      install_review_tools "$root/skills/mr-review"
      echo "Claude Code skills -> ${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"
      ;;
    store)
      # Cloud Agent personal store. Copy, do not symlink: the store may not
      # follow links outside itself. Keep the factory inside the synced skills
      # tree; /cursor/stores/user/factory is a different Cursor namespace.
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
        continue
      fi
      if ! mkdir -p "$store" 2>/dev/null; then
        echo "Agent store skipped (not writable here): $store"
        continue
      fi
      for skill in "$root/skills"/*; do
        name="$(basename "$skill")"
        if [[ "$name" == "delivery" ]]; then
          copy_delivery_skill "$skill" "$store/$name"
        else
          rm -rf -- "$store/$name"
          cp -R "$skill" "$store/$name"
        fi
      done
      copy_factory "$store/_factory"
      install_review_tools "$store/mr-review"
      echo "Agent store -> $store"
      echo "Factory -> $store/_factory"
      ;;
  esac
done

echo "Next: open a new Cursor chat and a new Claude Code session so /delivery reloads."
echo "Factory root: $root/factory"
