# Design

## Context

The installer transactionally copies skills and the bundled runtime, but a generic install writes no runtime manifest. Adapter installation generates a manifest entirely from static declarations, providers do not compose into it, and Claude's adapter declares mutation enforcement although its setup script does not install the settings hook. The current preflight verifies Bun, `zod`, the constitution, and an optional git remote; it does not reconcile declared and observed host capabilities.

Host powers differ. Claude Code can enforce a PreToolUse mutation hook. Cursor currently cannot expose an equivalent denial boundary, so its mutating stages must remain unavailable. Secrets and human-owned approvals cannot be safely automated.

## Goals / Non-Goals

**Goals:**

- Make every installation immediately diagnosable without manual JSON.
- Use one canonical runtime-manifest path throughout the installed pack.
- Distinguish declared configuration from observed readiness.
- Automate safe, idempotent host setup while preserving unrelated configuration.
- Give operators exact next actions instead of late stage failures.

**Non-Goals:**

- Do not infer a host in the generic installer.
- Do not claim a provider or mutation guard is ready without a successful probe.
- Do not install secrets, silently edit shell startup files, or bypass host permission prompts.
- Do not make Cursor mutation appear supported before an enforceable host boundary exists.
- Do not automate merge, tracker state, risk acceptance, gate override, or skill installation approval.

## Decisions

### 1. One manifest assembled from fail-closed layers

The generic installer first writes a complete manifest with every portable capability unavailable. It may mark `process.run` available only when the pinned Bun runtime and installed dependencies are present. A selected adapter overlays host-native declarations. A selected provider overlays only capabilities that its setup and probe can substantiate. The final manifest is parsed before the installation transaction is committed.

Alternative: require operators to author the manifest. Rejected because it duplicates repository policy and lets configuration drift from installed adapters.

Alternative: let the latest component replace the whole manifest. Rejected because provider installation would erase host capabilities and adapter installation would imply provider readiness.

### 2. Separate declaration, observation, and enforcement

The installed manifest records declared capability. `delivery doctor` runs non-destructive live probes and reports observed state. Stage gating remains the enforcement authority and reads `$FACTORY_ROOT/runtime-manifest.json`.

For mutation, declaration is insufficient. Claude setup installs the exact checked-in hook additively, verifies the persisted command points at the installed `commit-guard.ts`, then permits the generated manifest to mark enforcement. Cursor remains explicitly unenforced.

Alternative: have doctor rewrite capability availability after every probe. Rejected because transient credentials or network failures would mutate installed configuration and make diagnoses non-reproducible.

### 3. Doctor reports four operator-facing classes

Doctor renders:

- **Ready now**: configured and successfully probed.
- **Needs setup**: remediation is available to the operator.
- **Host limitation**: the runtime cannot currently provide the capability.
- **Human-owned**: actions intentionally outside automation.

It checks installed Bun version, dependencies, constitution, manifest, mutation hook evidence, review wrappers and PATH, credential presence without values, supporting executables, target-state writability, OpenSpec availability, and adapter/provider declarations. Missing optional capabilities do not make read-only help unusable.

Alternative: one global READY/NOT READY verdict. Rejected because capability requirements are stage-specific and a global failure hides the safe subset that already works.

### 4. Target bootstrap is explicit and idempotent

`delivery init` runs in a target repository, adds `.delivery/` and `.review/` to `.gitignore` once, verifies their parent is writable, runs doctor, and prints valid first commands. It does not create remote resources or infer approvals.

Alternative: mutate every repository during skill installation. Rejected because installation is host-level and may not run from the intended target repository.

### 5. Preserve generic and named-host boundaries

`install.sh` keeps requiring an explicit skills directory. Named wrappers choose documented host directories and call it. Post-install output is adapter-specific only when an adapter was explicitly selected. Provider setup composes capabilities but never prints or persists credential values.

## Risks / Trade-offs

- **Risk: Additive settings merge corrupts user configuration** → Parse JSON, back up first, preserve unrelated keys and hooks, write atomically, and fail without changing the original on ambiguity.
- **Risk: Static provider declarations overstate readiness** → Require provider-specific non-destructive probes; otherwise leave the capability unavailable with a remedy.
- **Risk: Doctor output becomes another source of policy** → Derive capability names and stage requirements from `runtime-manifest.ts`.
- **Risk: Generic installation appears less capable** → Prefer an honest immediately usable read-only baseline over fabricated capability.
- **Trade-off: Reload remains manual** → Print it as the single unavoidable host action because the installer cannot safely restart the parent application.

## Migration Plan

1. Add manifest assembly and default-manifest generation.
2. Expand preflight into doctor while retaining the existing preflight invocation as an alias.
3. Add target bootstrap.
4. Add verified Claude hook setup and provider composition.
5. Update skill invocations and onboarding docs.
6. Verify generic, Claude, and Cursor packaging paths. Existing installs upgrade transactionally; rollback restores the previous managed install from the installer's existing backup path.
