# Claude Code skill overlay

Generic `SKILL.md` files keep only portable frontmatter. Host-specific fields
such as `disable-model-invocation`, `argument-hint`, `tools`, `allowed-tools`,
and `effort` belong here.

The host invocation input maps to "the skill arguments" in the generic skills.
Do not copy `$ARGUMENTS` back into core files.
