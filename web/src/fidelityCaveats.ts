import type { RepoConnectResult } from "../../shared/types";

export interface FidelityCaveat {
  id: string;
  label: string;
  detail: string;
}

export function fidelityCaveats(repo: RepoConnectResult): FidelityCaveat[] {
  const caveats: FidelityCaveat[] = [];
  const { submodules, lfs, linkedWorktrees } = repo.staticDisqualifiers;
  const { operation } = repo.dynamicDisqualifiers;

  if (submodules) {
    caveats.push({
      id: "submodules",
      label: "Submodules",
      detail: "Their contents are not copied into the rehearsal."
    });
  }
  if (lfs) {
    caveats.push({
      id: "lfs",
      label: "Git LFS",
      detail: "LFS files rehearse as pointers rather than real content."
    });
  }
  if (linkedWorktrees > 0) {
    caveats.push({
      id: "worktrees",
      label: linkedWorktrees === 1 ? "1 linked worktree" : `${linkedWorktrees} linked worktrees`,
      detail: "They are not copied into the rehearsal."
    });
  }
  if (operation) {
    caveats.push({
      id: "operation",
      label: "An operation is in progress",
      detail: `Git's internal state for the ${operation} is not reproduced.`
    });
  }

  return caveats;
}
