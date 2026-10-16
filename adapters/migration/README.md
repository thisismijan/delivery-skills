# Source-framework migration adapter

Optional compatibility reads for old state names. Select it explicitly:

```bash
./install.sh --skills-dir /path/to/skills --adapter migration
```

This adapter is the only place that still knows:

- `.ig-spec/grooming/` as a previous groom output directory
- `.ig-spec.json` change metadata with `jiraKey` and `opusJustification`
- the previous audit marker `**ig-spec** ·`

Generic core files do not teach those names. New runs write `.delivery/grooming/`,
`.delivery.json` with `workItemKey` and `frontierJustification`, and
`**delivery** ·`.
