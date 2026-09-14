import type { Caveat } from "./types";

export const CAVEAT_CATALOG: Record<string, { label: string; detail: string }> = {
  "untracked-not-mirrored": {
    label: "Untracked files are not mirrored",
    detail:
      "The rehearsal cannot see untracked files, so commands that would act on them are refused rather than previewed."
  },
  "ignored-not-mirrored": {
    label: "Ignored files are not mirrored",
    detail:
      "Ignored files are left out of the rehearsal, so a command that would overwrite them is refused."
  },
  "sanitized-environment": {
    label: "The environment is sanitized",
    detail:
      "The rehearsal runs with a controlled git environment and no network, so a command that would fail for real — a missing credential, a hook — can succeed here, and vice versa."
  },
  "origin-topology": {
    label: "origin is not your real remote",
    detail:
      "The clone's origin points at a dead path and its origin/* refs mirror your local branches, not what is on your real remote."
  },
  "auto-answered-message": {
    label: "The merge message was auto-answered",
    detail: "git's generated merge message was accepted as-is rather than edited."
  },
  "squash-auto-message": {
    label: "The squashed message was auto-answered",
    detail: "git's concatenated default message was accepted as-is rather than edited."
  }
};

export function caveat(id: string): Caveat {
  const entry = CAVEAT_CATALOG[id];
  return { id, label: entry?.label ?? id, detail: entry?.detail ?? "" };
}
