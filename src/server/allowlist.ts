export const READ_ONLY_SUBCOMMANDS = new Set([
  "log",
  "status",
  "diff",
  "show",
  "blame",
  "describe",
  "rev-parse",
  "shortlog",
  "cat-file",
  "ls-files",
  "ls-tree",
  "rev-list",
  "for-each-ref",
  "show-ref",
  "merge-base",
  "count-objects",
  "verify-pack",
  "check-ignore",
  "whatchanged",
  "grep"
]);

export const ALLOWED_GLOBAL_FLAGS = new Set([
  "--no-pager",
  "--literal-pathspecs",
  "--no-optional-locks",
  "--no-replace-objects",
  "--paginate"
]);

export const REFUSED_GLOBAL_OPTIONS: Record<string, string> = {
  "-C": "changing the working directory would escape the rehearsal clone",
  "--git-dir": "pointing at another git directory would escape the rehearsal clone",
  "--work-tree": "pointing at another work tree would escape the rehearsal clone",
  "--namespace": "a namespace is not reproduced in the rehearsal clone",
  "--exec-path": "redirecting the executable path would run a program outside the rehearsal",
  "--config-env": "environment-sourced config is not reproduced in the rehearsal"
};

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
  /^uploadpack\./i,
  /^receive\./i
];

export function configKeyIsAllowed(key: string): boolean {
  return !EXECUTABLE_CONFIG_PATTERNS.some((pattern) => pattern.test(key));
}

export function configKeyRefusal(key: string): string {
  return `\`-c ${key}\` names a program or hook that git would execute, and the rehearsal will not run programs that the pasted command names`;
}
