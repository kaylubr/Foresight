import type { ParsedCommand } from "./parseCommand";

export interface GuardContext {
  sequence: string | null;
}

export interface GuardRefusal {
  code: string;
  reason: string;
  alternative: string | null;
}

export interface GuardResult {
  refusal: GuardRefusal | null;
  autoAnswerMergeMessage: boolean;
  sequence: string | null;
}

const MESSAGE_FLAGS = [
  "-m",
  "--message",
  "-F",
  "--file",
  "-C",
  "--reuse-message",
  "-c",
  "--reedit-message",
  "--fixup",
  "--squash",
  "--no-edit"
];

const PATCH_FLAGS = ["-p", "--patch"];
const INTERACTIVE_FLAGS = ["-i", "--interactive"];

function hasAny(args: string[], names: string[]): boolean {
  return args.some((arg) => names.includes(arg));
}

function refusal(code: string, reason: string, alternative: string | null): GuardResult {
  return { refusal: { code, reason, alternative }, autoAnswerMergeMessage: false, sequence: null };
}

function evaluateInteractive(command: ParsedCommand): GuardResult | null {
  const { subcommand, subArgs } = command;

  if (subcommand === "add" && hasAny(subArgs, ["-e", "--edit"])) {
    return refusal(
      "interactive-add-edit",
      "`git add -e` opens an editor and the edit is the command itself, so there is no unattended result to rehearse",
      "stage the change first, then edit the index outside Foresight"
    );
  }

  if (subcommand === "add" && (hasAny(subArgs, PATCH_FLAGS) || hasAny(subArgs, INTERACTIVE_FLAGS))) {
    return refusal(
      "interactive-add",
      "`git add -p` and `git add -i` read hunk choices from a terminal, and the rehearsal has no terminal to read them from",
      "use `git add <path>` to rehearse whole-file staging"
    );
  }

  if (subcommand === "stash" && (hasAny(subArgs, PATCH_FLAGS) || hasAny(subArgs, INTERACTIVE_FLAGS))) {
    return refusal(
      "interactive-stash",
      "`git stash -p` reads hunk choices from a terminal, and the rehearsal has no terminal",
      "use `git stash` without `-p`"
    );
  }

  if (
    (subcommand === "checkout" || subcommand === "restore" || subcommand === "reset") &&
    hasAny(subArgs, PATCH_FLAGS)
  ) {
    return refusal(
      "interactive-patch",
      `\`git ${subcommand} -p\` reads hunk choices from a terminal, and the rehearsal has no terminal`,
      `use \`git ${subcommand} -- <path>\` for whole files`
    );
  }

  if (subcommand === "commit" && !hasAny(subArgs, MESSAGE_FLAGS) && !hasAny(subArgs, ["--verbose", "-v"])) {
    return refusal(
      "commit-needs-message",
      "a commit without a message opens an editor, and there is no default message to rehearse",
      "pass `-m \"your message\"`, or `commit --amend --no-edit`"
    );
  }

  if (subcommand === "tag") {
    const annotated = hasAny(subArgs, ["-a", "--annotate", "-s", "--sign", "-u", "--local-user"]);
    if (annotated && !hasAny(subArgs, ["-m", "--message", "-F", "--file"])) {
      return refusal(
        "tag-needs-message",
        "an annotated tag without a message opens an editor, and the default message is empty",
        "pass `-m \"your message\"`"
      );
    }
  }

  if (
    (subcommand === "cherry-pick" || subcommand === "revert") &&
    hasAny(subArgs, ["-e", "--edit"])
  ) {
    return refusal(
      "sequencer-edit",
      `\`git ${subcommand} -e\` opens an editor for the commit message, and the rehearsal has no editor input`,
      `drop \`-e\``
    );
  }

  if (subcommand === "rebase" && hasAny(subArgs, ["-p", "--patch"])) {
    return refusal(
      "rebase-patch",
      "`git rebase --patch` reads hunk choices from a terminal, and the rehearsal has no terminal",
      "use an interactive rebase todo list instead"
    );
  }

  return null;
}

function evaluateArbitraryExecution(command: ParsedCommand): GuardResult | null {
  if (command.subcommand === "rebase" && hasAny(command.subArgs, ["--exec", "-x"])) {
    return refusal(
      "rebase-exec",
      "`--exec` runs an arbitrary shell command at every step of the rebase",
      "drop `--exec`"
    );
  }
  return null;
}

function sequenceRefusal(sequence: string | null): GuardResult | null {
  if (!sequence) {
    return null;
  }
  const lines = sequence
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  for (const line of lines) {
    const action = line.split(/\s+/)[0];
    if (action === "reword") {
      return refusal(
        "sequence-reword",
        "`reword` exists to type a new message, and Foresight has no message input for a todo list yet",
        "use `squash` or `fixup`, or reorder without `reword`"
      );
    }
    if (action === "exec" || action === "x") {
      return refusal("sequence-exec", "`exec` runs an arbitrary shell command", "drop the `exec` line");
    }
    if (action === "break" || action === "b") {
      return refusal("sequence-break", "`break` stops the rebase and has no unattended result", null);
    }
  }
  return null;
}

export function evaluateGuards(command: ParsedCommand, context: GuardContext): GuardResult {
  const sequenceGuard = sequenceRefusal(context.sequence);
  if (sequenceGuard) {
    return sequenceGuard;
  }

  const arbitrary = evaluateArbitraryExecution(command);
  if (arbitrary) {
    return arbitrary;
  }

  const interactive = evaluateInteractive(command);
  if (interactive) {
    return interactive;
  }

  const autoAnswerMergeMessage =
    command.subcommand === "merge" && !hasAny(command.subArgs, ["-m", "--message", "-F", "--file"]);

  return {
    refusal: null,
    autoAnswerMergeMessage,
    sequence: command.subcommand === "rebase" ? context.sequence : null
  };
}
