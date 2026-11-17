# Human decision brief

The factory owns simple decisions. Escalate only a choice the operator must
make because the codebase cannot answer it, the paths have material or
hard-to-reverse consequences, or a human boundary already applies (merge,
release-risk, skill install).

The factory decides, records, and continues when:

- the answer is a factual question it can look up or observe
- a deterministic gate result already decided the path
- only one viable path remains
- the choice is local, cheap, and reversible (a two-way door)
- the work is how to implement an already-approved contract
- the operator would only be giving simple confirmation of an already
  selected option

It records those as agent-owned in the decision log so they stay inspectable.
It does not ask. Do not manufacture a choice. A failed gate never
becomes an option. A missing identifier or credential is asked directly,
without this brief.

Escalate with this brief when two or more viable options remain and the choice
changes product intent, a public contract, persistent data, a security
boundary, distributed state, operational topology, or a costly rollback. This
brief explains a human-owned decision; it does not take that decision or
weaken its approval boundary.

Once escalated, scale the depth to the consequence. A reversible product-scope
choice stays compact. Go deeper for a public contract, persistent data,
security boundary, distributed state, cross-system effect, operational
topology, safety concern, or costly rollback. Use plain language and define a
technical term by its practical consequence.

The brief has two turns so the operator decides before seeing a preferred
answer. A recommendation shown first anchors the choice and hides the trade-off.

**Choose phase.** Present evidence, every viable option, and the comparison.
Do not include a recommendation, a preferred option, or wording that "yes"
accepts your pick. Hold that judgment until after they answer. Ask exactly one
final question.

```markdown
## Decision: <what must be chosen>
**Why now:** <why work cannot safely continue without this choice>
**Why it matters:** <the engineering consequence of this choice, in this codebase>

### Evidence and constraints
- Known: <verified fact and source>
- Constraint: <boundary that every option must respect>
- Assumption: <unverified premise>
- Unknown: <remaining uncertainty>

### Option A: <name>
**How it works:** <mechanism and reasoning>
**Pros:** <benefits>
**Cons:** <drawbacks>
**Risks and consequences:** <failure modes and practical effect>

### Option B: <name>
<the same fields>

### DSA lens
<material data structures, lookup/traversal/scheduling behavior, concurrency
semantics, and supported time/space complexity; or "No material DSA difference"
with the reason. Never invent Big-O claims.>

### System-design lens
<material boundaries, state ownership, consistency, coupling, scaling,
reliability, recovery, security, and operability; or "No material system-design
difference" with the actual discriminator.>

### Comparison
<side-by-side material consequences, with no preferred option>
**Reversibility:** <cost and method of changing course>
**If we wait:** <effect of delaying or giving no answer>

**Choose:** <one precise question naming every viable option>
```

**After they choose.** Reveal the withheld recommendation and why. Give them a
chance to change.

```markdown
## Your choice: <the option they picked>
**Recommendation:** <option and evidence-bound reason>
**Assumptions:** <what the recommendation relies on>
**Would change if:** <evidence that would change the recommendation>
```

If they picked the same option, say so, explain the reason in one or two
sentences, and continue unless they ask to switch. If they picked a different
option, explain the disagreement without talking down to them, then wait for
keep or switch. If evidence does not support a strong preference, say the
recommendation is weak and name the missing evidence or value judgment that
decides it. Never hide uncertainty in a confident recommendation.

Record the settled choice: the question, the options, their pick, the
recommendation, and whether they differed. Grooming writes that log under the
grooming output directory as `decisions.md`. Other stages append a Decision
line in the ledger.
