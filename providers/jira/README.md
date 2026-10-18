# Jira tracker provider

Selected with `./install.sh --skills-dir <path> --provider jira`.

Generic delivery uses local work items unless a tracker provider is advertised
in the runtime manifest. This provider remains unavailable until the host
runtime supplies and probes a tracker invocation. Selecting it does not claim a
working tracker or change core stage gates; doctor reports the host-runtime
setup remedy.
