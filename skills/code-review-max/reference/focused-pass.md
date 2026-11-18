# Focused coverage pass

Read this when the coverage result's `needsFocusedPass` lists a file, or when resuming a review that had focused passes.

Start one fresh read-only subagent per `needsFocusedPass` file, all in one
parallel batch, on the `standard` model resolved for the lenses. Pass the exact
model identifier. Each gets the brief, the pinned diff, `reference/lenses.md`,
and one file path, and applies the correctness and security checks and the
tests and specification checks of lenses 1 and 2 to that file, reading outside
it only to prove a claim. A deleted file is read through its removed lines in
the pinned diff. A carried file from an earlier review is read at the head,
because it is not in the delta patch. It returns candidates in the lens format
and ends with its own `Examined files:` list. Save each report as
`.review/mr-<iid>/<full-head-sha>/focused-pass-<n>.md`, `n` being the file's
1-based place in `unexamined`. A file gets exactly one focused pass, never
repeated, including after a resume. A binary file never gets a pass: the result
names it and the Coverage section reports it as not read as text.

Record each pass under `focused` in the coverage input file, as `returned` with
its list transcribed unchanged, or as `failed` when it errored, timed out,
returned nothing usable, or could not start. Run the same coverage command
again. The script, not this conversation, decides whether a pass examined its
file. Keep each pass's candidates with the lens candidates for the Adjudicate
step: they share one id sequence and one `lens-candidates.json`. Add each
pass's report file to the `--evidence` arguments of `review-packet.ts`, so the
adjudicator reads the candidate text.

A failed pass is recorded and not retried: its file stays still unexamined, the
Coverage section names it, and adjudication continues. On a resumed review, run
the same command again with the fresh lens reports and an input with no
`focused` list, and dispatch only what `needsFocusedPass` returns, because the
script keeps every outcome the earlier artifact recorded.
