# Later review rounds

Read this when `review-scope.json` names a `previous` review: a `delta` scope, or a `full` scope after an earlier review.

## Full scope after an earlier review

When a `full` scope names a `previous` review, give the lenses that earlier
review too, and start from its needs-validation items: where the risk still
stands, copy the missing fact unchanged rather than rewording it.

## Delta scope

A `delta` scope means an earlier review at `since` covered this change, and
what changed after it is small, stays inside files that review covered, and
touches no sensitive surface, dependency, one-way step, or weakened test.
Review only that change. The brief's `paths` command and the coverage command
both take `since` as `<base-or-since>` and add
`--earlier ".review/mr-<iid>/<since>/lens-coverage.json"`, so files the
earlier review left unexamined are carried in. Wherever the skill measures,
scans, or hands the lenses a diff against `<full-base-sha>`, use `since`
instead, and write
`git diff <since> <full-head-sha>` to `.review/mr-<iid>/<full-head-sha>/delta.patch`
as the diff the lenses read. Give every lens the earlier review without its
`### Previously disproved` section: copy `.review/mr-<iid>/<since>/max.md`
to `.review/mr-<iid>/<full-head-sha>/earlier-review.md` minus that section,
and hand the lenses that copy. Add to the brief: confirm whether each
earlier finding is fixed at this head, and report one that is not again at
its current line. The earlier review holds findings only, and nothing in it
but a finding is to be confirmed, carried, or reported. Lenses may still
read any code outside the change to prove a claim. Under the head line of
the output, add a `**Scope:**` line that says the review covered the changes
since `since`, and list each earlier finding as fixed or not under
`### Earlier findings`, which names findings only. The earlier dropped list
is not copied into this review's: this review's list holds only what this
review dropped. Carry every needs-validation item forward as the next section
says, with its missing fact copied unchanged.

## Carry needs-validation items forward

The earlier review is the one `previous` names in `review-scope.json`, for a
full and a delta scope alike (`since` names the same head for a delta). Account
for each of its needs-validation items in one of two ways:

- List it again under `### Needs validation`, with its path and **Missing
  fact** copied unchanged. A reworded fact is a different item, and the
  operator would have to acknowledge it again.
- Close it under `### Earlier findings` as
  `N. **`path` — closed: <title>**`, with the unchanged `**Missing fact:**`
  line below it. The title says whether the code is gone or the repository now
  shows the fact.

Release readiness compares this review with the earlier one and refuses a
review that drops an item without either.
