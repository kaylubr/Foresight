export type CommandClass = "read-only" | "mutator";

export const ALLOWED_SUBCOMMANDS: Record<string, CommandClass> = {
  log: "read-only",
  status: "read-only",
  diff: "read-only",
  show: "read-only",
  blame: "read-only",
  describe: "read-only",
  "rev-parse": "read-only",
  shortlog: "read-only",
  add: "mutator",
  commit: "mutator",
  branch: "mutator",
  tag: "mutator",
  checkout: "mutator",
  switch: "mutator",
  restore: "mutator",
  reset: "mutator",
  merge: "mutator",
  rebase: "mutator",
  "cherry-pick": "mutator",
  revert: "mutator",
  stash: "mutator",
  rm: "mutator",
  mv: "mutator"
};

export interface RefusalReason {
  reason: string;
  alternative: string | null;
}

const REMOTE_REFUSAL: RefusalReason = {
  reason: "it reaches a remote, and a remote's state is not in the mirror",
  alternative: null
};

const OBJECT_STORE_REFUSAL: RefusalReason = {
  reason: "its effect is object-store or repository maintenance, which Modelled state cannot represent",
  alternative: null
};

const UNTRACKED_REFUSAL: RefusalReason = {
  reason: "it acts on untracked or ignored files, which the mirror deliberately does not copy",
  alternative: null
};

const PLUMBING_REFUSAL: RefusalReason = {
  reason: "it is plumbing whose effect is not expressed in Modelled state",
  alternative: null
};

export const REFUSED_SUBCOMMANDS: Record<string, RefusalReason> = {
  push: REMOTE_REFUSAL,
  fetch: REMOTE_REFUSAL,
  pull: REMOTE_REFUSAL,
  clone: REMOTE_REFUSAL,
  remote: REMOTE_REFUSAL,
  submodule: REMOTE_REFUSAL,
  "ls-remote": REMOTE_REFUSAL,
  gc: OBJECT_STORE_REFUSAL,
  repack: OBJECT_STORE_REFUSAL,
  prune: OBJECT_STORE_REFUSAL,
  "prune-packed": OBJECT_STORE_REFUSAL,
  "commit-graph": OBJECT_STORE_REFUSAL,
  "update-server-info": OBJECT_STORE_REFUSAL,
  "multi-pack-index": OBJECT_STORE_REFUSAL,
  "pack-refs": OBJECT_STORE_REFUSAL,
  "reflog": OBJECT_STORE_REFUSAL,
  "filter-branch": OBJECT_STORE_REFUSAL,
  "filter-repo": OBJECT_STORE_REFUSAL,
  "fast-import": OBJECT_STORE_REFUSAL,
  "fast-export": OBJECT_STORE_REFUSAL,
  bundle: OBJECT_STORE_REFUSAL,
  archive: OBJECT_STORE_REFUSAL,
  fsck: OBJECT_STORE_REFUSAL,
  clean: UNTRACKED_REFUSAL,
  bisect: {
    reason: "it drives an interactive prompt that cannot be scripted through an editor",
    alternative: "run the search outside Foresight"
  },
  worktree: {
    reason: "linked worktrees are not mirrored, so a preview would describe a different repository",
    alternative: null
  },
  config: {
    reason: "config changes are not part of Modelled state",
    alternative: null
  },
  "update-ref": PLUMBING_REFUSAL,
  "update-index": PLUMBING_REFUSAL,
  "symbolic-ref": PLUMBING_REFUSAL,
  "write-tree": PLUMBING_REFUSAL,
  "read-tree": PLUMBING_REFUSAL,
  "hash-object": PLUMBING_REFUSAL,
  "cat-file": PLUMBING_REFUSAL,
  "rev-list": PLUMBING_REFUSAL,
  "for-each-ref": PLUMBING_REFUSAL,
  "ls-files": PLUMBING_REFUSAL,
  "ls-tree": PLUMBING_REFUSAL,
  "checkout-index": PLUMBING_REFUSAL,
  "diff-index": PLUMBING_REFUSAL,
  "merge-base": PLUMBING_REFUSAL,
  "show-ref": PLUMBING_REFUSAL,
  "verify-pack": PLUMBING_REFUSAL,
  "count-objects": PLUMBING_REFUSAL,
  apply: {
    reason: "it takes a patch from outside the repository, which the mirror cannot reproduce",
    alternative: null
  },
  am: {
    reason: "it takes a mailbox from outside the repository, which the mirror cannot reproduce",
    alternative: null
  },
  notes: {
    reason: "note content is not part of Modelled state",
    alternative: null
  },
  replace: PLUMBING_REFUSAL,
  "send-email": REMOTE_REFUSAL,
  "request-pull": REMOTE_REFUSAL,
  daemon: REMOTE_REFUSAL,
  instaweb: REMOTE_REFUSAL,
  svn: REMOTE_REFUSAL,
  p4: REMOTE_REFUSAL
};

