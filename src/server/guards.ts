import type { ParsedCommand } from "./parseCommand";

export interface GuardContext {
  untracked: string[];
  ignored: string[];
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
  return args.some((arg) => names.includes(arg) || names.some((name) => name.length > 2 && arg === name));
}

function globToRegExp(pattern: string): RegExp {
  let source = "^";
  for (let index = 0; index < pattern.length; index += 1) {
    const char = pattern[index];
    if (char === "*") {
      if (pattern[index + 1] === "*") {
        source += ".*";
        index += 1;
      } else {
        source += "[^/]*";
      }
      continue;
    }
    if (char === "?") {
      source += "[^/]";
      continue;
    }
    source += char !== undefined && "\\^$+{}()|[]".includes(char) ? `\\${char}` : char;
  }
  return new RegExp(`${source}$`);
}

function matchesPathspec(pathspec: string, file: string): boolean {
  const normalized = pathspec.replace(/^\.\//, "");
  if (normalized === "" || normalized === "." || normalized === ":/" || normalized === "*") {
    return true;
  }
  if (/[*?[\]]/.test(normalized)) {
    return globToRegExp(normalized).test(file);
  }
  return file === normalized || file.startsWith(`${normalized}/`);
}

function collectPathspecs(args: string[]): string[] {
  const pathspecs: string[] = [];
  let afterSeparator = false;
  for (const arg of args) {
    if (arg === "--") {
      afterSeparator = true;
      continue;
    }
    if (afterSeparator) {
      pathspecs.push(arg);
      continue;
    }
    if (!arg.startsWith("-")) {
      pathspecs.push(arg);
    }
  }
  return pathspecs;
}

function touchedCount(pathspecs: string[], files: string[]): number {
  const matched = new Set<string>();
  for (const pathspec of pathspecs) {
    for (const file of files) {
      if (matchesPathspec(pathspec, file)) {
        matched.add(file);
      }
    }
  }
  return matched.size;
}

function refusal(code: string, reason: string, alternative: string | null): GuardResult {
  return { refusal: { code, reason, alternative }, autoAnswerMergeMessage: false, sequence: null };
}

function evaluateAdd(command: ParsedCommand, context: GuardContext): GuardResult | null {
  const { subArgs } = command;
  if (hasAny(subArgs, ["-e", "--edit"])) {
    return refusal(
      "interactive-add-edit",
      "`git add -e` opens an editor, and the edit is the whole command",
      "stage the change, then edit the index outside Foresight"
    );
  }
  if (hasAny(subArgs, PATCH_FLAGS) || hasAny(subArgs, INTERACTIVE_FLAGS)) {
    return refusal(
      "interactive-add",
      "`git add -p`/`-i` reads hunk choices from the terminal, which an editor cannot stand in for",
      "use `git add <path>` for a whole file"
    );
  }
  const force = hasAny(subArgs, ["-f", "--force"]);
  const all = hasAny(subArgs, ["-A", "--all"]);
  const pathspecs = collectPathspecs(subArgs);
  if (force && context.ignored.length > 0) {
    return refusal(
      "ignored-add",
      `\`git add -f\` would stage ignored files this preview cannot see (${context.ignored.length} present)`,
      "unignore the path, or run it outside Foresight"
    );
  }
  const targets = force ? [...context.untracked, ...context.ignored] : context.untracked;
  const touched = all ? targets.length : touchedCount(pathspecs, targets);
  if (touched > 0) {
    return refusal(
      "untracked-add",
      `this would stage ${touched} untracked ${touched === 1 ? "file" : "files"} this preview cannot see`,
      "run it outside Foresight, or add them one at a time with a path the mirror has"
    );
  }
  return null;
}

function evaluateStash(command: ParsedCommand, context: GuardContext): GuardResult | null {
  const { subArgs } = command;
  if (hasAny(subArgs, PATCH_FLAGS) || hasAny(subArgs, INTERACTIVE_FLAGS)) {
    return refusal(
      "interactive-stash",
      "`git stash -p` reads hunk choices from the terminal",
      "use `git stash` without `-p`"
    );
  }
  const includeUntracked = hasAny(subArgs, ["-u", "--include-untracked"]);
  const includeIgnored = hasAny(subArgs, ["-a", "--all"]);
  if (includeUntracked && context.untracked.length > 0) {
    return refusal(
      "untracked-stash",
      `\`git stash -u\` would remove ${context.untracked.length} untracked ${context.untracked.length === 1 ? "file" : "files"} this preview cannot see`,
      "stash without `-u`, or run it outside Foresight"
    );
  }
  if (includeIgnored && context.ignored.length > 0) {
    return refusal(
      "ignored-stash",
      `\`git stash -a\` would remove ${context.ignored.length} ignored ${context.ignored.length === 1 ? "file" : "files"} this preview cannot see`,
      "stash without `-a`, or run it outside Foresight"
    );
  }
  return null;
}

function isBranchSwitch(command: ParsedCommand): boolean {
  if (command.subcommand === "switch") {
    return true;
  }
  const { subArgs } = command;
  if (hasAny(subArgs, ["-b", "-B", "--orphan", "--detach"])) {
    return true;
  }
  if (subArgs.includes("--")) {
    return false;
  }
  return subArgs.some((arg) => !arg.startsWith("-"));
}

function evaluateCheckout(command: ParsedCommand, context: GuardContext): GuardResult | null {
  const { subArgs } = command;
  if (hasAny(subArgs, PATCH_FLAGS)) {
    return refusal(
      "interactive-checkout",
      "`git checkout -p` reads hunk choices from the terminal",
      "use `git checkout -- <path>`"
    );
  }
  if (!isBranchSwitch(command)) {
    return null;
  }
  const forced = hasAny(subArgs, ["-f", "--force", "--discard-changes"]);
  if (forced && context.untracked.length > 0) {
    return refusal(
      "forced-switch-untracked",
      `a forced switch throws away untracked files in the way (${context.untracked.length} present), which this preview cannot see`,
      "move the untracked files aside, or run it outside Foresight"
    );
  }
  const protects = hasAny(subArgs, ["--no-overwrite-ignore"]);
  if (!forced && !protects && context.ignored.length > 0) {
    return refusal(
      "ignored-switch",
      `switching branches silently overwrites ignored files by default (${context.ignored.length} present), which this preview cannot see`,
      "pass `--no-overwrite-ignore`, or run it outside Foresight"
    );
  }
  return null;
}

function evaluateCommit(command: ParsedCommand): GuardResult | null {
  const { subArgs } = command;
  if (hasAny(subArgs, MESSAGE_FLAGS)) {
    return null;
  }
  if (hasAny(subArgs, PATCH_FLAGS) || hasAny(subArgs, ["--verbose", "-v"])) {
    return null;
  }
  return refusal(
    "commit-needs-message",
    "a commit without a message opens an editor, and there is no valid default message to preview",
    "pass `-m \"your message\"`, or `--amend --no-edit`"
  );
}

function evaluateTag(command: ParsedCommand): GuardResult | null {
  const { subArgs } = command;
  const annotated = hasAny(subArgs, ["-a", "--annotate", "-s", "--sign", "-u", "--local-user"]);
  if (!annotated) {
    return null;
  }
  if (hasAny(subArgs, ["-m", "--message", "-F", "--file"])) {
    return null;
  }
  return refusal(
    "tag-needs-message",
    "an annotated tag without a message opens an editor, and the default message is empty",
    "pass `-m \"your message\"`"
  );
}

function evaluateRebase(command: ParsedCommand, context: GuardContext): GuardResult | null {
  const { subArgs } = command;
  if (hasAny(subArgs, ["--exec", "-x"])) {
    return refusal(
      "rebase-exec",
      "`--exec` runs an arbitrary shell command at each step",
      "drop `--exec`"
    );
  }
  if (hasAny(subArgs, ["-p", "--patch"])) {
    return refusal(
      "rebase-patch",
      "`--patch` is interactive",
      "use an interactive rebase todo list instead"
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
        "`reword` exists to type a new message, and Foresight has no message input for it yet",
        "use `squash` or `fixup`, or reorder without `reword`"
      );
    }
    if (action === "exec" || action === "x") {
      return refusal("sequence-exec", "`exec` runs an arbitrary shell command", "drop the `exec` line");
    }
    if (action === "break" || action === "b") {
      return refusal("sequence-break", "`break` stops the rebase without a previewable result", null);
    }
  }
  return null;
}

