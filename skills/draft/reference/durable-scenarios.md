# Durable scenarios for removal and migration tickets

Read this at step 7 when the ticket removes or migrates behaviour.

For a **removal** ticket, the durable coverage is *deleting the removed
behaviour's existing tests*, so the scenario says that behaviour is gone from
the surface, not "the old route returns 404 forever". For a **migration**
ticket, assert the new steady state (the feature works via the new stack), not
"no trace of the old stack remains".
