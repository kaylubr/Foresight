# Only commands whose effects land in Modelled state are previewable

Foresight's allowlist admits read-only commands and the porcelain mutators whose effects appear in Modelled state (refs, HEAD, the index, the working directory), and refuses everything else with a stated reason. The principle is not that refused commands are dangerous — under a local clone, none of them can harm the original — but that the diff engine cannot represent their effects, so previewing one would show a false no-op or a lie.

The allowlist is necessary but not sufficient. A command that passes it can still be refused by the **mirror-representability** gate: if its effect depends on input the mirror omits — untracked or ignored files, which the mirror deliberately leaves out — the preview cannot represent it either, for the same reason. A command is previewable only when both hold: its effect lands in Modelled state, *and* nothing it depends on was left out of the mirror. See ADR-0007.

## Considered Options

- An explicit denylist — rejected. It is open-ended: each new command or flag is another chance to miss an indirect harm.
- Refusing on a danger basis — rejected. It is the wrong axis under this isolation model, where nothing on the allowlist-or-not question can endanger the original either way.
