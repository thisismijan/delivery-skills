# Proposal

## Why

The delivery pack embeds product names, one source framework, specific agent hosts, and tracker/forge commands throughout its core workflow. That coupling prevents the same safety and lifecycle protocol from being installed as a normal skill on other LLM hosts, even where equivalent tools are available.

## What Changes

- **BREAKING**: replace host- and source-framework-specific instructions in the core skills with a runtime-neutral capability protocol.
- Define a portable runtime manifest that advertises model dispatch, subprocess, review, forge, tracker, and mutation-guard capabilities without naming a vendor.
- Move host detection, skill installation paths, native review commands, hooks, forge commands, and tracker commands into optional adapters.
- Replace references to the source framework with delivery-native stage names, schemas, artifacts, and commands.
- Make the default installation target an explicit skills directory so any skill-capable agent can install the pack; retain named adapters only as optional compatibility packages.
- Keep deterministic gates, durable ledgers, approval boundaries, fail-closed behavior, and local artifacts in the generic core.
- Fail with a clear missing-capability result when a host cannot enforce a required operation; never pretend that portability supplies tools a host does not expose.
- Add contract tests that prevent vendor, host, and source-framework names from returning to generic core files.

## Capabilities

### New Capabilities

- `portable-runtime-contract`: runtime-neutral discovery and invocation of models, tools, subagents, review, forge, tracker, and mutation enforcement.
- `generic-skill-packaging`: installation and loading of the generic skill pack through an explicit destination, with optional host adapters kept outside the core.
- `delivery-native-workflow`: delivery lifecycle terminology, artifacts, and stage contracts that do not depend on the original source framework or a named LLM host.

### Modified Capabilities

None.

## Impact

- Core skills under `skills/`, workflow documentation, factory prompts, runtime documentation, model inventory, and contract tests.
- Installer behavior and adapter layout.
- Existing host-specific installations must select or configure an adapter, or provide the generic runtime manifest directly.
- Git forge and issue tracker integrations become providers; GitLab and Jira remain possible adapters rather than core requirements.
- The implementation must distinguish portable protocol guarantees from optional integrations, so “works anywhere” means any host that can satisfy the declared capabilities.
