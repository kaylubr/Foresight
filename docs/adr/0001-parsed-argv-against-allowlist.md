# Pasted commands run as parsed argv against a subcommand allowlist

Foresight never passes a submitted command through a shell: it parses the input into an argv array and invokes git directly, restricted to an allowlist of subcommands and flags. This closes shell interpretation (`;`, `|`, backticks, `$(...)`) and git's own shell-out trapdoors (`!` aliases, `rebase --exec`, `-c core.editor=` / `core.pager=` overrides) at the input boundary.

The cost is that pipelines, redirection, and shell aliases are unsupported by design, and a whole class of commands is refused rather than run.

## Considered Options

- `child_process.exec` of the pasted string — rejected. It hands the text to a real shell, so arbitrary code runs outside git's object model, where clone-based isolation is irrelevant.
- Best-effort interception of interactive commands — rejected in favour of refusing them; a preview that silently does the wrong thing is worse than one that declines.
