# Design

## Context

The delivery pack already treats merge, risk acceptance, failed-gate overrides, plan approval, and improvement installation as human-owned boundaries. It also asks product and implementation questions during discovery, grooming, recovery, and exception handling. Those prompts currently inherit local wording from several skills and workflow documents, so option quality is not governed by one reusable contract.

The output is human-facing and must stay clear, sanitised, and useful to an operator who has not followed every implementation detail. The workflow must not invent algorithmic complexity or architecture differences merely to fill a template.

## Goals / Non-Goals

**Goals:**

- Give a human enough evidence and technical context to choose among viable alternatives.
- Teach the relevant DSA and system-design implications without turning every prompt into a long design document.
- Preserve an explicit recommendation while keeping the decision human-owned.
- Make the behavior consistent across live delivery workflows and stage skills.
- Make regressions detectable from the checked-in contracts.

**Non-Goals:**

- Do not replace deterministic gates, approvals, or risk-acceptance rules.
- Do not require a decision brief for factual questions, missing credentials, simple confirmation of one already-approved option, or a choice with only one viable path.
- Do not manufacture DSA or system-design consequences when the alternatives do not materially differ.
- Do not encode domain-specific algorithms or architectures in the conductor.

## Decisions

### 1. Use one canonical decision-brief contract

The delivery conductor will define the canonical structure and stage workflows will reference it before asking a human to choose among two or more viable options. The brief contains:

1. the decision and why it is needed now;
2. known facts, constraints, assumptions, and unknowns;
3. for each option: how it works, benefits, drawbacks, risks, and fit;
4. a DSA lens covering relevant data structures, algorithmic complexity, concurrency semantics, or an explicit statement that there is no material DSA difference;
5. a system-design lens covering relevant boundaries, state ownership, consistency, scaling, reliability, security, and operability, or an explicit statement that there is no material system-design difference;
6. a side-by-side consequence summary;
7. the recommendation, why it best fits current evidence, its assumptions, and what evidence would change it;
8. reversibility and the effect of delaying or providing no answer;
9. one precise question that names the available choices.

Centralising the contract prevents wording drift while allowing each stage to supply domain-specific evidence.

Alternative considered: duplicate a complete template in every workflow. Rejected because copies will drift and contract tests would need to compare several sources of truth.

### 2. Make technical lenses relevance-sensitive but never silent

Every decision brief includes both lens headings. When a lens is relevant, it explains concrete consequences in plain language and quantifies time/space complexity only when supported. When it is not relevant, the brief states that the alternatives have no material difference under that lens and returns focus to the actual discriminator.

Alternative considered: omit irrelevant lenses. Rejected because omission is ambiguous: the operator cannot tell whether the topic was assessed or forgotten.

Alternative considered: require Big-O and architecture commentary for every option. Rejected because fabricated technical depth would mislead the operator and obscure product trade-offs.

### 3. Separate evidence, inference, and recommendation

The brief labels known evidence, assumptions, and unresolved unknowns before comparing options. The recommendation cites those inputs and identifies a change trigger. This preserves epistemic clarity and lets the operator challenge the premise rather than only selecting a label.

Alternative considered: provide pros and cons without a recommendation. Rejected because the conductor has enough context to reduce decision effort and should state its best judgment, while leaving ownership with the human.

### 4. Enforce the contract at the documentation boundary

Contract tests will derive the required brief fields from the canonical conductor section and assert that live workflows which can present multi-option decisions invoke that contract. Tests will also prohibit misleading requirements such as unconditional Big-O claims. This repository's behavior is primarily delivered through skills and workflow specifications, so document-contract tests are the executable boundary.

Alternative considered: add a runtime JSON schema for prose. Rejected for now because the host renders conversational output directly and no common structured decision object crosses all runtimes. A schema can be introduced later if runtime adapters gain a shared rendering seam.

## Risks / Trade-offs

- **Risk: Decision prompts become too long** → Keep each option concise, compare only material differences, and scale depth with consequence and reversibility.
- **Risk: Technical language excludes non-specialists** → Define terms in plain language and explain their decision consequence rather than naming concepts alone.
- **Risk: Agents fabricate complexity analysis** → Require evidence-based claims and an explicit “no material difference” statement when a lens does not discriminate.
- **Risk: A central contract is referenced but not followed** → Add contract tests for every live workflow that can ask a multi-option question and include examples in the conductor.
- **Trade-off: Documentation enforcement cannot inspect every generated sentence at runtime** → Treat checked-in workflow contracts as the enforceable seam now; retain fail-closed human boundaries and add structured runtime output only when a shared renderer exists.

## Migration Plan

1. Add the canonical decision-brief section to the delivery conductor.
2. Update discovery, grooming, recovery, release-readiness, and improvement workflows to invoke it at multi-option checkpoints.
3. Update relevant stage skills that independently ask humans to choose among alternatives.
4. Add contract tests covering required fields, relevance-sensitive lenses, and workflow adoption.
5. Run factory and delivery-skill suites. Rollback is a single documentation-and-test revert; no persisted run-state migration is required.