export const ALLOWED_GLOBAL_FLAGS = new Set([
  "--no-pager",
  "--literal-pathspecs",
  "--no-optional-locks",
  "--no-replace-objects",
  "--paginate"
]);

export const REFUSED_GLOBAL_OPTIONS: Record<string, string> = {
  "-C": "changing the working directory would escape the mirror",
  "--git-dir": "pointing at another git directory would escape the mirror",
  "--work-tree": "pointing at another work tree would escape the mirror",
  "--namespace": "a namespace is not reproduced in the mirror",
  "--exec-path": "redirecting the executable path is not supported",
  "--config-env": "environment-sourced config is not supported"
};

export const ALLOWED_CONFIG_KEYS = new Set([
  "user.name",
  "user.email",
  "commit.gpgsign",
  "commit.verbose",
  "core.autocrlf",
  "core.eol",
  "core.ignorecase",
  "core.filemode",
  "core.safecrlf",
  "core.whitespace",
  "diff.algorithm",
  "diff.context",
  "diff.ignoreallspace",
  "diff.ignorespacechange",
  "diff.renameLimit",
  "diff.renames",
  "diff.statgraphwidth",
  "merge.conflictStyle",
  "merge.ff",
  "rebase.autosquash",
  "rebase.autostash",
  "log.date",
  "log.decorate",
  "log.follow",
  "status.showUntrackedFiles",
  "advice.detachedHead"
]);

export const EXECUTABLE_CONFIG_PATTERNS: RegExp[] = [
  /^core\.editor$/i,
  /^core\.pager$/i,
  /^core\.hookspath$/i,
  /^core\.fsmonitor$/i,
  /^core\.sshcommand$/i,
  /^core\.askpass$/i,
  /^core\.gpgprogram$/i,
  /^gpg\.program$/i,
  /^sequence\.editor$/i,
  /^diff\..*command$/i,
  /^diff\.external$/i,
  /^merge\.tool/i,
  /^mergetool\./i,
  /^difftool\./i,
  /^credential/i,
  /^filter\./i,
  /^alias\./i,
  /^submodule\..*\.update$/i,
  /^pager\./i,
  /^interactive\./i,
  /^uploadpack\./i,
  /^receive\./i
];

export function configKeyIsAllowed(key: string): boolean {
  if (EXECUTABLE_CONFIG_PATTERNS.some((pattern) => pattern.test(key))) {
    return false;
  }
  return ALLOWED_CONFIG_KEYS.has(key.toLowerCase());
}

export function configKeyRefusal(key: string): string {
  if (EXECUTABLE_CONFIG_PATTERNS.some((pattern) => pattern.test(key))) {
    return `\`-c ${key}\` names a program or hook that git would execute`;
  }
  return `\`-c ${key}\` is not on the allowlist of data-only config keys`;
}
