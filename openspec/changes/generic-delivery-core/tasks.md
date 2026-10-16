# Tasks

## 1. Runtime contract

- [ ] 1.1 Test first: add failing coverage for manifest validation, capability lookup, missing-capability errors, equivalent-host behavior, mutation enforcement, and advertised model resolution; verify the focused test fails before product changes
- [ ] 1.2 Implement the versioned vendor-neutral runtime manifest and normalized capability results; verify the runtime-contract tests pass
- [ ] 1.3 Convert stage preflight and model inventory to consume runtime capabilities instead of host names; verify stage-gating and routing tests pass

## 2. Delivery-native workflow

- [ ] 2.1 Add a generic-boundary contract test that rejects source-framework, LLM-vendor, agent-host, forge, and tracker product names in core skills, prompts, and runtime docs; verify it fails on the current tree
- [ ] 2.2 Replace source-framework attribution, host branches, native review commands, and hard-coded integration instructions with delivery-native stages and capability descriptors; verify the neutrality contract passes
- [ ] 2.3 Convert forge, tracker, review, subprocess, and subagent operations to normalized provider inputs and fail-closed missing-provider results; verify workflow contract tests cover absent and fake providers
- [ ] 2.4 Update model routing to use capability traits and runtime-advertised identifiers without named host or vendor examples in core; verify routing tests preserve safety floors and promotion gates

## 3. Generic packaging and adapters

- [ ] 3.1 Add failing installer tests for `--skills-dir`, managed-file replacement, state preservation, unwritable destinations, and explicit adapter selection; verify they fail on the current installer
- [ ] 3.2 Make explicit destination installation the default interface and install the generic runtime beside the skills; verify installer tests pass
- [ ] 3.3 Move existing host paths, hooks, native commands, forge commands, and tracker setup into optional adapters validated against the runtime manifest; verify adapter contract tests pass
- [ ] 3.4 Rewrite the README and generic runtime documentation around the portable protocol and bounded capability prerequisites; verify documented commands in installer tests

## 4. Integration

- [ ] 4.1 Run strict OpenSpec validation, the full factory test suite, typecheck, formatting checks, delivery contracts, neutrality scans, and adapter tests; verify all are green
- [ ] 4.2 Run a fake-host end-to-end lifecycle through a read-only stage and a denied mutating stage; verify normalized outputs and fail-closed behavior

## Workflow follow-up

- Archive the change after review and merge.
