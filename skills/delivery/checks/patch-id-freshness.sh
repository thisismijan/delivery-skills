#!/usr/bin/env bash
# Exercises the verdict-freshness rule in delivery-ledger.md against real merged
# branches: a rebase keeps the patch-id, a new commit changes it.
set -euo pipefail

# The rebase target is the target branch as it stood when the MR merged, which
# never contains the branch's own commits. A merge whose branch was already on
# that tip would rebase to a no-op, so pick one whose branch had fallen behind.
repo=${1:-$(pwd)}
scratch=$(mktemp -d)
trap 'git -C "$repo" worktree remove --force "$scratch/wt" >/dev/null 2>&1 || true; rm -rf "$scratch"' EXIT

patch_id() { git -C "$repo" diff "$1" "$2" | git patch-id --stable | cut -d' ' -f1; }

merge=${2:-}
if [ -z "$merge" ]; then
  for m in $(git -C "$repo" log --merges -40 --format=%H); do
    t=$(git -C "$repo" rev-parse "$m^1"); h=$(git -C "$repo" rev-parse "$m^2")
    if [ "$(git -C "$repo" merge-base "$t" "$h")" != "$t" ]; then merge=$m; break; fi
  done
fi
[ -n "$merge" ] || { echo "no merge with a branch behind its target in the last 40"; exit 2; }

target=$(git -C "$repo" rev-parse "$merge^1")
head=$(git -C "$repo" rev-parse "$merge^2")
base=$(git -C "$repo" merge-base "$target" "$head")
onto=$target
recorded=$(patch_id "$base" "$head")
echo "merge:            $(git -C "$repo" log -1 --format='%h %s' "$merge")"
echo "verdict head:     $head"
echo "verdict base:     $base"
echo "recorded patch:   $recorded"

git -C "$repo" worktree add --detach "$scratch/wt" "$head" >/dev/null 2>&1
if ! git -C "$scratch/wt" -c user.name=check -c user.email=check@example.invalid rebase --quiet --onto "$onto" "$base" >/dev/null 2>&1; then
  echo "rebase onto $(git -C "$repo" rev-parse --short "$onto") conflicts; pick another merge"; exit 2
fi
rebased=$(git -C "$scratch/wt" rev-parse HEAD)
new_base=$(git -C "$repo" merge-base "$onto" "$rebased")
after_rebase=$(patch_id "$new_base" "$rebased")
echo
echo "after rebase onto $(git -C "$repo" log -1 --format='%h %s' "$onto"):"
echo "  head:           $rebased (changed: $([ "$rebased" != "$head" ] && echo yes || echo no))"
echo "  base:           $new_base"
echo "  patch:          $after_rebase"
[ "$after_rebase" = "$recorded" ] && echo "  result:         verdict holds for the code (head changed, patch-id same)" || { echo "  FAIL: rebase changed the patch-id"; exit 1; }

echo "# extra" >> "$scratch/wt/README.md"
git -C "$scratch/wt" -c user.name=check -c user.email=check@example.invalid commit --quiet -am "extra change"
pushed=$(git -C "$scratch/wt" rev-parse HEAD)
after_push=$(patch_id "$new_base" "$pushed")
echo
echo "after pushing one more commit:"
echo "  head:           $pushed"
echo "  patch:          $after_push"
[ "$after_push" != "$recorded" ] && echo "  result:         verdict void (patch-id differs)" || { echo "  FAIL: a new commit kept the patch-id"; exit 1; }

empty=$(patch_id "$base" "$base")
echo
echo "empty diff patch: '${empty}' (empty means terminal stop)"
[ -z "$empty" ] || { echo "  FAIL: empty diff produced a patch-id"; exit 1; }
echo
echo "PASS"
