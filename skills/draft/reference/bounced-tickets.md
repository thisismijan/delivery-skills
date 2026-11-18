# Bounced tickets

Read this at step 3 or step 5 when the route does not return `proceed`. Every outcome here posts one provider note, updated in place as step 10 describes, and is a terminal stop: end the run as the "Terminal stop" hard rule says.

## Assessment route (step 3)

- **Non-zero exit**: the verdict was malformed JSON or failed the schema. **Stop and escalate** with one provider note naming the validator failure. Do not proceed.
- `state: "SPLIT_REQUIRED"`: post the concrete vertical split recommendation as one provider note, then **HARD STOP this run**. No spec. A human creates the smaller work items and invokes `/draft` separately for each reference.
- `decision: "clarify"` or `"reject"`: post the routing `reason` as one provider note on `<work-item-key>`, then **HARD STOP this run**. No spec. For clarify, the note lists the specific gaps. For both, it notes that a human may edit the work item and re-invoke `/draft` **in a new session**.

## Feasibility route (step 5)

- **Non-zero exit**: the verdict is malformed, so stop and escalate.
- `decision: "escalate"`: post the `reason` as a provider note (too complex, too risky, or otherwise not safe to spec), then **HARD STOP this run**. A human must change the scope and re-invoke `/draft` in a new session.
