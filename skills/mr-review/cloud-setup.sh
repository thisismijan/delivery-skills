#!/usr/bin/env bash
# Cloud agents only: puts gl-mr and gl-note on PATH. The skill store drops
# execute bits, a cloud agent has the GitLab token only as GITLAB_TOKEN (not
# ~/token), and git's insteadOf rewrite gives `git remote get-url` a
# credentialed URL that the scripts' host parsing does not expect.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
[ -n "${GITLAB_TOKEN:-}" ] || { echo "GITLAB_TOKEN is not set" >&2; exit 1; }

for tool in gl-mr gl-note; do
  sudo tee "/usr/local/bin/${tool}" >/dev/null <<EOF
#!/usr/bin/env bash
url="\$(git config --get remote.origin.url)"; p="\${url#*://}"; p="\${p#*@}"; p="\${p#*[/:]}"; p="\${p%/}"; p="\${p%.git}"
exec env GL_HOST="\${GL_HOST:-https://gitlab.com}" GL_PROJECT="\${GL_PROJECT:-\$p}" GL_TOKEN_FILE=<(printf %s "\$GITLAB_TOKEN") bash "${here}/${tool}" "\$@"
EOF
  sudo chmod 0755 "/usr/local/bin/${tool}"
done

echo "gl-mr and gl-note are on PATH"
