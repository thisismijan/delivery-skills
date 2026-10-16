#!/usr/bin/env bash
# Optional Cursor adapter: install forge/review wrappers next to the skills.
set -euo pipefail

skills_dir="${DELIVERY_SKILLS_DIR:?}"
bin_dir="${DELIVERY_BIN_DIR:-$HOME/.local/bin}"
review_skill="$skills_dir/mr-review"
mkdir -p "$bin_dir"
for tool in gl-mr gl-note; do
  cat >"$bin_dir/$tool" <<EOF
#!/usr/bin/env bash
exec bash "$review_skill/$tool" "\$@"
EOF
  chmod 0755 "$bin_dir/$tool"
done
echo "Review tools -> $bin_dir"
