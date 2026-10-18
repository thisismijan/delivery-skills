# Jira tracker provider

Selected with `./install.sh --skills-dir <path> --provider jira`.

Jira appears as a repository work-item choice only after the host runtime
supplies and probes a `tracker.item` invocation with `provider: "jira"`.
Selecting this package alone does not claim working Jira access. Delivery never
infers Jira from credentials, URLs, or Jira-shaped keys; the operator still
confirms it on first use. A portable adapter exposes an
`exec:/absolute/path` bridge implementing the JSON protocol in
`factory/WORK-ITEMS.md`. Doctor reports the host-runtime setup remedy.
