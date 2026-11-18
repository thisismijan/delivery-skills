# Search for variants

Read this when adjudication confirms a finding at Medium or higher.

For each finding you confirmed at Medium or higher, search for the same root
cause elsewhere before writing the output: the same call, the same missing
guard, the same unchecked input. Search the changed files and their sibling
paths (the same folder, and files in the change's affected areas that call or
are called by the changed code), never beyond the change's affected areas.
Verify each further instance the way you verified the finding, by steps 1 to 4.
List every confirmed instance under that finding as **Also at:** with its path
and line. Do not raise an instance as a separate finding, so the fix is one
round, not one per copy. Low findings get no variant search.
