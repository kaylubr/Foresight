# Rehearsal isolates the git object store only; it is not a security boundary

A rehearsal runs in a `git clone --local`, which hardlinks `.git/objects/**` to the original and leaves refs, config, hooks, and the index unshared. Foresight therefore guarantees one narrow thing: git's own object-store-rewriting commands, run in the rehearsal clone, cannot alter the original repository's object bytes. It does not claim to contain shell execution, filesystem writes, network access, or anything outside git's object model.

The broader "sandbox" claim is false — a `push` through the clone's live `origin` remote, a write-through on a shared inode, or a `chmod` all mutate the original — and a promise that isn't true erodes. The name "sandbox" is retired for this reason.

## Consequences

- Remote commands are excluded from the allowlist, `origin` is severed in the clone, and the network is denied to the child process.
- Repositories with submodules, LFS, or linked worktrees are refused, since each breaks an assumption behind the clone-and-compare approach.
- **Upgrade trigger:** accepting commands the user has not read moves this to OS-level isolation — container, unprivileged user, no network, read-only mount of the original.

## Considered Options

- `--shared` — rejected. It does not share refs; it borrows the original's object store via `objects/info/alternates`, so the original's own `gc`/`prune` can corrupt the clone.
