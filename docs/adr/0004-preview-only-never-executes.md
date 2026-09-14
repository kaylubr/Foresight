# Foresight never executes a command on the original repository

Foresight is preview-only: a submitted command is rehearsed in a throwaway clone, and the user copies it out to run for real themselves. The tool never runs the command against the original repository, and a future "run for real" feature would be a separate, explicitly confirmed, non-isolated path rather than an extension of the preview path.

The reason is that preview fidelity is only ever good enough to be *illustrative* — unmirrored untracked files, a sanitized environment, and a severed `origin` all mean a rehearsal can diverge from reality. Keeping the two paths structurally separate stops a disclosed Fidelity caveat from quietly becoming a correctness bug.

## Consequences

- No mutation of the original is possible through Foresight at all.
- Because the user acts on a preview later, staleness is a real concern; the snapshot-fingerprint check and the `--local` hardlinks both assume the original is untouched by the tool.
