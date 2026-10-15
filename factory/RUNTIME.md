# Factory runtime

This `factory/` directory is the portable ig-spec factory: gate scripts, subagent
prompts, and capability specs. It is not a Claude Code plugin. Cursor and Claude
Code both load the skills under `skills/` and resolve this directory the same way.

## Resolve FACTORY_ROOT

Use the first match:

1. `$DELIVERY_FACTORY_ROOT` when it contains `scripts/find-change.ts`.
2. The real path of this skill's `SKILL.md` (follow symlinks), then
   `../_factory` from that skill directory. This is the Cloud Agent store
   layout (`skills/<skill>` beside `skills/_factory`).
3. From the same real skill directory, `../../factory`. This is the clone and
   desktop-symlink layout.
4. `$CLAUDE_PLUGIN_ROOT` when it contains `scripts/find-change.ts`.

Stop if none match: clone `delivery-skills` and run `./install.sh`.

Export both for the rest of the run:

```bash
export FACTORY_ROOT='<resolved>'
export CLAUDE_PLUGIN_ROOT="$FACTORY_ROOT"
```

Gate scripts still read `CLAUDE_PLUGIN_ROOT` and otherwise default to the parent
of `scripts/`, which is this directory.

## Subagents

Claude Code plugins auto-load `agents/*.md`. Cursor does not. Every factory
skill must `Read` `$FACTORY_ROOT/agents/<name>.md` and give that prompt to the
subagent. Do not invent a cheaper substitute prompt.

## Host

Factory commands (`/groom`, `/draft`, `/execute`, `/address-comments`) are
identical on Cursor and Claude Code. Host-specific behaviour lives only in
review: Cursor uses `/code-review-max`; Claude Code may use native
`/code-review max` when present, otherwise the same `/code-review-max` skill.

## Provenance

Vendored from the internal ig-spec plugin so delivery does not depend on
`/plugin install ig-spec`. Behavioural changes belong here, then flow to both
hosts through `install.sh`. Do not load the original Claude plugin in the same
session: two factories will fight.
