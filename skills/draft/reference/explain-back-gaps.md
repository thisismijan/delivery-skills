# Explain-back gaps

Read this at step 7b when the comprehension route returns `revise` or `escalate`.

The reader cannot see the work item, so the route command does the comparison:
it compares the reader's restatement to the change files, and when the
restatement contradicts them it rewrites the verdict as a misread that names
the contradiction before routing. A `revise` can therefore come from a misread
as well as from gaps.

- `revise`: report each gap or the contradiction, then revise the change files
  to close it. Regenerate `tasks.md` with `generate-tasks.ts`, and run step 7b
  once more as attempt 2 with the same isolated inputs. Do not add the work
  item or grooming decisions to the reader's inputs, and do not paste them into
  the revised files in a way the reader cannot see.
- `escalate` (exit 3): the revised change still does not stand on its own. Post
  one note naming each gap through the provider, then **stop** with the stop id
  `unsettled-comprehension`. A person decides and re-invokes `/draft`. Do not
  verify, commit, or post the spec-ready note.
