## 1. Tests

- [x] 1.1 Prove A focused pass uses the standard tier.
- [x] 1.2 Prove A skipped review adds no second skipped-worker entry.
- [x] 1.3 Prove A lens that finds nothing still reports what it examined.
- [x] 1.4 Prove A named file is not an examined file.
- [x] 1.5 Prove A file outside the diff does not count.
- [x] 1.6 Prove A deleted file is examined by reading its removed lines.
- [x] 1.7 Prove A planned lens with no report stops the review.
- [x] 1.8 Prove A malformed examined list stops the review.
- [x] 1.9 Prove An unplanned or repeated lens report stops the review.
- [x] 1.10 Prove A path is never trimmed.
- [x] 1.11 Prove A renamed file is two changed files with real paths.
- [x] 1.12 Prove A non-ASCII path is listed as written.
- [x] 1.13 Prove The brief and the check use one list.
- [x] 1.14 Prove A file the input never mentions is still checked.
- [x] 1.15 Prove A path that cannot be written in a report stops the review.
- [x] 1.16 Prove Unexamined files are listed in the artifact.
- [x] 1.17 Prove A file one lens examined counts even when the other lenses did not.
- [x] 1.18 Prove Every file examined leaves nothing to pass.
- [x] 1.19 Prove A delta review checks only the delta paths.
- [x] 1.20 Prove A file an earlier review left unexamined is carried into the delta check.
- [x] 1.21 Prove A carried file that is also a delta path is checked once.
- [x] 1.22 Prove Missing, skipped and mismatched earlier artifacts.
- [x] 1.23 Prove Paths the measure leaves out are not checked.
- [x] 1.24 Prove A path written differently from the changed path does not count.
- [x] 1.25 Prove A binary file is named and never sent to a pass.
- [x] 1.26 Prove A deleted file is checked.
- [x] 1.27 Prove One pass per unexamined file.
- [x] 1.28 Prove A focused pass candidate reaches adjudication.
- [x] 1.29 Prove A pass that reads the file closes the gap.
- [x] 1.30 Prove A pass that does not list its file counts as failed.
- [x] 1.31 Prove A pass cannot cover another file.
- [x] 1.32 Prove An outcome record that cannot be read is refused.
- [x] 1.33 Prove A recorded outcome is never passed again.
- [x] 1.34 Prove A resumed review does not repeat a pass.
- [x] 1.35 Prove An artifact for another head is not reused.
- [x] 1.36 Prove An outcome for a file that was never unexamined is refused.
- [x] 1.37 Prove A failed pass does not block adjudication.
- [x] 1.38 Prove A failed pass is named in the review output and never repeated.
- [x] 1.39 Prove Coverage alone does not set the verdict.
- [x] 1.40 Prove A review with no lenses records the skip.
- [x] 1.41 Prove The review output says the check was skipped.
- [x] 1.42 Prove The output does not claim more than the reports say.
- [x] 1.43 Prove A file is not scored by how much of it was read.

## 2. Implementation

- [x] 2.1 Implement the specified behaviour so every scenario above holds.
