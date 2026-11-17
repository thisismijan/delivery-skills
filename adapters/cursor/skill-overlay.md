# Cursor skill overlay

Generic `SKILL.md` files keep only portable frontmatter. Host-specific fields
live here so Cursor can map invocation input without teaching those names in
core.

| Skill | argument-hint | Host notes |
| --- | --- | --- |
| delivery | `[auto [idea\|KEY\|iid] \| discover <idea> \| ...]` | Map the host invocation input to "the skill arguments". |
| groom | `[file-path \| inline-text]` | |
| draft | `<WORK-ITEM-KEY>` | |
| execute | `<WORK-ITEM-KEY>` | |
| address-comments | `<WORK-ITEM-KEY>` | |
| code-review-max | `[!MR-iid \| MR-iid]` | |
| mr-review | `[MR iid]` | Tool allowlists and effort stay with the host. |
