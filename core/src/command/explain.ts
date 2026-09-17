const PATTERNS: Array<{ test: RegExp; explanation: string }> = [
  {
    test: /could not read from remote repository|does not appear to be a git repository|could not resolve host|unable to access|no such remote|authentication failed|could not read Username|terminal prompts disabled|repository not found/i,
    explanation:
      "This command talks to a remote. The rehearsal clone has no remote and no network, so there is nothing to visualize. Rehearse it with a local ref instead, or run it yourself."
  },
  {
    test: /not a git repository/i,
    explanation:
      "git could not find a repository where the command expected one. Check the path and whether the command expects to run inside a working tree."
  },
  {
    test: /did not match any file|pathspec .* did not match|did not match any files/i,
    explanation:
      "The path in the command does not match anything in the mirrored working tree, so git had nothing to act on."
  },
  {
    test: /unknown revision|bad revision|invalid ref|not a valid object name|no such ref|ambiguous argument/i,
    explanation:
      "A ref or revision in the command does not resolve. Names that only exist in a remote, or in a repository you have not fetched, will not resolve in the rehearsal clone."
  },
  {
    test: /would be overwritten|unstaged changes|uncommitted changes|cannot rebase|cannot merge|cannot pull with rebase|local changes/i,
    explanation:
      "git refused because the mirrored working tree is not in a state it will operate on. The rehearsal reproduces your staged and unstaged changes, so the real command would refuse here too."
  },
  {
    test: /nothing to commit|no changes added to commit|nothing specified, nothing added/i,
    explanation:
      "There was nothing for the command to act on in the state the rehearsal reproduced."
  },
  {
    test: /already exists|already checked out|is already used by worktree/i,
    explanation:
      "The target already exists in the mirrored repository."
  },
  {
    test: /needs a single revision|not enough arguments|usage:/i,
    explanation:
      "The command is incomplete or malformed for git. Check the arguments after the subcommand."
  }
];

export function explainFailure(stderr: string): string | null {
  for (const pattern of PATTERNS) {
    if (pattern.test.test(stderr)) {
      return pattern.explanation;
    }
  }
  return null;
}
