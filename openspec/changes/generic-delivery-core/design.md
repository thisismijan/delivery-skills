# Design

## Context

The repository currently has safe, deterministic lifecycle behavior, but its core prose and orchestration mix that behavior with named hosts, the framework it was ported from, one forge, one tracker, native slash commands, and fixed installation paths. The scripts are already mostly pure TypeScript and file based, so the durable state and gate logic can remain while invocation moves behind a runtime contract.

## Goals / Non-Goals

**Goals:**

- Make `skills/`, generic runtime documentation, and core factory prompts vendor neutral.
- Resolve all environment-dependent operations from a versioned runtime manifest.
- Keep integrations available as optional adapters without letting them define core behavior.
- Preserve deterministic gates, durable state, review provenance, and fail-closed mutation policy.
- Provide a generic installer that targets an explicit skills directory.

**Non-Goals:**

- Pretend that a text-only chat without tools can execute tests, mutate repositories, or enforce hooks.
- Build adapters for every existing agent host, forge, or tracker in one change.
- Replace the package runtime or rewrite stable pure helpers.
- Preserve obsolete source-framework command names as aliases in the generic core.

## Decisions

### 1. Use a capability manifest, not host detection

Add a versioned manifest schema with stable capability identifiers such as `process.run`, `agent.dispatch`, `model.inventory`, `forge.change`, `tracker.item`, `review.publish`, and `mutation.guard`. Each descriptor declares availability, mode, and an invocation reference. Core preflight and stage selection use this manifest.

Host-name switches were rejected because every new product would require editing and retesting the core.

### 2. Keep core pure and adapters imperative

Pure scripts own lifecycle decisions, validation, state transitions, evidence, and normalized provider inputs/outputs. Adapters may translate those operations to native commands or tools. Adapter files are outside the generic scan boundary and cannot weaken core validation.

Embedding shell snippets directly in skills was rejected because prose cannot provide a stable cross-host API.

### 3. Install generically by destination

`install.sh --skills-dir <path>` is the primary interface, with `.agents/skills/` as the documented repository-local convention when the host supports it. It installs generic skills plus a local runtime directory and writes a managed manifest. Optional `--adapter <name>` and `--provider <name>` apply setup only when explicitly requested. Existing named flags are removed or retained only in adapter-owned compatibility wrappers.

Automatic host detection was rejected because it is ambiguous in containers and multi-agent workstations.

### 4. Make the delivery protocol self-describing

Replace source-framework attribution and native slash-command branching with delivery stage descriptors and normalized actions. The conductor can still present `/delivery` where the host supports slash skills, but that syntax is packaging sugar, not the protocol.

### 5. Treat forge, tracker, and review as optional providers

Local work items are the baseline. Provider-backed issue lookup, change requests, comments, readiness, and publication are capabilities. A stage that reaches an unavailable provider boundary stops with its artifacts intact.

Generalizing all providers into a lowest-common-denominator workflow was rejected because it would erase safety-significant distinctions such as immutable review heads and draft readiness.

### 6. Enforce neutrality with repository-derived tests

Define the generic boundary explicitly and scan it for forbidden source-framework, host, model-vendor, forge, and tracker names. Validate the runtime manifest and test one fake adapter end to end. Adapter directories and historical archived changes are outside the scan boundary.

### 7. Use delivery-owned state and portable skill metadata

Generic skill frontmatter contains only portable skill fields. Host argument placeholders, tool allowlists, effort controls, and model hints are overlays supplied by adapters. New grooming state lives under `.delivery/grooming/`, change metadata uses a delivery-owned filename, and factory comments use a delivery-owned marker. Compatibility reads for old names live in an optional migration adapter so the generic core never teaches the old source framework.

## Risks / Trade-offs

- **Large migration surface** → land the manifest, installer, and terminology together behind contract tests; keep existing integrations as adapters.
- **“Works anywhere” can be misunderstood as “needs no tools”** → document capability prerequisites and fail clearly when they are absent.
- **Adapter drift** → validate every adapter against the same manifest and normalized result schemas.
- **Reduced convenience for existing users** → provide explicit compatibility adapter commands and migration notes.
- **Product names leaking through model catalogues or examples** → use capability traits and runtime-advertised identifiers in core; keep benchmark examples in adapter or evaluation data.

## Migration Plan

1. Add manifest schemas, normalized capability results, and fake-runtime tests.
2. Convert conductor and stage skills to capability descriptors and delivery-native terminology.
3. Move current host, forge, and tracker setup into optional adapters.
4. Move spec-tool setup into an optional provider while retaining file-based plan and evidence contracts in core.
5. Replace source-owned state names and frontmatter with delivery-owned portable equivalents; keep legacy reads in the migration adapter.
6. Replace the installer default with `--skills-dir`; add migration wrappers in adapters.
7. Rewrite README and core runtime documentation around prerequisites and the generic protocol.
8. Run neutrality scans, factory tests, delivery contract tests, and adapter contract tests.
9. Existing installations may keep their current adapter while migrating; rollback restores the previous release because target-repository state formats remain readable through the migration adapter.
