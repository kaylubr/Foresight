# Foresight

A local web app that visualises a git repository and lets you rehearse a pasted git command in a throwaway clone before running it for real.

## Language

**Rehearsal**:
Running a submitted command inside a throwaway clone to observe its effect before deciding whether to run it for real.
_Avoid_: Simulation, dry run, sandbox

**Rehearsal clone**:
The throwaway `git clone` a rehearsal runs in, discarded afterwards.
_Avoid_: Sandbox, scratch repo

**Mirror**:
To reproduce the original repository's local state — index, tracked working-tree edits, local branches, and stash — in the rehearsal clone before running a command. Untracked and ignored files are deliberately not mirrored.
_Avoid_: Copy, sync

**Command**:
A single git invocation submitted by the user and parsed into argv. Never a shell string.
_Avoid_: Pastie, script, shell command

**Outcome**:
What Foresight reports for a submitted command: one of Preview, Conflict stop, Pause stop, Failure, or Refusal.
_Avoid_: Result, status

**Change set**:
The difference between a rehearsal's before and after snapshots of Modelled state. It is a property of the run, not of the Outcome, so any outcome that moved Modelled state carries one.
_Avoid_: Diff, delta

**Preview**:
A rehearsal that completed, whose Change set is the command's effect.
_Avoid_: Result, output, diff

**Conflict stop**:
A rehearsal that hit a conflict, was aborted inside the clone, and is reported as "would conflict here". Carries the conflicting paths and the step it stopped at, and an empty Change set.
_Avoid_: Conflict, error, failure

**Pause stop**:
A rehearsal that stopped by design at an `edit` action and was aborted inside the clone, reported as "would pause here". Same shape as a Conflict stop; only the reason differs.
_Avoid_: Interruption, pause

**Failure**:
A rehearsal in which the command ran and exited non-zero without conflicting, reported with git's error text, exit code, and whatever Change set it produced.
_Avoid_: Error, exception

**Tool error**:
A failure of Foresight's own machinery — the clone, the mirror, the sandbox, the timeout, or the output cap. Reported in the same panel as an Outcome but labelled as Foresight failing, never as something the command did.
_Avoid_: Failure, crash

**Fingerprint**:
A cheap measurement of a state surface, taken before and after a run, used to detect changes that Modelled state does not explain. Distinct from a snapshot, which measures Modelled state itself.
_Avoid_: Snapshot, checksum

**Fidelity caveat**:
A disclosed way a rehearsal diverges from reality, such as unmirrored untracked files or a sanitized environment.
_Avoid_: Limitation, gotcha

**Isolation guarantee**:
The narrow promise that git's own object-store-rewriting commands, run in a rehearsal clone, cannot alter the original repository's object bytes. It does not cover shell execution, filesystem writes, network access, or anything outside git's object model.
_Avoid_: Sandbox, safety guarantee, security boundary

**Modelled state**:
The four state surfaces Foresight compares to build a preview: refs, HEAD, the index, and the working directory.
_Avoid_: Repo state, tracked state

**Unmodelled side effect**:
A change a command made that Modelled state does not capture, such as config, reflog entries, index bits, object-store packing, or filter transforms.
_Avoid_: Hidden change, side effect

**Interactive intent**:
A command that would prompt on stdin or launch an editor. Foresight refuses these rather than guess at them.
_Avoid_: Interactive command

**Refusal**:
Foresight declining to rehearse a command before it runs, with a specific reason and the in-scope alternative.
_Avoid_: Error, block, failure

**Root**:
A starting folder the repository browser offers: the home directory, the filesystem root, or a mounted volume.
_Avoid_: Drive, mount, shortcut

**Volume**:
A mounted filesystem that appears under a conventional mount location, such as a drive under `/mnt` or a disk under `/Volumes`.
_Avoid_: Drive, disk
