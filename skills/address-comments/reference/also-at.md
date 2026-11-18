# Comments that list other locations

Read this in step 6 when an action comment, or the review finding it repeats,
lists **Also at:** locations.

When an action comment, or the review finding it repeats, lists **Also at:**
locations, the fix covers every listed instance in the same commit and round.
The failing test covers at least one instance, and the reply names every
location fixed. A listed instance that turns out not to be the same defect is
named in the reply with why, not silently skipped.
