#!/usr/bin/env bash
# Install generic delivery skills and runtime into an explicit skills directory.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
adapters_root="${DELIVERY_ADAPTERS_DIR:-$root/adapters}"
skills_dir=""
adapter=""

usage() {
  echo "usage: $0 --skills-dir <path> [--adapter <name>]" >&2
  exit 2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skills-dir)
      [[ $# -ge 2 ]] || usage
      skills_dir="$2"
      shift 2
      ;;
    --adapter)
      [[ $# -ge 2 ]] || usage
      adapter="$2"
      shift 2
      ;;
    --cursor|--claude|--store|--all)
      echo "named host flags live in adapters/compat.sh; pass --skills-dir" >&2
      usage
      ;;
    *)
      usage
      ;;
  esac
done

[[ -n "$skills_dir" ]] || usage
if [[ -n "$adapter" && ! -d "$adapters_root/$adapter" ]]; then
  echo "unknown adapter: $adapter" >&2
  exit 2
fi

if [[ "$skills_dir" != /* ]]; then
  skills_dir="$(pwd)/$skills_dir"
fi
skills_dir="${skills_dir%/}"
parent="$(dirname -- "$skills_dir")"

if [[ -e "$skills_dir" ]]; then
  if [[ ! -d "$skills_dir" ]]; then
    echo "destination is not writable: $skills_dir" >&2
    exit 1
  fi
  if [[ ! -w "$skills_dir" ]] || ! touch "$skills_dir/.delivery-write-probe" 2>/dev/null; then
    echo "destination is not writable: $skills_dir" >&2
    exit 1
  fi
  rm -f -- "$skills_dir/.delivery-write-probe"
else
  if [[ ! -d "$parent" ]]; then
    if ! mkdir -p "$parent" 2>/dev/null; then
      echo "destination is not writable: $skills_dir" >&2
      exit 1
    fi
  elif [[ ! -w "$parent" ]]; then
    echo "destination is not writable: $skills_dir" >&2
    exit 1
  fi
fi

if [[ -n "${DELIVERY_INSTALL_SKIP_BUN:-}" ]]; then
  :
elif command -v bun >/dev/null 2>&1; then
  (cd "$root/factory" && bun install --frozen-lockfile)
else
  echo "bun is not on PATH; factory gate scripts will fail until it is installed" >&2
fi

copy_unmanaged() {
  local src="$1" dest="$2"
  local old_manifest="$src/.delivery-managed"
  local item name
  [[ -d "$src" ]] || return 0
  for item in "$src"/*; do
    [[ -e "$item" ]] || continue
    name="$(basename "$item")"
    if [[ -e "$dest/$name" || -L "$dest/$name" ]]; then
      continue
    fi
    if [[ -f "$old_manifest" ]] && grep -Fxq "$name" "$old_manifest"; then
      continue
    fi
    cp -R "$item" "$dest/$name"
  done
}

preserve_state() {
  local src="$1" dest="$2"
  local state
  for state in runs candidates versions; do
    if [[ -e "$src/$state" ]]; then
      rm -rf -- "$dest/$state"
      cp -R "$src/$state" "$dest/$state"
    fi
  done
}

copy_factory() {
  local dest="$1"
  mkdir -p "$dest"
  local item name
  for item in "$root/factory"/* "$root/factory"/.[!.]*; do
    [[ -e "$item" ]] || continue
    name="$(basename "$item")"
    case "$name" in node_modules|.review|.|..) continue ;; esac
    rm -rf -- "$dest/$name"
    cp -R "$item" "$dest/$name"
  done
}

staging=""
backup=""
cleanup() {
  if [[ -n "$staging" && -d "$staging" ]]; then
    rm -rf -- "$staging"
  fi
  if [[ -n "$backup" && -e "$backup" && ! -e "$skills_dir" ]]; then
    mv "$backup" "$skills_dir" 2>/dev/null || true
  fi
}
trap cleanup EXIT

staging="$(mktemp -d "$parent/.delivery-install.XXXXXX")"
managed="$staging/.delivery-managed"
: >"$managed"

for skill in "$root/skills"/*; do
  [[ -e "$skill" ]] || continue
  name="$(basename "$skill")"
  cp -R "$skill" "$staging/$name"
  : >"$staging/$name/.delivery-managed"
  for item in "$skill"/*; do
    [[ -e "$item" ]] || continue
    printf '%s\n' "$(basename "$item")" >>"$staging/$name/.delivery-managed"
  done
  if [[ -d "$skills_dir/$name" ]]; then
    preserve_state "$skills_dir/$name" "$staging/$name"
    copy_unmanaged "$skills_dir/$name" "$staging/$name"
  fi
  printf '%s\n' "$name" >>"$managed"
done

copy_factory "$staging/_factory"
printf '%s\n' "_factory" >>"$managed"
copy_unmanaged "$skills_dir" "$staging"

if [[ -e "$skills_dir" ]]; then
  backup="$(mktemp -d "$parent/.delivery-backup.XXXXXX")"
  rm -rf -- "$backup"
  mv "$skills_dir" "$backup"
fi
mv "$staging" "$skills_dir"
staging=""
if [[ -n "$backup" ]]; then
  rm -rf -- "$backup"
  backup=""
fi
trap - EXIT

if [[ -n "$adapter" ]]; then
  export DELIVERY_SKILLS_DIR="$skills_dir"
  export DELIVERY_FACTORY_ROOT="$skills_dir/_factory"
  export DELIVERY_PACK_ROOT="$root"
  if [[ -f "$adapters_root/$adapter/setup.sh" ]]; then
    bash "$adapters_root/$adapter/setup.sh"
  fi
  echo "Adapter $adapter applied"
fi

echo "Skills -> $skills_dir"
echo "Runtime -> $skills_dir/_factory"
echo "Reload the host session so the installed skills are picked up."
echo "Factory root: $skills_dir/_factory"
