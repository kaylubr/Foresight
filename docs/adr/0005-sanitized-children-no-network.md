# The rehearsal child runs with a sanitized environment and no network

The git process that runs a submitted command is given a controlled environment: `GIT_CONFIG_NOSYSTEM`, a controlled `GIT_CONFIG_GLOBAL`, `GIT_TERMINAL_PROMPT=0`, `GIT_ASKPASS=/bin/false`, `GIT_PAGER=cat`, `GIT_OPTIONAL_LOCKS=0`, and Foresight's own `GIT_EDITOR`/`GIT_SEQUENCE_EDITOR`, with the user's `user.name`/`user.email` re-injected so commits behave. The child's network access is denied at the OS level rather than by the allowlist alone, because remote helpers, credential helpers, LFS smudge filters, and fsmonitor hooks can reach the network through paths a parser cannot see. The denial is verified rather than assumed: a startup probe attempts a real network call from inside the sandbox, and if it succeeds Foresight refuses to preview at all rather than run with network access while claiming otherwise. This is Linux-only for v1.

## Consequences

- Alias expansion and the `core.*` executable keys are neutralised: Foresight expands non-`!` aliases itself and allowlists `-c` keys, rather than letting the user's config act.
- Previews can diverge from a real run — a command that would fail for real (missing credentials, a hook) may succeed in rehearsal, and vice versa — which is disclosed as a Fidelity caveat.
- The network denial and the process-group kill on timeout are Linux-specific; running on another platform is the trigger to revisit these decisions.
- If the probe cannot confirm denial, previews are unavailable rather than degraded. A silent fallback to running *with* network access is the failure mode this decision exists to prevent.

## Resolution

Revisited when Foresight was made usable from Windows. The decision holds: the sandbox stays Linux-only, and the rest of the app is portable, so on another platform the graph and the read-only surfaces work while rehearsals are unavailable with a stated reason. What changed is only that the requirement is declared rather than left implicit. The revisit trigger is unchanged: actually needing to rehearse somewhere the sandbox cannot run.

## Considered Options

- Inheriting the user's environment — rejected. It reopens the shell-out trapdoors that the parsed-argv model exists to close.
- Relying on the subcommand allowlist alone for network denial — rejected. It cannot see the indirect paths above.
