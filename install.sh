#!/usr/bin/env bash
# Install generic delivery skills and runtime into an explicit skills directory.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
adapters_root="${DELIVERY_ADAPTERS_DIR:-$root/adapters}"
providers_root="${DELIVERY_PROVIDERS_DIR:-$root/providers}"
skills_dir=""
adapter=""
providers=()

list_dirs() {
  local dir="$1"
  local names=()
  local entry
  shopt -s nullglob
  for entry in "$dir"/*/; do
    names+=("$(basename "$entry")")
  done
  shopt -u nullglob
  printf '%s' "${names[*]}"
}

usage() {
  local dest="${1:-stderr}"
  local message
  message="$(cat <<EOF
usage: $0 --skills-dir <path> [--adapter <name>] [--provider <name>]...
       --help

--provider may be repeated. Later selections overlay per capability.
adapters: $(list_dirs "$adapters_root")
providers: $(list_dirs "$providers_root")
EOF
)"
  if [[ "$dest" == "stdout" ]]; then
    echo "$message"
    exit 0
  fi
  echo "$message" >&2
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
    --provider)
      [[ $# -ge 2 ]] || usage
      providers+=("$2")
      shift 2
      ;;
    --help|-h)
      usage stdout
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
for provider in "${providers[@]+"${providers[@]}"}"; do
  if [[ ! -d "$providers_root/$provider" ]]; then
    echo "unknown provider: $provider" >&2
    exit 2
  fi
done

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

expected_bun=""
while IFS= read -r line; do
  case "$line" in
    *'"packageManager": "bun@'*)
      expected_bun="${line#*bun@}"
      expected_bun="${expected_bun%%\"*}"
      break
      ;;
  esac
done < "$root/factory/package.json"
bun_install_cmd="curl -fsSL https://bun.sh/install | bash -s \"bun-v${expected_bun}\""

if [[ -z "${DELIVERY_INSTALL_SKIP_BUN:-}" ]]; then
  if ! command -v bun >/dev/null 2>&1; then
    echo "Bun ${expected_bun} is required before install." >&2
    echo "Install the pinned runtime:" >&2
    echo "  ${bun_install_cmd}" >&2
    echo "Then restart the shell and confirm: bun --version" >&2
    exit 1
  fi
  found_bun="$(bun --version)"
  if [[ "$found_bun" != "$expected_bun" ]]; then
    echo "Pinned Bun runtime is ${expected_bun}; found ${found_bun}." >&2
    echo "Install the pinned runtime:" >&2
    echo "  ${bun_install_cmd}" >&2
    echo "If an older bun is earlier on PATH, put ~/.bun/bin first or uninstall that package." >&2
    echo "Continuing with ${found_bun}; doctor will keep this as a setup item." >&2
  fi
  bun_install_lock="$root/factory/.delivery-bun-install.lock"
  bun_install_lock_acquired=0
  release_bun_install_lock() {
    if [[ "$bun_install_lock_acquired" -eq 1 ]]; then
      rmdir "$bun_install_lock" 2>/dev/null || true
      bun_install_lock_acquired=0
    fi
  }
  trap release_bun_install_lock EXIT
  for _ in {1..300}; do
    if mkdir "$bun_install_lock" 2>/dev/null; then
      bun_install_lock_acquired=1
      break
    fi
    sleep 0.1
  done
  if [[ "$bun_install_lock_acquired" -ne 1 ]]; then
    echo "Another delivery install is still preparing Bun dependencies; retry after it finishes." >&2
    exit 1
  fi
  (cd "$root/factory" && bun install --frozen-lockfile)
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
    case "$name" in
      node_modules)
        [[ -n "${DELIVERY_INSTALL_SKIP_BUN:-}" ]] && continue
        ;;
      .review|.|..) continue ;;
    esac
    rm -rf -- "$dest/$name"
    cp -R "$item" "$dest/$name"
  done
}

staging=""
backup=""
activated=0
adapter_runtime=""
provider_runtime=""
composed_runtime=""
cleanup() {
  if declare -F release_bun_install_lock >/dev/null 2>&1; then
    release_bun_install_lock
  fi
  if [[ -n "$staging" && -d "$staging" ]]; then
    rm -rf -- "$staging"
  fi
  rm -f -- "$adapter_runtime" "$provider_runtime" "$composed_runtime"
  if [[ "$activated" -eq 1 ]]; then
    rm -rf -- "$skills_dir"
    if [[ -n "$backup" && -e "$backup" ]]; then
      mv "$backup" "$skills_dir" 2>/dev/null || true
    fi
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
if declare -F release_bun_install_lock >/dev/null 2>&1; then
  release_bun_install_lock
fi
if [[ -n "${DELIVERY_INSTALL_SKIP_BUN:-}" ]]; then
  cp "$root/factory/default-runtime-manifest.json" \
    "$staging/_factory/runtime-manifest.json"
else
  bun "$root/factory/scripts/runtime-manifest.ts" default --process \
    >"$staging/_factory/runtime-manifest.json"
fi
printf '%s\n' "_factory" >>"$managed"
copy_unmanaged "$skills_dir" "$staging"

if [[ -e "$skills_dir" ]]; then
  backup="$(mktemp -d "$parent/.delivery-backup.XXXXXX")"
  rm -rf -- "$backup"
  mv "$skills_dir" "$backup"
fi
mv "$staging" "$skills_dir"
staging=""
activated=1

if [[ -n "$adapter" || ${#providers[@]} -gt 0 ]]; then
  export DELIVERY_SKILLS_DIR="$skills_dir"
  export DELIVERY_FACTORY_ROOT="$skills_dir/_factory"
  export DELIVERY_PACK_ROOT="$root"
fi
if [[ -n "$adapter" ]]; then
  if [[ -f "$adapters_root/$adapter/setup.sh" ]]; then
    bash "$adapters_root/$adapter/setup.sh"
  fi
  adapter_runtime="$(mktemp "$parent/.delivery-adapter-runtime.XXXXXX")"
  adapter_args=(
    runtime
    "$adapters_root/$adapter/adapter.json"
  )
  if [[ -f "$skills_dir/_factory/.mutation-guard-enforced" ]]; then
    adapter_args+=("$skills_dir/_factory/.mutation-guard-enforced")
  fi
  bun "$root/factory/scripts/adapter-contract.ts" "${adapter_args[@]}" \
    >"$adapter_runtime"
  composed_runtime="$(mktemp "$parent/.delivery-runtime.XXXXXX")"
  bun "$root/factory/scripts/runtime-manifest.ts" overlay \
    "$skills_dir/_factory/runtime-manifest.json" \
    "$adapter_runtime" \
    >"$composed_runtime"
  mv "$composed_runtime" "$skills_dir/_factory/runtime-manifest.json"
  rm -f "$adapter_runtime"
  adapter_runtime=""
  composed_runtime=""
  echo "Adapter $adapter applied"
fi
for provider in "${providers[@]+"${providers[@]}"}"; do
  if [[ -f "$providers_root/$provider/setup.sh" ]]; then
    bash "$providers_root/$provider/setup.sh"
  fi
  provider_runtime="$(mktemp "$parent/.delivery-provider-runtime.XXXXXX")"
  bun "$root/factory/scripts/provider-contract.ts" runtime \
    "$providers_root/$provider/provider.json" \
    "${DELIVERY_BIN_DIR:-$HOME/.local/bin}" \
    >"$provider_runtime"
  composed_runtime="$(mktemp "$parent/.delivery-runtime.XXXXXX")"
  bun "$root/factory/scripts/runtime-manifest.ts" overlay \
    "$skills_dir/_factory/runtime-manifest.json" \
    "$provider_runtime" \
    >"$composed_runtime"
  mv "$composed_runtime" "$skills_dir/_factory/runtime-manifest.json"
  rm -f "$provider_runtime"
  provider_runtime=""
  composed_runtime=""
  bun "$root/factory/scripts/provider-contract.ts" status \
    "$providers_root/$provider/provider.json" \
    "${DELIVERY_BIN_DIR:-$HOME/.local/bin}"
done

if [[ -n "$backup" ]]; then
  rm -rf -- "$backup"
  backup=""
fi
activated=0
trap - EXIT

echo "Skills -> $skills_dir"
echo "Runtime -> $skills_dir/_factory"
echo "Reload the host session so the installed skills are picked up."
echo "Factory root: $skills_dir/_factory"
echo "Then run: bun \"$skills_dir/_factory/scripts/doctor.ts\""
