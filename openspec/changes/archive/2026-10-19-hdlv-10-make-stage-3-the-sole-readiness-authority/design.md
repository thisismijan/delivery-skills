## Context

Address-comments step 8 currently undrafts on holdout `approve` (`glab mr update --ready`) and can leave `[reviewed-blocked]`. Release readiness then treats a conductor-written `review` row with verdict `ready` as Stage 3 having passed. A new head can skip `/code-review-max` plus `/mr-review`. Complexity signal: medium.

Artifact shapes already exist: max-pass ends with `<!-- code-review-max:mr=<iid> head=<full-head-sha> -->`; approach-pass files end with `<!-- mr-review:<head-sha> -->`. Holdout stays the quality gate for comment fixes. It is not the readiness authority.

## Goals / Non-Goals

**Goals:**
- One pure decision: ready versus stay-draft from dual-review artifacts.
- Holdout approve after a new head never undrafts.
- `[addressed !N]` resumes at review.

**Non-Goals:**
- Changing review lenses or replacing holdout.
- Teaching the helper to fetch GitLab or read the ledger file.

## Decisions

### Approved test seam: `decideStage3Readiness`

A pure function in `factory/scripts/stage3-readiness.ts`, tested with `bun test`. Highest stable seam: public, executable, no git or network.

Inputs: merge request iid, current full head SHA, max-pass body (or missing), approach-pass body (or missing). No ledger row field. A conductor-written ready row cannot be supplied as evidence.

Output: `{ decision: "ready" | "stay-draft", reason }`. `ready` only when both bodies parse, both markers match this iid and head, and neither records a blocker.

**Catches:**
- missing max-pass or approach-pass
- stale head or wrong iid
- malformed or absent marker
- max-pass `BLOCK` or Critical / High / Medium findings
- approach-pass blocking `[bug]` or `[approach]` findings, or verdict "a better option is worth taking"
- a test that pretends a ledger ready flag exists still stay-drafts without artifacts

**Misses:** whether the session wrote the artifact honestly; whether `glab mr update --ready` is actually invoked. Those need wording contracts.

**Controlled fakes:** artifact strings built in the test. No filesystem, clock, or GitLab.

Max-pass marker must match `<!-- code-review-max:mr=<iid> head=<full-head-sha> -->` as the last non-empty line. Approach-pass marker must match `<!-- mr-review:<full-head-sha> -->`. Head comparison is exact full SHA. `[nit]` never blocks. A `[bug]` or `[approach]` finding that does not clearly say it would not block the merge is a blocker (fail closed).

CLI: `scripts/stage3-readiness.ts <iid> <head> <max-pass|-> <approach-pass|->`. `-` means missing. Prints JSON. Exit 0 only for `ready`.

### Address-comments stay draft

Step 8 `approve` keeps holdout, removes `re-review-pending.json`, posts the summary, and does **not** call `--ready`. The merge request stays draft. The conductor writes `[addressed !N]`, not a ready `review` row.

### Next-step table is parsed, not copied

Add `[addressed !N]` to the ledger status tags and to `### Next step by status` as Review. `selectNextAction` already reads that table. A new helper test pins `[addressed !N]` → review.

Add `addressed` to the delivery-specs status-tag regex so docs that name the tag are checked against the ledger.

### Ship and Stage 3 use the helper

After review, the conductor undrafts only when the helper returns `ready`, then writes the `review` row. Release readiness runs the helper against the pinned artifacts for the live head. A ready review row with stay-draft evidence is a terminal stop: run `/delivery review <iid>`. Ship never undrafts.

### Alternatives considered

- Keep holdout as the undraft gate and re-run it on the new head: rejected, the ticket names dual Stage 3 artifacts as the only authority.
- Copy the next-step for `[addressed !N]` into `next-action.ts`: rejected, it would drift from `auto.md`.
- Let ship undraft when the helper is ready even if the MR is still draft: rejected, undraft belongs to Stage 3; ship already stops on draft.

## Risks / Trade-offs

- Prose still runs the glab commands. Mitigation: wording tests forbid `--ready` on the address-comments approve path and require ship to name the helper.
- Fail-closed parsing of "blocking or not" may keep a sound approach-pass in draft if the finding text is vague. That is intended.
- In-flight tickets left `[reviewed-blocked]` after a new head still resume to address comments until that run finishes and writes `[addressed !N]`.
