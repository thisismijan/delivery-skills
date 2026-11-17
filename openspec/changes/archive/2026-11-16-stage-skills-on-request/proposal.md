## Why

In Cursor, the model could start any skill in the pack on its own judgement,
including the stage skills that write specs, build code, reply on changes, or
archive them. The not-for clauses reduced the risk but relied on the model
reading them.

## What Changes

- The Cursor plugin build marks `/groom`, `/draft`, `/execute`,
  `/address-comments`, `/mr-review`, and `/openspec-archive` with
  `disable-model-invocation: true` in the plugin's copy. The model cannot start
  them on its own; a person types them. `/delivery` and `/code-review-max` stay
  model-invocable. The generic skills keep portable frontmatter only.
- The `/delivery` conductor gains one rule. When the host does not offer it a
  stage command, it reads the sibling `../<command>/SKILL.md` and follows it
  with the same arguments, so auto still reaches every stage.

Out of scope: the existing non-plugin install and other hosts.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `stage-skill-triggers`: in the Cursor plugin, stage skills start only on
  request or from the conductor.

## Impact

`factory/scripts/cursor-plugin.ts` and its tests, `skills/delivery/SKILL.md`,
`adapters/cursor/README.md`, and `factory/skill-size-ceilings.json`.
