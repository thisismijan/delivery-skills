## Context

`release-readiness.md` is an agent-followed workflow. Its Security lens says a Critical or High finding needs a proof of concept or is downgraded to Important, and its Decide step blocks only on unaccepted Critical findings. The decision itself has no executable form, so the rule can only be pinned by wording.

## Goals / Non-Goals

**Goals:**
- Unverified Critical and High security findings stay blocking and carry an unverified marker.
- Operator acceptance is recorded and valid only for the assessed head.
- The decision rule is executable and tested, and the workflow wording is pinned.

**Non-Goals:**
- Replacing repository security scanners.
- A new severity scale. Existing levels (Critical, High, Important, and below) are kept.
- Changing the other NO-GO conditions (pipeline, conflicts, one-way door).

## Decisions

### Approved test seams

The operator approved two seams. Complexity is low.

1. **Pure readiness decision helper** (`factory/scripts/readiness-decision.ts`, tested by `readiness-decision.test.ts`). This is the highest stable seam that proves behaviour. It takes the assessed head, the findings, and the recorded acceptances, and returns GO or NO-GO with the blocking and accepted findings.
   - Catches: a downgrade of unverified Critical or High, a missing unverified marker, an acceptance for another head still applying, an acceptance that names a different finding, an acceptance without a recorded operator, High findings dropping out of the blocking rule.
   - Misses: whether the agent follows the workflow prose, and whether the ledger row is written correctly.
   - Controlled fakes: none. Inputs are plain data. There is no clock, git, or network.
2. **Markdown contract checks** in `skills/delivery/checks/delivery-specs.test.ts`, reading `SPECS["release-readiness.md"]`.
   - Catches: the downgrade wording returning, High missing from the NO-GO rule, acceptance losing its operator-only or head-scoped wording, the brief template losing the unverified marker.
   - Misses: runtime agent behaviour and stale approvals being reused after a push (only the wording is checked).
   - Controlled fakes: none. The files are read from disk.

Every scenario in `specs/release-readiness/spec.md` maps to one of these seams in `tasks.md`.

### Helper shape

```ts
type Severity = "Critical" | "High" | "Important" | "Minor";
interface Finding { id: string; severity: Severity; reproduced: boolean }
interface Acceptance { findingId: string; head: string; acceptedBy: string; words: string }
interface ReadinessInput { head: string; findings: Finding[]; acceptances: Acceptance[] }
interface BlockingFinding { id: string; severity: Severity; unverified: boolean }
interface ReadinessDecision {
  decision: "GO" | "NO-GO";
  blocking: BlockingFinding[];
  accepted: Array<BlockingFinding & { acceptedBy: string; head: string }>;
}
function decideReadiness(input: ReadinessInput): ReadinessDecision;
```

A finding is serious when its severity is Critical or High. It is unverified when serious and not reproduced. A serious finding blocks unless an acceptance exists with the same finding id and the same head, a non-empty acceptor, and non-empty words. Non-serious findings never block here.

### Workflow wording

The Security lens drops the downgrade and says an incompletely reproduced Critical or High finding keeps its severity and is marked unverified. Decide lists unaccepted Critical and High findings, unverified ones included, as NO-GO. The operator-only acceptance rule covers both severities and requires the record to name the merge request and head. The brief template shows an unverified marker in Must fix and records the head in Risks accepted.

## Risks / Trade-offs

- The helper is a reference for the rule, not called by the agent at runtime, so the workflow wording and the helper can drift. The contract checks and the helper tests both derive from the same scenarios to limit this.
- `code-review-max` has a separate rule that downgrades findings whose trigger cannot be shown. It is left unchanged and is not part of the readiness decision.
- More NO-GO outcomes are expected. Operators accept a named risk to proceed.
