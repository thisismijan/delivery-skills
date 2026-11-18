# Keeping a needs-validation item

Read this before keeping a candidate as needs-validation under adjudication step 8, that is, when its harm depends on a fact outside the repository.

8. Keep a candidate as **needs-validation** instead of dropping it under step 7
   only when all of these hold: the code at the pinned head shows the bad
   behaviour; the harm depends on one named fact outside the repository, such
   as a replica count, a production setting, or a deployment topology; you
   searched the repository for that fact (configuration, manifests, CI deploy
   jobs, runbooks, `design.md`) and did not find it; and you can write down the
   missing fact and an owner check. If the repository does show the fact, the
   candidate is judged by that fact. If any condition fails, drop it under
   step 7. "I am not sure" is not a missing fact. The owner check is read-only
   and names where the owner looks, for example "read the replica count for
   this service in the deploy dashboard". Never run that check, and never probe
   a live environment.
