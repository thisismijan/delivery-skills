# Proposal

## Why

Delivery workflows sometimes stop for a human choice without giving the operator enough technical context to make that choice confidently. A decision prompt should teach the relevant trade-offs instead of merely presenting two labels, especially when the alternatives differ in algorithmic behavior, state ownership, scaling, reliability, or operational complexity.

## What Changes

- Introduce a shared decision-brief contract for every delivery checkpoint that asks a human to choose between two or more viable options.
- Require each option to explain its reasoning, benefits, drawbacks, risks, and consequences in plain language.
- Require a concise DSA perspective when data structures, algorithms, complexity, or concurrency semantics materially distinguish the options.
- Require a concise system-design perspective when architecture, boundaries, state, consistency, reliability, scalability, security, or operability materially distinguish the options.
- Require a recommendation, the assumptions behind it, and what evidence would change it, while preserving the human's ownership of the decision.
- Add deterministic contract checks so future workflow edits cannot regress to context-free option prompts.

## Capabilities

### New Capabilities

- `human-decision-context`: Defines the information, recommendation, and technical teaching required before a delivery workflow asks a human to choose among alternatives.

### Modified Capabilities

None.

## Impact

The delivery conductor and stage workflow documents will share one decision-brief format. Delivery contract tests will inspect human checkpoints across the live workflow set. No external API, dependency, or human-owned decision boundary changes; the change improves the context supplied at those boundaries.
