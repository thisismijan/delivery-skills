# Rules written from samples

Read this at step 5a when an acceptance criterion is met by a rule written from sample data (patterns, thresholds, keyword lists, mappings, or classifications).

For such a rule, the samples the rule is written from cannot be its only test,
because a rule always fits the data it came from. Before anything is built, set aside some
real samples the rule will not be written from. Label each one from its source,
never by running code, and save them with their labels under
`.review/<changeName>/held-out-samples/`, which is gitignored and never part of
the spec. Record in `design.md` how many were set aside and where they came
from, not what they contain. When no samples can be set aside, say so in
`design.md`; the change description then names the rule under "What the checks
do not prove".