export function evaluateGuards(command: ParsedCommand, context: GuardContext): GuardResult {
  const sequenceGuard = sequenceRefusal(context.sequence);
  if (sequenceGuard) {
    return sequenceGuard;
  }

  const bySubcommand: Record<string, GuardResult | null> = {
    add: evaluateAdd(command, context),
    stash: evaluateStash(command, context),
    checkout: evaluateCheckout(command, context),
    switch: evaluateCheckout(command, context),
    commit: evaluateCommit(command),
    tag: evaluateTag(command),
    rebase: evaluateRebase(command, context)
  };

  const evaluated = bySubcommand[command.subcommand];
  if (evaluated) {
    return evaluated;
  }

  if (
    (command.subcommand === "cherry-pick" || command.subcommand === "revert") &&
    hasAny(command.subArgs, ["-e", "--edit"])
  ) {
    return refusal(
      "sequencer-edit",
      `\`git ${command.subcommand} -e\` opens an editor for the message`,
      `drop \`-e\``
    );
  }

  const autoAnswerMergeMessage =
    command.subcommand === "merge" && !hasAny(command.subArgs, ["-m", "--message", "-F", "--file"]);

  return {
    refusal: null,
    autoAnswerMergeMessage,
    sequence: command.subcommand === "rebase" ? context.sequence : null
  };
}
