# How scoping marks a comment outdated

Read this in step 4 when a scoping result needs explaining, for example when a
reviewer asks why a comment was skipped. `forge-comments.ts scope` applies
these rules itself; this file explains its verdict and does not replace it.

A missing path or a new-side line past the end of the file is outdated. An
empty or whitespace-only body is outdated. A body that is only acknowledgements
such as LGTM, thanks, approved, or done is outdated. A body that is only a
mention is outdated. A body that is only a URL is outdated. A body that is only
emoji is outdated. A comment whose body is only a suggestion fence, and whose
suggested text is already in that file, is outdated. An unanchored comment, an
old-side anchor, or a path you did not look up stays in scope.
