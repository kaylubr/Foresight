# Commands that would act on unmirrored untracked or ignored files are refused

The mirror deliberately omits untracked and ignored files. For most commands that is a disclosed Fidelity caveat, but for commands that *act on* those files it is not: `git add -A` in the clone stages nothing while the real run stages every untracked file, secrets included; `git stash -u` removes untracked files for real while the preview shows nothing removed. A preview that understates a destructive effect is the dishonesty ADR-0003 exists to prevent, so these commands are refused outright, naming the count.

The gate resolves the command's **pathspecs** against the real repository's untracked and ignored sets rather than scanning for flags — `git add secret.txt` is as dangerous as `git add -A`, and in the clone it merely errors on a missing pathspec.

The trigger is **file class × force flag**, not "acts on" versus "collides":

- untracked + a plain `checkout`/`switch` — git aborts rather than overwrite. Caveat only.
- untracked + `-f` (`checkout -f`, `switch -f`) — git throws the files away. Refuse when untracked files exist.
- ignored + a plain `checkout`/`switch` — git silently overwrites ignored files by default. Refuse when ignored files exist, unless `--no-overwrite-ignore` is passed.
- `merge`, `reset --hard`, `rebase` — genuinely fail safe on untracked collisions and leave ignored files alone. Caveat only.

`switch -f`/`--discard-changes` is gated on the same terms as `checkout -f` even though its documentation is silent on untracked files. The two mistakes are not symmetric — an unnecessary Refusal costs a retry, a missed one costs a file that cannot be recovered — so it fails closed until tested.
