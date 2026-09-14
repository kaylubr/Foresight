# An object-store change with no Modelled-state explanation is a blocking anomaly

Foresight fingerprints the object store (loose and packed object counts, `packed-refs`, `commit-graph`) alongside Modelled state, and raises a blocking anomaly when the object store moved but none of the four Modelled surfaces explains why. The axis is Modelled state rather than refs specifically, because `git add` writes a blob object while moving only the index — a refs-only rule would fire on one of the tool's most ordinary commands.

Within the allowlist, that combination should essentially never occur on a *successful* run. That is what makes a firing trustworthy: it means something ran that the allowlist should have refused, rather than routine noise to squint past.

A non-zero exit is itself an explanation and suppresses the anomaly: a failing operation can write and abandon scratch objects without moving any Modelled surface. This was found empirically — a `git merge` that aborts on a dirty worktree fails with an object-store delta and no modelled change — and it corrects the original assumption that a plain `git add` was the only legitimate source of object churn. The badge is still reported, just not as blocking.

## Considered Options

- A refs-only rule with per-command exceptions — rejected. A hand-maintained exception list is the same one-case complexity the rest of this design avoids, and it grows every time a command writes objects without moving a ref.
- Treating every object-store delta as blocking — rejected after the failing-merge evidence above; it would fire on ordinary failed operations.
