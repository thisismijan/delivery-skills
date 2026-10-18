# Proposal

## Why

The pack installs its files reliably but still leaves operators to hand-author runtime manifests, activate host hooks, discover missing tools, and reconcile provider configuration. That makes a safe installation look complete before its live capabilities are actually usable.

## What Changes

- Always install one canonical, fail-closed runtime manifest at `_factory/runtime-manifest.json`.
- Compose adapter and provider declarations into that manifest without claiming capabilities that have not been configured.
- Add a delivery doctor that reconciles declared capabilities with live probes and reports Ready, Needs setup, Host limitation, and Human-owned actions with exact remedies.
- Add an idempotent target-repository bootstrap for delivery state directories, model inventory guidance, and first valid commands.
- Make the Claude Code adapter safely install and verify its mutation hook before mutation is declared enforceable.
- Keep Cursor mutation unavailable until its host exposes a real denial boundary, while making its safe read-only subset immediately understandable.
- Print adapter-specific next steps and smoke-test commands after installation.

## Capabilities

### New Capabilities

- `seamless-onboarding`: Defines truthful one-command installation, live capability diagnosis, and safe target-repository bootstrap behavior.

### Modified Capabilities

None.

## Impact

The generic installer, runtime-manifest tooling, preflight diagnostics, adapter/provider setup, delivery conductor, documentation, and packaging tests will change. Existing safety boundaries remain fail closed; no provider credentials, tracker mutation, merge, risk acceptance, gate override, or skill installation decision is automated.
